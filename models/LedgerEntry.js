var mongoose = require('mongoose');

var LedgerEntrySchema = new mongoose.Schema({
  ledgerAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerAccount', required: true, index: true },
  transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true, index: true },
  direction: { type: String, enum: ['debit', 'credit'], required: true },
  amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, required: true, uppercase: true },
  balanceAfter: { type: Number, required: true, min: 0 },
  idempotencyKey: { type: String, required: true, index: true },
  description: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, immutable: true }
});

LedgerEntrySchema.index({ ledgerAccount: 1, createdAt: -1 });
LedgerEntrySchema.index({ idempotencyKey: 1, ledgerAccount: 1 }, { unique: true });

module.exports = mongoose.model('LedgerEntry', LedgerEntrySchema);
