var CardToken = require('../models/CardToken');

function publicCardView(card, token) {
  return {
    id: card._id,
    cardType: card.cardType,
    cardHolder: card.cardHolder,
    status: card.status,
    last4: token ? token.last4 : String(card.cardNumber || '').slice(-4),
    expiry: token && token.expMonth && token.expYear ? String(token.expMonth).padStart(2, '0') + '/' + String(token.expYear).slice(-2) : null,
    brand: token ? token.brand : null
  };
}

function getPublicCards(userId, callback) {
  CardToken.find({ user: userId, status: 'active' }).populate('card')
    .then(function (tokens) {
      callback(null, tokens.map(function (token) {
        return publicCardView(token.card, token);
      }));
    }).catch(callback);
}

module.exports = {
  publicCardView: publicCardView,
  getPublicCards: getPublicCards
};
