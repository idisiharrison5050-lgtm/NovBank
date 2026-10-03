var mongoose = require('mongoose');

var LedgerAccountSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  currency: { type: String, required: true, uppercase: true, trim: true, default: 'EUR' },
  balance: { type: Number, required: true, min: 0, default: 0 },
  status: { type: String, enum: ['active', 'frozen', 'closed'], default: 'active' },
  version: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('LedgerAccount', LedgerAccountSchema);
