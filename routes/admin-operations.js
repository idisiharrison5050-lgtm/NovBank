var express = require('express');
var router = express.Router();
var Admin = require('../models/Admin');
var User = require('../models/User');
var Grant = require('../models/Grant');
var Refund = require('../models/Refund');
var AuditLog = require('../models/AuditLog');
var Notification = require('../models/Notification');
var ledger = require('../services/ledger');

function isAdmin(req, res, next) {
  if (req.isAuthenticated() && req.user.role === 'superadmin') return next();
  res.redirect('/admin/login');
}

function logAction(adminId, action, targetType, targetId, details) {
  return new AuditLog({
    admin: adminId,
    action: action,
    targetType: targetType || 'System',
    targetId: targetId || null,
    details: details || ''
  }).save();
}

function renderList(req, res, model, title, filter, statuses, extra) {
  var query = filter && filter !== 'all' ? { status: filter } : {};
  model.find(query).sort({ createdAt: -1 }).populate('user', 'firstName lastName username email accountNumber')
    .then(function (items) {
      res.render('admin/operations', {
        title: title,
        items: items,
        filter: filter || 'all',
        statuses: statuses,
        operation: extra.operation,
        columns: extra.columns,
        emptyText: extra.emptyText
      });
    })
    .catch(function (err) {
      console.error(err);
      req.flash('error_msg', 'Unable to load ' + title.toLowerCase() + '.');
      res.redirect('/admin/dashboard');
    });
}

router.get('/grants', isAdmin, function (req, res) {
  renderList(req, res, Grant, 'Grant Applications', req.query.filter || 'all',
    ['all', 'processing', 'approved', 'rejected', 'disbursed'],
    {
      operation: 'grants',
      emptyText: 'No grant applications found.',
      columns: ['Applicant', 'Amount', 'Purpose', 'Applied', 'Status', 'Actions']
    });
});

router.post('/grants/:id/approve', isAdmin, function (req, res) {
  Grant.findById(req.params.id).then(function (grant) {
    if (!grant || grant.status !== 'processing') throw new Error('Grant is unavailable or already processed.');
    grant.status = 'approved';
    grant.reviewNote = String(req.body.note || 'Grant application approved.').trim();
    grant.reviewedBy = req.user._id;
    grant.reviewedAt = new Date();
    return grant.save().then(function () {
      return logAction(req.user._id, 'Approved Grant', 'User', grant.user, 'Approved grant of €' + grant.amount.toFixed(2));
    }).then(function () {
      return new Notification({
        user: grant.user,
        type: 'system',
        title: 'Grant Application Approved',
        message: 'Your grant application has been approved and is awaiting disbursement.',
        severity: 'success'
      }).save();
    }).then(function () {
      req.flash('success_msg', 'Grant approved. It is ready for disbursement.');
      res.redirect('/admin/grants');
    });
  }).catch(function (err) {
    req.flash('error_msg', err.message);
    res.redirect('/admin/grants');
  });
});

router.post('/grants/:id/reject', isAdmin, function (req, res) {
  Grant.findById(req.params.id).then(function (grant) {
    if (!grant || grant.status !== 'processing') throw new Error('Grant is unavailable or already processed.');
    grant.status = 'rejected';
    grant.reviewNote = String(req.body.note || 'Grant application rejected.').trim();
    grant.reviewedBy = req.user._id;
    grant.reviewedAt = new Date();
    return grant.save().then(function () {
      return logAction(req.user._id, 'Rejected Grant', 'User', grant.user, grant.reviewNote);
    }).then(function () {
      return new Notification({
        user: grant.user,
        type: 'system',
        title: 'Grant Application Update',
        message: 'Your grant application was not approved. ' + grant.reviewNote,
        severity: 'warning'
      }).save();
    }).then(function () {
      req.flash('success_msg', 'Grant rejected.');
      res.redirect('/admin/grants');
    });
  }).catch(function (err) {
    req.flash('error_msg', err.message);
    res.redirect('/admin/grants');
  });
});

router.post('/grants/:id/disburse', isAdmin, function (req, res) {
  Grant.findById(req.params.id).then(function (grant) {
    if (!grant || grant.status !== 'approved') throw new Error('Only approved grants can be disbursed.');
    return new Promise(function (resolve, reject) {
      ledger.createCredit({
        userId: grant.user,
        type: 'grant_credit',
        amount: grant.amount,
        description: 'Grant disbursement',
        category: 'Other',
        idempotencyKey: 'grant:' + grant._id + ':disbursement'
      }, function (err, txn) {
        if (err) return reject(err);
        resolve(txn);
      });
    }).then(function () {
      grant.status = 'disbursed';
      grant.disbursedAt = new Date();
      return grant.save();
    }).then(function () {
      return logAction(req.user._id, 'Disbursed Grant', 'User', grant.user, 'Disbursed €' + grant.amount.toFixed(2));
    }).then(function () {
      return new Notification({
        user: grant.user,
        type: 'transaction',
        title: 'Grant Disbursed',
        message: '€' + grant.amount.toFixed(2) + ' has been credited to your account as a grant.',
        severity: 'success'
      }).save();
    }).then(function () {
      req.flash('success_msg', 'Grant disbursed and credited through the ledger.');
      res.redirect('/admin/grants');
    });
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Grant disbursement failed: ' + err.message);
    res.redirect('/admin/grants');
  });
});

router.get('/refunds', isAdmin, function (req, res) {
  renderList(req, res, Refund, 'Refund Management', req.query.filter || 'all',
    ['all', 'pending', 'approved', 'rejected', 'completed'],
    {
      operation: 'refunds',
      emptyText: 'No refund requests found.',
      columns: ['Customer', 'Amount', 'Reason', 'Requested', 'Status', 'Actions']
    });
});

router.post('/refunds/:id/approve', isAdmin, function (req, res) {
  Refund.findById(req.params.id).then(function (refund) {
    if (!refund || refund.status !== 'pending') throw new Error('Refund is unavailable or already processed.');
    refund.status = 'approved';
    refund.reviewNote = String(req.body.note || 'Refund approved.').trim();
    refund.reviewedBy = req.user._id;
    refund.reviewedAt = new Date();
    return refund.save().then(function () {
      return logAction(req.user._id, 'Approved Refund', 'User', refund.user, 'Approved refund of €' + refund.amount.toFixed(2));
    }).then(function () {
      return new Notification({
        user: refund.user,
        type: 'system',
        title: 'Refund Approved',
        message: 'Your refund request has been approved and is awaiting completion.',
        severity: 'success'
      }).save();
    }).then(function () {
      req.flash('success_msg', 'Refund approved. Complete it when funds are ready.');
      res.redirect('/admin/refunds');
    });
  }).catch(function (err) {
    req.flash('error_msg', err.message);
    res.redirect('/admin/refunds');
  });
});

router.post('/refunds/:id/reject', isAdmin, function (req, res) {
  Refund.findById(req.params.id).then(function (refund) {
    if (!refund || refund.status !== 'pending') throw new Error('Refund is unavailable or already processed.');
    refund.status = 'rejected';
    refund.reviewNote = String(req.body.note || 'Refund rejected.').trim();
    refund.reviewedBy = req.user._id;
    refund.reviewedAt = new Date();
    return refund.save().then(function () {
      return logAction(req.user._id, 'Rejected Refund', 'User', refund.user, refund.reviewNote);
    }).then(function () {
      return new Notification({
        user: refund.user,
        type: 'system',
        title: 'Refund Request Update',
        message: 'Your refund request was rejected. ' + refund.reviewNote,
        severity: 'warning'
      }).save();
    }).then(function () {
      req.flash('success_msg', 'Refund rejected.');
      res.redirect('/admin/refunds');
    });
  }).catch(function (err) {
    req.flash('error_msg', err.message);
    res.redirect('/admin/refunds');
  });
});

router.post('/refunds/:id/complete', isAdmin, function (req, res) {
  Refund.findById(req.params.id).then(function (refund) {
    if (!refund || refund.status !== 'approved') throw new Error('Only approved refunds can be completed.');
    return new Promise(function (resolve, reject) {
      ledger.createCredit({
        userId: refund.user,
        type: 'refund_credit',
        amount: refund.amount,
        description: 'Refund completion',
        category: 'Other',
        idempotencyKey: 'refund:' + refund._id + ':completion'
      }, function (err, txn) {
        if (err) return reject(err);
        resolve(txn);
      });
    }).then(function () {
      refund.status = 'completed';
      refund.completedAt = new Date();
      return refund.save();
    }).then(function () {
      return logAction(req.user._id, 'Completed Refund', 'User', refund.user, 'Completed refund of €' + refund.amount.toFixed(2));
    }).then(function () {
      return new Notification({
        user: refund.user,
        type: 'transaction',
        title: 'Refund Completed',
        message: '€' + refund.amount.toFixed(2) + ' has been credited to your account.',
        severity: 'success'
      }).save();
    }).then(function () {
      req.flash('success_msg', 'Refund completed and credited through the ledger.');
      res.redirect('/admin/refunds');
    });
  }).catch(function (err) {
    console.error(err);
    req.flash('error_msg', 'Refund completion failed: ' + err.message);
    res.redirect('/admin/refunds');
  });
});

router.get('/administrators', isAdmin, function (req, res) {
  Admin.find().sort({ createdAt: -1 }).then(function (admins) {
    res.render('admin/administrators', { title: 'Administrators', admins: admins });
  }).catch(function (err) {
    console.error(err);
    res.redirect('/admin/dashboard');
  });
});

router.post('/administrators', isAdmin, function (req, res) {
  var firstName = String(req.body.firstName || '').trim();
  var lastName = String(req.body.lastName || '').trim();
  var username = String(req.body.username || '').trim().toLowerCase();
  var email = String(req.body.email || '').trim().toLowerCase();
  var password = String(req.body.password || '');
  var role = req.body.role === 'manager' ? 'manager' : 'superadmin';

  if (!firstName || !lastName || !username || !email || password.length < 8) {
    req.flash('error_msg', 'Complete all administrator fields. Password must be at least 8 characters.');
    return res.redirect('/admin/administrators');
  }

  Admin.findOne({ $or: [{ username: username }, { email: email }] }).then(function (existing) {
    if (existing) throw new Error('Username or email is already in use.');
    return new Admin({
      firstName: firstName,
      lastName: lastName,
      username: username,
      email: email,
      password: password,
      role: role
    }).save();
  }).then(function (admin) {
    return logAction(req.user._id, 'Created Administrator', 'System', null, 'Created ' + role + ' account ' + admin.username);
  }).then(function () {
    req.flash('success_msg', 'Administrator created.');
    res.redirect('/admin/administrators');
  }).catch(function (err) {
    req.flash('error_msg', err.message);
    res.redirect('/admin/administrators');
  });
});

router.post('/administrators/:id/toggle-role', isAdmin, function (req, res) {
  if (String(req.user._id) === String(req.params.id)) {
    req.flash('error_msg', 'You cannot change your own administrator role.');
    return res.redirect('/admin/administrators');
  }
  Admin.findById(req.params.id).then(function (admin) {
    if (!admin) throw new Error('Administrator not found.');
    admin.role = admin.role === 'superadmin' ? 'manager' : 'superadmin';
    return admin.save();
  }).then(function () {
    return logAction(req.user._id, 'Changed Administrator Role', 'System', null, 'Administrator ' + req.params.id + ' role changed.');
  }).then(function () {
    req.flash('success_msg', 'Administrator role updated.');
    res.redirect('/admin/administrators');
  }).catch(function (err) {
    req.flash('error_msg', err.message);
    res.redirect('/admin/administrators');
  });
});

router.post('/administrators/:id/delete', isAdmin, function (req, res) {
  if (String(req.user._id) === String(req.params.id)) {
    req.flash('error_msg', 'You cannot delete your own administrator account.');
    return res.redirect('/admin/administrators');
  }
  Admin.findByIdAndDelete(req.params.id).then(function (admin) {
    if (!admin) throw new Error('Administrator not found.');
    return logAction(req.user._id, 'Deleted Administrator', 'System', null, 'Deleted administrator ' + admin.username);
  }).then(function () {
    req.flash('success_msg', 'Administrator deleted.');
    res.redirect('/admin/administrators');
  }).catch(function (err) {
    req.flash('error_msg', err.message);
    res.redirect('/admin/administrators');
  });
});

router.get('/settings', isAdmin, function (req, res) {
  res.render('admin/settings', {
    title: 'System Settings',
    settings: {
      appName: process.env.APP_NAME || 'NovBank',
      currency: process.env.DEFAULT_CURRENCY || 'EUR',
      supportEmail: process.env.ADMIN_EMAIL || '',
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

module.exports = router;
