var mongoose = require('mongoose');

var GrantSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  requestKey: { type: String, unique: true, sparse: true, index: true },
  purpose: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['processing', 'approved', 'rejected', 'disbursed'],
    default: 'processing',
    index: true
  },
  reviewNote: { type: String, default: '' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reviewedAt: { type: Date, default: null },
  disbursedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

GrantSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Grant', GrantSchema);
