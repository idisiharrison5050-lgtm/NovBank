var express = require('express');
var router = express.Router();
var passport = require('passport');
var User = require('../models/User');
var Notification = require('../models/Notification');

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
  successRedirect: '/dashboard',
  failureRedirect: '/login',
  failureFlash: true
}));

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

// Logout
router.get('/logout', function (req, res) {
  req.logout();
  req.flash('success_msg', 'You have been logged out.');
  res.redirect('/login');
});

module.exports = router;