var express = require('express');
var mongoose = require('mongoose');
var router = express.Router();
var User = require('../models/User');
var bcrypt = require('bcryptjs');
var LedgerAccount = require('../models/LedgerAccount');
var LedgerEntry = require('../models/LedgerEntry');
var Transaction = require('../models/Transaction');
var currencyExchange = require('../services/currencyExchange');
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

// Update account currency. Any existing balance is converted securely in the background.
router.post('/update-currency', isAuth, function (req, res) {
  var target = String(req.body.currency || '').toUpperCase().trim();
  var source = String(req.user.currency || 'EUR').toUpperCase();

  if (!currencies.some(function (item) { return item.code === target; })) {
    req.flash('error_msg', 'Please choose a supported currency.');
    return res.redirect('/dashboard/profile');
  }

  if (target === source) {
    req.flash('success_msg', 'Your account currency is already set to ' + target + '.');
    return res.redirect('/dashboard/profile');
  }

  LedgerAccount.findOne({ owner: req.user._id }).then(function (account) {
    var ledgerBalance = account ? Number(account.balance || 0) : Number(req.user.balance || 0);
    var userBalance = Number(req.user.balance || 0);

    if (!isFinite(ledgerBalance) || ledgerBalance < 0 || !isFinite(userBalance) || userBalance < 0) {
      throw new Error('Your account balance could not be verified. Currency was not changed.');
    }

    if (account && Math.abs(ledgerBalance - userBalance) > 0.01) {
      throw new Error('Your account balances need to be reconciled before changing currency. Your funds have not been changed.');
    }

    if (ledgerBalance === 0) {
      if (account) {
        return LedgerAccount.findOneAndUpdate(
          { _id: account._id, owner: req.user._id, balance: 0, status: 'active' },
          { $set: { currency: target } },
          { new: true }
        ).then(function (updatedAccount) {
          if (!updatedAccount) throw new Error('Your account changed while saving. Please try again.');
          return User.findOneAndUpdate(
            { _id: req.user._id, currency: source, balance: 0 },
            { $set: { currency: target } },
            { new: true }
          ).then(function (updatedUser) {
            if (!updatedUser) throw new Error('Your account changed while saving. Please refresh and try again.');
          });
        });
      }

      return User.findOneAndUpdate(
        { _id: req.user._id, currency: source, balance: 0 },
        { $set: { currency: target } },
        { new: true }
      ).then(function (updatedUser) {
        if (!updatedUser) throw new Error('Your account balance changed. Please refresh and try again.');
      });
    }

    return currencyExchange.getRate(source, target).then(function (quote) {
      if (quote.stale) throw new Error('Currency rates are temporarily unavailable. Please try again later.');
      var session;
      return mongoose.startSession().then(function (newSession) {
        session = newSession;
        return session.withTransaction(function () {
          return User.findOne({ _id: req.user._id, currency: source }).session(session).then(function (user) {
            if (!user || user.accountStatus !== 'active') throw new Error('Your account is not active or its currency changed.');

            return LedgerAccount.findOne({ owner: user._id }).session(session).then(function (ledgerAccount) {
              var accountPromise = ledgerAccount
                ? Promise.resolve(ledgerAccount)
                : LedgerAccount.create([{
                  owner: user._id,
                  currency: source,
                  balance: Number(user.balance || 0),
                  status: 'active'
                }], { session: session }).then(function (created) { return created[0]; });

              return accountPromise.then(function (activeAccount) {
                if (!activeAccount || activeAccount.status !== 'active') throw new Error('Your account is not available for currency changes.');
                if (String(activeAccount.currency || 'EUR').toUpperCase() !== source) throw new Error('Your ledger currency does not match your account currency.');

                var fromAmount = Math.round(Number(activeAccount.balance || 0) * 100) / 100;
                if (!isFinite(fromAmount) || fromAmount <= 0) throw new Error('Your account balance changed. Please refresh and try again.');
                var toAmount = Math.round(fromAmount * quote.rate * 100) / 100;
                if (!isFinite(toAmount) || toAmount <= 0) throw new Error('The converted balance is too small to credit.');

                var reference = 'FX' + Date.now() + Math.floor(Math.random() * 1000000);
                var idempotencyKey = 'currency-conversion:' + user._id.toString() + ':' + reference;
                return Transaction.create([{
                  sender: user._id,
                  type: 'currency_conversion',
                  amount: toAmount,
                  currency: target,
                  description: 'Account balance converted from ' + source + ' to ' + target,
                  category: 'Other',
                  status: 'completed',
                  idempotencyKey: idempotencyKey,
                  reference: reference,
                  currencyConversion: {
                    fromCurrency: source,
                    toCurrency: target,
                    fromAmount: fromAmount,
                    toAmount: toAmount,
                    rate: quote.rate,
                    rateUpdatedAt: quote.updatedAt,
                    rateProvider: quote.provider
                  }
                }], { session: session }).then(function (created) {
                  var txn = created[0];
                  return LedgerAccount.updateOne(
                    { _id: activeAccount._id, owner: user._id, currency: source, balance: activeAccount.balance, status: 'active', version: activeAccount.version },
                    { $set: { balance: 0, currency: target }, $inc: { version: 1 } },
                    { session: session }
                  ).then(function (debitUpdate) {
                    if (debitUpdate.nModified !== 1) throw new Error('Your balance changed during the currency update. Please try again.');
                    return LedgerEntry.create([{
                      ledgerAccount: activeAccount._id,
                      transaction: txn._id,
                      direction: 'debit',
                      amount: fromAmount,
                      currency: source,
                      balanceAfter: 0,
                      idempotencyKey: idempotencyKey + ':debit',
                      description: 'Account currency conversion',
                      metadata: { fromCurrency: source, toCurrency: target, exchangeRate: quote.rate, convertedAmount: toAmount }
                    }], { session: session });
                  }).then(function () {
                    return LedgerAccount.updateOne(
                      { _id: activeAccount._id, owner: user._id, currency: target, balance: 0, status: 'active' },
                      { $set: { balance: toAmount }, $inc: { version: 1 } },
                      { session: session }
                    );
                  }).then(function (creditUpdate) {
                    if (creditUpdate.nModified !== 1) throw new Error('Unable to update the converted balance.');
                    return LedgerEntry.create([{
                      ledgerAccount: activeAccount._id,
                      transaction: txn._id,
                      direction: 'credit',
                      amount: toAmount,
                      currency: target,
                      balanceAfter: toAmount,
                      idempotencyKey: idempotencyKey + ':credit',
                      description: 'Converted account balance',
                      metadata: { fromCurrency: source, toCurrency: target, exchangeRate: quote.rate, sourceAmount: fromAmount }
                    }], { session: session });
                  }).then(function () {
                    return User.updateOne(
                      { _id: user._id, currency: source, balance: user.balance },
                      { $set: { currency: target, balance: toAmount } },
                      { session: session }
                    );
                  }).then(function (userUpdate) {
                    if (userUpdate.nModified !== 1) throw new Error('Unable to save the new account currency.');
                  });
                });
              });
            });
          });
        });
      }).then(function () {
        if (session) session.endSession();
      }).catch(function (err) {
        if (session) session.endSession();
        throw err;
      });
    });
  }).then(function () {
    req.flash('success_msg', 'Account currency updated to ' + target + '.');
    res.redirect('/dashboard/profile');
  }).catch(function (err) {
    console.error('Account currency update failed:', err);
    req.flash('error_msg', err.message || 'Could not update account currency. Please try again.');
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