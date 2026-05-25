var mongoose = require('mongoose');

var AuditLogSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
  action: { type: String, required: true },
  targetType: { type: String, enum: ['User', 'Transaction', 'Notification', 'System'], default: 'System' },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
  details: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);