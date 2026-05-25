var mongoose = require('mongoose');

var AirtimeSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  phone:       { type: String, required: true },
  network:     { type: String, enum: ['Telekom', 'Vodafone', 'O2'], required: true },
  amount:      { type: Number, required: true },
  status:      { type: String, enum: ['success', 'failed'], default: 'success' },
  createdAt:   { type: Date, default: Date.now }
});

module.exports = mongoose.model('Airtime', AirtimeSchema);