var mongoose = require('mongoose');

var TransferSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ledgerAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerAccount', required: true },
  beneficiary: { type: mongoose.Schema.Types.ObjectId, ref: 'Beneficiary', default: null },
  amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, required: true, uppercase: true },
  type: { type: String, enum: ['internal', 'domestic', 'international', 'scheduled'], required: true },
  status: { type: String, enum: ['created', 'authorized', 'held', 'processing', 'submitted', 'settled', 'failed', 'cancelled', 'reversed'], default: 'created', index: true },
  scheduledFor: { type: Date, default: null, index: true },
  submittedAt: { type: Date, default: null },
  settledAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
  reversedAt: { type: Date, default: null },
  failureCode: { type: String, default: null },
  failureReason: { type: String, default: null },
  provider: { type: String, default: null },
  providerReference: { type: String, default: null, index: true },
  idempotencyKey: { type: String, required: true, unique: true, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

TransferSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

TransferSchema.index({ user: 1, status: 1, createdAt: -1 });
TransferSchema.index({ status: 1, scheduledFor: 1 });

module.exports = mongoose.model('Transfer', TransferSchema);
