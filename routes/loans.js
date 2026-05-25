var express      = require('express');
var router       = express.Router();
var Loan         = require('../models/Loan');
var User         = require('../models/User');
var Transaction  = require('../models/Transaction');
var Notification = require('../models/Notification');

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in.');
  res.redirect('/login');
}

// Loan page
router.get('/', isAuth, function (req, res) {
  Loan.findOne({ user: req.user._id, status: { $in: ['pending', 'approved'] } })
    .then(function (activeLoan) {
      res.render('dashboard/loans', {
        title: 'Loan',
        activeLoan: activeLoan,
        unreadCount: 0
      });
    }).catch(function (err) {
      console.error(err);
      res.redirect('/dashboard');
    });
});

// Request loan
router.post('/request', isAuth, function (req, res) {
  var amount          = parseFloat(req.body.amount);
  var purpose         = req.body.purpose;
  var repaymentPeriod = parseInt(req.body.repaymentPeriod);

  if (!amount || isNaN(amount) || amount <= 0) {
    req.flash('error_msg', 'Please enter a valid loan amount.');
    return res.redirect('/loans');
  }

  if (!purpose || !repaymentPeriod) {
    req.flash('error_msg', 'Please fill in all fields.');
    return res.redirect('/loans');
  }

  // Check no active loan
  Loan.findOne({ user: req.user._id, status: { $in: ['pending', 'approved'] } })
    .then(function (existing) {
      if (existing) {
        req.flash('error_msg', 'You already have an active loan. Please repay it before requesting another.');
        return res.redirect('/loans');
      }

      var loan = new Loan({
        user:            req.user._id,
        amount:          amount,
        purpose:         purpose,
        repaymentPeriod: repaymentPeriod
      });

      return loan.save().then(function () {
        var notif = new Notification({
          user:    req.user._id,
          title:   'Loan Request Received',
          message: 'Your loan request of €' + amount.toFixed(2) + ' is under review.',
          type:    'info'
        });
        return notif.save();
      }).then(function () {
        req.flash('success_msg', 'Loan request submitted successfully.');
        res.redirect('/loans');
      });
    }).catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Failed to submit loan request.');
      res.redirect('/loans');
    });
});

module.exports = router;