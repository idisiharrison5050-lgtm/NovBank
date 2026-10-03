var express = require('express');
var router = express.Router();
var User = require('../models/User');
var Notification = require('../models/Notification');
var mailer = require('../config/mailer');
var ledger = require('../services/ledger');
var bcrypt = require('bcryptjs');
var accountLimits = require('../services/accountLimits');
var Beneficiary = require('../models/Beneficiary');

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

  Beneficiary.find({ user: req.user._id, kind: 'local' }).sort({ lastUsedAt: -1, createdAt: -1 }).limit(8).exec(function (err, beneficiaries) {
    if (err) {
      console.error('Transfer beneficiary load failed:', err);
      beneficiaries = [];
    }
    res.render('dashboard/transfer', {
      title: 'Send Money',
      unreadCount: 0,
      prefillRecipient: prefillRecipient,
      beneficiaries: beneficiaries || []
    });
  });
});

router.post('/', isAuth, isPinVerified, function (req, res) {
  verifyPin(req, res, function () {
    if (req.user.accountStatus !== 'active') {
      req.flash('error_msg', 'Your account is suspended or closed. You cannot make transactions. Please contact support.');
      return res.redirect('/transfer');
    }
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

      var identifierKey = String(identifier).trim().toLowerCase();
      var saveRecipient = req.body.saveRecipient === 'on';

      var beneficiaryPromise = saveRecipient
        ? Beneficiary.findOneAndUpdate(
            { user: req.user._id, identifier: identifierKey, kind: 'local' },
            { user: req.user._id, identifier: identifierKey, name: recipient.firstName + ' ' + recipient.lastName, kind: 'local', lastUsedAt: new Date() },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          )
        : Beneficiary.updateOne(
            { user: req.user._id, identifier: identifierKey, kind: 'local' },
            { $set: { lastUsedAt: new Date() } }
          );

      return beneficiaryPromise.then(function () {
        return Promise.all([
        new Notification({
          user: req.user._id,
          title: 'Transfer Sent',
          message: 'You sent €' + amount.toFixed(2) + ' to ' + recipient.firstName + ' ' + recipient.lastName + '.',
          type: 'transaction',
          severity: 'success'
        }).save(),
        new Notification({
          user: recipient._id,
          title: 'Money Received',
          message: 'You received €' + amount.toFixed(2) + ' from ' + req.user.firstName + ' ' + req.user.lastName + '.',
          type: 'transaction',
          severity: 'success'
        }).save(),
        mailer.transferSentEmail(req.user, amount, recipient.firstName + ' ' + recipient.lastName),
        mailer.transferReceivedEmail(recipient, amount, req.user.firstName + ' ' + req.user.lastName)
      ]);
      }).then(function () {
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


router.post('/beneficiaries/:id/delete', isAuth, isPinVerified, function (req, res) {
  Beneficiary.deleteOne({ _id: req.params.id, user: req.user._id, kind: 'local' }).then(function () {
    req.flash('success_msg', 'Saved recipient removed.');
    res.redirect('/transfer');
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Unable to remove saved recipient.');
    res.redirect('/transfer');
  });
});

module.exports = router;
