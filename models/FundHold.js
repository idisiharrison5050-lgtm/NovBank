var mongoose = require('mongoose');

var FundHoldSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, required: true, uppercase: true },
  reason: { type: String, required: true, trim: true },
  reference: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['active', 'released', 'captured', 'expired'], default: 'active', index: true },
  expiresAt: { type: Date, default: null, index: true },
  transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  releasedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

FundHoldSchema.index({ user: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('FundHold', FundHoldSchema);
