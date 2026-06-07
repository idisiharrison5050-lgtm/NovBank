var express  = require('express');
var router   = express.Router();
var KYC      = require('../models/KYC');
var User     = require('../models/User');
var Notification = require('../models/Notification');
var { upload } = require('../config/cloudinary');
var mailer   = require('../config/mailer');

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in.');
  res.redirect('/login');
}

// KYC gate middleware — used in dashboard routes
function kycGate(req, res, next) {
  if (!req.isAuthenticated()) return res.redirect('/login');
  var status = req.user.kycStatus;
  if (status === 'approved') return next();
  if (status === 'none')     return res.redirect('/kyc/verify');
  if (status === 'pending')  return res.redirect('/kyc/pending');
  if (status === 'declined') return res.redirect('/kyc/declined');
  return res.redirect('/kyc/verify');
}

// Verify page
router.get('/verify', isAuth, function (req, res) {
  if (req.user.kycStatus === 'approved') return res.redirect('/dashboard');
  if (req.user.kycStatus === 'pending')  return res.redirect('/kyc/pending');
  res.render('kyc/verify', { title: 'Verify Your Identity' });
});

// Submit KYC
router.post('/verify', isAuth, upload.fields([
  { name: 'frontImage', maxCount: 1 },
  { name: 'backImage',  maxCount: 1 }
]), function (req, res) {
  if (req.user.kycStatus === 'approved') return res.redirect('/dashboard');

  var idType       = req.body.idType;
  var idNumber     = req.body.idNumber;
  var dateOfIssue  = req.body.dateOfIssue;
  var dateOfExpiry = req.body.dateOfExpiry;

  if (!idType || !idNumber || !dateOfIssue || !dateOfExpiry) {
    req.flash('error_msg', 'Please fill in all fields.');
    return res.redirect('/kyc/verify');
  }

  if (!req.files || !req.files.frontImage || !req.files.backImage) {
    req.flash('error_msg', 'Please upload both front and back images of your ID.');
    return res.redirect('/kyc/verify');
  }

  var frontImage = req.files.frontImage[0].path;
  var backImage  = req.files.backImage[0].path;

  // Remove existing declined KYC if resubmitting
  KYC.findOneAndDelete({ user: req.user._id })
    .then(function () {
      var kyc = new KYC({
        user:         req.user._id,
        idType:       idType,
        idNumber:     idNumber,
        dateOfIssue:  dateOfIssue,
        dateOfExpiry: dateOfExpiry,
        frontImage:   frontImage,
        backImage:    backImage,
        status:       'pending'
      });
      return kyc.save();
    })
    .then(function () {
      return User.findByIdAndUpdate(req.user._id, { kycStatus: 'pending' });
    })
    .then(function () {
      // notify admins of new KYC submission
      try {
        mailer.adminKycNotification(
          req.user.firstName + ' ' + req.user.lastName,
          req.user.email,
          req.user.accountNumber
        );
      } catch (e) {
        console.error('Admin KYC notification failed:', e);
      }
      res.redirect('/kyc/pending');
    })
    .catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Something went wrong. Please try again.');
      res.redirect('/kyc/verify');
    });
});

// Pending page
router.get('/pending', isAuth, function (req, res) {
  if (req.user.kycStatus === 'approved') return res.redirect('/dashboard');
  if (req.user.kycStatus === 'none')     return res.redirect('/kyc/verify');
  res.render('kyc/pending', { title: 'Verification Pending' });
});

// Declined page
router.get('/declined', isAuth, function (req, res) {
  if (req.user.kycStatus === 'approved') return res.redirect('/dashboard');
  KYC.findOne({ user: req.user._id }).then(function (kyc) {
    res.render('kyc/declined', {
      title: 'Verification Declined',
      declineReason: kyc ? kyc.declineReason : ''
    });
  }).catch(function () {
    res.render('kyc/declined', { title: 'Verification Declined', declineReason: '' });
  });
});

module.exports = { router, kycGate };