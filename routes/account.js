var express = require('express');
var router = express.Router();
var User = require('../models/User');
var bcrypt = require('bcryptjs');
var LedgerAccount = require('../models/LedgerAccount');
var currencies = require('../config/currencies');

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

// Update the account's operating currency. Existing funds are never silently converted.
router.post('/update-currency', isAuth, function (req, res) {
  var currency = String(req.body.currency || '').toUpperCase().trim();
  var currentPassword = req.body.currentPassword;

  if (!currencies.some(function (item) { return item.code === currency; })) {
    req.flash('error_msg', 'Please choose a supported currency.');
    return res.redirect('/dashboard/profile');
  }

  if (!currentPassword) {
    req.flash('error_msg', 'Enter your current password to change account currency.');
    return res.redirect('/dashboard/profile');
  }

  bcrypt.compare(currentPassword, req.user.password, function (passwordErr, matches) {
    if (passwordErr || !matches) {
      req.flash('error_msg', 'Current password is incorrect. Currency was not changed.');
      return res.redirect('/dashboard/profile');
    }

    LedgerAccount.findOne({ owner: req.user._id }).then(function (account) {
      if (Number(req.user.balance || 0) > 0 || (account && Number(account.balance || 0) > 0)) {
        req.flash('error_msg', 'Your account has a balance. To protect your money, currency cannot be changed until the balance is zero. Currency conversion is not enabled yet.');
        return res.redirect('/dashboard/profile');
      }

      if (account) {
        return LedgerAccount.findOneAndUpdate(
          { _id: account._id, balance: 0, status: 'active' },
          { $set: { currency: currency } },
          { new: true }
        ).then(function (updatedAccount) {
          if (!updatedAccount) {
            req.flash('error_msg', 'Your account changed while we were saving. Please refresh and try again.');
            return res.redirect('/dashboard/profile');
          }
          return User.findByIdAndUpdate(req.user._id, { $set: { currency: currency } })
            .then(function () {
              req.flash('success_msg', 'Account currency updated to ' + currency + '.');
              res.redirect('/dashboard/profile');
            });
        });
      }

      return User.findByIdAndUpdate(req.user._id, { $set: { currency: currency } }).then(function () {
        req.flash('success_msg', 'Account currency updated to ' + currency + '.');
        res.redirect('/dashboard/profile');
      });
    }).catch(function (err) {
      console.error('Account currency update failed:', err);
      req.flash('error_msg', 'Could not update account currency. Please try again.');
      res.redirect('/dashboard/profile');
    });
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