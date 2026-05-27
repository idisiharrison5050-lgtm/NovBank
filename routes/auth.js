var express = require('express');
var router = express.Router();
var passport = require('passport');
var User = require('../models/User');
var Notification = require('../models/Notification');
var mailer = require('../config/mailer');

function isGuest(req, res, next) {
  if (!req.isAuthenticated()) return next();
  res.redirect('/dashboard');
}

// Landing
router.get('/', function (req, res) {
  res.render('landing', { title: 'Welcome' });
});

// Login
router.get('/login', isGuest, function (req, res) {
  res.render('auth/login', { title: 'Login' });
});

router.post('/login', isGuest, passport.authenticate('user-local', {
  failureRedirect: '/login',
  failureFlash:    true
}), function (req, res) {
  req.session.pinVerified = false;
  res.redirect('/pin');
});

// Register Step 1
router.get('/register', isGuest, function (req, res) {
  res.render('auth/register-step1', { title: 'Create Account - Step 1' });
});

router.post('/register/step1', isGuest, function (req, res) {
  var firstName = req.body.firstName;
  var lastName  = req.body.lastName;
  var email     = req.body.email;
  var phone     = req.body.phone;
  var dob       = req.body.dateOfBirth;

  if (!firstName || !lastName || !email || !phone || !dob) {
    req.flash('error_msg', 'Please fill in all fields.');
    return res.redirect('/register');
  }

  req.session.regStep1 = { firstName, lastName, email, phone, dateOfBirth: dob };
  res.redirect('/register/step2');
});

// Register Step 2
router.get('/register/step2', isGuest, function (req, res) {
  if (!req.session.regStep1) return res.redirect('/register');
  res.render('auth/register-step2', { title: 'Create Account - Step 2' });
});

router.post('/register/step2', isGuest, function (req, res) {
  var street  = req.body.street;
  var city    = req.body.city;
  var country = req.body.country;
  var zip     = req.body.zip;

  if (!street || !city || !country || !zip) {
    req.flash('error_msg', 'Please fill in all address fields.');
    return res.redirect('/register/step2');
  }

  req.session.regStep2 = { street, city, country, zip };
  res.redirect('/register/step3');
});

// Register Step 3
router.get('/register/step3', isGuest, function (req, res) {
  if (!req.session.regStep1 || !req.session.regStep2) return res.redirect('/register');
  res.render('auth/register-step3', { title: 'Create Account - Step 3' });
});

router.post('/register/step3', isGuest, function (req, res) {
  if (!req.session.regStep1 || !req.session.regStep2) return res.redirect('/register');

  var username        = req.body.username;
  var password        = req.body.password;
  var confirmPassword = req.body.confirmPassword;

  if (!username || !password || !confirmPassword) {
    req.flash('error_msg', 'Please fill in all fields.');
    return res.redirect('/register/step3');
  }

  if (password !== confirmPassword) {
    req.flash('error_msg', 'Passwords do not match.');
    return res.redirect('/register/step3');
  }

  if (password.length < 8) {
    req.flash('error_msg', 'Password must be at least 8 characters.');
    return res.redirect('/register/step3');
  }

  var step1 = req.session.regStep1;
  var step2 = req.session.regStep2;

  User.findOne({ $or: [{ email: step1.email }, { username: username.toLowerCase() }] })
    .then(function (existing) {
      if (existing) {
        req.flash('error_msg', 'Email or username already in use.');
        return res.redirect('/register/step3');
      }

      var newUser = new User({
        firstName:   step1.firstName,
        lastName:    step1.lastName,
        email:       step1.email,
        phone:       step1.phone,
        dateOfBirth: step1.dateOfBirth,
        username:    username.toLowerCase(),
        password:    password,
        address: {
          street:  step2.street,
          city:    step2.city,
          country: step2.country,
          zip:     step2.zip
        }
      });

      return newUser.save().then(function (user) {
        var notif = new Notification({
          user:    user._id,
          title:   'Welcome!',
          message: 'Your account has been created. Account number: ' + user.accountNumber,
          type:    'success'
        });
        return notif.save().then(function () {
          delete req.session.regStep1;
          delete req.session.regStep2;
          req.flash('success_msg', 'Account created! You can now log in.');
          res.redirect('/login');
        });
      });
    })
    .catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Something went wrong. Please try again.');
      res.redirect('/register');
    });
});
mailer.welcomeEmail(user);

// Logout
router.get('/logout', function (req, res, next) {
  req.logout(function (err) {
    if (err) { 
      return next(err); 
    }
    res.redirect('/');
  });
});

// PIN page
router.get('/pin', function (req, res) {
  if (!req.isAuthenticated()) return res.redirect('/login');
  if (req.session.pinVerified) return res.redirect('/dashboard');
  res.render('auth/pin', { title: 'Enter PIN' });
});

router.post('/pin', function (req, res) {
  if (!req.isAuthenticated()) return res.redirect('/login');

  var enteredPin = req.body.pin;

  if (!req.user.pinSet) {
    req.session.pinVerified = true;
    return res.redirect('/dashboard');
  }

  var bcrypt = require('bcryptjs');
  bcrypt.compare(enteredPin, req.user.pin, function (err, isMatch) {
    if (err || !isMatch) {
      req.flash('error_msg', 'Incorrect PIN. Please try again.');
      return res.redirect('/pin');
    }
    req.session.pinVerified = true;
    res.redirect('/dashboard');
  });
});

// Set PIN
router.get('/set-pin', function (req, res) {
  if (!req.isAuthenticated()) return res.redirect('/login');
  res.render('auth/set-pin', { title: 'Set PIN' });
});

router.post('/set-pin', function (req, res) {
  if (!req.isAuthenticated()) return res.redirect('/login');

  var pin        = req.body.pin;
  var confirmPin = req.body.confirmPin;

  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    req.flash('error_msg', 'PIN must be exactly 4 digits.');
    return res.redirect('/set-pin');
  }

  if (pin !== confirmPin) {
    req.flash('error_msg', 'PINs do not match.');
    return res.redirect('/set-pin');
  }

  var bcrypt = require('bcryptjs');
  bcrypt.genSalt(10, function (err, salt) {
    bcrypt.hash(pin, salt, function (err, hash) {
      var User = require('../models/User');
      User.findByIdAndUpdate(req.user._id, { pin: hash, pinSet: true })
        .then(function () {
          req.flash('success_msg', 'PIN set successfully.');
          res.redirect('/dashboard/profile');
        }).catch(function () {
          req.flash('error_msg', 'Failed to set PIN.');
          res.redirect('/set-pin');
        });
    });
  });
});

// Change PIN from profile
router.post('/change-pin', function (req, res) {
  if (!req.isAuthenticated()) return res.redirect('/login');

  var currentPin = req.body.currentPin;
  var newPin     = req.body.newPin;
  var confirmPin = req.body.confirmPin;

  if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
    req.flash('error_msg', 'New PIN must be exactly 4 digits.');
    return res.redirect('/dashboard/profile');
  }

  if (newPin !== confirmPin) {
    req.flash('error_msg', 'New PINs do not match.');
    return res.redirect('/dashboard/profile');
  }

  var bcrypt = require('bcryptjs');
  var User   = require('../models/User');

  if (!req.user.pinSet) {
    bcrypt.genSalt(10, function (err, salt) {
      bcrypt.hash(newPin, salt, function (err, hash) {
        User.findByIdAndUpdate(req.user._id, { pin: hash, pinSet: true })
          .then(function () {
            req.flash('success_msg', 'PIN set successfully.');
            res.redirect('/dashboard/profile');
          });
      });
    });
    return;
  }

  bcrypt.compare(currentPin, req.user.pin, function (err, isMatch) {
    if (err || !isMatch) {
      req.flash('error_msg', 'Current PIN is incorrect.');
      return res.redirect('/dashboard/profile');
    }
    bcrypt.genSalt(10, function (err, salt) {
      bcrypt.hash(newPin, salt, function (err, hash) {
        User.findByIdAndUpdate(req.user._id, { pin: hash, pinSet: true })
          .then(function () {
            req.flash('success_msg', 'PIN changed successfully.');
            res.redirect('/dashboard/profile');
          });
      });
    });
  });
});

// Reset PIN with password
router.post('/reset-pin', function (req, res) {
  if (!req.isAuthenticated()) return res.redirect('/login');

  var password   = req.body.password;
  var newPin     = req.body.newPin;
  var confirmPin = req.body.confirmPin;

  if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
    req.flash('error_msg', 'PIN must be exactly 4 digits.');
    return res.redirect('/dashboard/profile');
  }

  if (newPin !== confirmPin) {
    req.flash('error_msg', 'PINs do not match.');
    return res.redirect('/dashboard/profile');
  }

  var bcrypt = require('bcryptjs');
  var User   = require('../models/User');

  bcrypt.compare(password, req.user.password, function (err, isMatch) {
    if (err || !isMatch) {
      req.flash('error_msg', 'Password is incorrect.');
      return res.redirect('/dashboard/profile');
    }
    bcrypt.genSalt(10, function (err, salt) {
      bcrypt.hash(newPin, salt, function (err, hash) {
        User.findByIdAndUpdate(req.user._id, { pin: hash, pinSet: true })
          .then(function () {
            req.flash('success_msg', 'PIN reset successfully.');
            res.redirect('/dashboard/profile');
          });
      });
    });
  });
});

module.exports = router;