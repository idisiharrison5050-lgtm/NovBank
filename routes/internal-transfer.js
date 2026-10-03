var express = require('express');
var router = express.Router();
var User = require('../models/User');
var Notification = require('../models/Notification');
var mailer = require('../config/mailer');
var ledger = require('../services/ledger');
var bcrypt = require('bcryptjs');
var accountLimits = require('../services/accountLimits');

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in.');
  res.redirect('/login');
}

function isPinVerified(req, res, next) {
  if (req.session.pinVerified) return next();
  res.redirect('/pin');
}

function verifyPin(req, res, callback) {
  if (!req.user.pinSet) {
    req.flash('error_msg', 'You have not set up a transaction PIN yet.');
    return res.redirect('/transfer');
  }

  bcrypt.compare(req.body.transactionPin, req.user.pin, function (err, isMatch) {
    if (err || !isMatch) {
      req.flash('error_msg', 'Incorrect PIN. Transaction cancelled.');
      return res.redirect('/transfer');
    }
    callback();
  });
}

router.get('/', isAuth, isPinVerified, function (req, res) {
  req.session.transferRequestKey = 'WEB-' + req.user._id.toString() + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000000);

  /*
   * The transfer view supports an optional prefilled recipient and a
   * saved-recipient section. These values were previously omitted from
   * render(), which caused EJS to throw ReferenceError when the page loaded.
   *
   * Keep the saved-recipient collection empty until a persistent beneficiary
   * model/service is wired into this route; an empty collection is valid for
   * the view and preserves the transfer flow.
   */
  var prefillRecipient = typeof req.query.recipient === 'string' ? req.query.recipient : '';

  res.render('dashboard/transfer', {
    title: 'Send Money',
    unreadCount: 0,
    prefillRecipient: prefillRecipient,
    beneficiaries: []
  });
});

router.post('/', isAuth, isPinVerified, function (req, res) {
  verifyPin(req, res, function () {
    var identifier = req.body.identifier;
    var amount = parseFloat(req.body.amount);
    var description = req.body.description || '';
    var category = req.body.category || 'Transfer';
    var idempotencyKey = req.body.idempotencyKey || req.session.transferRequestKey;

    if (!idempotencyKey) {
      idempotencyKey = 'WEB-' + req.user._id.toString() + '-' + Date.now() + '-' + Math.floor(Math.random() * 1000000);
    }

    if (!identifier || isNaN(amount) || amount <= 0) {
      req.flash('error_msg', 'Invalid transfer details.');
      return res.redirect('/transfer');
    }

    User.findOne({
      $or: [
        { accountNumber: identifier },
        { email: identifier.toLowerCase() },
        { username: identifier.toLowerCase() }
      ]
    }).then(function (recipient) {
      if (!recipient) throw new Error('Recipient not found.');
      if (recipient._id.toString() === req.user._id.toString()) throw new Error('You cannot transfer to yourself.');

      return new Promise(function (resolve, reject) {
        accountLimits.checkTransferLimit(req.user, amount, function (limitErr) {
          if (limitErr) return reject(limitErr);
          ledger.transferInternal({
            senderId: req.user._id,
            receiverId: recipient._id,
            amount: amount,
            description: description,
            category: category,
            idempotencyKey: idempotencyKey
          }, function (err, result) {
            if (err) return reject(err);
            resolve({ recipient: recipient, result: result });
          });
        });
      });
    }).then(function (payload) {
      var txn = payload.result.transaction;
      var recipient = payload.recipient;

      return Promise.all([
        new Notification({
          user: req.user._id,
          title: 'Transfer Sent',
          message: 'You sent €' + amount.toFixed(2) + ' to ' + recipient.firstName + ' ' + recipient.lastName + '.',
          type: 'success'
        }).save(),
        new Notification({
          user: recipient._id,
          title: 'Money Received',
          message: 'You received €' + amount.toFixed(2) + ' from ' + req.user.firstName + ' ' + req.user.lastName + '.',
          type: 'success'
        }).save(),
        mailer.transferSentEmail(req.user, amount, recipient.firstName + ' ' + recipient.lastName),
        mailer.transferReceivedEmail(recipient, amount, req.user.firstName + ' ' + req.user.lastName)
      ]).then(function () {
        req.session.transferRequestKey = null;
        req.session.receipt = {
          amount: txn.amount,
          reference: txn.reference,
          date: new Date(txn.createdAt).toLocaleString('en-GB'),
          type: 'Internal Transfer',
          from: req.user.firstName + ' ' + req.user.lastName + ' (' + req.user.accountNumber + ')',
          to: recipient.firstName + ' ' + recipient.lastName + ' (' + recipient.accountNumber + ')',
          description: txn.description || '-',
          category: txn.category,
          status: txn.status
        };
        res.redirect('/transfer/receipt');
      });
    }).catch(function (err) {
      console.error('Atomic transfer error:', err);
      req.flash('error_msg', err.message || 'Transfer failed. Please try again.');
      res.redirect('/transfer');
    });
  });
});

module.exports = router;
