var mongoose = require('mongoose');

var CardSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  cardType: { type: String, enum: ['visa', 'mastercard'], required: true },
  cardNumber: { type: String, select: false, default: null },
  cvv: { type: String, select: false, default: null },
  expiry: { type: String, default: null },
  cardHolder: { type: String, required: true },
  status: { type: String, enum: ['pending', 'active', 'blocked'], default: 'pending', index: true },
  frozenAt: { type: Date, default: null },
  spendingLimit: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Card', CardSchema);
