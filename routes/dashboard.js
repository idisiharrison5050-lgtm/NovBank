var express     = require('express');
var PDFDocument = require('pdfkit');
var router      = express.Router();
var Transaction = require('../models/Transaction');
var Notification= require('../models/Notification');
var LedgerAccount = require('../models/LedgerAccount');
var LedgerEntry = require('../models/LedgerEntry');
var Card = require('../models/Card');
var { kycGate } = require('./kyc');
var currencies = require('../config/currencies');
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
        Transaction.find({ $or: [{ sender: userId }, { receiver: userId }], status: 'completed', type: { $ne: 'currency_conversion' }, createdAt: { $gte: thirtyDaysAgo } }).sort({ createdAt: 1 }).select('sender receiver amount createdAt type'),
        Transaction.countDocuments({ $or: [{ sender: userId }, { receiver: userId }], status: { $in: ['pending', 'processing'] }, createdAt: { $gte: thirtyDaysAgo } })
      ]).then(function (results) {
        var spending = results[0];
        var cashflowTransactions = results[1];
        var pendingCount = results[2] || 0;
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
          monthPending: pendingCount,
          monthIncoming: monthIncoming,
          monthOutgoing: monthOutgoing
        });
      });
    });
  }).catch(function (err) { console.error(err); res.render('dashboard/index', { title: 'Dashboard', transactions: [], unreadCount: 0, spending: [] }); });
});

router.get('/statement/pdf', isAuth, isPinVerified, kycGate, function (req, res) {
  var userId = req.user._id;
  var from = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  var to = req.query.to ? new Date(req.query.to) : new Date();
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || to < from) return res.status(400).send('Invalid statement period');
  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);
  Promise.all([
    Transaction.find({ $or: [{ sender: userId }, { receiver: userId }], createdAt: { $gte: from, $lte: to } }).sort({ createdAt: 1 }),
    LedgerAccount.findOne({ owner: userId })
  ]).then(function (results) {
    var transactions = results[0] || [];
    var ledgerAccount = results[1];
    var openingBalance = Number(ledgerAccount && ledgerAccount.balance || 0);
    var closingBalance = openingBalance;
    if (ledgerAccount) {
      return LedgerEntry.find({ ledgerAccount: ledgerAccount._id, createdAt: { $lte: to } }).sort({ createdAt: 1 }).then(function (entries) {
        var before = null;
        var atEnd = null;
        entries.forEach(function (entry) {
          if (new Date(entry.createdAt) < from) before = entry;
          atEnd = entry;
        });
        if (before) openingBalance = Number(before.balanceAfter || 0);
        else if (entries.length && new Date(entries[0].createdAt) >= from) openingBalance = Number(entries[0].balanceAfter || 0) + (entries[0].direction === 'debit' ? Number(entries[0].amount || 0) : -Number(entries[0].amount || 0));
        closingBalance = atEnd ? Number(atEnd.balanceAfter || 0) : openingBalance;
        return { transactions: transactions, openingBalance: openingBalance, closingBalance: closingBalance };
      });
    }
    return { transactions: transactions, openingBalance: openingBalance, closingBalance: closingBalance };
  }).then(function (data) {
    var doc = new PDFDocument({ size: 'A4', margin: 42 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="novbank-statement-' + from.toISOString().slice(0, 10) + '-to-' + to.toISOString().slice(0, 10) + '.pdf"');
    doc.pipe(res);
    doc.fontSize(22).fillColor('#101828').text('NovBank');
    doc.fontSize(9).fillColor('#667085').text('ACCOUNT STATEMENT');
    doc.moveDown(1);
    doc.fontSize(10).fillColor('#101828').text('Account: •••• ' + String(req.user.accountNumber || '').slice(-4));
    doc.fontSize(9).fillColor('#667085').text('Period: ' + from.toLocaleDateString('en-GB') + ' — ' + to.toLocaleDateString('en-GB'));
    doc.moveDown(1);
    doc.roundedRect(42, doc.y, 511, 58, 10).fill('#f8fafc');
    doc.fillColor('#667085').fontSize(8).text('OPENING BALANCE', 56, doc.y + 14);
    doc.fillColor('#101828').fontSize(14).text('€' + data.openingBalance.toLocaleString('en-GB', { minimumFractionDigits: 2 }), 56, doc.y + 7);
    doc.fillColor('#667085').fontSize(8).text('CLOSING BALANCE', 310, doc.y + 7);
    doc.fillColor('#101828').fontSize(14).text('€' + data.closingBalance.toLocaleString('en-GB', { minimumFractionDigits: 2 }), 310, doc.y + 7);
    doc.y = 170;
    data.transactions.forEach(function (txn) {
      if (doc.y > 730) doc.addPage();
      var outgoing = txn.sender && txn.sender.toString() === userId.toString() && txn.type !== 'deposit';
      doc.moveTo(42, doc.y).lineTo(553, doc.y).strokeColor('#eaecf0').stroke();
      doc.moveDown(0.45);
      doc.fontSize(9).fillColor('#101828').text(new Date(txn.createdAt).toLocaleDateString('en-GB') + '  ' + (txn.description || txn.type.replace(/_/g, ' ')), 42, doc.y, { width: 330 });
      doc.fontSize(9).fillColor(outgoing ? '#101828' : '#039855').text((outgoing ? '-' : '+') + (txn.currency || 'EUR') + ' ' + Number(txn.amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 }), 390, doc.y, { width: 160, align: 'right' });
      doc.moveDown(0.25).fontSize(7).fillColor('#667085').text((txn.reference || '') + ' · ' + txn.status, 42, doc.y);
      doc.moveDown(0.65);
    });
    doc.moveTo(42, 760).lineTo(553, 760).strokeColor('#e4e7ec').stroke();
    doc.fontSize(7).fillColor('#98a2b3').text('Generated from your NovBank account activity.', 42, 770);
    doc.end();
  }).catch(function (err) {
    console.error('Statement PDF generation failed:', err);
    res.status(500).send('Unable to generate statement');
  });
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
        user: req.user,
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
      var firstPeriodIndex = -1;
      for (var i = 0; i < entries.length; i += 1) {
        if (new Date(entries[i].createdAt) >= from) { firstPeriodIndex = i; break; }
      }
      var openingBalance;
      if (firstPeriodIndex > 0) {
        openingBalance = Number(entries[firstPeriodIndex - 1].balanceAfter);
      } else if (firstPeriodIndex === 0) {
        var firstEntry = entries[0];
        openingBalance = Number(firstEntry.balanceAfter) + (firstEntry.direction === 'debit' ? Number(firstEntry.amount) : -Number(firstEntry.amount));
      } else {
        openingBalance = Number(ledgerAccount.balance || 0);
      }
      var closingEntry = entries.length ? entries[entries.length - 1] : null;
      var closingBalance = closingEntry ? Number(closingEntry.balanceAfter) : Number(ledgerAccount.balance || 0);

      res.render('dashboard/statement', {
        title: 'Account Statement',
        user: req.user,
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
  if (['internal_transfer', 'wire_transfer', 'deposit', 'withdrawal', 'airtime', 'loan_credit', 'currency_conversion'].indexOf(filter) !== -1) query.type = filter;
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
        if (txn.type === 'currency_conversion') return;
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

router.get('/transactions/:id/receipt', isAuth, isPinVerified, kycGate, function (req, res) {
  Transaction.findOne({ _id: req.params.id, $or: [{ sender: req.user._id }, { receiver: req.user._id }] }).populate('sender receiver', 'firstName lastName accountNumber').then(function (transaction) {
    if (!transaction) return res.status(404).send('Transaction not found');
    var isCredit = transaction.type === 'deposit' || transaction.type === 'loan_credit' || !(transaction.sender && transaction.sender._id && transaction.sender._id.toString() === req.user._id.toString());
    var doc = new PDFDocument({ size: 'A4', margin: 48 });
    var filename = 'novbank-' + String(transaction.reference || transaction._id) + '-receipt.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    doc.pipe(res);
    function line(label, value) {
      doc.fontSize(8).fillColor('#667085').text(String(label).toUpperCase(), { characterSpacing: 0.6 });
      doc.moveDown(0.25).fontSize(11).fillColor('#101828').text(String(value || '—'));
      doc.moveDown(0.8);
    }
    doc.fontSize(22).fillColor('#101828').text('NovBank');
    doc.fontSize(9).fillColor('#667085').text('TRANSACTION RECEIPT');
    doc.moveDown(1.2);
    doc.roundedRect(48, doc.y, 499, 105, 12).fill('#f8fafc');
    doc.fillColor('#667085').fontSize(9).text(isCredit ? 'MONEY RECEIVED' : 'MONEY SENT', 68, doc.y + 20);
    doc.fillColor(isCredit ? '#039855' : '#101828').fontSize(27).text((isCredit ? '+' : '-') + transaction.currency + ' ' + Number(transaction.amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 68, doc.y + 7);
    doc.fillColor('#667085').fontSize(9).text('Status: ' + transaction.status, 68, doc.y + 7);
    doc.y = 185;
    line('Reference', transaction.reference);
    line('Date', new Date(transaction.createdAt).toLocaleString('en-GB'));
    line('Type', transaction.type.replace(/_/g, ' '));
    line('Category', transaction.category || 'Account activity');
    line('Description', transaction.description || '—');
    if (transaction.wireDetails) {
      line('Payout method', transaction.wireDetails.payoutMethod || 'bank');
      line('Recipient', transaction.wireDetails.recipientName || '—');
      line('Bank', transaction.wireDetails.bankName || '—');
      line('Destination', transaction.wireDetails.iban || '—');
      line('Country', transaction.wireDetails.bankCountry || '—');
    } else {
      line('From', transaction.sender ? ((transaction.sender.firstName || '') + ' ' + (transaction.sender.lastName || '')).trim() : '—');
      line('To', transaction.receiver ? ((transaction.receiver.firstName || '') + ' ' + (transaction.receiver.lastName || '')).trim() : '—');
    }
    doc.moveTo(48, 745).lineTo(547, 745).strokeColor('#e4e7ec').stroke();
    doc.fontSize(8).fillColor('#98a2b3').text('Generated from your NovBank account activity.', 48, 758);
    doc.end();
  }).catch(function (err) {
    console.error('Receipt generation failed:', err);
    res.status(404).send('Unable to generate receipt');
  });
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

router.get('/profile', isAuth, isPinVerified, kycGate, function (req, res) {
  currencies.refresh().then(function (availableCurrencies) {
    return LedgerAccount.findOne({ owner: req.user._id }).then(function (account) {
      res.render('dashboard/profile', {
        title: 'Account Center',
        currencies: availableCurrencies,
        accountBalance: Number(account ? account.balance : req.user.balance || 0)
      });
    });
  }).catch(function (err) {
    console.error('Account center load failed:', err);
    res.render('dashboard/profile', {
      title: 'Account Center',
      currencies: currencies,
      accountBalance: Number(req.user.balance || 0)
    });
  });
});
module.exports = router;