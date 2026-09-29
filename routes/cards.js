var express = require('express');
var router = express.Router();
var Card = require('../models/Card');
var Notification = require('../models/Notification');
var CardToken = require('../models/CardToken');
var crypto = require('crypto');

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
          last4: token ? token.last4 : '0000',
          expiry: token && token.expMonth && token.expYear ? String(token.expMonth).padStart(2, '0') + '/' + String(token.expYear).slice(-2) : (card.expiry || '—')
        };
      });
      res.render('dashboard/cards', { title: 'My Cards', cards: safeCards, unreadCount: 0 });
    });
  }).catch(function (err) {
    console.error(err);
    res.redirect('/dashboard');
  });
});

router.post('/request', isAuth, function (req, res) {
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

module.exports = router;
