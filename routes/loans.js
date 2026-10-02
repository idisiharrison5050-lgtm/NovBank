var express      = require('express');
var router       = express.Router();
var bcrypt       = require('bcryptjs');
var Loan         = require('../models/Loan');
var Notification = require('../models/Notification');
var loanRepayment = require('../services/loanRepayment');

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
  Promise.all([
    Loan.findOne({ user: req.user._id, status: { $in: ['pending', 'approved'] } }).sort({ createdAt: -1 }),
    Loan.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(12)
  ]).then(function (results) {
    res.render('dashboard/loans', {
      title: 'Loan',
      activeLoan: results[0],
      loanHistory: results[1],
      unreadCount: 0
    });
  }).catch(function (err) {
    console.error(err);
    res.redirect('/dashboard');
  });
});

router.post('/request', isAuth, function (req, res) {
  var amount          = parseFloat(req.body.amount);
  var purpose         = String(req.body.purpose || '').trim();
  var repaymentPeriod = parseInt(req.body.repaymentPeriod, 10);

  if (!amount || isNaN(amount) || amount <= 0) {
    req.flash('error_msg', 'Please enter a valid loan amount.');
    return res.redirect('/loans');
  }

  if (!purpose || !repaymentPeriod || repaymentPeriod <= 0) {
    req.flash('error_msg', 'Please fill in all fields.');
    return res.redirect('/loans');
  }

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
        repaymentPeriod: repaymentPeriod,
        totalDue:        amount,
        amountRepaid:    0,
        outstanding:     amount
      });

      return loan.save().then(function () {
        return new Notification({
          user:    req.user._id,
          title:   'Loan Request Received',
          message: 'Your loan request of €' + amount.toFixed(2) + ' is under review.',
          type:    'info'
        }).save();
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

router.post('/repay', isAuth, function (req, res) {
  checkAccountActive(req, res, '/loans', function () {
    var enteredPin = String(req.body.transactionPin || '');

    if (!req.user.pinSet || !req.user.pin) {
      req.flash('error_msg', 'Please set up your transaction PIN before making a repayment.');
      return res.redirect('/dashboard/profile');
    }

    if (!/^\d{4}$/.test(enteredPin)) {
      req.flash('error_msg', 'Please enter your 4-digit transaction PIN.');
      return res.redirect('/loans');
    }

    bcrypt.compare(enteredPin, req.user.pin, function (pinErr, isMatch) {
      if (pinErr || !isMatch) {
        req.flash('error_msg', 'Incorrect transaction PIN. Repayment cancelled.');
        return res.redirect('/loans');
      }

      var amount = parseFloat(req.body.amount);
      var loanId = String(req.body.loanId || '').trim();
      var idempotencyKey = String(req.body.idempotencyKey || '').trim();

      if (!amount || isNaN(amount) || amount <= 0) {
        req.flash('error_msg', 'Enter a valid repayment amount.');
        return res.redirect('/loans');
      }

      if (!loanId) {
        req.flash('error_msg', 'The repayment session is invalid. Please try again.');
        return res.redirect('/loans');
      }

      loanRepayment.repayLoan({
        userId: req.user._id,
        loanId: loanId,
        amount: amount,
        idempotencyKey: idempotencyKey,
        description: 'Loan repayment'
      }, function (err, result) {
        if (err) {
          console.error(err);
          req.flash(
            'error_msg',
            err.message === 'Insufficient funds'
              ? 'Insufficient funds for this repayment.'
              : (err.message || 'Unable to process repayment.')
          );
          return res.redirect('/loans');
        }

        if (result.duplicate) {
          req.flash('success_msg', 'This repayment was already processed.');
          return res.redirect('/loans');
        }

        var completedLoan = result.loan;
        var message = completedLoan && completedLoan.status === 'repaid'
          ? '€' + result.transaction.amount.toFixed(2) + ' completed your loan repayment.'
          : '€' + result.transaction.amount.toFixed(2) + ' has been applied to your loan.';

        new Notification({
          user: req.user._id,
          title: completedLoan && completedLoan.status === 'repaid' ? 'Loan Repaid' : 'Loan Repayment Received',
          message: message,
          type: 'success'
        }).save().catch(function (notificationErr) {
          console.error('Loan repayment notification error:', notificationErr);
        }).then(function () {
          req.flash(
            'success_msg',
            completedLoan && completedLoan.status === 'repaid'
              ? 'Your loan has been fully repaid.'
              : 'Loan repayment received.'
          );
          res.redirect('/loans');
        });
      });
    });
  });
});

module.exports = router;
