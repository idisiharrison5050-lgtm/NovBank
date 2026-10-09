var express    = require('express');
var mongoose   = require('mongoose');
var session    = require('express-session');
var MongoStore = require('connect-mongo')(session);
var passport   = require('passport');
var flash      = require('connect-flash');
var path       = require('path');
var Notification = require('./models/Notification');
var currencies = require('./config/currencies');
require('dotenv').config();

var environment = require('./config/environment');
var environmentConfig = environment.assertSafeEnvironment();

require('./config/passport')(passport);

var app = express();
app.set('trust proxy', 1);

app.get('/health', function (req, res) {
  res.status(200).json({ status: 'ok', service: 'novbank', timestamp: new Date().toISOString() });
});

mongoose.connect(environmentConfig.uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true
}).then(function () {
  console.log('MongoDB connected');
}).catch(function (err) {
  console.log('MongoDB connection error:', err);
  process.exit(1);
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new MongoStore({ mongooseConnection: mongoose.connection }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24,
    httpOnly: true,
    secure: environment.isProduction(),
    sameSite: 'lax'
  }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.use(function (req, res, next) {
  if (req.session && req.session.pinVerified && req.session.pinVerifiedAt) {
    var pinAge = Date.now() - Number(req.session.pinVerifiedAt);
    var maxPinAge = 1000 * 60 * 15;
    if (pinAge > maxPinAge) {
      req.session.pinVerified = false;
      req.session.pinVerifiedAt = null;
    }
  }
  next();
});

app.use(function (req, res, next) {
  res.locals.user = req.user || null;
  res.locals.session = req.session;
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  res.locals.recaptchaSiteKey = process.env.RECAPTCHA_SITE_KEY || '';
  res.locals.adminEmail = process.env.ADMIN_EMAIL || '';
  res.locals.currencySymbol = function (code) {
    var normalized = String(code || 'EUR').toUpperCase();
    var currency = currencies.find(function (item) { return item.code === normalized; });
    return currency ? currency.symbol : normalized;
  };
  res.locals.unreadCount = 0;
  if (!req.user) return next();
  Notification.countDocuments({ user: req.user._id, isRead: false }).then(function (count) {
    res.locals.unreadCount = count;
    next();
  }).catch(function () {
    next();
  });
});

app.get('/ready', function (req, res) {
  var ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', database: ready ? 'connected' : 'disconnected', timestamp: new Date().toISOString() });
});

// Sensitive account-access mutations must run before the legacy auth/account handlers.
app.use('/', require('./routes/account-access-hardening'));

// Routes
app.use('/', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/dashboard', require('./routes/transaction-details'));
app.use('/dashboard', require('./routes/notification-actions'));
app.use('/transfer', require('./routes/transfer'));
app.use('/transfer/wire', require('./routes/wire-beneficiaries'));
app.use('/account', require('./routes/account'));
app.use('/receive', require('./routes/receive'));
app.use('/admin', require('./routes/admin'));
app.use('/admin', require('./routes/admin-operations'));
app.use('/kyc', require('./routes/kyc').router);
app.use('/cards', require('./routes/cards'));
app.use('/loans', require('./routes/loans'));
app.use('/airtime', require('./routes/airtime'));
app.use('/', require('./routes/customer-services'));

app.use(function (req, res) {
  res.status(404).render('404', { title: '404 - Page Not Found' });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', function () {
  console.log('Server running on port ' + PORT);
});
