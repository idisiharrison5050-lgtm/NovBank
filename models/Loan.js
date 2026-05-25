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
  createdAt:     { type: Date, default: Date.now }
});

module.exports = mongoose.model('Loan', LoanSchema);