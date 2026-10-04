var express = require('express');
var router = express.Router();
var kycGate = require('./kyc').kycGate;

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in.');
  return res.redirect('/login');
}

router.get('/', isAuth, kycGate, function (req, res) {
  var user = req.user;
  var bitcoinAddress = user.bitcoinDepositAddress || process.env.BITCOIN_DEPOSIT_ADDRESS || '';

  res.render('receive/index', {
    title: 'Receive Money',
    user: user,
    bitcoinAddress: bitcoinAddress
  });
});

module.exports = router;