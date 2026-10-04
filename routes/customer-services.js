var express = require('express');
var router = express.Router();
var Grant = require('../models/Grant');
var Refund = require('../models/Refund');
var Transaction = require('../models/Transaction');
var Notification = require('../models/Notification');
var bcrypt = require('bcryptjs');
var kycGate = require('./kyc').kycGate;
var crypto = require('crypto');

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in.');
  res.redirect('/login');
}

function activeAccount(req, res, next) {
  if (req.user.accountStatus !== 'active') {
    req.flash('error_msg', 'Your account is not active. Please contact support.');
    return res.redirect('/dashboard');
  }
  next();
}


function pinGate(req, res, next) {
  if (!req.user.pinSet || !req.user.pin) {
    req.flash('error_msg', 'Please set up your transaction PIN before submitting this request.');
    return res.redirect('/set-pin');
  }
  var enteredPin = String(req.body.transactionPin || '');
  if (!/^\d{4}$/.test(enteredPin)) {
    req.flash('error_msg', 'Please enter your 4-digit transaction PIN.');
    return res.redirect(req.path.indexOf('/grants') === 0 ? '/grants' : '/refunds');
  }
  bcrypt.compare(enteredPin, req.user.pin, function (err, match) {
    if (err || !match) {
      req.flash('error_msg', 'Incorrect transaction PIN. Request cancelled.');
      return res.redirect(req.path.indexOf('/grants') === 0 ? '/grants' : '/refunds');
    }
    next();
  });
}

/* Grants */
router.get('/grants', isAuth, kycGate, function (req, res) {
  Grant.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20)
    .then(function (grants) {
      res.render('dashboard/grants', { title: 'Grants', grants: grants });
    }).catch(function (err) {
      console.error(err);
      res.redirect('/dashboard');
    });
});

router.post('/grants/apply', isAuth, kycGate, activeAccount, pinGate, function (req, res) {
  var amount = Number(req.body.amount);
  var purpose = String(req.body.purpose || '').trim();
  var requestKey = String(req.body.requestKey || '').trim() || ('grant:' + req.user._id + ':' + crypto.randomBytes(18).toString('hex'));

  if (!isFinite(amount) || amount <= 0 || !purpose || purpose.length > 500) {
    req.flash('error_msg', 'Enter a valid amount and explain the purpose of the grant.');
    return res.redirect('/grants');
  }

  Grant.findOne({ requestKey: requestKey }).then(function (duplicate) {
    if (duplicate) return duplicate;
    return Grant.findOne({ user: req.user._id, status: 'processing' });
  }).then(function (existing) {
    if (existing) {
      if (existing.requestKey === requestKey) {
        req.flash('success_msg', 'This grant application was already submitted.');
        return res.redirect('/grants');
      }
      throw new Error('You already have a grant application under review.');
    }

    return new Grant({
      user: req.user._id,
      requestKey: requestKey || undefined,
      amount: amount,
      purpose: purpose
    }).save();
  }).then(function (grant) {
    return new Notification({
      user: req.user._id,
      type: 'system',
      title: 'Grant Application Received',
      message: 'Your grant application for €' + amount.toFixed(2) + ' is now under review.',
      severity: 'info',
      actionUrl: '/grants',
      referenceType: 'Grant',
      referenceId: grant._id
    }).save();
  }).then(function () {
    req.flash('success_msg', 'Your grant application has been submitted.');
    res.redirect('/grants');
  }).catch(function (err) {
    req.flash('error_msg', err.message || 'Unable to submit grant application.');
    res.redirect('/grants');
  });
});

/* Refunds */
router.get('/refunds', isAuth, kycGate, function (req, res) {
  Promise.all([
    Refund.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(20).populate('transaction', 'reference amount description createdAt'),
    Transaction.find({
      $or: [{ sender: req.user._id }, { receiver: req.user._id }],
      status: 'completed',
      type: { $in: ['internal_transfer', 'wire_transfer', 'deposit', 'airtime', 'withdrawal'] }
    }).sort({ createdAt: -1 }).limit(30).select('reference amount description type createdAt sender receiver')
  ]).then(function (results) {
    res.render('dashboard/refunds', {
      title: 'Refunds',
      refunds: results[0],
      eligibleTransactions: results[1]
    });
  }).catch(function (err) {
    console.error(err);
    res.redirect('/dashboard');
  });
});

router.post('/refunds/request', isAuth, kycGate, activeAccount, pinGate, function (req, res) {
  var amount = Number(req.body.amount);
  var reason = String(req.body.reason || '').trim();
  var transactionId = String(req.body.transactionId || '').trim();
  var requestKey = String(req.body.requestKey || '').trim() || ('refund:' + req.user._id + ':' + crypto.randomBytes(18).toString('hex'));

  if (!transactionId || !isFinite(amount) || amount <= 0 || !reason || reason.length > 500) {
    req.flash('error_msg', 'Select a transaction, amount and reason for the refund.');
    return res.redirect('/refunds');
  }

  Transaction.findOne({
    _id: transactionId,
    status: 'completed',
    $or: [{ sender: req.user._id }, { receiver: req.user._id }]
  }).then(function (transaction) {
    if (!transaction) throw new Error('That transaction is not eligible for a refund.');

    if (amount > Number(transaction.amount || 0)) {
      throw new Error('Refund amount cannot exceed the original transaction amount.');
    }

    return Refund.findOne({
      user: req.user._id,
      transaction: transaction._id,
      status: { $in: ['pending', 'approved', 'completed'] }
    }).then(function (existing) {
      if (existing) throw new Error('A refund already exists for this transaction.');
      return new Refund({
        user: req.user._id,
        transaction: transaction._id,
        requestKey: requestKey || undefined,
        amount: amount,
        reason: reason
      }).save();
    });
  }).then(function (refund) {
    return new Notification({
      user: req.user._id,
      type: 'system',
      title: 'Refund Request Received',
      message: 'Your refund request for €' + amount.toFixed(2) + ' is under review.',
      severity: 'info',
      actionUrl: '/refunds',
      referenceType: 'Refund',
      referenceId: refund._id
    }).save();
  }).then(function () {
    req.flash('success_msg', 'Your refund request has been submitted.');
    res.redirect('/refunds');
  }).catch(function (err) {
    req.flash('error_msg', err.message || 'Unable to submit refund request.');
    res.redirect('/refunds');
  });
});

module.exports = router;
