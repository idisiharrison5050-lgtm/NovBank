var LocalStrategy = require('passport-local').Strategy;
var bcrypt = require('bcryptjs');
var User = require('../models/User');
var Admin = require('../models/Admin');

module.exports = function (passport) {

  // User strategy
  passport.use('user-local', new LocalStrategy(
    { usernameField: 'identifier' },
    function (identifier, password, done) {
      User.findOne({
        $or: [
          { email: identifier.toLowerCase() },
          { username: identifier.toLowerCase() }
        ]
      }).then(function (user) {
        if (!user) return done(null, false, { message: 'No account found with that email or username.' });
        bcrypt.compare(password, user.password, function (err, isMatch) {
          if (err) return done(err);
          if (isMatch) return done(null, user);
          return done(null, false, { message: 'Incorrect password.' });
        });
      }).catch(function (err) { return done(err); });
    }
  ));

  // Admin strategy
  passport.use('admin-local', new LocalStrategy(
    { usernameField: 'identifier' },
    function (identifier, password, done) {
      Admin.findOne({
        $or: [
          { email: identifier.toLowerCase() },
          { username: identifier.toLowerCase() }
        ]
      }).then(function (admin) {
        if (!admin) return done(null, false, { message: 'No admin account found.' });
        bcrypt.compare(password, admin.password, function (err, isMatch) {
          if (err) return done(err);
          if (isMatch) return done(null, admin);
          return done(null, false, { message: 'Incorrect password.' });
        });
      }).catch(function (err) { return done(err); });
    }
  ));

  passport.serializeUser(function (entity, done) {
    done(null, { id: entity.id, type: (entity.role === 'superadmin' || entity.role === 'manager') ? 'admin' : 'user' });
  });

  passport.deserializeUser(function (obj, done) {
    if (obj.type === 'admin') {
      Admin.findById(obj.id, function (err, admin) { done(err, admin); });
    } else {
      User.findById(obj.id, function (err, user) { done(err, user); });
    }
  });
};