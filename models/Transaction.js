var mongoose = require('mongoose');

var TransactionSchema = new mongoose.Schema({
  sender:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  type: {
    type: String,
    enum: ['internal_transfer', 'wire_transfer', 'deposit', 'withdrawal', 'airtime', 'loan_credit'],
    required: true
  },

  amount:      { type: Number, required: true },
  currency:    { type: String, default: 'EUR' },
  description: { type: String, default: '' },
  category: {
    type: String,
    enum: ['Transfer', 'Food', 'Rent', 'Utilities', 'Shopping', 'Healthcare', 'Entertainment', 'Airtime', 'Loan', 'Other'],
    default: 'Transfer'
  },

  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },

  wireDetails: {
    recipientName: { type: String },
    iban:          { type: String },
    bic:           { type: String },
    bankName:      { type: String },
    bankCountry:   { type: String },
    reference:     { type: String }
  },

  reference: {
    type: String,
    default: function () {
      return 'TXN' + Date.now() + Math.floor(Math.random() * 1000);
    }
  },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', TransactionSchema);