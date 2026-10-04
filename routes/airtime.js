var express      = require('express');
var router       = express.Router();
var User         = require('../models/User');
var Transaction  = require('../models/Transaction');
var Airtime      = require('../models/Airtime');
var Notification = require('../models/Notification');
var mailer = require('../config/mailer');
var ledger = require('../services/ledger');
var bcrypt = require('bcryptjs');

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
  if (!req.session.pinVerified) {
    req.flash('error_msg', 'Please verify your transaction PIN before making an airtime recharge.');
    return res.redirect('/pin');
  }

  if (!req.user.pinSet || !req.user.pin) {
    req.flash('error_msg', 'Please set up your transaction PIN in your profile before making an airtime recharge.');
    return res.redirect('/account/profile');
  }

  bcrypt.compare(req.body.transactionPin || '', req.user.pin, function (pinErr, pinMatch) {
    if (pinErr || !pinMatch) {
      req.flash('error_msg', 'Incorrect transaction PIN. Recharge cancelled.');
      return res.redirect('/airtime');
    }

    processRecharge();
  });

  function processRecharge() {
  var phone   = String(req.body.phone || '').trim();
  var network = req.body.network;
  var amount  = parseFloat(req.body.amount);

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

  new Promise(function(resolve,reject){
    ledger.createDebit({userId:req.user._id,type:'airtime',amount:amount,description:network+' airtime recharge to '+phone,category:'Airtime',status:'completed',idempotencyKey:req.body.requestKey || ('airtime:'+req.user._id+':'+Date.now()+':'+Math.floor(Math.random()*1000000))},function(err,txn){if(err)reject(err);else resolve(txn);});
  })
    .then(function () {
      return new Airtime({user:req.user._id,phone:phone,network:network,amount:amount,status:'success'}).save();
    })
    .then(function () {
      return new Notification({user:req.user._id,title:'Airtime Recharge Successful',message:'€'+amount.toFixed(2)+' airtime sent to '+phone+' ('+network+').',type:'transaction',severity:'success'}).save();
    })
    .then(function () {
      req.flash('success_msg','Airtime recharge of €'+amount.toFixed(2)+' to '+phone+' was successful.');
      res.redirect('/airtime');
    })
    .catch(function (err) {
      console.error(err);
      req.flash('error_msg',err.message==='Insufficient funds'?'Insufficient balance.':'Recharge failed. Please try again.');
      res.redirect('/airtime');
    });
  }
});

module.exports = router;