var mongoose = require('mongoose');
var LedgerAccount = require('../models/LedgerAccount');
var LedgerEntry = require('../models/LedgerEntry');
var User = require('../models/User');

function reconcileUser(userId, callback) {
  LedgerAccount.findOne({ owner: userId }).then(function (account) {
    if (!account) return callback(null, { ok: false, reason: 'ledger_account_missing' });

    return LedgerEntry.find({ ledgerAccount: account._id }).sort({ createdAt: 1 }).then(function (entries) {
      var calculated = 0;
      var valid = true;
      var previous = 0;

      entries.forEach(function (entry) {
        if (entry.direction === 'credit') calculated += entry.amount;
        else calculated -= entry.amount;

        if (Math.round(calculated * 100) / 100 !== Number(entry.balanceAfter)) valid = false;
        previous = calculated;
      });

      calculated = Math.round(calculated * 100) / 100;
      var balanceMatches = calculated === Number(account.balance);

      return User.findById(userId).then(function (user) {
        var cacheMatches = !user || calculated === Number(user.balance || 0);
        callback(null, {
          ok: valid && balanceMatches && cacheMatches,
          ledgerBalance: calculated,
          accountBalance: Number(account.balance),
          userBalance: user ? Number(user.balance || 0) : null,
          entryCount: entries.length,
          balanceMatches: balanceMatches,
          cacheMatches: cacheMatches,
          sequenceValid: valid
        });
      });
    });
  }).catch(callback);
}

function reconcileAll(callback) {
  LedgerAccount.find({}).select('owner').then(function (accounts) {
    var results = [];
    var index = 0;

    function next() {
      if (index >= accounts.length) return callback(null, results);
      var account = accounts[index++];
      reconcileUser(account.owner, function (err, result) {
        if (err) return callback(err);
        results.push({ userId: account.owner, result: result });
        next();
      });
    }

    next();
  }).catch(callback);
}

module.exports = {
  reconcileUser: reconcileUser,
  reconcileAll: reconcileAll
};
