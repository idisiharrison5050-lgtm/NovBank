var mongoose = require('mongoose');

function generateCardNumber() {
  var num = '';
  for (var i = 0; i < 16; i++) {
    num += Math.floor(Math.random() * 10).toString();
  }
  return num;
}

function generateCVV() {
  return Math.floor(100 + Math.random() * 900).toString();
}

function generateExpiry() {
  var now     = new Date();
  var expYear = now.getFullYear() + 4;
  var expMonth = String(now.getMonth() + 1).padStart(2, '0');
  return expMonth + '/' + String(expYear).slice(2);
}

var CardSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cardType:   { type: String, enum: ['visa', 'mastercard'], required: true },
  cardNumber: { type: String, default: generateCardNumber },
  cvv:        { type: String, default: generateCVV },
  expiry:     { type: String, default: generateExpiry },
  cardHolder: { type: String, required: true },
  status:     { type: String, enum: ['pending', 'active', 'blocked'], default: 'pending' },
  createdAt:  { type: Date, default: Date.now }
});

module.exports = mongoose.model('Card', CardSchema);