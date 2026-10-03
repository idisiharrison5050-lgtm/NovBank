var mongoose = require('mongoose');

var NotificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['transaction', 'security', 'card', 'loan', 'kyc', 'system', 'marketing'], required: true },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  severity: { type: String, enum: ['info', 'success', 'warning', 'critical'], default: 'info' },
  isRead: { type: Boolean, default: false, index: true },
  readAt: { type: Date, default: null },
  actionUrl: { type: String, default: null },
  referenceType: { type: String, default: null },
  referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true }
});

NotificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
