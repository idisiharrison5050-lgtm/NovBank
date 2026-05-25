var express     = require('express');
var router      = express.Router();
var Transaction = require('../models/Transaction');
var Notification= require('../models/Notification');
var { kycGate } = require('./kyc');

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in to continue.');
  res.redirect('/login');
}

router.get('/', isAuth, kycGate, function (req, res) {
  var userId = req.user._id;

  Transaction.find({ $or: [{ sender: userId }, { receiver: userId }] })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate('sender receiver', 'firstName lastName accountNumber')
    .then(function (transactions) {
      return Notification.countDocuments({ user: userId, isRead: false })
        .then(function (unreadCount) {
          var thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          return Transaction.aggregate([
            {
              $match: {
                sender:  userId,
                status:  'completed',
                type:    { $in: ['internal_transfer', 'wire_transfer', 'airtime'] },
                createdAt: { $gte: thirtyDaysAgo }
              }
            },
            { $group: { _id: '$category', total: { $sum: '$amount' } } }
          ]).then(function (spending) {
            res.render('dashboard/index', {
              title:        'Dashboard',
              transactions: transactions,
              unreadCount:  unreadCount,
              spending:     spending
            });
          });
        });
    })
    .catch(function (err) {
      console.error(err);
      res.render('dashboard/index', {
        title: 'Dashboard', transactions: [], unreadCount: 0, spending: []
      });
    });
});

router.get('/transactions', isAuth, kycGate, function (req, res) {
  var userId = req.user._id;
  var page   = parseInt(req.query.page) || 1;
  var limit  = 15;
  var skip   = (page - 1) * limit;
  var filter = req.query.filter || 'all';
  var query  = { $or: [{ sender: userId }, { receiver: userId }] };
  if (filter !== 'all') query.type = filter;

  Transaction.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('sender receiver', 'firstName lastName accountNumber')
    .then(function (transactions) {
      return Transaction.countDocuments(query).then(function (total) {
        res.render('dashboard/transactions', {
          title:        'Transaction History',
          transactions: transactions,
          currentPage:  page,
          totalPages:   Math.ceil(total / limit),
          filter:       filter,
          unreadCount:  0
        });
      });
    })
    .catch(function (err) {
      console.error(err);
      res.redirect('/dashboard');
    });
});

router.get('/notifications', isAuth, kycGate, function (req, res) {
  Notification.find({ user: req.user._id }).sort({ createdAt: -1 })
    .then(function (notifications) {
      return Notification.updateMany(
        { user: req.user._id, isRead: false }, { isRead: true }
      ).then(function () {
        res.render('dashboard/notifications', {
          title: 'Notifications', notifications: notifications, unreadCount: 0
        });
      });
    }).catch(function (err) {
      console.error(err);
      res.redirect('/dashboard');
    });
});

router.get('/profile', isAuth, kycGate, function (req, res) {
  res.render('dashboard/profile', { title: 'My Profile', unreadCount: 0 });
});

module.exports = router;