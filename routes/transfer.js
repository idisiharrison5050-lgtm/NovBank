var express = require('express');
var router = express.Router();
var User = require('../models/User');
var Transaction = require('../models/Transaction');
var Notification = require('../models/Notification');

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in.');
  res.redirect('/login');
}

// Internal Transfer
router.get('/', isAuth, function (req, res) {
  res.render('dashboard/transfer', { title: 'Send Money', unreadCount: 0 });
});

router.post('/', isAuth, function (req, res) {
  var identifier = req.body.identifier;
  var amount     = parseFloat(req.body.amount);
  var description = req.body.description || '';
  var category   = req.body.category || 'Transfer';
  var senderId   = req.user._id;

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
        return Promise.all([senderNotif.save(), recipientNotif.save()]);
      })
      .then(function () {
        req.flash('success_msg', 'Transfer of €' + amount.toFixed(2) + ' completed successfully.');
        res.redirect('/dashboard');
      });
  })
  .catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Transfer failed. Please try again.');
    res.redirect('/transfer');
  });
});

// Wire Transfer
router.get('/wire', isAuth, function (req, res) {
  res.render('dashboard/wire-transfer', { title: 'Wire Transfer', unreadCount: 0 });
});

router.post('/wire', isAuth, function (req, res) {
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
      req.flash('success_msg', 'Wire transfer submitted and is pending approval.');
      res.redirect('/dashboard');
    })
    .catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Wire transfer failed. Please try again.');
      res.redirect('/transfer/wire');
    });
});

var Notification = require('../models/Notification');

// Deposit Page
router.get('/deposit', isAuth, function (req, res) {
  res.render('dashboard/deposit', {
    title: 'Deposit Funds',
    unreadCount: 0
  });
});

// Deposit Submission
router.post('/deposit', isAuth, function (req, res) {
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
    req.flash('success_msg', 'Deposit request submitted. Your balance will be updated once we verify the transfer.');
    res.redirect('/dashboard/transactions');
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Something went wrong. Please try again.');
    res.redirect('/transfer/deposit');
  });
});

module.exports = router;