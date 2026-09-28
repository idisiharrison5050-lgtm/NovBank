var mongoose = require('mongoose');
var LedgerAccount = require('../models/LedgerAccount');
var LedgerEntry = require('../models/LedgerEntry');
var Transaction = require('../models/Transaction');
var User = require('../models/User');

function normalizeAmount(amount) {
  var value = Number(amount);
  if (!isFinite(value) || value <= 0) throw new Error('Invalid amount');
  return Math.round(value * 100) / 100;
}

function ensureLedgerAccount(user, session, callback) {
  LedgerAccount.findOne({ owner: user._id }).session(session).then(function (account) {
    if (account) return callback(null, account);

    return LedgerAccount.create([{ owner: user._id, currency: user.currency || 'EUR', balance: Number(user.balance || 0) }], { session: session })
      .then(function (created) { callback(null, created[0]); });
  }).catch(callback);
}

function transferInternal(options, callback) {
  var amount;
  var session;

  try {
    amount = normalizeAmount(options.amount);
  } catch (err) {
    return callback(err);
  }

  if (!options.senderId || !options.receiverId) return callback(new Error('Sender and receiver are required'));
  if (options.senderId.toString() === options.receiverId.toString()) return callback(new Error('Self transfer is not allowed'));

  var idempotencyKey = options.idempotencyKey || ('internal:' + options.senderId.toString() + ':' + options.receiverId.toString() + ':' + Date.now() + ':' + Math.floor(Math.random() * 1000000));

  session = null;
  mongoose.startSession().then(function (newSession) {
    session = newSession;
    return session.withTransaction(function () {
      return Transaction.findOne({ idempotencyKey: idempotencyKey }).session(session).then(function (existing) {
        if (existing) return { transaction: existing, duplicate: true };

        return Promise.all([
          User.findById(options.senderId).session(session),
          User.findById(options.receiverId).session(session)
        ]).then(function (users) {
          var sender = users[0];
          var receiver = users[1];
          if (!sender || !receiver) throw new Error('Account not found');
          if (sender.accountStatus !== 'active' || receiver.accountStatus !== 'active') throw new Error('Account is not active');
          if ((sender.currency || 'EUR') !== (receiver.currency || 'EUR')) throw new Error('Currency mismatch');

          return Promise.all([
            ensureLedgerAccount(sender, session, function (err, account) { if (err) throw err; return account; }),
            ensureLedgerAccount(receiver, session, function (err, account) { if (err) throw err; return account; })
          ]).then(function () {
            return Promise.all([
              LedgerAccount.findOne({ owner: sender._id }).session(session),
              LedgerAccount.findOne({ owner: receiver._id }).session(session)
            ]);
          }).then(function (accounts) {
            var senderAccount = accounts[0];
            var receiverAccount = accounts[1];
            if (!senderAccount || !receiverAccount) throw new Error('Ledger account unavailable');
            if (senderAccount.status !== 'active' || receiverAccount.status !== 'active') throw new Error('Ledger account is not active');
            if (senderAccount.balance < amount) throw new Error('Insufficient funds');

            var senderBalance = Math.round((senderAccount.balance - amount) * 100) / 100;
            var receiverBalance = Math.round((receiverAccount.balance + amount) * 100) / 100;

            return Transaction.create([{
              sender: sender._id,
              receiver: receiver._id,
              type: 'internal_transfer',
              amount: amount,
              currency: sender.currency || 'EUR',
              description: options.description || '',
              category: options.category || 'Transfer',
              status: 'completed',
              idempotencyKey: idempotencyKey
            }], { session: session }).then(function (created) {
              var transaction = created[0];

              return LedgerAccount.updateOne(
                { _id: senderAccount._id, balance: { $gte: amount }, status: 'active' },
                { $inc: { balance: -amount, version: 1 } },
                { session: session }
              ).then(function (senderUpdate) {
                if (senderUpdate.nModified !== 1) throw new Error('Unable to debit sender account');
                return LedgerAccount.updateOne(
                  { _id: receiverAccount._id, status: 'active' },
                  { $inc: { balance: amount, version: 1 } },
                  { session: session }
                );
              }).then(function (receiverUpdate) {
                if (receiverUpdate.nModified !== 1) throw new Error('Unable to credit receiver account');

                return Promise.all([
                  LedgerEntry.create([{
                    ledgerAccount: senderAccount._id,
                    transaction: transaction._id,
                    direction: 'debit',
                    amount: amount,
                    currency: sender.currency || 'EUR',
                    balanceAfter: senderBalance,
                    idempotencyKey: idempotencyKey + ':debit',
                    description: options.description || 'Internal transfer'
                  }], { session: session }),
                  LedgerEntry.create([{
                    ledgerAccount: receiverAccount._id,
                    transaction: transaction._id,
                    direction: 'credit',
                    amount: amount,
                    currency: receiver.currency || 'EUR',
                    balanceAfter: receiverBalance,
                    idempotencyKey: idempotencyKey + ':credit',
                    description: options.description || 'Internal transfer'
                  }], { session: session })
                ]);
              }).then(function () {
                return User.updateOne({ _id: sender._id }, { $set: { balance: senderBalance } }, { session: session });
              }).then(function () {
                return User.updateOne({ _id: receiver._id }, { $set: { balance: receiverBalance } }, { session: session });
              }).then(function () {
                return Transaction.findById(transaction._id).session(session).populate('sender receiver', 'firstName lastName accountNumber');
              });
            });
          });
        });
      });
    });
  }).then(function (result) {
    session.endSession();
    callback(null, result);
  }).catch(function (err) {
    if (session) session.endSession();
    callback(err);
  });
}

function getBalance(userId, callback) {
  LedgerAccount.findOne({ owner: userId }).then(function (account) {
    callback(null, account ? account.balance : 0);
  }).catch(callback);
}

module.exports = {
  transferInternal: transferInternal,
  getBalance: getBalance,
  ensureLedgerAccount: ensureLedgerAccount
};
