var Transaction = require('../models/Transaction');

function getTransferUsage(userId, callback) {
  var now = new Date();
  var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  var types = { $in: ['internal_transfer', 'wire_transfer', 'withdrawal'] };

  Promise.all([
    Transaction.aggregate([{ $match: { sender: userId, type: types, createdAt: { $gte: dayStart }, status: { $in: ['pending', 'completed'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Transaction.aggregate([{ $match: { sender: userId, type: types, createdAt: { $gte: monthStart }, status: { $in: ['pending', 'completed'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
  ]).then(function (results) {
    callback(null, {
      daily: results[0].length ? Number(results[0][0].total) : 0,
      monthly: results[1].length ? Number(results[1][0].total) : 0
    });
  }).catch(function (err) {
    callback(err);
  });
}

function checkTransferLimit(user, amount, callback) {
  var limits = user.accountLimits || {};
  var dailyLimit = Number(limits.dailyTransfer || 0);
  var monthlyLimit = Number(limits.monthlyTransfer || 0);

  if (dailyLimit <= 0 || monthlyLimit <= 0) {
    return callback(new Error('Transfers are currently disabled for this account. Please contact support.'));
  }

  getTransferUsage(user._id, function (err, usage) {
    if (err) return callback(err);
    if (usage.daily + amount > dailyLimit) {
      return callback(new Error('This transfer would exceed your daily transfer limit of €' + dailyLimit.toFixed(2) + '.'));
    }
    if (usage.monthly + amount > monthlyLimit) {
      return callback(new Error('This transfer would exceed your monthly transfer limit of €' + monthlyLimit.toFixed(2) + '.'));
    }
    callback(null);
  });
}

module.exports = {
  getTransferUsage: getTransferUsage,
  checkTransferLimit: checkTransferLimit
};
