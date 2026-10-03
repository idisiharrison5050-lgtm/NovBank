var mongoose = require('mongoose');

var LoanSchema = new mongoose.Schema({
  user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount:      { type: Number, required: true },
  purpose:     { type: String, required: true },
  repaymentPeriod: { type: Number, required: true }, // in months
  status: {
    type: String,
    enum: ['pending', 'approved', 'declined', 'repaid'],
    default: 'pending'
  },
  declineReason: { type: String, default: '' },
  approvedAt:    { type: Date },
  totalDue:      { type: Number, default: 0 },
  amountRepaid:  { type: Number, default: 0 },
  outstanding:   { type: Number, default: 0 },
  nextPaymentAt: { type: Date, default: null },
  createdAt:     { type: Date, default: Date.now },
  updatedAt:     { type: Date, default: Date.now }
});

LoanSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Loan', LoanSchema);
