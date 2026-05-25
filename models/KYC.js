var mongoose = require('mongoose');

var KYCSchema = new mongoose.Schema({
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  idType: {
    type: String,
    enum: ['passport', 'national_id', 'drivers_license', 'residence_permit'],
    required: true
  },
  idNumber:     { type: String, required: true },
  dateOfIssue:  { type: Date, required: true },
  dateOfExpiry: { type: Date, required: true },
  frontImage:   { type: String, required: true },
  backImage:    { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'declined'],
    default: 'pending'
  },
  declineReason: { type: String, default: '' },
  submittedAt:   { type: Date, default: Date.now },
  reviewedAt:    { type: Date }
});

module.exports = mongoose.model('KYC', KYCSchema);