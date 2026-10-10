var mongoose = require('mongoose');
var FundHold = require('../models/FundHold');
var LedgerAccount = require('../models/LedgerAccount');

function normalizeAmount(amount) {
  var value = Number(amount);
  if (!isFinite(value) || value <= 0) throw new Error('Invalid amount');
  return Math.round(value * 100) / 100;
}

function createHold(options, callback) {
  var amount;
  try {
    amount = normalizeAmount(options.amount);
  } catch (err) {
    return callback(err);
  }

  var session;
  mongoose.startSession().then(function (newSession) {
    session = newSession;
    return session.withTransaction(function () {
      return LedgerAccount.findOne({ owner: options.userId, status: 'active' }).session(session).then(function (account) {
        if (!account) throw new Error('Ledger account unavailable');
        if (account.balance < amount) throw new Error('Insufficient available funds');

        var reference = options.reference || ('HOLD-' + Date.now() + '-' + Math.floor(Math.random() * 1000000));
        return FundHold.create([{
          user: options.userId,
          amount: amount,
          currency: account.currency,
          reason: options.reason || 'Funds reservation',
          reference: reference,
          expiresAt: options.expiresAt || null,
          transaction: options.transactionId || null,
          createdBy: options.createdBy || null
        }], { session: session }).then(function (created) {
          return LedgerAccount.updateOne(
            { _id: account._id, status: 'active', balance: { $gte: amount } },
            { $inc: { balance: -amount, version: 1 } },
            { session: session }
          ).then(function (result) {
            if (result.nModified !== 1) throw new Error('Unable to reserve funds');
            return created[0];
          });
        });
      });
    });
  }).then(function (hold) {
    session.endSession();
    callback(null, hold);
  }).catch(function (err) {
    if (session) session.endSession();
    callback(err);
  });
}

module.exports = {
  createHold: createHold
};
