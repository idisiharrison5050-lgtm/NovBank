var mongoose = require('mongoose');
var bcrypt = require('bcryptjs');

var AdminSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  lastName:  { type: String, required: true, trim: true },
  username:  { type: String, required: true, unique: true, lowercase: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:  { type: String, required: true },
  role:      { type: String, default: 'superadmin' },
  createdAt: { type: Date, default: Date.now }
});

AdminSchema.pre('save', function (next) {
  var admin = this;
  if (!admin.isModified('password')) return next();
  bcrypt.genSalt(10, function (err, salt) {
    if (err) return next(err);
    bcrypt.hash(admin.password, salt, function (err, hash) {
      if (err) return next(err);
      admin.password = hash;
      next();
    });
  });
});

module.exports = mongoose.model('Admin', AdminSchema);