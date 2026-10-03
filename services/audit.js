var AuditLog = require('../models/AuditLog');

function record(options, callback) {
  options = options || {};

  var log = new AuditLog({
    admin: options.admin || null,
    action: options.action || 'system_event',
    targetType: options.targetType || 'System',
    targetId: options.targetId || null,
    details: options.details || ''
  });

  log.save(callback);
}

module.exports = {
  record: record
};
