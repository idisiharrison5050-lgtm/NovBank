var mongoose = require('mongoose');
var Transfer = require('../models/Transfer');
var FundHold = require('../models/FundHold');

function transition(reference, nextStatus, extra, callback) {
  var allowed = {
    created: ['authorized', 'cancelled'],
    authorized: ['held', 'cancelled'],
    held: ['processing', 'cancelled'],
    processing: ['submitted', 'failed', 'reversed'],
    submitted: ['settled', 'failed', 'reversed'],
    settled: ['reversed'],
    failed: [],
    cancelled: [],
    reversed: []
  };

  Transfer.findOne({ reference: reference }).then(function (transfer) {
    if (!transfer) throw new Error('Transfer not found');
    if (!allowed[transfer.status] || allowed[transfer.status].indexOf(nextStatus) === -1) {
      throw new Error('Invalid transfer state transition');
    }

    transfer.status = nextStatus;
    extra = extra || {};
    Object.keys(extra).forEach(function (key) { transfer[key] = extra[key]; });

    if (nextStatus === 'submitted') transfer.submittedAt = new Date();
    if (nextStatus === 'settled') transfer.settledAt = new Date();
    if (nextStatus === 'failed') transfer.failedAt = new Date();
    if (nextStatus === 'reversed') transfer.reversedAt = new Date();

    return transfer.save();
  }).then(function (transfer) {
    callback(null, transfer);
  }).catch(callback);
}

function settle(reference, providerReference, callback) {
  transition(reference, 'settled', { providerReference: providerReference || null }, callback);
}

function fail(reference, code, reason, callback) {
  transition(reference, 'failed', { failureCode: code || 'UNKNOWN', failureReason: reason || 'Transfer failed' }, callback);
}

function reverse(reference, reason, callback) {
  transition(reference, 'reversed', { failureCode: 'REVERSED', failureReason: reason || 'Transfer reversed' }, callback);
}

module.exports = {
  transition: transition,
  settle: settle,
  fail: fail,
  reverse: reverse
};
