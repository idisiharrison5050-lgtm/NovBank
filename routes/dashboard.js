var express     = require('express');
var router      = express.Router();
var Transaction = require('../models/Transaction');
var Notification= require('../models/Notification');
var LedgerAccount = require('../models/LedgerAccount');
var LedgerEntry = require('../models/LedgerEntry');
var Card = require('../models/Card');
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
    return Promise.all([
        Notification.countDocuments({ user: userId, isRead: false }),
        Card.find({ user: userId }).sort({ createdAt: -1 }).limit(3).select('cardType status frozenAt spendingLimit createdAt')
      ]).then(function (dashboardMeta) {
      var unreadCount = dashboardMeta[0];
      var cards = dashboardMeta[1] || [];
      var thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return Promise.all([
        Transaction.aggregate([{ $match: { sender: userId, status: 'completed', type: { $in: ['internal_transfer', 'wire_transfer', 'airtime'] }, createdAt: { $gte: thirtyDaysAgo } } }, { $group: { _id: '$category', total: { $sum: '$amount' } } }]),
        Transaction.find({ $or: [{ sender: userId }, { receiver: userId }], status: 'completed', createdAt: { $gte: thirtyDaysAgo } }).sort({ createdAt: 1 }).select('sender receiver amount createdAt type')
      ]).then(function (results) {
        var spending = results[0];
        var cashflowTransactions = results[1];
        var cashflow = [];
        for (var day = 6; day >= 0; day--) {
          var date = new Date();
          date.setHours(0, 0, 0, 0);
          date.setDate(date.getDate() - day);
          var next = new Date(date);
          next.setDate(next.getDate() + 1);
          var incoming = 0;
          var outgoing = 0;
          cashflowTransactions.forEach(function (txn) {
            var created = new Date(txn.createdAt);
            if (created >= date && created < next) {
              var outgoingTxn = txn.sender && txn.sender.toString() === userId.toString();
              if (outgoingTxn) outgoing += Number(txn.amount || 0);
              else incoming += Number(txn.amount || 0);
            }
          });
          cashflow.push({ label: date.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 1), incoming: incoming, outgoing: outgoing });
        }
        var monthIncoming = 0;
        var monthOutgoing = 0;
        var monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        cashflowTransactions.forEach(function (txn) {
          if (new Date(txn.createdAt) < monthStart) return;
          var outgoingTxn = txn.sender && txn.sender.toString() === userId.toString();
          if (outgoingTxn) monthOutgoing += Number(txn.amount || 0);
          else monthIncoming += Number(txn.amount || 0);
        });
        res.render('dashboard/index', {
          title: 'Dashboard',
          transactions: transactions,
          unreadCount: unreadCount,
          spending: spending,
          cashflow: cashflow,
          cards: cards,
          monthPending: cashflowTransactions.filter(function (txn) { return txn.status === 'pending' || txn.status === 'processing'; }).length,
          monthIncoming: monthIncoming,
          monthOutgoing: monthOutgoing
        });
      });
    });
  }).catch(function (err) { console.error(err); res.render('dashboard/index', { title: 'Dashboard', transactions: [], unreadCount: 0, spending: [] }); });
});

router.get('/statement', isAuth, isPinVerified, kycGate, function (req, res) {
  var userId = req.user._id;
  var from = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  var to = req.query.to ? new Date(req.query.to) : new Date();
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    req.flash('error_msg', 'Choose valid statement dates.');
    return res.redirect('/dashboard/transactions');
  }
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  if (to < from) {
    req.flash('error_msg', 'Statement end date must be after the start date.');
    return res.redirect('/dashboard/transactions');
  }

  LedgerAccount.findOne({ owner: userId }).then(function (ledgerAccount) {
    if (!ledgerAccount) {
      return res.render('dashboard/statement', {
        title: 'Account Statement',
        transactions: [],
        statementFrom: from,
        statementTo: to,
        openingBalance: 0,
        closingBalance: 0
      });
    }

    return Promise.all([
      Transaction.find({
        $or: [{ sender: userId }, { receiver: userId }],
        createdAt: { $gte: from, $lte: to }
      }).sort({ createdAt: 1 }),
      LedgerEntry.find({
        ledgerAccount: ledgerAccount._id,
        createdAt: { $lte: to }
      }).sort({ createdAt: 1 })
    ]).then(function (results) {
      var transactions = results[0] || [];
      var entries = results[1] || [];
      var openingBalance = entries.length ? Number(entries[0].balanceAfter) + (entries[0].direction === 'debit' ? Number(entries[0].amount) : -Number(entries[0].amount)) : Number(ledgerAccount.balance || 0);
      var closingEntry = entries.length ? entries[entries.length - 1] : null;
      var closingBalance = closingEntry ? Number(closingEntry.balanceAfter) : Number(ledgerAccount.balance || 0);

      res.render('dashboard/statement', {
        title: 'Account Statement',
        transactions: transactions,
        statementFrom: from,
        statementTo: to,
        openingBalance: openingBalance,
        closingBalance: closingBalance
      });
    });
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Unable to load your account statement.');
    res.redirect('/dashboard/transactions');
  });
});

router.get('/transactions', isAuth, isPinVerified, kycGate, function (req, res) {
  var userId = req.user._id;
  var page = parseInt(req.query.page) || 1;
  var limit = 15;
  var skip = (page - 1) * limit;
  var filter = req.query.filter || 'all';
  var search = String(req.query.q || '').trim();
  var query = { $or: [{ sender: userId }, { receiver: userId }] };
  if (['internal_transfer', 'wire_transfer', 'deposit', 'withdrawal', 'airtime', 'loan_credit'].indexOf(filter) !== -1) query.type = filter;
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
    return Promise.all([
      Transaction.countDocuments(query),
      Transaction.find(query).select('amount type status createdAt sender receiver').lean()
    ]).then(function (results) {
      var total = results[0];
      var allActivity = results[1] || [];
      var monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      var monthIncoming = 0;
      var monthOutgoing = 0;
      var pendingCount = 0;
      allActivity.forEach(function (txn) {
        if (txn.status === 'pending' || txn.status === 'processing') pendingCount += 1;
        if (new Date(txn.createdAt) < monthStart || txn.status === 'failed' || txn.status === 'cancelled' || txn.status === 'reversed') return;
        var outgoing = txn.sender && String(txn.sender) === String(userId) && txn.type !== 'deposit';
        if (outgoing) monthOutgoing += Number(txn.amount || 0);
        else monthIncoming += Number(txn.amount || 0);
      });
      res.render('dashboard/transactions', {
        title: 'Transactions',
        transactions: transactions,
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        filter: filter,
        search: search,
        activityCount: total,
        monthIncoming: monthIncoming,
        monthOutgoing: monthOutgoing,
        pendingCount: pendingCount
      });
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