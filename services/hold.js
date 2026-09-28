var mongoose = require('mongoose');
var FundHold = require('../models/FundHold');
var LedgerAccount = require('../models/LedgerAccount');

function makeReference() {
  return 'HLD' + Date.now() + Math.floor(Math.random() * 1000000);
}

function createHold(options, callback) {
  var amount = Number(options.amount);
  if (!isFinite(amount) || amount <= 0) return callback(new Error('Invalid hold amount'));

  var session;
  mongoose.startSession().then(function (newSession) {
    session = newSession;
    return session.withTransaction(function () {
      return LedgerAccount.findOne({ owner: options.userId }).session(session).then(function (account) {
        if (!account) throw new Error('Ledger account not found');
        if (account.status !== 'active') throw new Error('Ledger account is not active');
        if (Number(account.balance) < amount) throw new Error('Insufficient available funds');

        var reference = makeReference();
        return LedgerAccount.updateOne(
          { _id: account._id, balance: { $gte: amount }, status: 'active' },
          { $inc: { balance: -amount, version: 1 } },
          { session: session }
        ).then(function (updated) {
          if (updated.nModified !== 1) throw new Error('Unable to reserve funds');
          return FundHold.create([{
            user: options.userId,
            amount: Math.round(amount * 100) / 100,
            currency: options.currency || account.currency,
            reason: options.reason || 'Reserved funds',
            reference: reference,
            expiresAt: options.expiresAt || null,
            transaction: options.transactionId || null,
            createdBy: options.createdBy || null
          }], { session: session });
        }).then(function (created) {
          return created[0];
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

function releaseHold(reference, callback) {
  var session;
  mongoose.startSession().then(function (newSession) {
    session = newSession;
    return session.withTransaction(function () {
      return FundHold.findOne({ reference: reference }).session(session).then(function (hold) {
        if (!hold) throw new Error('Hold not found');
        if (hold.status !== 'active') throw new Error('Hold is no longer active');

        return LedgerAccount.findOne({ owner: hold.user }).session(session).then(function (account) {
          if (!account) throw new Error('Ledger account not found');
          return LedgerAccount.updateOne({ _id: account._id, status: 'active' }, { $inc: { balance: hold.amount, version: 1 } }, { session: session }).then(function (updated) {
            if (updated.nModified !== 1) throw new Error('Unable to release funds');
            hold.status = 'released';
            hold.releasedAt = new Date();
            return hold.save({ session: session });
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
  createHold: createHold,
  releaseHold: releaseHold
};
