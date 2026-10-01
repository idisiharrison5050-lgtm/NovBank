var mongoose = require('mongoose');

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function getDatabaseName() {
  if (process.env.MONGODB_DB_NAME) return process.env.MONGODB_DB_NAME;
  return isProduction() ? 'novbank-production' : 'novbank-staging';
}

function getMongoUri() {
  // Keep compatibility with the existing Render deployment, which uses
  // MONGO_URI, while allowing the more explicit MONGODB_URI name.
  var uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGODB_URI or MONGO_URI is required. Refusing to start without an explicit database connection.');
  }
  return uri;
}

function assertSafeEnvironment() {
  var uri = getMongoUri();
  var databaseName = getDatabaseName();
  var allowProduction = process.env.ALLOW_PRODUCTION_DATABASE === 'true';

  if (isProduction() && !allowProduction) {
    throw new Error('Production is locked. Set ALLOW_PRODUCTION_DATABASE=true only for an explicitly approved production deployment.');
  }

  if (!isProduction() && process.env.NODE_ENV !== 'test' && /production/i.test(databaseName)) {
    throw new Error('Refusing to run a non-production environment against a production-named database.');
  }

  return { uri: uri, databaseName: databaseName };
}

module.exports = {
  isProduction: isProduction,
  getDatabaseName: getDatabaseName,
  getMongoUri: getMongoUri,
  assertSafeEnvironment: assertSafeEnvironment
};
