var express      = require('express');
var router       = express.Router();
var Loan         = require('../models/Loan');
var User         = require('../models/User');
var Transaction  = require('../models/Transaction');
var Notification = require('../models/Notification');
var ledger = require('../services/ledger');

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in.');
  res.redirect('/login');
}

function checkAccountActive(req, res, redirectOnFail, callback) {
  if (req.user.accountStatus !== 'active') {
    req.flash('error_msg', 'Your account is suspended or closed. You cannot make transactions. Please contact support.');
    return res.redirect(redirectOnFail);
  }
  callback();
}

// Loan page
router.get('/', isAuth, function (req, res) {
  Loan.findOne({ user: req.user._id, status: { $in: ['pending', 'approved'] } })
    .then(function (activeLoan) {
      res.render('dashboard/loans', {
        title: 'Loan',
        activeLoan: activeLoan,
        unreadCount: 0
      });
    }).catch(function (err) {
      console.error(err);
      res.redirect('/dashboard');
    });
});

// Request loan
router.post('/request', isAuth, function (req, res) {
  var amount          = parseFloat(req.body.amount);
  var purpose         = req.body.purpose;
  var repaymentPeriod = parseInt(req.body.repaymentPeriod);

  if (!amount || isNaN(amount) || amount <= 0) {
    req.flash('error_msg', 'Please enter a valid loan amount.');
    return res.redirect('/loans');
  }

  if (!purpose || !repaymentPeriod) {
    req.flash('error_msg', 'Please fill in all fields.');
    return res.redirect('/loans');
  }

  // Check no active loan
  Loan.findOne({ user: req.user._id, status: { $in: ['pending', 'approved'] } })
    .then(function (existing) {
      if (existing) {
        req.flash('error_msg', 'You already have an active loan. Please repay it before requesting another.');
        return res.redirect('/loans');
      }

      var loan = new Loan({
        user:            req.user._id,
        amount:          amount,
        purpose:         purpose,
        repaymentPeriod: repaymentPeriod,
        totalDue:        amount,
        amountRepaid:    0,
        outstanding:     amount
      });

      return loan.save().then(function () {
        var notif = new Notification({
          user:    req.user._id,
          title:   'Loan Request Received',
          message: 'Your loan request of €' + amount.toFixed(2) + ' is under review.',
          type:    'info'
        });
        return notif.save();
      }).then(function () {
        req.flash('success_msg', 'Loan request submitted successfully.');
        res.redirect('/loans');
      });
    }).catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Failed to submit loan request.');
      res.redirect('/loans');
    });
});

// Repay approved loan
router.post('/repay', isAuth, function (req, res) {
  checkAccountActive(req, res, '/loans', function () {
    var amount = parseFloat(req.body.amount);
    if (!amount || isNaN(amount) || amount <= 0) {
      req.flash('error_msg', 'Enter a valid repayment amount.');
      return res.redirect('/loans');
    }
    Loan.findOne({ user: req.user._id, status: 'approved' }).then(function (loan) {
      if (!loan) {
        req.flash('error_msg', 'No approved loan is available for repayment.');
        return res.redirect('/loans');
      }
      if (amount > loan.outstanding) amount = loan.outstanding;
      return new Promise(function (resolve, reject) {
        ledger.createDebit({
          userId: req.user._id,
          type: 'withdrawal',
          amount: amount,
          description: 'Loan repayment',
          category: 'Loan',
          idempotencyKey: 'loan-repayment:' + loan._id + ':' + Date.now()
        }, function (err, txn) {
          if (err) return reject(err);
          resolve(txn);
        });
      }).then(function () {
        loan.amountRepaid = Math.round((Number(loan.amountRepaid || 0) + amount) * 100) / 100;
        loan.outstanding = Math.max(0, Math.round((Number(loan.totalDue || loan.amount) - loan.amountRepaid) * 100) / 100);
        if (loan.outstanding === 0) loan.status = 'repaid';
        return loan.save();
      }).then(function () {
        return new Notification({
          user: req.user._id,
          title: loan.status === 'repaid' ? 'Loan Repaid' : 'Loan Repayment Received',
          message: '€' + amount.toFixed(2) + ' has been applied to your loan.',
          type: 'success'
        }).save();
      }).then(function () {
        req.flash('success_msg', loan.status === 'repaid' ? 'Your loan has been fully repaid.' : 'Loan repayment received.');
        res.redirect('/loans');
      });
    }).catch(function (err) {
      console.error(err);
      req.flash('error_msg', err.message === 'Insufficient funds' ? 'Insufficient funds for this repayment.' : 'Unable to process repayment.');
      res.redirect('/loans');
    });
  });
});


module.exports = router;