var mongoose = require('mongoose');
var bcrypt = require('bcryptjs');

function generateAccountNumber() {
  return 'EU' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

function generateIBAN(accountNumber) {
  var bban = accountNumber.replace('EU', '');
  return 'EU76' + 'NOVB' + bban;
}

function generateSortCode() {
  var part = function () {
    return Math.floor(10 + Math.random() * 90).toString();
  };
  return part() + '-' + part() + '-' + part();
}

var UserSchema = new mongoose.Schema({
  firstName:   { type: String, required: true, trim: true },
  lastName:    { type: String, required: true, trim: true },
  username:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:       { type: String, required: true },
  password:    { type: String, required: true },
  dateOfBirth: { type: Date },
  address: {
    street:  { type: String },
    city:    { type: String },
    country: { type: String },
    zip:     { type: String }
  },
  accountNumber:  { type: String, unique: true, default: generateAccountNumber },
  balance:        { type: Number, default: 0.00 },
  currency:       { type: String, default: 'EUR' },
  accountStatus:  { type: String, enum: ['active', 'suspended', 'closed'], default: 'active' },
  isVerified:     { type: Boolean, default: false },
  avatar:         { type: String, default: '' },

  bankDetails: {
    iban:          { type: String },
    swift:         { type: String, default: 'NOVBEUXX' },
    routingNumber: { type: String, default: '021000021' },
    sortCode:      { type: String },
    bankName:      { type: String, default: 'NovBank' },
    bankAddress:   { type: String, default: '15 Financial Square, Frankfurt, Germany' }
  },

  recentPayees: [
    {
      name:     { type: String },
      iban:     { type: String },
      bankName: { type: String },
      addedAt:  { type: Date, default: Date.now }
    }
  ],

  createdAt: { type: Date, default: Date.now }
});

UserSchema.pre('save', function (next) {
  var user = this;

  // Generate bank details on first save
  if (!user.bankDetails || !user.bankDetails.iban) {
    user.bankDetails = {
      iban:          generateIBAN(user.accountNumber),
      swift:         'NOVBEUXX',
      routingNumber: '021000021',
      sortCode:      generateSortCode(),
      bankName:      'NovBank',
      bankAddress:   '15 Financial Square, Frankfurt, Germany'
    };
  }

  if (!user.isModified('password')) return next();

  bcrypt.genSalt(10, function (err, salt) {
    if (err) return next(err);
    bcrypt.hash(user.password, salt, function (err, hash) {
      if (err) return next(err);
      user.password = hash;
      next();
    });
  });
});

module.exports = mongoose.model('User', UserSchema);