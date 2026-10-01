var express = require('express');
var router = express.Router();
var User = require('../models/User');
var Transaction = require('../models/Transaction');
var Notification = require('../models/Notification');
var mailer = require('../config/mailer');
var ledger = require('../services/ledger');
var { uploadDeposit } = require('../config/cloudinary');

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
      var recipient;
      var identifier=req.body.identifier;
      var amount=parseFloat(req.body.amount);
      var description=req.body.description || '';
      var category=req.body.category || 'Transfer';
      if(!identifier || isNaN(amount) || amount<=0){req.flash('error_msg','Invalid transfer details.');return res.redirect('/transfer');}
      User.findOne({$or:[{accountNumber:identifier},{email:identifier.toLowerCase()},{username:identifier.toLowerCase()}]}).then(function(foundRecipient){
        recipient=foundRecipient;
        if(!recipient){req.flash('error_msg','Recipient not found.');return res.redirect('/transfer');}
        if(recipient._id.toString()===req.user._id.toString()){req.flash('error_msg','You cannot transfer to yourself.');return res.redirect('/transfer');}
        return new Promise(function(resolve,reject){
          ledger.transferInternal({senderId:req.user._id,receiverId:recipient._id,amount:amount,description:description,category:category,idempotencyKey:'internal:'+req.user._id+':'+Date.now()+':'+Math.floor(Math.random()*1000000)},function(err,txn){if(err)return reject(err);resolve(txn);});
        });
      }).then(function(txn){
        return Promise.all([
          new Notification({user:req.user._id,title:'Transfer Sent',message:'You sent €'+amount.toFixed(2)+' to '+txn.receiver.firstName+' '+txn.receiver.lastName+'.',type:'success'}).save(),
          new Notification({user:recipient._id,title:'Money Received',message:'You received €'+amount.toFixed(2)+' from '+req.user.firstName+' '+req.user.lastName+'.',type:'success'}).save(),
          mailer.transferSentEmail(req.user,amount,recipient.firstName+' '+recipient.lastName),
          mailer.transferReceivedEmail(recipient,amount,req.user.firstName+' '+req.user.lastName)
        ]).then(function(){req.session.receipt={amount:txn.amount,reference:txn.reference,date:new Date(txn.createdAt).toLocaleString('en-GB'),type:'Internal Transfer',from:req.user.firstName+' '+req.user.lastName+' ('+req.user.accountNumber+')',to:recipient.firstName+' '+recipient.lastName+' ('+recipient.accountNumber+')',description:txn.description||'-',category:txn.category,status:txn.status};res.redirect('/transfer/receipt');});
      }).catch(function(err){console.error(err);req.flash('error_msg',err.message==='Insufficient funds'?'Insufficient funds.':'Transfer failed. Please try again.');res.redirect('/transfer');});
    });
  });
});
// Wire Transfer
router.get('/wire', isAuth, isPinVerified, function (req, res) {
  res.render('dashboard/wire-transfer', { title: 'Wire Transfer', unreadCount: 0 });
});

router.post('/wire', isAuth, isPinVerified, function (req, res) {
  verifyPin(req,res,'/transfer/wire',function(){checkAccountActive(req,res,'/transfer/wire',function(){
    var amount=parseFloat(req.body.amount), recipientName=req.body.recipientName, iban=req.body.iban, bic=req.body.bic, bankName=req.body.bankName, bankCountry=req.body.bankCountry, reference=req.body.reference||'', description=req.body.description||'', category=req.body.category||'Transfer';
    if(!amount||!recipientName||!iban||!bic||!bankName||!bankCountry){req.flash('error_msg','Please fill in all required wire transfer fields.');return res.redirect('/transfer/wire');}
    if(isNaN(amount)||amount<=0){req.flash('error_msg','Enter a valid amount.');return res.redirect('/transfer/wire');}
    new Promise(function(resolve,reject){ledger.createDebit({userId:req.user._id,type:'wire_transfer',amount:amount,description:description,category:category,status:'pending',wireDetails:{recipientName:recipientName,iban:iban,bic:bic,bankName:bankName,bankCountry:bankCountry,reference:reference},idempotencyKey:'wire:'+req.user._id+':'+Date.now()+':'+Math.floor(Math.random()*1000000)},function(err,txn){if(err)reject(err);else resolve(txn);});})
    .then(function(txn){return new Notification({user:req.user._id,title:'Wire Transfer Initiated',message:'Your wire transfer of €'+amount.toFixed(2)+' to '+recipientName+' is pending processing.',type:'info'}).save().then(function(){mailer.wireTransferEmail(req.user,amount,recipientName,iban,bankName);mailer.adminWithdrawalNotification(req.user.firstName+' '+req.user.lastName,req.user.email,req.user.accountNumber,amount,'Wire Transfer');req.session.receipt={amount:amount,reference:txn.reference,date:new Date().toLocaleString('en-GB'),type:'Wire Transfer',from:req.user.firstName+' '+req.user.lastName+' ('+req.user.accountNumber+')',to:recipientName+' — '+iban+' ('+bankName+')',description:description||'-',category:category,status:'pending'};res.redirect('/transfer/receipt');});})
    .catch(function(err){console.error(err);req.flash('error_msg',err.message==='Insufficient funds'?'Insufficient funds.':'Wire transfer failed. Please try again.');res.redirect('/transfer/wire');});
  });});
});
// Deposit Page
router.get('/deposit', isAuth, isPinVerified, function (req, res) {
  res.render('dashboard/deposit', {
    title: 'Deposit Funds',
    unreadCount: 0
  });
});

// Deposit Submission
router.post('/deposit', isAuth, isPinVerified, uploadDeposit.single('proofOfPayment'), function (req, res) {
  verifyPin(req, res, '/transfer/deposit', function () {
    checkAccountActive(req, res, '/transfer/deposit', function () {
      var amount      = parseFloat(req.body.amount);
      var description = req.body.description || '';
      var proofUrl    = req.file ? req.file.path : null;

      if (!amount || isNaN(amount) || amount <= 100) {
        req.flash('error_msg', 'Please enter a valid amount (minimum €100).');
        return res.redirect('/transfer/deposit');
      }

      var txn = new Transaction({
        sender:         req.user._id,
        type:           'deposit',
        amount:         amount,
        description:    description,
        category:       'Transfer',
        status:         'pending',
        proofOfPayment: proofUrl
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
        mailer.depositRequestEmail(req.user, amount);
        mailer.adminWithdrawalNotification(
          req.user.firstName + ' ' + req.user.lastName,
          req.user.email,
          req.user.accountNumber,
          amount,
          'Deposit Request'
        );
        req.flash('success_msg', 'Deposit request submitted. Your balance will be updated once we verify the transfer.');
        res.redirect('/dashboard/transactions');
      }).catch(function (err) {
        console.error(err);
        req.flash('error_msg', 'Something went wrong. Please try again.');
        res.redirect('/transfer/deposit');
      });
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