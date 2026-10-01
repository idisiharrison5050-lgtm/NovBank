var express = require('express');
var router = express.Router();
var passport = require('passport');
var bcrypt = require('bcryptjs');
var Admin = require('../models/Admin');
var User = require('../models/User');
var Transaction = require('../models/Transaction');
var Notification = require('../models/Notification');
var AuditLog = require('../models/AuditLog');
var KYC  = require('../models/KYC');
var Card = require('../models/Card');
var Loan = require('../models/Loan');
var mailer = require('../config/mailer');
var ledger = require('../services/ledger');

// ─── Middleware ───────────────────────────────────────────────
function isAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'superadmin') return next();
  res.redirect('/admin/login');
}

function isAdminGuest(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'superadmin') return res.redirect('/admin/dashboard');
  next();
}

function logAction(adminId, action, targetType, targetId, details) {
  var log = new AuditLog({
    admin: adminId,
    action: action,
    targetType: targetType || 'System',
    targetId: targetId || null,
    details: details || ''
  });
  return log.save();
}

// ─── Admin Register ───────────────────────────────────────────
router.get('/register', isAdminGuest, function (req, res) {
  res.render('admin/register', { title: 'Admin Register' });
});

router.post('/register', isAdminGuest, function (req, res) {
  var secretKey = req.body.secretKey;
  if (secretKey !== process.env.ADMIN_SECRET) {
    req.flash('error_msg', 'Invalid registration key.');
    return res.redirect('/admin/register');
  }

  var firstName = req.body.firstName;
  var lastName  = req.body.lastName;
  var username  = req.body.username;
  var email     = req.body.email;
  var password  = req.body.password;
  var confirmPassword = req.body.confirmPassword;

  if (!firstName || !lastName || !username || !email || !password || !confirmPassword) {
    req.flash('error_msg', 'Please fill in all fields.');
    return res.redirect('/admin/register');
  }

  if (password !== confirmPassword) {
    req.flash('error_msg', 'Passwords do not match.');
    return res.redirect('/admin/register');
  }

  if (password.length < 8) {
    req.flash('error_msg', 'Password must be at least 8 characters.');
    return res.redirect('/admin/register');
  }

  Admin.findOne({ $or: [{ email: email }, { username: username }] })
    .then(function (existing) {
      if (existing) {
        req.flash('error_msg', 'Email or username already in use.');
        return res.redirect('/admin/register');
      }
      var newAdmin = new Admin({
        firstName: firstName,
        lastName:  lastName,
        username:  username.toLowerCase(),
        email:     email.toLowerCase(),
        password:  password
      });
      return newAdmin.save().then(function () {
        req.flash('success_msg', 'Admin account created. Please log in.');
        res.redirect('/admin/login');
      });
    })
    .catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Something went wrong.');
      res.redirect('/admin/register');
    });
});

// ─── Admin Login ──────────────────────────────────────────────
router.get('/login', isAdminGuest, function (req, res) {
  res.render('admin/login', { title: 'Admin Login' });
});

router.post('/login', isAdminGuest, passport.authenticate('admin-local', {
  successRedirect: '/admin/dashboard',
  failureRedirect: '/admin/login',
  failureFlash: true
}));

// ─── Admin Logout ─────────────────────────────────────────────
// Change your old logout route to look like this:
router.get('/logout', function (req, res, next) {
  req.logout(function (err) {
    if (err) { 
      return next(err); 
    }
    res.redirect('/admin/login'); 
  });
});

// ─── Dashboard ────────────────────────────────────────────────
router.get('/dashboard', isAdmin, function (req, res) {
  Promise.all([
    User.countDocuments(),
    Transaction.countDocuments({ status: 'pending' }),
    Transaction.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]),
    User.aggregate([{ $group: { _id: null, total: { $sum: '$balance' } } }]),
    Transaction.find({ status: 'pending' }).sort({ createdAt: -1 }).limit(5).populate('sender', 'firstName lastName accountNumber'),
    User.find().sort({ createdAt: -1 }).limit(5)
  ]).then(function (results) {
    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      totalUsers:        results[0],
      pendingCount:      results[1],
      totalTransacted:   results[2].length ? results[2][0].total : 0,
      totalBalance:      results[3].length ? results[3][0].total : 0,
      pendingTxns:       results[4],
      recentUsers:       results[5]
    });
  }).catch(function (err) {
    console.error(err);
    res.redirect('/admin/login');
  });
});

// ─── All Users ────────────────────────────────────────────────
router.get('/users', isAdmin, function (req, res) {
  var search = req.query.search || '';
  var query  = {};
  if (search) {
    query = {
      $or: [
        { firstName: new RegExp(search, 'i') },
        { lastName:  new RegExp(search, 'i') },
        { email:     new RegExp(search, 'i') },
        { username:  new RegExp(search, 'i') },
        { accountNumber: new RegExp(search, 'i') }
      ]
    };
  }

  User.find(query).sort({ createdAt: -1 })
    .then(function (users) {
      res.render('admin/users', {
        title: 'All Users',
        users: users,
        search: search
      });
    }).catch(function (err) {
      console.error(err);
      res.redirect('/admin/dashboard');
    });
});

// ─── User Detail ─────────────────────────────────────────────
router.get('/users/:id', isAdmin, function (req, res) {
  User.findById(req.params.id)
    .then(function (user) {
      if (!user) {
        req.flash('error_msg', 'User not found.');
        return res.redirect('/admin/users');
      }
      return Transaction.find({
        $or: [{ sender: user._id }, { receiver: user._id }]
      }).sort({ createdAt: -1 }).limit(20)
        .populate('sender receiver', 'firstName lastName accountNumber')
        .then(function (transactions) {
          res.render('admin/user-detail', {
            title: user.firstName + ' ' + user.lastName,
            targetUser: user,
            transactions: transactions
          });
        });
    }).catch(function (err) {
      console.error(err);
      res.redirect('/admin/users');
    });
});

// ─── Edit User Balance ────────────────────────────────────────
router.post('/users/:id/edit-balance', isAdmin, function (req, res) {
  var newBalance = parseFloat(req.body.balance);
  if (isNaN(newBalance) || newBalance < 0) {
    req.flash('error_msg', 'Invalid balance amount.');
    return res.redirect('/admin/users/' + req.params.id);
  }

  User.findById(req.params.id).then(function (user) {
    var oldBalance = user.balance;
    return User.findByIdAndUpdate(req.params.id, { balance: newBalance })
      .then(function () {
        return logAction(
          req.user._id, 'Edited Balance', 'User', req.params.id,
          'Changed balance from €' + oldBalance.toFixed(2) + ' to €' + newBalance.toFixed(2) + ' for user ' + user.username
        );
      })
      .then(function () {
        var notif = new Notification({
          user:    req.params.id,
          title:   'Account Balance Updated',
          message: 'Your account balance has been updated to €' + newBalance.toFixed(2) + '.',
          type:    'info'
        });
        return notif.save();
      })
      .then(function () {
        req.flash('success_msg', 'Balance updated successfully.');
        res.redirect('/admin/users/' + req.params.id);
      });
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to update balance.');
    res.redirect('/admin/users/' + req.params.id);
  });
});

// ─── Change Account Status ────────────────────────────────────
router.post('/users/:id/status', isAdmin, function (req, res) {
  var status = req.body.status;
  var allowed = ['active', 'suspended', 'closed'];
  if (!allowed.includes(status)) {
    req.flash('error_msg', 'Invalid status.');
    return res.redirect('/admin/users/' + req.params.id);
  }

  User.findByIdAndUpdate(req.params.id, { accountStatus: status })
    .then(function (user) {
      return logAction(
        req.user._id, 'Changed Account Status', 'User', req.params.id,
        'Set account status to "' + status + '" for user ' + user.username
      );
    })
    .then(function () {
      var notif = new Notification({
        user:    req.params.id,
        title:   'Account Status Changed',
        message: 'Your account status has been changed to: ' + status + '.',
        type:    status === 'active' ? 'success' : 'warning'
      });
      return notif.save();
    })
    .then(function () {
      req.flash('success_msg', 'Account status updated.');
      res.redirect('/admin/users/' + req.params.id);
    }).catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Failed to update status.');
      res.redirect('/admin/users/' + req.params.id);
    });
});

// ─── Delete User ──────────────────────────────────────────────
router.post('/users/:id/delete', isAdmin, function (req, res) {
  User.findById(req.params.id).then(function (user) {
    var username = user.username;
    return User.findByIdAndDelete(req.params.id)
      .then(function () {
        return Transaction.deleteMany({ $or: [{ sender: req.params.id }, { receiver: req.params.id }] });
      })
      .then(function () {
        return logAction(req.user._id, 'Deleted User', 'User', null, 'Deleted user account: ' + username);
      })
      .then(function () {
        req.flash('success_msg', 'User deleted successfully.');
        res.redirect('/admin/users');
      });
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to delete user.');
    res.redirect('/admin/users');
  });
});

// ─── All Transactions ─────────────────────────────────────────
router.get('/transactions', isAdmin, function (req, res) {
  var filter = req.query.filter || 'all';
  var status = req.query.status || 'all';
  var page   = parseInt(req.query.page) || 1;
  var limit  = 20;
  var skip   = (page - 1) * limit;
  var query  = {};

  if (filter !== 'all') query.type   = filter;
  if (status !== 'all') query.status = status;

  Transaction.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('sender receiver', 'firstName lastName accountNumber username')
    .then(function (transactions) {
      return Transaction.countDocuments(query).then(function (total) {
        res.render('admin/transactions', {
          title: 'Transactions',
          transactions: transactions,
          filter: filter,
          status: status,
          currentPage: page,
          totalPages: Math.ceil(total / limit)
        });
      });
    }).catch(function (err) {
      console.error(err);
      res.redirect('/admin/dashboard');
    });
});

// ─── Approve Transaction ──────────────────────────────────────
router.post('/transactions/:id/approve', isAdmin, function (req, res) {
  Transaction.findById(req.params.id).then(function(txn){
    if(!txn || txn.status!=='pending'){req.flash('error_msg','Transaction not found or already processed.');return res.redirect('/admin/transactions');}
    var action;
    if(txn.type==='deposit'){
      action=new Promise(function(resolve,reject){ledger.creditExisting(txn._id,function(err,result){if(err)reject(err);else resolve(result);});});
    } else if(txn.type==='wire_transfer'){
      txn.status='completed';txn.processing.processedAt=new Date();action=txn.save();
    } else { txn.status='completed';txn.processing.processedAt=new Date();action=txn.save(); }
    return action.then(function(){return logAction(req.user._id,'Approved Transaction','Transaction',txn._id,'Approved '+txn.type+' of €'+txn.amount.toFixed(2));})
      .then(function(){if(txn.sender)return new Notification({user:txn.sender,title:txn.type==='deposit'?'Deposit Approved':'Transfer Approved',message:txn.type==='deposit'?'Your deposit of €'+txn.amount.toFixed(2)+' has been approved and credited to your account.':'Your '+txn.type.replace('_',' ')+' of €'+txn.amount.toFixed(2)+' has been approved.',type:'success'}).save();})
      .then(function(){if(txn.type==='wire_transfer'&&txn.sender)return User.findById(txn.sender).then(function(user){if(user&&txn.wireDetails)return mailer.wireTransferSuccessEmail(user,txn.amount,txn.wireDetails.recipientName,txn.wireDetails.iban,txn.wireDetails.bankName);});})
      .then(function(){if(txn.type==='deposit'&&txn.sender)return User.findById(txn.sender).then(function(user){if(user)return mailer.depositApprovedEmail(user,txn.amount);});})
      .then(function(){req.flash('success_msg','Transaction approved successfully.');res.redirect('/admin/transactions');});
  }).catch(function(err){console.error(err);req.flash('error_msg','Failed to approve transaction.');res.redirect('/admin/transactions');});
});
// ─── Decline Transaction ──────────────────────────────────────
router.post('/transactions/:id/decline', isAdmin, function (req, res) {
  Transaction.findById(req.params.id).then(function(txn){
    if(!txn || txn.status!=='pending'){req.flash('error_msg','Transaction not found or already processed.');return res.redirect('/admin/transactions');}
    var reason=req.body.reason || 'Transaction declined by operations.';
    var action;
    if(txn.type==='wire_transfer'||txn.type==='withdrawal'){action=new Promise(function(resolve,reject){ledger.reverseDebit(txn._id,reason,function(err,result){if(err)reject(err);else resolve(result);});});}
    else {txn.status='failed';txn.processing.failureReason=reason;txn.processing.processedAt=new Date();txn.processing.processedBy=req.user._id;action=txn.save();}
    return action.then(function(){return logAction(req.user._id,'Declined Transaction','Transaction',txn._id,'Declined '+txn.type+' of €'+txn.amount.toFixed(2)+' — '+reason);})
      .then(function(){if(txn.sender)return new Notification({user:txn.sender,title:'Transaction Declined',message:'Your '+txn.type.replace('_',' ')+' of €'+txn.amount.toFixed(2)+' was declined. '+((txn.type==='wire_transfer'||txn.type==='withdrawal')?'The amount has been returned to your account.':'Please review the transaction details.'),type:'warning'}).save();})
      .then(function(){if(txn.type==='deposit'&&txn.sender)return User.findById(txn.sender).then(function(u){if(u)return mailer.depositDeclinedEmail(u,txn.amount);});})
      .then(function(){req.flash('success_msg','Transaction declined successfully.');res.redirect('/admin/transactions');});
  }).catch(function(err){console.error(err);req.flash('error_msg','Failed to decline transaction.');res.redirect('/admin/transactions');});
});
// ─── Send Notification ────────────────────────────────────────
router.get('/notifications', isAdmin, function (req, res) {
  User.find({}, 'firstName lastName username email').sort({ firstName: 1 })
    .then(function (users) {
      return Notification.find().sort({ createdAt: -1 }).limit(30)
        .populate('user', 'firstName lastName username')
        .then(function (notifications) {
          res.render('admin/notifications', {
            title: 'Notifications',
            users: users,
            notifications: notifications
          });
        });
    }).catch(function (err) {
      console.error(err);
      res.redirect('/admin/dashboard');
    });
});

router.post('/notifications/send', isAdmin, function (req, res) {
  var target  = req.body.target; // 'all' or a user id
  var title   = req.body.title;
  var message = req.body.message;
  var type    = req.body.type || 'info';

  if (!title || !message) {
    req.flash('error_msg', 'Title and message are required.');
    return res.redirect('/admin/notifications');
  }

  var promise;

  if (target === 'all') {
    promise = User.find({}, '_id').then(function (users) {
      var notifs = users.map(function (u) {
        return new Notification({ user: u._id, title: title, message: message, type: type });
      });
      return Notification.insertMany(notifs);
    }).then(function () {
      return logAction(req.user._id, 'Sent Broadcast Notification', 'System', null, title);
    });
  } else {
    promise = new Notification({ user: target, title: title, message: message, type: type }).save()
      .then(function () {
        return logAction(req.user._id, 'Sent Notification to User', 'User', target, title);
      });
  }

  promise.then(function () {
    req.flash('success_msg', 'Notification sent successfully.');
    res.redirect('/admin/notifications');
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Failed to send notification.');
    res.redirect('/admin/notifications');
  });
});

// ─── Audit Log ────────────────────────────────────────────────
router.get('/audit-log', isAdmin, function (req, res) {
  var page  = parseInt(req.query.page) || 1;
  var limit = 25;
  var skip  = (page - 1) * limit;

  AuditLog.find()
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('admin', 'firstName lastName username')
    .then(function (logs) {
      return AuditLog.countDocuments().then(function (total) {
        res.render('admin/audit-log', {
          title: 'Audit Log',
          logs: logs,
          currentPage: page,
          totalPages: Math.ceil(total / limit)
        });
      });
    }).catch(function (err) {
      console.error(err);
      res.redirect('/admin/dashboard');
    });
});


// ─── KYC Management ──────────────────────────────────────────
router.get('/kyc', isAdmin, function (req, res) {
  var filter = req.query.filter || 'pending';
  var query  = filter === 'all' ? {} : { status: filter };

  KYC.find(query).sort({ submittedAt: -1 })
    .populate('user', 'firstName lastName email username accountNumber')
    .then(function (kycs) {
      res.render('admin/kyc', {
        title: 'KYC Verification',
        kycs:  kycs,
        filter: filter
      });
    }).catch(function (err) {
      console.error(err);
      res.redirect('/admin/dashboard');
    });
});

router.get('/kyc/:id', isAdmin, function (req, res) {
  KYC.findById(req.params.id)
    .populate('user', 'firstName lastName email username phone accountNumber address dateOfBirth')
    .then(function (kyc) {
      if (!kyc) {
        req.flash('error_msg', 'KYC record not found.');
        return res.redirect('/admin/kyc');
      }
      res.render('admin/kyc-detail', {
        title: 'KYC Detail',
        kyc:   kyc
      });
    }).catch(function (err) {
      console.error(err);
      res.redirect('/admin/kyc');
    });
});

router.post('/kyc/:id/approve', isAdmin, function (req, res) {
  KYC.findById(req.params.id)
    .populate('user', 'firstName lastName email username phone accountNumber address dateOfBirth')
    .then(function (kyc) {
      kyc.status     = 'approved';
      kyc.reviewedAt = new Date();
      return kyc.save()
        .then(function () {
          return User.findByIdAndUpdate(kyc.user, { kycStatus: 'approved', isVerified: true });
        })
        .then(function () {
          return logAction(req.user._id, 'Approved KYC', 'User', kyc.user, 'KYC approved');
        })
        .then(function () {
          var notif = new Notification({
            user:    kyc.user,
            title:   'Identity Verified',
            message: 'Your identity has been verified. You now have full access to NovBank.',
            type:    'success'
          });
          return notif.save();
        })
        .then(function () {
          mailer.kycApprovedEmail(kyc.user);
          req.flash('success_msg', 'KYC approved.');
          res.redirect('/admin/kyc');
        });
    }).catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Failed to approve KYC.');
      res.redirect('/admin/kyc');
    });
});

router.post('/kyc/:id/decline', isAdmin, function (req, res) {
  var reason = req.body.reason || 'Your submission did not meet our requirements.';
  KYC.findById(req.params.id)
    .populate('user', 'firstName lastName email username phone accountNumber address dateOfBirth')
    .then(function (kyc) {
      kyc.status        = 'declined';
      kyc.declineReason = reason;
      kyc.reviewedAt    = new Date();
      return kyc.save()
        .then(function () {
          return User.findByIdAndUpdate(kyc.user, { kycStatus: 'declined' });
        })
        .then(function () {
          return logAction(req.user._id, 'Declined KYC', 'User', kyc.user, reason);
        })
        .then(function () {
          var notif = new Notification({
            user:    kyc.user,
            title:   'Verification Declined',
            message: 'Your identity verification was declined. Reason: ' + reason + '. Please resubmit with correct documents.',
            type:    'warning'
          });
          return notif.save();
        })
        .then(function () {
          mailer.kycDeclinedEmail(kyc.user, reason);
          req.flash('success_msg', 'KYC declined.');
          res.redirect('/admin/kyc');
        });
    }).catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Failed to decline KYC.');
      res.redirect('/admin/kyc');
    });
});

// ─── Card Management ──────────────────────────────────────────
router.get('/cards', isAdmin, function (req, res) {
  Card.find().sort({ createdAt: -1 })
    .populate('user', 'firstName lastName email username')
    .then(function (cards) {
      res.render('admin/cards', { title: 'Card Requests', cards: cards });
    }).catch(function (err) {
      console.error(err);
      res.redirect('/admin/dashboard');
    });
});

router.post('/cards/:id/approve', isAdmin, function (req, res) {
  Card.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true })
    .then(function (card) {
      if (!card) {
        req.flash('error_msg', 'Card request not found.');
        return res.redirect('/admin/cards');
      }
      return logAction(req.user._id, 'Approved Card', 'User', card.user, card.cardType + ' card approved')
        .then(function () {
          var notif = new Notification({
            user:    card.user,
            title:   'Card Approved',
            message: 'Your ' + card.cardType + ' card has been approved and is now active.',
            type:    'success'
          });
          return notif.save();
        })
        .then(function () {
          return User.findById(card.user).then(function (u) {
            if (u) return mailer.cardApprovedEmail(u, card.cardType);
          });
        })
        .then(function () {
          req.flash('success_msg', 'Card approved.');
          res.redirect('/admin/cards');
        });
    }).catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Failed to approve card.');
      res.redirect('/admin/cards');
    });
});

router.post('/cards/:id/block', isAdmin, function (req, res) {
  Card.findByIdAndUpdate(req.params.id, { status: 'blocked' })
    .then(function (card) {
      return logAction(req.user._id, 'Blocked Card', 'User', card.user, card.cardType + ' card blocked')
        .then(function () {
          var notif = new Notification({
            user:    card.user,
            title:   'Card Blocked',
            message: 'Your ' + card.cardType + ' card has been blocked. Contact support for assistance.',
            type:    'warning'
          });
          return notif.save();
        });
    })
    .then(function () {
      req.flash('success_msg', 'Card blocked.');
      res.redirect('/admin/cards');
    }).catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Failed to block card.');
      res.redirect('/admin/cards');
    });
});

// ─── Loan Management ─────────────────────────────────────────
router.get('/loans', isAdmin, function (req, res) {
  var filter = req.query.filter || 'pending';
  var query  = filter === 'all' ? {} : { status: filter };

  Loan.find(query).sort({ createdAt: -1 })
    .populate('user', 'firstName lastName email username accountNumber')
    .then(function (loans) {
      res.render('admin/loans', { title: 'Loan Requests', loans: loans, filter: filter });
    }).catch(function (err) {
      console.error(err);
      res.redirect('/admin/dashboard');
    });
});

router.post('/loans/:id/approve', isAdmin, function (req, res) {
  Loan.findById(req.params.id).then(function(loan){
    if(!loan||loan.status!=='pending'){req.flash('error_msg','Loan request not found or already processed.');return res.redirect('/admin/loans');}
    return new Promise(function(resolve,reject){ledger.createCredit({userId:loan.user,type:'loan_credit',amount:loan.amount,description:'Loan credited to account',category:'Loan',idempotencyKey:'loan:'+loan._id},function(err,txn){if(err)reject(err);else resolve(txn);});}).then(function(){
      loan.status='approved';loan.approvedAt=new Date();loan.totalDue=loan.amount;loan.amountRepaid=0;loan.outstanding=loan.amount;
      return loan.save();
    }).then(function(){
      return logAction(req.user._id,'Approved Loan','User',loan.user,'€'+loan.amount+' loan approved');
    }).then(function(){return new Notification({user:loan.user,title:'Loan Approved',message:'Your loan of €'+loan.amount.toFixed(2)+' has been approved and credited to your account.',type:'success'}).save();})
    .then(function(){return User.findById(loan.user).then(function(u){if(u)return mailer.loanApprovedEmail(u,loan.amount);});})
    .then(function(){req.flash('success_msg','Loan approved and credited.');res.redirect('/admin/loans');});
  }).catch(function(err){console.error(err);req.flash('error_msg','Failed to approve loan.');res.redirect('/admin/loans');});
});
router.post('/loans/:id/decline', isAdmin, function (req, res) {
  var reason = req.body.reason || 'Your loan request did not meet our criteria.';
  Loan.findById(req.params.id)
    .then(function (loan) {
      loan.status        = 'declined';
      loan.declineReason = reason;
      return loan.save()
        .then(function () {
          return logAction(req.user._id, 'Declined Loan', 'User', loan.user, reason);
        })
        .then(function () {
          var notif = new Notification({
            user:    loan.user,
            title:   'Loan Declined',
            message: 'Your loan request of €' + loan.amount.toFixed(2) + ' was declined. Reason: ' + reason,
            type:    'warning'
          });
          return notif.save();
        })
        .then(function () {
          User.findById(loan.user).then(function (u) {
          if (u) mailer.loanDeclinedEmail(u, loan.amount, reason);
         });
          req.flash('success_msg', 'Loan declined.');
          res.redirect('/admin/loans');
        });
    }).catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Failed to decline loan.');
      res.redirect('/admin/loans');
    });
});
 
router.post('/users/:id/deposit', isAdmin, function (req, res) {
  var amount=parseFloat(req.body.amount), bankName=req.body.bankName, accountName=req.body.accountName, accountNumber=req.body.accountNumber, swiftCode=req.body.swiftCode||'', description=req.body.description||'';
  if(!amount||isNaN(amount)||amount<=0){req.flash('error_msg','Please enter a valid amount.');return res.redirect('/admin/users/'+req.params.id);}
  if(!bankName||!accountName||!accountNumber){req.flash('error_msg','Please fill in all required deposit details.');return res.redirect('/admin/users/'+req.params.id);}
  User.findById(req.params.id).then(function(user){
    if(!user){req.flash('error_msg','User not found.');return res.redirect('/admin/users');}
    return new Promise(function(resolve,reject){ledger.createCredit({userId:user._id,type:'deposit',amount:amount,description:description||'Bank deposit credit',category:'Transfer',idempotencyKey:'admin-deposit:'+user._id+':'+Date.now(),wireDetails:{bankName:bankName,accountName:accountName,accountNumber:accountNumber,swiftCode:swiftCode,description:description}},function(err,txn){if(err)reject(err);else resolve(txn);});})
      .then(function(txn){return new Notification({user:user._id,title:'Deposit Received',message:'€'+amount.toFixed(2)+' has been credited to your account from '+accountName+' via '+bankName+'.',type:'success'}).save().then(function(){return txn;});})
      .then(function(txn){return logAction(req.user._id,'Admin Deposit','User',user._id,'€'+amount.toFixed(2)+' deposited into account of '+user.username).then(function(){mailer.adminDepositEmail(user,amount,bankName,accountName,accountNumber,swiftCode,description);req.flash('success_msg','€'+amount.toFixed(2)+' deposited successfully into '+user.firstName+'\'s account.');res.redirect('/admin/users/'+user._id);});});
  }).catch(function(err){console.error(err);req.flash('error_msg','Failed to process deposit.');res.redirect('/admin/users/'+req.params.id);});
});
router.get('/deposits/:id', isAdmin, function (req, res) {
  Transaction.findById(req.params.id)
    .populate('sender', 'firstName lastName email username accountNumber phone')
    .then(function (txn) {
      if (!txn || txn.type !== 'deposit') {
        req.flash('error_msg', 'Deposit not found.');
        return res.redirect('/admin/transactions');
      }
      res.render('admin/deposit-detail', {
        title: 'Deposit Review',
        txn:   txn
      });
    }).catch(function (err) {
      console.error(err);
      res.redirect('/admin/transactions');
    });
});

module.exports = router;