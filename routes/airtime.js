var express      = require('express');
var router       = express.Router();
var User         = require('../models/User');
var Transaction  = require('../models/Transaction');
var Airtime      = require('../models/Airtime');
var Notification = require('../models/Notification');
var mailer = require('../config/mailer');

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

router.get('/', isAuth, function (req, res) {
  Airtime.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(10)
    .then(function (history) {
      res.render('dashboard/airtime', {
        title: 'Airtime Recharge',
        history: history,
        unreadCount: 0
      });
    }).catch(function (err) {
      console.error(err);
      res.redirect('/dashboard');
    });
});

router.post('/recharge', isAuth, checkAccountActive, function (req, res) {
  var phone   = req.body.phone;
  var network = req.body.network;
  var amount  = parseFloat(req.body.amount);

  if (req.user.accountStatus !== 'active') {
  req.flash('error_msg', 'Your account is suspended or closed. You cannot buy airtime.');
  return res.redirect('/airtime');
}

  if (req.user.accountStatus !== 'active') {
  req.flash('error_msg', 'Your account is suspended or closed. You cannot make transactions.');
  return res.redirect('/airtime');
}

  if (!phone || !network || !amount) {
    req.flash('error_msg', 'Please fill in all fields.');
    return res.redirect('/airtime');
  }

  if (isNaN(amount) || amount < 50) {
    req.flash('error_msg', 'Minimum recharge amount is €50.');
    return res.redirect('/airtime');
  }

  if (!['Telekom', 'Vodafone', 'O2'].includes(network)) {
    req.flash('error_msg', 'Please select a valid network.');
    return res.redirect('/airtime');
  }

  if (amount > req.user.balance) {
    req.flash('error_msg', 'Insufficient balance.');
    return res.redirect('/airtime');
  }

  User.findByIdAndUpdate(req.user._id, { $inc: { balance: -amount } })
    .then(function () {
      var airtime = new Airtime({
        user:    req.user._id,
        phone:   phone,
        network: network,
        amount:  amount,
        status:  'success'
      });
      return airtime.save();
    })
    .then(function () {
      var txn = new Transaction({
        sender:      req.user._id,
        type:        'airtime',
        amount:      amount,
        description: network + ' airtime recharge to ' + phone,
        category:    'Airtime',
        status:      'completed'
      });
      return txn.save();
    })
    .then(function () {
      var notif = new Notification({
        user:    req.user._id,
        title:   'Airtime Recharge Successful',
        message: '€' + amount.toFixed(2) + ' airtime sent to ' + phone + ' (' + network + ').',
        type:    'success'
      });
      return notif.save();
    })
    .then(function () {
      req.flash('success_msg', 'Airtime recharge of €' + amount.toFixed(2) + ' to ' + phone + ' was successful.');
      res.redirect('/airtime');
    })
    .catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Recharge failed. Please try again.');
      res.redirect('/airtime');
    });
});

module.exports = router;