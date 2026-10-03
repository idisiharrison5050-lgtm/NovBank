var mongoose = require('mongoose');

function getOrCreate(Model, query, factory, callback) {
  Model.findOne(query).then(function (existing) {
    if (existing) return callback(null, existing, true);

    return factory().then(function (created) {
      callback(null, created, false);
    }).catch(function (err) {
      if (err && err.code === 11000) {
        return Model.findOne(query).then(function (retry) {
          if (!retry) return callback(err);
          callback(null, retry, true);
        });
      }
      callback(err);
    });
  }).catch(callback);
}

module.exports = {
  getOrCreate: getOrCreate
};
