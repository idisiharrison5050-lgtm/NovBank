var Notification = require('../models/Notification');

function create(options, callback) {
  Notification.create({
    user: options.user,
    type: options.type || 'system',
    title: options.title,
    message: options.message,
    severity: options.severity || 'info',
    actionUrl: options.actionUrl || null,
    referenceType: options.referenceType || null,
    referenceId: options.referenceId || null,
    metadata: options.metadata || {}
  }).then(function (notification) {
    callback(null, notification);
  }).catch(callback);
}

function markRead(userId, notificationId, callback) {
  Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { $set: { isRead: true, readAt: new Date() } },
    { new: true }
  ).then(function (notification) {
    callback(null, notification);
  }).catch(callback);
}

function unreadCount(userId, callback) {
  Notification.countDocuments({ user: userId, isRead: false }).then(function (count) {
    callback(null, count);
  }).catch(callback);
}

module.exports = {
  create: create,
  markRead: markRead,
  unreadCount: unreadCount
};
