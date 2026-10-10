var express = require('express');
var router = express.Router();
var Card = require('../models/Card');
var Notification = require('../models/Notification');
var CardToken = require('../models/CardToken');
var crypto = require('crypto');
var bcrypt = require('bcryptjs');
var kycGate = require('./kyc').kycGate;

function isAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.flash('error_msg', 'Please log in.');
  res.redirect('/login');
}

router.get('/', isAuth, function (req, res) {
  Card.find({ user: req.user._id }).sort({ createdAt: -1 }).then(function (cards) {
    return CardToken.find({ user: req.user._id, status: 'active' }).then(function (tokens) {
      var byCard = {};
      tokens.forEach(function (token) { byCard[String(token.card)] = token; });
      var safeCards = cards.map(function (card) {
        var token = byCard[String(card._id)];
        return {
          _id: card._id,
          cardType: card.cardType,
          cardHolder: card.cardHolder,
          status: card.status,
          frozenAt: card.frozenAt,
          userFrozen: !!card.frozenAt,
          last4: token ? token.last4 : '0000',
          expiry: token && token.expMonth && token.expYear ? String(token.expMonth).padStart(2, '0') + '/' + String(token.expYear).slice(-2) : (card.expiry || '—'),
          spendingLimit: Number(card.spendingLimit || 0),
          createdAt: card.createdAt
        };
      });
      res.render('dashboard/cards', { title: 'Cards', cards: safeCards, unreadCount: 0 });
    });
  }).catch(function (err) {
    console.error(err);
    res.redirect('/dashboard');
  });
});

router.post('/request', isAuth, kycGate, pinGate, function (req, res) {
  var cardType = req.body.cardType;
  if (!cardType || ['visa', 'mastercard'].indexOf(cardType) === -1) {
    req.flash('error_msg', 'Please select a valid card type.');
    return res.redirect('/cards');
  }

  Card.findOne({ user: req.user._id, cardType: cardType, status: { $in: ['pending', 'active'] } }).then(function (existing) {
    if (existing) {
      req.flash('error_msg', 'You already have an active or pending ' + cardType + ' card.');
      return res.redirect('/cards');
    }

    var card = new Card({
      user: req.user._id,
      cardType: cardType,
      cardHolder: req.user.firstName + ' ' + req.user.lastName,
      status: 'pending'
    });

    return card.save().then(function () {
      return new CardToken({
        user: req.user._id,
        card: card._id,
        providerToken: 'tok_' + crypto.randomBytes(24).toString('hex'),
        last4: '0000',
        brand: cardType,
        status: 'active'
      }).save();
    }).then(function () {
      return new Notification({
        user: req.user._id,
        title: 'Card Request Received',
        message: 'Your ' + cardType.charAt(0).toUpperCase() + cardType.slice(1) + ' card request has been received and is pending approval.',
        type: 'card',
        severity: 'info'
      }).save();
    }).then(function () {
      req.flash('success_msg', 'Card request submitted successfully.');
      res.redirect('/cards');
    });
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to request card.');
    res.redirect('/cards');
  });
});

function pinGate(req, res, next) {
  if (!req.user.pinSet || !req.user.pin) {
    req.flash('error_msg', 'Set your transaction PIN before managing a card.');
    return res.redirect('/set-pin');
  }
  var enteredPin = String(req.body.transactionPin || '');
  if (!/^\d{4}$/.test(enteredPin)) {
    req.flash('error_msg', 'Enter your 4-digit PIN to confirm this card action.');
    return res.redirect('/cards');
  }
  bcrypt.compare(enteredPin, req.user.pin, function (err, isMatch) {
    if (err || !isMatch) {
      req.flash('error_msg', 'Incorrect PIN. Your card action was cancelled.');
      return res.redirect('/cards');
    }
    return next();
  });
}

router.post('/:id/freeze', isAuth, kycGate, pinGate, function (req, res) {
  Card.findOne({ _id: req.params.id, user: req.user._id }).then(function (card) {
    if (!card) {
      req.flash('error_msg', 'Card not found.');
      return res.redirect('/cards');
    }
    if (card.status === 'pending') {
      req.flash('error_msg', 'A pending card cannot be frozen.');
      return res.redirect('/cards');
    }
    card.status = 'blocked';
    card.frozenAt = new Date();
    return card.save().then(function () {
      return new Notification({
        user: req.user._id,
        title: 'Card frozen',
        message: 'Your ' + card.cardType.toUpperCase() + ' card ending in ' + (card.cardNumber ? card.cardNumber.slice(-4) : '0000') + ' has been frozen.',
        type: 'card',
        severity: 'warning'
      }).save();
    }).then(function () {
      req.flash('success_msg', 'Your card has been frozen.');
      res.redirect('/cards');
    });
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Unable to update card status.');
    res.redirect('/cards');
  });
});

router.post('/:id/unfreeze', isAuth, kycGate, pinGate, function (req, res) {
  Card.findOne({ _id: req.params.id, user: req.user._id }).then(function (card) {
    if (!card) {
      req.flash('error_msg', 'Card not found.');
      return res.redirect('/cards');
    }
    if (card.status !== 'blocked' || !card.frozenAt) {
      req.flash('error_msg', 'This card cannot be unfrozen from your account.');
      return res.redirect('/cards');
    }
    card.status = 'active';
    card.frozenAt = null;
    return card.save().then(function () {
      return new Notification({
        user: req.user._id,
        title: 'Card unfrozen',
        message: 'Your ' + card.cardType.toUpperCase() + ' card is active again.',
        type: 'card',
        severity: 'info'
      }).save();
    }).then(function () {
      req.flash('success_msg', 'Your card is active again.');
      res.redirect('/cards');
    });
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Unable to update card status.');
    res.redirect('/cards');
  });
});

router.post('/:id/limit', isAuth, kycGate, pinGate, function (req, res) {
  var requestedLimit = Number(req.body.spendingLimit);
  if (!isFinite(requestedLimit) || requestedLimit < 50 || requestedLimit > 10000) {
    req.flash('error_msg', 'Card spending limit must be between €50 and €10,000.');
    return res.redirect('/cards');
  }

  requestedLimit = Math.round(requestedLimit * 100) / 100;

  Card.findOne({ _id: req.params.id, user: req.user._id }).then(function (card) {
    if (!card) {
      req.flash('error_msg', 'Card not found.');
      return res.redirect('/cards');
    }
    if (card.status !== 'active') {
      req.flash('error_msg', 'Only active cards can have their spending limit changed.');
      return res.redirect('/cards');
    }

    card.spendingLimit = requestedLimit;
    return card.save().then(function () {
      return new Notification({
        user: req.user._id,
        title: 'Card spending limit updated',
        message: card.cardType.toUpperCase() + ' spending limit is now €' + requestedLimit.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '.',
        type: 'card',
        severity: 'info'
      }).save();
    }).then(function () {
      req.flash('success_msg', 'Card spending limit updated successfully.');
      res.redirect('/cards');
    });
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Unable to update card spending limit.');
    res.redirect('/cards');
  });
});

module.exports = router;
