var mongoose = require('mongoose');

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function getMongoUri() {
  var uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is required. Refusing to start without an explicit database connection.');
  }
  return uri;
}

function assertSafeEnvironment() {
  var uri = getMongoUri();

  return {
    uri: uri
  };
}

module.exports = {
  isProduction: isProduction,
  getMongoUri: getMongoUri,
  assertSafeEnvironment: assertSafeEnvironment
};
