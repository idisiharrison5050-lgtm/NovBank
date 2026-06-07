var express = require('express');
var router = express.Router();
var User = require('../models/User');
var Transaction = require('../models/Transaction');
var Notification = require('../models/Notification');
var mailer = require('../config/mailer');

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in.');
  res.redirect('/login');
}

function isPinVerified(req, res, next) {
  if (req.session.pinVerified) return next();
  res.redirect('/pin');
}
function verifyPin(req, res, redirectOnFail, callback) {
  var enteredPin = req.body.transactionPin;

  if (!req.user.pinSet) {
    req.flash('error_msg', 'You have not set up a transaction PIN yet. Please set one in your profile settings before making transactions.');
    return res.redirect(redirectOnFail);
  }

  var bcrypt = require('bcryptjs');
  bcrypt.compare(enteredPin, req.user.pin, function (err, isMatch) {
    if (err || !isMatch) {
      req.flash('error_msg', 'Incorrect PIN. Transaction cancelled.');
      return res.redirect(redirectOnFail);
    }
    callback();
  });
}

function checkAccountActive(req, res, redirectOnFail, callback) {
  if (req.user.accountStatus !== 'active') {
    req.flash('error_msg', 'Your account is suspended or closed. You cannot make transactions. Please contact support.');
    return res.redirect(redirectOnFail);
  }
  callback();
}

// Internal Transfer
router.get('/', isAuth, isPinVerified, function (req, res) {
  res.render('dashboard/transfer', { title: 'Send Money', unreadCount: 0 });
});

router.post('/', isAuth, isPinVerified, function (req, res) {
  verifyPin(req, res, '/transfer', function () {
  checkAccountActive(req, res, '/transfer', function () {
    var identifier  = req.body.identifier;
    var amount      = parseFloat(req.body.amount);
    var description = req.body.description || '';
    var category    = req.body.category || 'Transfer';
    var senderId    = req.user._id;

    if (!identifier || isNaN(amount) || amount <= 0) {
      req.flash('error_msg', 'Invalid transfer details.');
      return res.redirect('/transfer');
    }

    if (amount > req.user.balance) {
      req.flash('error_msg', 'Insufficient funds.');
      return res.redirect('/transfer');
    }

    User.findOne({
      $or: [
        { accountNumber: identifier },
        { email: identifier.toLowerCase() },
        { username: identifier.toLowerCase() }
      ]
    }).then(function (recipient) {
      if (!recipient) {
        req.flash('error_msg', 'Recipient not found.');
        return res.redirect('/transfer');
      }

      if (recipient._id.toString() === senderId.toString()) {
        req.flash('error_msg', 'You cannot transfer to yourself.');
        return res.redirect('/transfer');
      }

      return User.findByIdAndUpdate(senderId, { $inc: { balance: -amount } })
        .then(function () {
          return User.findByIdAndUpdate(recipient._id, { $inc: { balance: amount } });
        })
        .then(function () {
          var txn = new Transaction({
            sender:      senderId,
            receiver:    recipient._id,
            type:        'internal_transfer',
            amount:      amount,
            description: description,
            category:    category,
            status:      'completed'
          });
          return txn.save();
        })
        .then(function () {
          return Transaction.findOne({ sender: senderId, type: 'internal_transfer' })
            .sort({ createdAt: -1 })
            .populate('sender receiver', 'firstName lastName accountNumber');
        })
        .then(function (txn) {
          var senderNotif = new Notification({
            user:    senderId,
            title:   'Transfer Sent',
            message: 'You sent €' + amount.toFixed(2) + ' to ' + recipient.firstName + ' ' + recipient.lastName + '.',
            type:    'success'
          });
          var recipientNotif = new Notification({
            user:    recipient._id,
            title:   'Money Received',
            message: 'You received €' + amount.toFixed(2) + ' from ' + req.user.firstName + ' ' + req.user.lastName + '.',
            type:    'success'
          });
          return Promise.all([
            senderNotif.save(),
            recipientNotif.save(),
            mailer.transferSentEmail(req.user, amount, recipient.firstName + ' ' + recipient.lastName),
            mailer.transferReceivedEmail(recipient, amount, req.user.firstName + ' ' + req.user.lastName),
            mailer.adminWithdrawalNotification(
              req.user.firstName + ' ' + req.user.lastName,
              req.user.email,
              req.user.accountNumber,
              amount,
              'Internal Transfer'
            )
          ]).then(function () {
            req.session.receipt = {
              amount:      txn.amount,
              reference:   txn.reference,
              date:        new Date(txn.createdAt).toLocaleString('en-GB'),
              type:        'Internal Transfer',
              from:        txn.sender.firstName + ' ' + txn.sender.lastName + ' (' + txn.sender.accountNumber + ')',
              to:          txn.receiver.firstName + ' ' + txn.receiver.lastName + ' (' + txn.receiver.accountNumber + ')',
              description: txn.description || '-',
              category:    txn.category,
              status:      txn.status
            };
            res.redirect('/transfer/receipt');
          });
        });
    })
    .catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Transfer failed. Please try again.');
      res.redirect('/transfer');
    });
  });
});
});

// Wire Transfer
router.get('/wire', isAuth, isPinVerified, function (req, res) {
  res.render('dashboard/wire-transfer', { title: 'Wire Transfer', unreadCount: 0 });
});

router.post('/wire', isAuth, isPinVerified, function (req, res) {
  verifyPin(req, res, '/transfer/wire', function () {
  checkAccountActive(req, res, '/transfer/wire', function () {
    var amount        = parseFloat(req.body.amount);
    var recipientName = req.body.recipientName;
    var iban          = req.body.iban;
    var bic           = req.body.bic;
    var bankName      = req.body.bankName;
    var bankCountry   = req.body.bankCountry;
    var reference     = req.body.reference || '';
    var description   = req.body.description || '';
    var category      = req.body.category || 'Transfer';

    if (!amount || !recipientName || !iban || !bic || !bankName || !bankCountry) {
      req.flash('error_msg', 'Please fill in all required wire transfer fields.');
      return res.redirect('/transfer/wire');
    }

    if (isNaN(amount) || amount <= 0) {
      req.flash('error_msg', 'Enter a valid amount.');
      return res.redirect('/transfer/wire');
    }

    if (amount > req.user.balance) {
      req.flash('error_msg', 'Insufficient funds.');
      return res.redirect('/transfer/wire');
    }

    User.findByIdAndUpdate(req.user._id, { $inc: { balance: -amount } })
      .then(function () {
        var txn = new Transaction({
          sender:      req.user._id,
          type:        'wire_transfer',
          amount:      amount,
          description: description,
          category:    category,
          status:      'pending',
          wireDetails: {
            recipientName: recipientName,
            iban:          iban,
            bic:           bic,
            bankName:      bankName,
            bankCountry:   bankCountry,
            reference:     reference
          }
        });
        return txn.save();
      })
      .then(function () {
        var notif = new Notification({
          user:    req.user._id,
          title:   'Wire Transfer Initiated',
          message: 'Your wire transfer of €' + amount.toFixed(2) + ' to ' + recipientName + ' is pending processing.',
          type:    'info'
        });
        return notif.save();
      })
      .then(function () {
        mailer.wireTransferEmail(req.user, amount, recipientName, iban, bankName);
        // Notify admin about the new wire transfer
        mailer.adminWithdrawalNotification(
         req.user.firstName + ' ' + req.user.lastName,
         req.user.email,
         req.user.accountNumber,
         amount,
         'Wire Transfer'
       );
        req.session.receipt = {
          amount:      amount,
          reference:   'TXN' + Date.now(),
          date:        new Date().toLocaleString('en-GB'),
          type:        'Wire Transfer',
          from:        req.user.firstName + ' ' + req.user.lastName + ' (' + req.user.accountNumber + ')',
          to:          recipientName + ' — ' + iban + ' (' + bankName + ')',
          description: description || '-',
          category:    category,
          status:      'pending'
        };
        res.redirect('/transfer/receipt');
      })
      .catch(function (err) {
        console.error(err);
        req.flash('error_msg', 'Wire transfer failed. Please try again.');
        res.redirect('/transfer/wire');
      });
  });
});
});


// Deposit Page
router.get('/deposit', isPinVerified, isAuth, function (req, res) {
  res.render('dashboard/deposit', {
    title: 'Deposit Funds',
    unreadCount: 0
  });
});

// Deposit Submission
router.post('/deposit', isAuth, isPinVerified, function (req, res) {
  verifyPin(req, res, '/transfer/deposit', function () {
    var amount      = parseFloat(req.body.amount);
    var description = req.body.description || '';

    if (!amount || isNaN(amount) || amount <= 0) {
      req.flash('error_msg', 'Please enter a valid amount.');
      return res.redirect('/transfer/deposit');
    }

    var txn = new Transaction({
      sender:      req.user._id,
      type:        'deposit',
      amount:      amount,
      description: description,
      category:    'Transfer',
      status:      'pending'
    });

    txn.save().then(function () {
      var notif = new Notification({
        user:    req.user._id,
        title:   'Deposit Request Received',
        message: 'Your deposit of €' + amount.toFixed(2) + ' is pending verification. It will be credited once confirmed.',
        type:    'info'
      });
      return notif.save();
    }).then(function () {
      return Promise.all([
        mailer.depositRequestEmail(req.user, amount),
        mailer.adminWithdrawalNotification(
          req.user.firstName + ' ' + req.user.lastName,
          req.user.email,
          req.user.accountNumber,
          amount,
          'Deposit Request'
        )
      ]);
    }).then(function () {
      req.flash('success_msg', 'Deposit request submitted. Your balance will be updated once we verify the transfer.');
      res.redirect('/dashboard/transactions');
    }).catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Something went wrong. Please try again.');
      res.redirect('/transfer/deposit');
    });
  });
});

router.get('/receipt', isAuth, isPinVerified, function (req, res) {
  if (!req.session.receipt) return res.redirect('/dashboard');
  var receipt = req.session.receipt;
  delete req.session.receipt;
  res.render('dashboard/receipt', { title: 'Receipt', receipt: receipt, unreadCount: 0 });
});

module.exports = router;