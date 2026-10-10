var express = require('express');
var router = express.Router();
var bcrypt = require('bcryptjs');
var User = require('../models/User');
var Notification = require('../models/Notification');

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in.');
  res.redirect('/login');
}

function notifySecurity(userId, title, message, severity, actionUrl) {
  return new Notification({
    user: userId,
    type: 'security',
    title: title,
    message: message,
    severity: severity || 'warning',
    actionUrl: actionUrl || '/dashboard/security'
  }).save();
}

function verifyPassword(password, storedHash, callback) {
  if (!password || !storedHash) return callback(null, false);
  bcrypt.compare(password, storedHash, callback);
}

function verifyCurrentPin(pin, storedHash, callback) {
  if (!pin || !storedHash) return callback(null, false);
  bcrypt.compare(pin, storedHash, callback);
}

function validPin(pin) {
  return !!pin && /^\d{4}$/.test(pin);
}

// Profile/contact changes require a fresh account-password check and generate a security alert.
router.post('/account/update-profile', isAuth, function (req, res) {
  var currentPassword = req.body.currentPassword;
  var phone = (req.body.phone || '').trim();
  var street = (req.body.street || '').trim();
  var city = (req.body.city || '').trim();
  var country = (req.body.country || '').trim();
  var zip = (req.body.zip || '').trim();

  verifyPassword(currentPassword, req.user.password, function (err, isMatch) {
    if (err || !isMatch) {
      req.flash('error_msg', 'Enter your current password to confirm this profile change.');
      return res.redirect('/dashboard/profile');
    }

    User.findByIdAndUpdate(req.user._id, {
      phone: phone,
      address: { street: street, city: city, country: country, zip: zip }
    }, { new: true }).then(function () {
      return notifySecurity(
        req.user._id,
        'Profile details updated',
        'Your contact or address information was changed from your account.',
        'warning',
        '/dashboard/profile'
      );
    }).then(function () {
      req.flash('success_msg', 'Profile updated successfully.');
      res.redirect('/dashboard/profile');
    }).catch(function (updateErr) {
      console.error(updateErr);
      req.flash('error_msg', 'Could not update your profile.');
      res.redirect('/dashboard/profile');
    });
  });
});

// Password changes require the current password, notify the account, and rotate the session id.
router.post('/account/change-password', isAuth, function (req, res, next) {
  var currentPassword = req.body.currentPassword;
  var newPassword = req.body.newPassword;
  var confirmNew = req.body.confirmNew;

  if (!newPassword || newPassword.length < 8) {
    req.flash('error_msg', 'Password must be at least 8 characters.');
    return res.redirect('/dashboard/profile');
  }

  if (newPassword !== confirmNew) {
    req.flash('error_msg', 'New passwords do not match.');
    return res.redirect('/dashboard/profile');
  }

  verifyPassword(currentPassword, req.user.password, function (err, isMatch) {
    if (err || !isMatch) {
      req.flash('error_msg', 'Current password is incorrect.');
      return res.redirect('/dashboard/profile');
    }

    bcrypt.genSalt(10, function (saltErr, salt) {
      if (saltErr) {
        req.flash('error_msg', 'Failed to update password.');
        return res.redirect('/dashboard/profile');
      }
      bcrypt.hash(newPassword, salt, function (hashErr, hash) {
        if (hashErr) {
          req.flash('error_msg', 'Failed to update password.');
          return res.redirect('/dashboard/profile');
        }

        User.findByIdAndUpdate(req.user._id, { password: hash }).then(function () {
          return notifySecurity(
            req.user._id,
            'Password changed',
            'Your NovBank account password was changed successfully. If you did not make this change, secure your account immediately.',
            'critical',
            '/dashboard/security'
          );
        }).then(function () {
          var user = req.user;
          req.logout(function (logoutErr) {
            if (logoutErr) return next(logoutErr);
            req.session.regenerate(function (sessionErr) {
              if (sessionErr) return next(sessionErr);
              req.logIn(user, function (loginErr) {
                if (loginErr) return next(loginErr);
                req.session.pinVerified = false;
                req.session.pinVerifiedAt = null;
                req.flash('success_msg', 'Password changed successfully. Please re-authorize with your PIN.');
                req.session.save(function (saveErr) {
                  if (saveErr) return next(saveErr);
                  res.redirect('/pin');
                });
              });
            });
          });
        }).catch(function (updateErr) {
          console.error(updateErr);
          req.flash('error_msg', 'Failed to update password.');
          res.redirect('/dashboard/profile');
        });
      });
    });
  });
});

// Transaction PIN changes require the existing PIN and invalidate the current PIN authorization.
router.post('/change-pin', isAuth, function (req, res) {
  var currentPin = req.body.currentPin;
  var newPin = req.body.newPin;
  var confirmPin = req.body.confirmPin;

  if (!validPin(newPin)) {
    req.flash('error_msg', 'New PIN must be exactly 4 digits.');
    return res.redirect('/dashboard/profile');
  }

  if (newPin !== confirmPin) {
    req.flash('error_msg', 'New PINs do not match.');
    return res.redirect('/dashboard/profile');
  }

  if (!req.user.pinSet || !req.user.pin) {
    req.flash('error_msg', 'Your transaction PIN is not configured. Use the PIN setup flow first.');
    return res.redirect('/dashboard/profile');
  }

  verifyCurrentPin(currentPin, req.user.pin, function (err, isMatch) {
    if (err || !isMatch) {
      req.flash('error_msg', 'Current PIN is incorrect.');
      return res.redirect('/dashboard/profile');
    }

    bcrypt.genSalt(10, function (saltErr, salt) {
      if (saltErr) {
        req.flash('error_msg', 'Failed to change PIN.');
        return res.redirect('/dashboard/profile');
      }
      bcrypt.hash(newPin, salt, function (hashErr, hash) {
        if (hashErr) {
          req.flash('error_msg', 'Failed to change PIN.');
          return res.redirect('/dashboard/profile');
        }

        User.findByIdAndUpdate(req.user._id, { pin: hash, pinSet: true }).then(function () {
          return notifySecurity(
            req.user._id,
            'Transaction PIN changed',
            'Your transaction PIN was changed successfully. Protected money movement now requires fresh PIN authorization.',
            'critical',
            '/dashboard/security'
          );
        }).then(function () {
          req.session.pinVerified = false;
          req.session.pinVerifiedAt = null;
          req.flash('success_msg', 'PIN changed successfully. Please enter your new PIN before protected actions.');
          req.session.save(function (saveErr) {
            if (saveErr) {
              console.error(saveErr);
              return res.redirect('/dashboard/profile');
            }
            res.redirect('/pin');
          });
        }).catch(function (updateErr) {
          console.error(updateErr);
          req.flash('error_msg', 'Failed to change PIN.');
          res.redirect('/dashboard/profile');
        });
      });
    });
  });
});

// PIN recovery requires the account password, then invalidates the existing PIN authorization.
router.post('/reset-pin', isAuth, function (req, res) {
  var password = req.body.password;
  var newPin = req.body.newPin;
  var confirmPin = req.body.confirmPin;

  if (!validPin(newPin)) {
    req.flash('error_msg', 'PIN must be exactly 4 digits.');
    return res.redirect('/dashboard/profile');
  }

  if (newPin !== confirmPin) {
    req.flash('error_msg', 'PINs do not match.');
    return res.redirect('/dashboard/profile');
  }

  verifyPassword(password, req.user.password, function (err, isMatch) {
    if (err || !isMatch) {
      req.flash('error_msg', 'Account password is incorrect.');
      return res.redirect('/dashboard/profile');
    }

    bcrypt.genSalt(10, function (saltErr, salt) {
      if (saltErr) {
        req.flash('error_msg', 'Failed to reset PIN.');
        return res.redirect('/dashboard/profile');
      }
      bcrypt.hash(newPin, salt, function (hashErr, hash) {
        if (hashErr) {
          req.flash('error_msg', 'Failed to reset PIN.');
          return res.redirect('/dashboard/profile');
        }

        User.findByIdAndUpdate(req.user._id, { pin: hash, pinSet: true }).then(function () {
          return notifySecurity(
            req.user._id,
            'Transaction PIN reset',
            'Your transaction PIN was reset using your account password. If you did not perform this action, secure your account immediately.',
            'critical',
            '/dashboard/security'
          );
        }).then(function () {
          req.session.pinVerified = false;
          req.session.pinVerifiedAt = null;
          req.flash('success_msg', 'PIN reset successfully. Please enter your new PIN before protected actions.');
          req.session.save(function (saveErr) {
            if (saveErr) return res.redirect('/dashboard/profile');
            res.redirect('/pin');
          });
        }).catch(function (updateErr) {
          console.error(updateErr);
          req.flash('error_msg', 'Failed to reset PIN.');
          res.redirect('/dashboard/profile');
        });
      });
    });
  });
});

module.exports = router;
