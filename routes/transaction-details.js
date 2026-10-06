var express = require('express');
var PDFDocument = require('pdfkit');
var mongoose = require('mongoose');
var router = express.Router();
var Transaction = require('../models/Transaction');
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

function getTransaction(req, res, callback) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(404).render('404', { title: 'Transaction not found' });
  var userId = req.user._id;
  Transaction.findOne({
    _id: req.params.id,
    $or: [{ sender: userId }, { receiver: userId }]
  }).populate('sender receiver', 'firstName lastName accountNumber').exec(function (err, txn) {
    if (err) {
      console.error('Transaction lookup failed:', err);
      return res.status(500).send('Unable to load transaction');
    }
    if (!txn) return res.status(404).render('404', { title: 'Transaction not found' });
    callback(txn);
  });
}

function isOutgoing(txn, userId) {
  return txn.sender && txn.sender._id && txn.sender._id.toString() === userId.toString() && txn.type !== 'deposit';
}

function displayName(person) {
  if (!person) return 'NovBank';
  var name = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  return name || ('•••• ' + String(person.accountNumber || '').slice(-4));
}

router.get('/transactions/:id', isAuth, isPinVerified, kycGate, function (req, res) {
  getTransaction(req, res, function (txn) {
    var outgoing = isOutgoing(txn, req.user._id);
    res.render('dashboard/transaction-detail', {
      title: 'Transaction details',
      user: req.user,
      txn: txn,
      outgoing: outgoing,
      counterparty: outgoing ? displayName(txn.receiver) : displayName(txn.sender)
    });
  });
});

router.get('/transactions/:id/receipt', isAuth, isPinVerified, kycGate, function (req, res) {
  getTransaction(req, res, function (txn) {
    var outgoing = isOutgoing(txn, req.user._id);
    var counterparty = outgoing ? displayName(txn.receiver) : displayName(txn.sender);
    var doc = new PDFDocument({ size: 'A4', margin: 48 });
    var safeReference = String(txn.reference || txn._id).replace(/[^a-zA-Z0-9_-]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="novbank-receipt-' + safeReference + '.pdf"');
    doc.pipe(res);

    doc.fillColor('#0b1220').fontSize(24).text('NovBank');
    doc.fillColor('#667085').fontSize(9).text('TRANSACTION RECEIPT');
    doc.moveDown(1.2);
    doc.roundedRect(48, doc.y, 499, 88, 12).fill('#f8fafc');
    doc.fillColor('#667085').fontSize(8).text(outgoing ? 'SENT' : 'RECEIVED', 66, doc.y + 18);
    doc.fillColor(outgoing ? '#101828' : '#039855').fontSize(22).text((outgoing ? '-' : '+') + (txn.currency || 'EUR') + ' ' + Number(txn.amount || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 }), 66, doc.y + 10);
    doc.fillColor('#667085').fontSize(8).text(String(txn.status || '').toUpperCase(), 66, doc.y + 7);
    doc.y = 168;

    var rows = [
      ['Reference', txn.reference || '—'],
      ['Date', new Date(txn.createdAt).toLocaleString('en-GB')],
      ['Type', String(txn.type || '').replace(/_/g, ' ')],
      ['Counterparty', counterparty],
      ['Category', txn.category || 'Account activity'],
      ['Description', txn.description || '—'],
      ['Status', String(txn.status || '').toUpperCase()]
    ];
    if (txn.wireDetails && txn.wireDetails.iban) {
      rows.push(['IBAN', txn.wireDetails.iban]);
      rows.push(['BIC / SWIFT', txn.wireDetails.bic || '—']);
      rows.push(['Bank', txn.wireDetails.bankName || '—']);
      rows.push(['Country', txn.wireDetails.bankCountry || '—']);
    }
    rows.forEach(function (row) {
      if (doc.y > 735) doc.addPage();
      doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#eaecf0').stroke();
      doc.moveDown(0.45);
      doc.fillColor('#667085').fontSize(8).text(row[0], 48, doc.y, { width: 150 });
      doc.fillColor('#101828').fontSize(9).text(row[1], 205, doc.y - 1, { width: 342 });
      doc.moveDown(0.8);
    });
    doc.moveDown(1);
    doc.fillColor('#98a2b3').fontSize(7).text('This receipt is generated from your NovBank account activity.', 48, doc.y);
    doc.end();
  });
});

module.exports = router;
