var express = require('express');
var router = express.Router();
var passport = require('passport');
var User = require('../models/User');
var Admin = require('../models/Admin');
var Notification = require('../models/Notification');
var mailer = require('../config/mailer');
var https = require('https');
var crypto = require("crypto");

function verifyRecaptcha(token, callback) {
  var secret = process.env.RECAPTCHA_SECRET_KEY;
  var postData = 'secret=' + secret + '&response=' + token;

  var options = {
    hostname: 'www.google.com',
    path:     '/recaptcha/api/siteverify',
    method:   'POST',
    headers: {
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  var req = https.request(options, function (res) {
    var data = '';
    res.on('data', function (chunk) { data += chunk; });
    res.on('end', function () {
      try {
        var parsed = JSON.parse(data);
        callback(parsed.success);
      } catch (e) {
        callback(false);
      }
    });
  });

  req.on('error', function () { callback(false); });
  req.write(postData);
  req.end();
}

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

router.post('/login', isGuest, function (req, res, next) {
  var token = req.body['g-recaptcha-response'];
  if (!token) {
    req.flash('error_msg', 'Please complete the reCAPTCHA.');
    return res.redirect('/login');
  }
  verifyRecaptcha(token, function (success) {
    if (!success) {
      req.flash('error_msg', 'reCAPTCHA verification failed. Please try again.');
      return res.redirect('/login');
    }
    passport.authenticate('user-local', {
      failureRedirect: '/login',
      failureFlash:    true
    }, function (err, user, info) {
      if (err) return next(err);
      if (!user) {
        var message = (info && info.message) ? info.message : 'Login failed. Please try again.';
        req.flash('error_msg', message);
        return res.redirect('/login');
      }
      req.logIn(user, function (err) {
      if (err) return next(err);
      if (!user.emailVerified) {
        req.session.verifyUserId = user._id.toString();
        req.flash('error_msg', 'Please verify your email address before logging in.');
        router.get('/logout', function(req, res, next) {
        req.logout(function(err) {
             if (err) { 
                 return next(err); 
             }
             res.redirect('/login'); // Redirect inside the callback
         });
     });
        return res.redirect('/verify-email');
      }
      req.session.pinVerified = false;
      req.session.save(function (sessionErr) {
        if (sessionErr) return next(sessionErr);
        res.redirect('/pin');
      });
    });
    })(req, res, next);
  });
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

  req.session.regStep1 = { firstName, lastName, email: email.toLowerCase().trim(), phone, dateOfBirth: dob };
  req.session.save(function (err) {
    if (err) {
      console.error('Registration session save error:', err);
      req.flash('error_msg', 'We could not continue your registration. Please try again.');
      return res.redirect('/register');
    }
    res.redirect('/register/step2');
  });
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
  req.session.save(function (err) {
    if (err) {
      console.error('Registration session save error:', err);
      req.flash('error_msg', 'We could not continue your registration. Please try again.');
      return res.redirect('/register/step2');
    }
    res.redirect('/register/step3');
  });
});

// Register Step 3
router.get('/register/step3', isGuest, function (req, res) {
  if (!req.session.regStep1 || !req.session.regStep2) return res.redirect('/register');
  res.render('auth/register-step3', { title: 'Create Account - Step 3' });
});

router.post('/register/step3', isGuest, function (req, res) {
  var token = req.body['g-recaptcha-response'];
  if (!token) {
    req.flash('error_msg', 'Please complete the reCAPTCHA.');
    return res.redirect('/register/step3');
  }
  verifyRecaptcha(token, function (success) {
    if (!success) {
      req.flash('error_msg', 'reCAPTCHA verification failed. Please try again.');
      return res.redirect('/register/step3');
    }
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
          type:    'system',
          severity: 'success'
        });

        var code     = Math.floor(100000 + Math.random() * 900000).toString();
        var expires  = new Date(Date.now() + 15 * 60 * 1000);
        var resendAt = new Date(Date.now() + 2 * 60 * 1000);

        return notif.save()
          .then(function () {
            return User.findByIdAndUpdate(user._id, {
              emailVerifyCode:     code,
              emailVerifyExpires:  expires,
              emailVerifyResendAt: resendAt
            });
          })
          .then(function () {
            return mailer.emailVerificationCode(user, code);
          })
          .then(function () {
            delete req.session.regStep1;
            delete req.session.regStep2;
            req.session.verifyUserId = user._id.toString();
            req.flash('success_msg', 'Account created! Check your email for the verification code.');
            req.session.save(function (sessionErr) {
              if (sessionErr) {
                console.error('Verification session save error:', sessionErr);
                return res.redirect('/register');
              }
              res.redirect('/verify-email');
            });
          });
      });
    })
    .catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Something went wrong. Please try again.');
      res.redirect('/register');
    });
});
});

// Exit Super Admin User Session
router.get('/admin-session/exit', function (req, res, next) {
  if (!req.session.impersonating || !req.session.impersonating.adminId) {
    return res.redirect('/dashboard');
  }

  var adminId = req.session.impersonating.adminId;
  var impersonatedUserId = req.session.impersonating.userId;

  Admin.findById(adminId, function (findErr, admin) {
    if (findErr || !admin || admin.role !== 'superadmin') {
      req.session.impersonating = null;
      return req.logout(function (logoutErr) {
        if (logoutErr) return next(logoutErr);
        res.redirect('/admin/login');
      });
    }

    req.logIn(admin, function (loginErr) {
      if (loginErr) return next(loginErr);
      req.session.impersonating = null;
      req.session.pinVerified = false;
      req.session.save(function (saveErr) {
        if (saveErr) return next(saveErr);
        res.redirect('/admin/users/' + impersonatedUserId);
      });
    });
  });
});

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

router.get('/terms', function (req, res) {
  res.render('terms', { title: 'Terms of Service' });
});

router.get('/privacy', function (req, res) {
  res.render('privacy', { title: 'Privacy Policy' });
});

router.get('/cookies', function (req, res) {
  res.render('cookies', { title: 'Cookie Policy' });
});

// Forgot Password
router.get('/forgot-password', isGuest, function (req, res) {
  res.render('auth/forgot-password', { title: 'Forgot Password' });
});

router.post('/forgot-password', isGuest, function (req, res) {
  var email = req.body.email;
  if (!email) {
    req.flash('error_msg', 'Please enter your email address.');
    return res.redirect('/forgot-password');
  }

  User.findOne({ email: email.toLowerCase() })
    .then(function (user) {
      if (!user) {
        req.flash('error_msg', 'No account found with that email address.');
        return res.redirect('/forgot-password');
      }

      var token   = crypto.randomBytes(32).toString('hex');
      var expires = Date.now() + 3600000; // 1 hour

      return User.findByIdAndUpdate(user._id, {
        resetPasswordToken:   token,
        resetPasswordExpires: expires
      }).then(function () {
        var resetUrl = req.protocol + '://' + req.get('host') + '/reset-password/' + token;
        var mailer   = require('../config/mailer');
        return mailer.forgotPasswordEmail(user, resetUrl);
      }).then(function () {
        req.flash('success_msg', 'A password reset link has been sent to your email address.');
        res.redirect('/forgot-password');
      });
    })
    .catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Something went wrong. Please try again.');
      res.redirect('/forgot-password');
    });
});

// Reset Password
router.get('/reset-password/:token', isGuest, function (req, res) {
  User.findOne({
    resetPasswordToken:   req.params.token,
    resetPasswordExpires: { $gt: Date.now() }
  }).then(function (user) {
    if (!user) {
      req.flash('error_msg', 'Password reset link is invalid or has expired.');
      return res.redirect('/forgot-password');
    }
    res.render('auth/reset-password', { title: 'Reset Password', token: req.params.token });
  }).catch(function (err) {
    console.error(err);
    res.redirect('/forgot-password');
  });
});

router.post('/reset-password/:token', isGuest, function (req, res) {
  var password        = req.body.password;
  var confirmPassword = req.body.confirmPassword;

  if (!password || password.length < 8) {
    req.flash('error_msg', 'Password must be at least 8 characters.');
    return res.redirect('/reset-password/' + req.params.token);
  }

  if (password !== confirmPassword) {
    req.flash('error_msg', 'Passwords do not match.');
    return res.redirect('/reset-password/' + req.params.token);
  }

  User.findOne({
    resetPasswordToken:   req.params.token,
    resetPasswordExpires: { $gt: Date.now() }
  }).then(function (user) {
    if (!user) {
      req.flash('error_msg', 'Password reset link is invalid or has expired.');
      return res.redirect('/forgot-password');
    }

    var bcrypt = require('bcryptjs');
    bcrypt.genSalt(10, function (err, salt) {
      bcrypt.hash(password, salt, function (err, hash) {
        User.findByIdAndUpdate(user._id, {
          password:             hash,
          resetPasswordToken:   undefined,
          resetPasswordExpires: undefined
        }).then(function () {
          req.flash('success_msg', 'Your password has been reset. You can now log in.');
          res.redirect('/login');
        });
      });
    });
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Something went wrong. Please try again.');
    res.redirect('/forgot-password');
  });
});

// Forgot PIN
router.get('/forgot-pin', function (req, res) {
  res.render('auth/forgot-pin', { title: 'Reset PIN' });
});

router.post('/forgot-pin', function (req, res) {
  var email         = req.body.email;
  var accountNumber = req.body.accountNumber;

  if (!email || !accountNumber) {
    req.flash('error_msg', 'Please enter your email and account number.');
    return res.redirect('/forgot-pin');
  }

  User.findOne({
    email:         email.toLowerCase(),
    accountNumber: accountNumber
  }).then(function (user) {
    if (!user) {
      req.flash('error_msg', 'No account found with those details.');
      return res.redirect('/forgot-pin');
    }

    var token   = crypto.randomBytes(32).toString('hex');
    var expires = Date.now() + 3600000;

    return User.findByIdAndUpdate(user._id, {
      resetPinToken:   token,
      resetPinExpires: expires
    }).then(function () {
      var resetUrl = req.protocol + '://' + req.get('host') + '/reset-pin/' + token;
      var mailer   = require('../config/mailer');
      return mailer.forgotPinEmail(user, resetUrl);
    }).then(function () {
      req.flash('success_msg', 'A PIN reset link has been sent to your email address.');
      res.redirect('/forgot-pin');
    });
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Something went wrong. Please try again.');
    res.redirect('/forgot-pin');
  });
});

// Reset PIN
router.get('/reset-pin/:token', function (req, res) {
  User.findOne({
    resetPinToken:   req.params.token,
    resetPinExpires: { $gt: Date.now() }
  }).then(function (user) {
    if (!user) {
      req.flash('error_msg', 'PIN reset link is invalid or has expired.');
      return res.redirect('/forgot-pin');
    }
    res.render('auth/reset-pin', { title: 'Reset PIN', token: req.params.token });
  }).catch(function (err) {
    console.error(err);
    res.redirect('/forgot-pin');
  });
});

router.post('/reset-pin/:token', function (req, res) {
  var newPin     = req.body.newPin;
  var confirmPin = req.body.confirmPin;

  if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
    req.flash('error_msg', 'PIN must be exactly 4 digits.');
    return res.redirect('/reset-pin/' + req.params.token);
  }

  if (newPin !== confirmPin) {
    req.flash('error_msg', 'PINs do not match.');
    return res.redirect('/reset-pin/' + req.params.token);
  }

  User.findOne({
    resetPinToken:   req.params.token,
    resetPinExpires: { $gt: Date.now() }
  }).then(function (user) {
    if (!user) {
      req.flash('error_msg', 'PIN reset link is invalid or has expired.');
      return res.redirect('/forgot-pin');
    }

    var bcrypt = require('bcryptjs');
    bcrypt.genSalt(10, function (err, salt) {
      bcrypt.hash(newPin, salt, function (err, hash) {
        User.findByIdAndUpdate(user._id, {
          pin:             hash,
          pinSet:          true,
          resetPinToken:   undefined,
          resetPinExpires: undefined
        }).then(function () {
          req.flash('success_msg', 'Your PIN has been reset successfully. You can now log in.');
          res.redirect('/login');
        });
      });
    });
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Something went wrong. Please try again.');
    res.redirect('/forgot-pin');
  });
});

// Verify Email page
router.get('/verify-email', function (req, res) {
  if (!req.session.verifyUserId) return res.redirect('/register');
  res.render('auth/verify-email', { title: 'Verify Your Email' });
});

router.post('/verify-email', function (req, res) {
  if (!req.session.verifyUserId) return res.redirect('/register');

  var code   = req.body.code;
  var userId = req.session.verifyUserId;

  User.findById(userId).then(function (user) {
    if (!user) {
      req.flash('error_msg', 'Something went wrong. Please register again.');
      return res.redirect('/register');
    }

    if (!user.emailVerifyCode || user.emailVerifyCode !== code) {
      req.flash('error_msg', 'Incorrect verification code. Please try again.');
      return res.redirect('/verify-email');
    }

    if (new Date() > user.emailVerifyExpires) {
      req.flash('error_msg', 'Your verification code has expired. Please request a new one.');
      return res.redirect('/verify-email');
    }

    return User.findByIdAndUpdate(userId, {
      emailVerified:       true,
      emailVerifyCode:     undefined,
      emailVerifyExpires:  undefined,
      emailVerifyResendAt: undefined
    }).then(function () {
      var mailer = require('../config/mailer');
      return mailer.welcomeEmail(user).then(function () {
        delete req.session.verifyUserId;
        req.flash('success_msg', 'Email verified successfully. You can now log in.');
        res.redirect('/login');
      });
    });
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Something went wrong. Please try again.');
    res.redirect('/verify-email');
  });
});

// Resend verification code
router.post('/verify-email/resend', function (req, res) {
  if (!req.session.verifyUserId) return res.redirect('/register');

  var userId = req.session.verifyUserId;

  User.findById(userId).then(function (user) {
    if (!user) return res.redirect('/register');

    if (user.emailVerifyResendAt && new Date() < user.emailVerifyResendAt) {
      var secondsLeft = Math.ceil((user.emailVerifyResendAt - new Date()) / 1000);
      req.flash('error_msg', 'Please wait ' + secondsLeft + ' seconds before requesting a new code.');
      return res.redirect('/verify-email');
    }

    var code     = Math.floor(100000 + Math.random() * 900000).toString();
    var expires  = new Date(Date.now() + 15 * 60 * 1000);
    var resendAt = new Date(Date.now() + 2 * 60 * 1000);

    return User.findByIdAndUpdate(userId, {
      emailVerifyCode:     code,
      emailVerifyExpires:  expires,
      emailVerifyResendAt: resendAt
    }).then(function () {
      var mailer = require('../config/mailer');
      return mailer.emailVerificationCode(user, code);
    }).then(function () {
      req.flash('success_msg', 'A new verification code has been sent to your email.');
      res.redirect('/verify-email');
    });
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Something went wrong. Please try again.');
    res.redirect('/verify-email');
  });
});

module.exports = router;