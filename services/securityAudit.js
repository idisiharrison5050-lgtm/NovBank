var AuditLog = require('../models/AuditLog');

function record(options, callback) {
  options = options || {};
  AuditLog.create({
    actor: options.actor || null,
    action: options.action || 'security.event',
    targetType: options.targetType || null,
    targetId: options.targetId || null,
    ip: options.ip || null,
    userAgent: options.userAgent || null,
    metadata: options.metadata || {}
  }).then(function (entry) {
    callback(null, entry);
  }).catch(callback);
}

module.exports = { record: record };
