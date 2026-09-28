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
  currency:    { type: String, default: 'EUR', uppercase: true },
  description: { type: String, default: '' },
  category: {
    type: String,
    enum: ['Transfer', 'Food', 'Rent', 'Utilities', 'Shopping', 'Healthcare', 'Entertainment', 'Airtime', 'Loan', 'Other'],
    default: 'Transfer'
  },

  proofOfPayment: { type: String, default: null },

  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'reversed'],
    default: 'pending'
  },

  processing: {
    submittedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    failureReason: { type: String, default: '' },
    reversalReason: { type: String, default: '' }
  },

  wireDetails: {
    recipientName: { type: String },
    iban:          { type: String },
    bic:           { type: String },
    bankName:      { type: String },
    bankCountry:   { type: String },
    proofOfPayment: { type: String, default: null },
    reference:     { type: String }
  },

  idempotencyKey: { type: String, unique: true, sparse: true, index: true },
  reference: {
    type: String,
    unique: true,
    default: function () {
      return 'TXN' + Date.now() + Math.floor(Math.random() * 1000);
    }
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

TransactionSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

TransactionSchema.index({ sender: 1, createdAt: -1 });
TransactionSchema.index({ receiver: 1, createdAt: -1 });
TransactionSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Transaction', TransactionSchema);
