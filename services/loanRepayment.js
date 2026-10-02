var mongoose = require('mongoose');
var Loan = require('../models/Loan');
var User = require('../models/User');
var Transaction = require('../models/Transaction');
var LedgerAccount = require('../models/LedgerAccount');
var LedgerEntry = require('../models/LedgerEntry');

function normalizeAmount(amount) {
  var value = Number(amount);
  if (!isFinite(value) || value <= 0) throw new Error('Invalid amount');
  return Math.round(value * 100) / 100;
}

function ensureLedgerAccount(user, session) {
  return LedgerAccount.findOne({ owner: user._id }).session(session).then(function (account) {
    if (account) return account;
    return LedgerAccount.create([{
      owner: user._id,
      currency: user.currency || 'EUR',
      balance: Number(user.balance || 0)
    }], { session: session }).then(function (created) {
      return created[0];
    });
  });
}

function repayLoan(options, callback) {
  var amount;

  try {
    amount = normalizeAmount(options.amount);
  } catch (err) {
    return callback(err);
  }

  if (!options.userId || !options.loanId) {
    return callback(new Error('Loan and user are required'));
  }

  var idempotencyKey = options.idempotencyKey || (
    'loan-repayment:' + options.loanId.toString() + ':' +
    Date.now() + ':' + Math.floor(Math.random() * 1000000)
  );

  var session;

  mongoose.startSession().then(function (newSession) {
    session = newSession;

    return session.withTransaction(function () {
      return Transaction.findOne({
        idempotencyKey: idempotencyKey
      }).session(session).then(function (existing) {
        if (existing) {
          if (
            String(existing.sender) !== String(options.userId) ||
            existing.type !== 'loan_repayment'
          ) {
            throw new Error('Invalid repayment request');
          }

          return {
            transaction: existing,
            loan: null,
            duplicate: true
          };
        }

        return Promise.all([
          User.findById(options.userId).session(session),
          Loan.findOne({
            _id: options.loanId,
            user: options.userId,
            status: 'approved'
          }).session(session)
        ]).then(function (results) {
          var user = results[0];
          var loan = results[1];

          if (!user) throw new Error('Account not found');
          if (!loan) throw new Error('No approved loan is available for repayment');
          if (user.accountStatus !== 'active') throw new Error('Account is not active');

          var outstanding = Math.round(
            Number(loan.outstanding || loan.totalDue || loan.amount || 0) * 100
          ) / 100;

          if (outstanding <= 0) throw new Error('Loan has no outstanding balance');
          if (amount > outstanding) amount = outstanding;

          return ensureLedgerAccount(user, session).then(function (account) {
            if (account.status !== 'active') throw new Error('Ledger account is not active');
            if (account.balance < amount) throw new Error('Insufficient funds');

            var after = Math.round((account.balance - amount) * 100) / 100;
            var newRepaid = Math.round(
              (Number(loan.amountRepaid || 0) + amount) * 100
            ) / 100;
            var newOutstanding = Math.max(
              0,
              Math.round((Number(loan.totalDue || loan.amount || 0) - newRepaid) * 100) / 100
            );

            return Transaction.create([{
              sender: user._id,
              type: 'loan_repayment',
              amount: amount,
              currency: user.currency || 'EUR',
              description: options.description || 'Loan repayment',
              category: 'Loan',
              status: 'completed',
              idempotencyKey: idempotencyKey
            }], { session: session }).then(function (created) {
              var txn = created[0];

              return LedgerAccount.updateOne(
                { _id: account._id, balance: { $gte: amount }, status: 'active' },
                { $inc: { balance: -amount, version: 1 } },
                { session: session }
              ).then(function (updated) {
                if (updated.nModified !== 1) {
                  throw new Error('Unable to debit account');
                }

                return LedgerEntry.create([{
                  ledgerAccount: account._id,
                  transaction: txn._id,
                  direction: 'debit',
                  amount: amount,
                  currency: user.currency || 'EUR',
                  balanceAfter: after,
                  idempotencyKey: idempotencyKey + ':entry',
                  description: 'Loan repayment'
                }], { session: session });
              }).then(function () {
                return User.updateOne(
                  { _id: user._id },
                  { $set: { balance: after } },
                  { session: session }
                );
              }).then(function () {
                loan.amountRepaid = newRepaid;
                loan.outstanding = newOutstanding;
                if (newOutstanding === 0) {
                  loan.status = 'repaid';
                  loan.nextPaymentAt = null;
                }
                loan.updatedAt = new Date();

                return loan.save({ session: session });
              }).then(function () {
                return {
                  transaction: txn,
                  loan: loan,
                  duplicate: false
                };
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

module.exports = {
  repayLoan: repayLoan
};
