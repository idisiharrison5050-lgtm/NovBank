var mongoose = require('mongoose');

var DeviceSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  deviceName: { type: String, default: 'Unknown device', trim: true },
  deviceType: { type: String, enum: ['mobile', 'tablet', 'desktop', 'unknown'], default: 'unknown' },
  browser: { type: String, default: null },
  ipHash: { type: String, default: null },
  lastSeenAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, index: true },
  revokedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

DeviceSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
DeviceSessionSchema.index({ user: 1, revokedAt: 1, lastSeenAt: -1 });

module.exports = mongoose.model('DeviceSession', DeviceSessionSchema);
