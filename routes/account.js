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
        req.flash('error_msg', 'Your account has a balance. Use the balance converter below to convert your funds before changing account currency.');
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

// Get a live exchange-rate quote for converting the account's entire current balance.
router.get('/currency-rate', isAuth, function (req, res) {
  var target = String(req.query.to || '').toUpperCase().trim();
  var source = String(req.user.currency || 'EUR').toUpperCase();
  if (!currencies.some(function (item) { return item.code === target; })) {
    return res.status(400).json({ error: 'Choose a supported target currency.' });
  }
  if (source === target) return res.status(400).json({ error: 'Choose a different currency.' });

  LedgerAccount.findOne({ owner: req.user._id }).then(function (account) {
    var balance = Number(account ? account.balance : req.user.balance || 0);
    if (!isFinite(balance) || balance <= 0) {
      return res.status(400).json({ error: 'There is no available balance to convert.' });
    }
    return currencyExchange.getRate(source, target).then(function (quote) {
      res.json({
        fromCurrency: source,
        toCurrency: target,
        fromAmount: balance,
        rate: quote.rate,
        toAmount: Math.round(balance * quote.rate * 100) / 100,
        updatedAt: quote.updatedAt,
        stale: quote.stale || false
      });
    });
  }).catch(function (err) {
    console.error('Currency quote failed:', err);
    res.status(503).json({ error: 'Live exchange rates are temporarily unavailable. Please try again later.' });
  });
});

// Convert the full account balance and change the account currency in one database transaction.
router.post('/convert-currency', isAuth, function (req, res) {
  var target = String(req.body.currency || '').toUpperCase().trim();
  var currentPassword = req.body.currentPassword;
  var transactionPin = String(req.body.transactionPin || '').trim();
  var source = String(req.user.currency || 'EUR').toUpperCase();

  if (!currencies.some(function (item) { return item.code === target; })) {
    req.flash('error_msg', 'Please choose a supported currency.');
    return res.redirect('/dashboard/profile#currency-settings');
  }
  if (target === source) {
    req.flash('error_msg', 'Choose a different currency to convert your balance.');
    return res.redirect('/dashboard/profile#currency-settings');
  }
  if (!currentPassword || !req.user.pinSet || !req.user.pin || !/^\\d{4}$/.test(transactionPin)) {
    req.flash('error_msg', 'Enter your current password and 4-digit transaction PIN to convert your balance.');
    return res.redirect('/dashboard/profile#currency-settings');
  }

  bcrypt.compare(currentPassword, req.user.password, function (passwordErr, passwordMatches) {
    if (passwordErr || !passwordMatches) {
      req.flash('error_msg', 'Current password is incorrect. Your balance was not changed.');
      return res.redirect('/dashboard/profile#currency-settings');
    }
    bcrypt.compare(transactionPin, req.user.pin, function (pinErr, pinMatches) {
      if (pinErr || !pinMatches) {
        req.flash('error_msg', 'Transaction PIN is incorrect. Your balance was not changed.');
        return res.redirect('/dashboard/profile#currency-settings');
      }

      currencyExchange.getRate(source, target).then(function (quote) {
        if (quote.stale) throw new Error('A fresh exchange rate is unavailable. Please try again before converting your balance.');
        var session;
        return mongoose.startSession().then(function (newSession) {
          session = newSession;
          return session.withTransaction(function () {
            return User.findById(req.user._id).session(session).then(function (user) {
              if (!user || user.accountStatus !== 'active') throw new Error('Your account is not active.');
              if (String(user.currency || 'EUR').toUpperCase() !== source) throw new Error('Your account currency changed. Refresh the page and try again.');

              return LedgerAccount.findOne({ owner: user._id }).session(session).then(function (account) {
                var accountPromise = account
                  ? Promise.resolve(account)
                  : LedgerAccount.create([{
                    owner: user._id,
                    currency: source,
                    balance: Number(user.balance || 0),
                    status: 'active'
                  }], { session: session }).then(function (created) { return created[0]; });

                return accountPromise.then(function (ledgerAccount) {
                  if (!ledgerAccount || ledgerAccount.status !== 'active') throw new Error('Your ledger account is not active.');
                  if (String(ledgerAccount.currency || 'EUR').toUpperCase() !== source) throw new Error('Your ledger currency does not match your account currency.');
                  var fromAmount = Math.round(Number(ledgerAccount.balance || 0) * 100) / 100;
                  if (!isFinite(fromAmount) || fromAmount <= 0) throw new Error('There is no available balance to convert.');
                  var toAmount = Math.round(fromAmount * quote.rate * 100) / 100;
                  if (!isFinite(toAmount) || toAmount <= 0) throw new Error('The converted amount is too small to credit.');

                  var reference = 'FX' + Date.now() + Math.floor(Math.random() * 1000000);
                  var idempotencyKey = 'currency-conversion:' + user._id.toString() + ':' + reference;
                  return Transaction.create([{
                    sender: user._id,
                    type: 'currency_conversion',
                    amount: toAmount,
                    currency: target,
                    description: 'Balance conversion from ' + source + ' ' + fromAmount.toFixed(2) + ' to ' + target + ' ' + toAmount.toFixed(2),
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
                      { _id: ledgerAccount._id, owner: user._id, currency: source, balance: ledgerAccount.balance, status: 'active', version: ledgerAccount.version },
                      { $set: { balance: 0, currency: target }, $inc: { version: 1 } },
                      { session: session }
                    ).then(function (debitUpdate) {
                      if (debitUpdate.nModified !== 1) throw new Error('Your balance changed during conversion. Please refresh and try again.');
                      return LedgerEntry.create([{
                        ledgerAccount: ledgerAccount._id,
                        transaction: txn._id,
                        direction: 'debit',
                        amount: fromAmount,
                        currency: source,
                        balanceAfter: 0,
                        idempotencyKey: idempotencyKey + ':debit',
                        description: 'Currency conversion debit',
                        metadata: { fromCurrency: source, toCurrency: target, exchangeRate: quote.rate, convertedAmount: toAmount }
                      }], { session: session });
                    }).then(function () {
                      return LedgerAccount.updateOne(
                        { _id: ledgerAccount._id, owner: user._id, currency: target, balance: 0, status: 'active' },
                        { $set: { balance: toAmount }, $inc: { version: 1 } },
                        { session: session }
                      );
                    }).then(function (creditUpdate) {
                      if (creditUpdate.nModified !== 1) throw new Error('Unable to credit the converted balance.');
                      return LedgerEntry.create([{
                        ledgerAccount: ledgerAccount._id,
                        transaction: txn._id,
                        direction: 'credit',
                        amount: toAmount,
                        currency: target,
                        balanceAfter: toAmount,
                        idempotencyKey: idempotencyKey + ':credit',
                        description: 'Currency conversion credit',
                        metadata: { fromCurrency: source, toCurrency: target, exchangeRate: quote.rate, sourceAmount: fromAmount }
                      }], { session: session });
                    }).then(function () {
                      return User.updateOne(
                        { _id: user._id, currency: source },
                        { $set: { currency: target, balance: toAmount } },
                        { session: session }
                      );
                    }).then(function (userUpdate) {
                      if (userUpdate.nModified !== 1) throw new Error('Unable to update your account currency.');
                      return { fromAmount: fromAmount, toAmount: toAmount, fromCurrency: source, toCurrency: target, rate: quote.rate };
                    });
                  });
                });
              });
            });
          });
        }).then(function (result) {
          if (session) session.endSession();
          return result;
        }).catch(function (err) {
          if (session) session.endSession();
          throw err;
        });
      }).then(function (result) {
        req.flash('success_msg', 'Balance converted: ' + result.fromCurrency + ' ' + result.fromAmount.toFixed(2) + ' → ' + result.toCurrency + ' ' + result.toAmount.toFixed(2) + '.');
        res.redirect('/dashboard/profile#currency-settings');
      }).catch(function (err) {
        console.error('Currency conversion failed:', err);
        req.flash('error_msg', err.message || 'Currency conversion failed. No changes were saved.');
        res.redirect('/dashboard/profile#currency-settings');
      });
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