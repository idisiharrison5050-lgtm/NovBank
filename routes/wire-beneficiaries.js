var express = require('express');
var router = express.Router();
var Beneficiary = require('../models/Beneficiary');
var kycGate = require('./kyc').kycGate;

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in.');
  return res.redirect('/login');
}

function isPinVerified(req, res, next) {
  if (req.session.pinVerified) return next();
  return res.redirect('/pin');
}

router.get('/beneficiaries', isAuth, kycGate, isPinVerified, function (req, res) {
  Beneficiary.find({ user: req.user._id, kind: 'wire' })
    .sort({ lastUsedAt: -1, createdAt: -1 })
    .limit(8)
    .exec(function (err, beneficiaries) {
      if (err) {
        console.error('Wire beneficiary load failed:', err);
        return res.status(500).json({ status: 'error', message: 'Unable to load saved beneficiaries.' });
      }
      res.json({
        status: 'ok',
        beneficiaries: (beneficiaries || []).map(function (item) {
          return {
            id: item._id.toString(),
            name: item.name,
            identifier: item.identifier,
            bankName: item.bankName || '',
            iban: item.iban || '',
            bic: item.bic || '',
            lastUsedAt: item.lastUsedAt
          };
        })
      });
    });
});

router.post('/beneficiaries/:id/delete', isAuth, kycGate, isPinVerified, function (req, res) {
  Beneficiary.deleteOne({ _id: req.params.id, user: req.user._id, kind: 'wire' }).then(function (result) {
    if (!result.deletedCount) {
      req.flash('error_msg', 'Saved beneficiary was not found.');
    } else {
      req.flash('success_msg', 'Saved international beneficiary removed.');
    }
    res.redirect('/transfer/wire');
  }).catch(function (err) {
    console.error('Wire beneficiary delete failed:', err);
    req.flash('error_msg', 'Unable to remove saved beneficiary.');
    res.redirect('/transfer/wire');
  });
});

module.exports = router;
