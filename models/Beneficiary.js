var mongoose = require('mongoose');

var BeneficiarySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  identifier: { type: String, required: true, trim: true, lowercase: true },
  kind: { type: String, enum: ['local', 'wire'], default: 'local' },
  bankName: { type: String, default: '' },
  iban: { type: String, default: '' },
  bic: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: null }
});

BeneficiarySchema.index({ user: 1, identifier: 1 }, { unique: true });

module.exports = mongoose.model('Beneficiary', BeneficiarySchema);