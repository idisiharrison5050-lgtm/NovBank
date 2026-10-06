var express = require('express');
var mongoose = require('mongoose');
var router = express.Router();
var Notification = require('../models/Notification');
var kycGate = require('./kyc').kycGate;

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in to continue.');
  return res.redirect('/login');
}

function isPinVerified(req, res, next) {
  if (req.session.pinVerified) return next();
  return res.redirect('/pin');
}

router.post('/notifications/read-all', isAuth, isPinVerified, kycGate, function (req, res) {
  Notification.updateMany(
    { user: req.user._id, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  ).then(function () {
    req.flash('success_msg', 'All notifications marked as read.');
    res.redirect('/dashboard/notifications');
  }).catch(function (err) {
    console.error('Mark all notifications read failed:', err);
    req.flash('error_msg', 'Unable to update notifications right now.');
    res.redirect('/dashboard/notifications');
  });
});

router.post('/notifications/:id/read', isAuth, isPinVerified, kycGate, function (req, res) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.redirect('/dashboard/notifications');
  Notification.updateOne(
    { _id: req.params.id, user: req.user._id },
    { $set: { isRead: true, readAt: new Date() } }
  ).then(function () {
    res.redirect('/dashboard/notifications');
  }).catch(function (err) {
    console.error('Notification read update failed:', err);
    res.redirect('/dashboard/notifications');
  });
});

module.exports = router;
