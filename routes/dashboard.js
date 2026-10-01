var express     = require('express');
var router      = express.Router();
var Transaction = require('../models/Transaction');
var Notification= require('../models/Notification');
var { kycGate } = require('./kyc');
function escapeRegex(value) { return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in to continue.');
  res.redirect('/login');
}

function isPinVerified(req, res, next) {
  if (req.session.pinVerified) return next();
  res.redirect('/pin');
}

router.get('/', isAuth, isPinVerified, kycGate, function (req, res) {
  var userId = req.user._id;
  Transaction.find({ $or: [{ sender: userId }, { receiver: userId }] }).sort({ createdAt: -1 }).limit(6).populate('sender receiver', 'firstName lastName accountNumber').then(function (transactions) {
    return Notification.countDocuments({ user: userId, isRead: false }).then(function (unreadCount) {
      var thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return Transaction.aggregate([{ $match: { sender: userId, status: 'completed', type: { $in: ['internal_transfer', 'wire_transfer', 'airtime'] }, createdAt: { $gte: thirtyDaysAgo } } }, { $group: { _id: '$category', total: { $sum: '$amount' } } }]).then(function (spending) {
        res.render('dashboard/index', { title: 'Dashboard', transactions: transactions, unreadCount: unreadCount, spending: spending });
      });
    });
  }).catch(function (err) { console.error(err); res.render('dashboard/index', { title: 'Dashboard', transactions: [], unreadCount: 0, spending: [] }); });
});

router.get('/transactions', isAuth, isPinVerified, kycGate, function (req, res) {
  var userId = req.user._id;
  var page = parseInt(req.query.page) || 1;
  var limit = 15;
  var skip = (page - 1) * limit;
  var filter = req.query.filter || 'all';
  var search = String(req.query.q || '').trim();
  var query = { $or: [{ sender: userId }, { receiver: userId }] };
  if (['internal_transfer', 'wire_transfer', 'deposit', 'airtime', 'loan_credit'].indexOf(filter) !== -1) query.type = filter;
  if (search) query.$and = [{ $or: [{ description: new RegExp(escapeRegex(search), 'i') }, { reference: new RegExp(escapeRegex(search), 'i') }, { category: new RegExp(escapeRegex(search), 'i') }] }];
  if (req.query.export === 'csv') {
    return Transaction.find(query).sort({ createdAt: -1 }).limit(1000).then(function (transactions) {
      var rows = ['Reference,Date,Type,Description,Category,Amount,Currency,Status'];
      transactions.forEach(function (txn) {
        var description = String(txn.description || '').replace(/"/g, '""');
        rows.push([txn.reference, new Date(txn.createdAt).toISOString(), txn.type, '"' + description + '"', txn.category || '', Number(txn.amount || 0).toFixed(2), txn.currency || 'EUR', txn.status].join(','));
      });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="novbank-transactions.csv"');
      res.send(rows.join('\n'));
    }).catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Unable to export transactions right now.');
      res.redirect('/dashboard/transactions');
    });
  }
  Transaction.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('sender receiver', 'firstName lastName accountNumber').then(function (transactions) {
    return Transaction.countDocuments(query).then(function (total) {
      res.render('dashboard/transactions', { title: 'Transactions', transactions: transactions, currentPage: page, totalPages: Math.ceil(total / limit), filter: filter, search: search });
    });
  }).catch(function (err) { console.error(err); res.redirect('/dashboard'); });
});

router.get('/transactions/:id', isAuth, isPinVerified, kycGate, function (req, res) {
  Transaction.findOne({ _id: req.params.id, $or: [{ sender: req.user._id }, { receiver: req.user._id }] }).populate('sender receiver', 'firstName lastName accountNumber').then(function (transaction) {
    if (!transaction) return res.status(404).render('404', { title: 'Transaction Not Found' });
    var isCredit = transaction.type === 'deposit' || transaction.type === 'loan_credit' || !(transaction.sender && transaction.sender._id && transaction.sender._id.toString() === req.user._id.toString());
    res.render('dashboard/transaction-detail', { title: 'Transaction Details', transaction: transaction, isCredit: isCredit });
  }).catch(function (err) { console.error(err); res.status(404).render('404', { title: 'Transaction Not Found' }); });
});


router.get('/security', isAuth, isPinVerified, kycGate, function (req, res) {
  Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(8).then(function (notifications) {
    res.render('dashboard/security', {
      title: 'Security Center',
      notifications: notifications
    });
  }).catch(function (err) {
    console.error(err);
    res.redirect('/dashboard/profile');
  });
});

router.get('/notifications', isAuth, isPinVerified, kycGate, function (req, res) {
  Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).then(function (notifications) { return Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true }).then(function () { res.render('dashboard/notifications', { title: 'Notifications', notifications: notifications, unreadCount: 0 }); }); }).catch(function (err) { console.error(err); res.redirect('/dashboard'); });
});

router.get('/profile', isAuth, isPinVerified, kycGate, function (req, res) { res.render('dashboard/profile', { title: 'Account Center' }); });
module.exports = router;