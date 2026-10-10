var crypto = require('crypto');

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function constantTimeEqual(a, b) {
  var left = Buffer.from(String(a));
  var right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function maskIdentifier(value) {
  value = String(value || '');
  if (value.length <= 4) return '****';
  return new Array(value.length - 3).join('*') + value.slice(-4);
}

module.exports = {
  hashToken: hashToken,
  generateSessionToken: generateSessionToken,
  constantTimeEqual: constantTimeEqual,
  maskIdentifier: maskIdentifier
};
