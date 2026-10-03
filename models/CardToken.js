var mongoose = require('mongoose');

var CardTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  card: { type: mongoose.Schema.Types.ObjectId, ref: 'Card', required: true, index: true },
  providerToken: { type: String, required: true, unique: true, index: true },
  last4: { type: String, required: true, minlength: 4, maxlength: 4 },
  brand: { type: String, default: null },
  expMonth: { type: Number, min: 1, max: 12, default: null },
  expYear: { type: Number, default: null },
  status: { type: String, enum: ['active', 'revoked'], default: 'active', index: true },
  createdAt: { type: Date, default: Date.now },
  revokedAt: { type: Date, default: null }
});

module.exports = mongoose.model('CardToken', CardTokenSchema);
