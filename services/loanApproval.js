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

function approveLoan(options, callback) {
  var session;

  if (!options || !options.loanId || !options.adminId) {
    return callback(new Error('Loan and administrator are required'));
  }

  mongoose.startSession().then(function (newSession) {
    session = newSession;

    return session.withTransaction(function () {
      return Loan.findById(options.loanId).session(session).then(function (loan) {
        if (!loan) throw new Error('Loan request not found');
        if (loan.status !== 'pending') throw new Error('Loan request not found or already processed');

        return Promise.all([
          User.findById(loan.user).session(session),
          Transaction.findOne({ idempotencyKey: 'loan:' + loan._id.toString() }).session(session)
        ]).then(function (results) {
          var user = results[0];
          var existing = results[1];

          if (!user) throw new Error('Account not found');
          if (user.accountStatus !== 'active') throw new Error('Account is not active');

          if (existing) {
            loan.status = 'approved';
            loan.approvedAt = loan.approvedAt || new Date();
            loan.totalDue = Number(loan.totalDue || loan.amount);
            loan.amountRepaid = Number(loan.amountRepaid || 0);
            loan.outstanding = Math.max(
              0,
              Math.round((loan.totalDue - loan.amountRepaid) * 100) / 100
            );

            return loan.save({ session: session }).then(function () {
              return {
                loan: loan,
                transaction: existing,
                duplicate: true
              };
            });
          }

          var amount = normalizeAmount(loan.amount);

          return ensureLedgerAccount(user, session).then(function (account) {
            if (account.status !== 'active') throw new Error('Ledger account is not active');

            var after = Math.round((account.balance + amount) * 100) / 100;

            return Transaction.create([{
              sender: user._id,
              type: 'loan_credit',
              amount: amount,
              currency: user.currency || 'EUR',
              description: 'Loan credited to account',
              category: 'Loan',
              status: 'completed',
              idempotencyKey: 'loan:' + loan._id.toString()
            }], { session: session }).then(function (created) {
              var txn = created[0];

              return LedgerAccount.updateOne(
                { _id: account._id, status: 'active' },
                { $inc: { balance: amount, version: 1 } },
                { session: session }
              ).then(function (updated) {
                if (updated.nModified !== 1) {
                  throw new Error('Unable to credit account');
                }

                return LedgerEntry.create([{
                  ledgerAccount: account._id,
                  transaction: txn._id,
                  direction: 'credit',
                  amount: amount,
                  currency: user.currency || 'EUR',
                  balanceAfter: after,
                  idempotencyKey: 'loan:' + loan._id.toString() + ':entry',
                  description: 'Loan credited to account'
                }], { session: session });
              }).then(function () {
                return User.updateOne(
                  { _id: user._id },
                  { $set: { balance: after } },
                  { session: session }
                );
              }).then(function () {
                loan.status = 'approved';
                loan.approvedAt = new Date();
                loan.totalDue = amount;
                loan.amountRepaid = 0;
                loan.outstanding = amount;

                return loan.save({ session: session });
              }).then(function () {
                return {
                  loan: loan,
                  transaction: txn,
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
  approveLoan: approveLoan
};
