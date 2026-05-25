var express = require('express');
var router = express.Router();
var User = require('../models/User');
var bcrypt = require('bcryptjs');

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in.');
  res.redirect('/login');
}

// Update profile info
router.post('/update-profile', isAuth, function (req, res) {
  var phone   = req.body.phone;
  var street  = req.body.street;
  var city    = req.body.city;
  var country = req.body.country;
  var zip     = req.body.zip;

  User.findByIdAndUpdate(req.user._id, {
    phone: phone,
    address: { street, city, country, zip }
  }).then(function () {
    req.flash('success_msg', 'Profile updated successfully.');
    res.redirect('/dashboard/profile');
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Could not update profile.');
    res.redirect('/dashboard/profile');
  });
});

// Change password
router.post('/change-password', isAuth, function (req, res) {
  var currentPassword = req.body.currentPassword;
  var newPassword     = req.body.newPassword;
  var confirmNew      = req.body.confirmNew;

  if (newPassword !== confirmNew) {
    req.flash('error_msg', 'New passwords do not match.');
    return res.redirect('/dashboard/profile');
  }

  if (newPassword.length < 8) {
    req.flash('error_msg', 'Password must be at least 8 characters.');
    return res.redirect('/dashboard/profile');
  }

  bcrypt.compare(currentPassword, req.user.password, function (err, isMatch) {
    if (err || !isMatch) {
      req.flash('error_msg', 'Current password is incorrect.');
      return res.redirect('/dashboard/profile');
    }

    bcrypt.genSalt(10, function (err, salt) {
      bcrypt.hash(newPassword, salt, function (err, hash) {
        User.findByIdAndUpdate(req.user._id, { password: hash })
          .then(function () {
            req.flash('success_msg', 'Password changed successfully.');
            res.redirect('/dashboard/profile');
          }).catch(function () {
            req.flash('error_msg', 'Failed to update password.');
            res.redirect('/dashboard/profile');
          });
      });
    });
  });
});

module.exports = router;