var express    = require('express');
var mongoose   = require('mongoose');
var session    = require('express-session');
var MongoStore = require('connect-mongo')(session);
var passport   = require('passport');
var flash      = require('connect-flash');
var path       = require('path');
var Notification = require('./models/Notification');
require('dotenv').config();

var environment = require('./config/environment');

// Fail closed before any session or financial route is initialized.
var environmentConfig = environment.assertSafeEnvironment();

require('./config/passport')(passport);

var app = express();

// Render and other reverse proxies terminate HTTPS before Express receives the request.
// Trust the proxy so secure session cookies are issued and recognized correctly.
app.set('trust proxy', 1);

mongoose.connect(environmentConfig.uri, {
  useNewUrlParser:    true,
  useUnifiedTopology: true,
  useCreateIndex:     true,
  dbName:             environmentConfig.databaseName
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
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  store:             new MongoStore({ mongooseConnection: mongoose.connection }),
  cookie:            {
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
  res.locals.user        = req.user || null;
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg   = req.flash('error_msg');
  res.locals.error       = req.flash('error');
  res.locals.recaptchaSiteKey = process.env.RECAPTCHA_SITE_KEY || '';
  res.locals.adminEmail = process.env.ADMIN_EMAIL || '';
  res.locals.unreadCount = 0;
  if (!req.user) return next();
  Notification.countDocuments({ user: req.user._id, isRead: false }).then(function (count) {
    res.locals.unreadCount = count;
    next();
  }).catch(function () {
    next();
  });
});

// Routes
app.use('/',          require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/transfer',  require('./routes/internal-transfer'));
app.use('/transfer',  require('./routes/transfer'));
app.use('/account',   require('./routes/account'));
app.use('/admin',     require('./routes/admin'));
app.use('/kyc',       require('./routes/kyc').router);
app.use('/cards',     require('./routes/cards'));
app.use('/loans',     require('./routes/loans'));
app.use('/airtime',   require('./routes/airtime'));

app.use(function (req, res) {
  res.status(404).render('404', { title: '404 - Page Not Found' });
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log('Server running on port ' + PORT);
});
