var { Resend } = require('resend');

var resend = new Resend(process.env.RESEND_API_KEY);

function sendMail(to, subject, html) {
  return resend.emails.send({
    from:    process.env.RESEND_FROM,
    to:      to,
    subject: subject,
    html:    html
  }).catch(function (err) {
    console.error('Mail error:', err);
  });
}

// Shared transactional email layout. Designed to stay readable across Gmail, Outlook and mobile clients.
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function money(amount, sign) {
  return (sign || '') + '€' + Number(amount || 0).toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function layout(content, preheader) {
  var year = new Date().getFullYear();
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>NovBank</title></head><body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#172033;">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;">' + escapeHtml(preheader || 'Account notification from NovBank') + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;"><tr><td align="center" style="padding:28px 12px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #dfe5ec;">' +
    '<tr><td style="padding:24px 30px;border-bottom:1px solid #e8edf3;"><table role="presentation" width="100%"><tr>' +
    '<td><span style="font-size:21px;font-weight:800;letter-spacing:-.4px;color:#14213d;">NovBank</span></td>' +
    '<td align="right"><span style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#728096;">ACCOUNT NOTIFICATION</span></td>' +
    '</tr></table></td></tr>' +
    '<tr><td style="padding:34px 30px 30px;">' + content + '</td></tr>' +
    '<tr><td style="padding:22px 30px;background:#f7f9fb;border-top:1px solid #e8edf3;">' +
    '<p style="margin:0 0 8px;font-size:12px;line-height:18px;color:#69778b;">This is an automated NovBank account notification. We will never ask you to send us your password, transaction PIN or one-time verification code by email.</p>' +
    '<p style="margin:0;font-size:12px;color:#8a96a7;">© ' + year + ' NovBank. All rights reserved.</p>' +
    '</td></tr></table></td></tr></table></body></html>';
}

function transactionEmail(user, subject, title, intro, amount, direction, rows, status, preheader) {
  var rowHtml = (rows || []).map(function(row) {
    return '<tr><td style="padding:12px 0;border-bottom:1px solid #edf1f5;font-size:13px;color:#778398;">' + escapeHtml(row[0]) +
      '</td><td align="right" style="padding:12px 0;border-bottom:1px solid #edf1f5;font-size:13px;font-weight:700;color:#172033;">' + escapeHtml(row[1]) + '</td></tr>';
  }).join('');
  var statusHtml = status ? '<div style="display:inline-block;padding:7px 10px;background:#f1f5f9;color:#334155;font-size:11px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;">' + escapeHtml(status) + '</div>' : '';
  var amountHtml = amount != null ? '<div style="margin:22px 0 20px;padding:22px;background:#f7f9fb;border:1px solid #e4e9ef;"><div style="font-size:11px;font-weight:800;letter-spacing:1px;color:#7a8799;">TRANSACTION AMOUNT</div><div style="margin-top:7px;font-size:30px;line-height:36px;font-weight:800;letter-spacing:-.7px;color:#14213d;">' + escapeHtml(direction || '') + escapeHtml(money(amount)) + '</div></div>' : '';
  return sendMail(
    user.email,
    subject,
    layout(
      '<h1 style="margin:0 0 9px;font-size:25px;line-height:32px;color:#14213d;">' + escapeHtml(title) + '</h1>' +
      '<p style="margin:0;font-size:15px;line-height:24px;color:#59677a;">Hi ' + escapeHtml(user.firstName) + ', ' + escapeHtml(intro) + '</p>' +
      amountHtml + statusHtml +
      (rowHtml ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">' + rowHtml + '</table>' : '') +
      '<p style="margin:24px 0 0;font-size:13px;line-height:21px;color:#69778b;">If you do not recognize this activity, sign in to your account and contact NovBank support immediately.</p>',
      preheader
    )
  );
}

// ── Email Templates ───────────────────────────────

function welcomeEmail(user) {
  return sendMail(
    user.email,
    'Welcome to NovBank',
    layout('\
      <h2>Welcome, ' + user.firstName + '!</h2>\
      <p>Your NovBank account has been created successfully.</p>\
      <p><strong>Account Number:</strong> ' + user.accountNumber + '</p>\
      <p><strong>Username:</strong> @' + user.username + '</p>\
      <p>If you did not create this account, contact support.</p>' )
  );
}

function kycApprovedEmail(user) {
  return sendMail(
    user.email,
    'Your Identity Has Been Verified — NovBank',
    layout('\
      <h2>Identity Verified ✓</h2>\
      <p>Hi ' + user.firstName + ', your identity verification has been approved. You now have full access to all features.</p>\
      <p>If you have questions, contact support.</p>' )
  );
}

function kycDeclinedEmail(user, reason) {
  return sendMail(
    user.email,
    'Identity Verification Declined — NovBank',
    layout('\
      <h2>Verification Declined</h2>\
      <p>Hi ' + user.firstName + ', your identity verification was declined.</p>\
      <p><strong>Reason:</strong> ' + reason + '</p>\
      <p>Please log in and resubmit your documents, or contact support.</p>' )
  );
}

function transferSentEmail(user, amount, recipient) {
  return transactionEmail(user, 'Transfer sent · ' + money(amount, '-'), 'Transfer sent', 'your transfer has been completed.', amount, '-', [
    ['Recipient', recipient],
    ['Date', new Date().toLocaleString('en-GB')],
    ['Status', 'Completed']
  ], 'Completed', 'Transfer completed · ' + money(amount, '-'));
}

function transferReceivedEmail(user, amount, sender) {
  return transactionEmail(user, 'Money received · ' + money(amount, '+'), 'Money received', 'a payment has been credited to your account.', amount, '+', [
    ['From', sender],
    ['Date', new Date().toLocaleString('en-GB')],
    ['Status', 'Completed']
  ], 'Completed', 'Money received · ' + money(amount, '+'));
}

function wireTransferEmail(user, amount, recipientName, iban, bankName) {
  return transactionEmail(user, 'Transfer pending · ' + money(amount, '-'), 'International transfer submitted', 'your transfer request has been received and is pending processing.', amount, '-', [
    ['Recipient', recipientName],
    ['IBAN', iban],
    ['Bank', bankName],
    ['Submitted', new Date().toLocaleString('en-GB')]
  ], 'Pending', 'International transfer submitted · awaiting processing');
}

function wireTransferSuccessEmail(user, amount, recipientName, iban, bankName) {
  return sendMail(
    user.email,
    'Wire Transfer Processed Successfully — NovBank',
    layout('\
      <h2>Wire Transfer Successful ✓</h2>\
      <p>Hi ' + user.firstName + ', your wire transfer was processed successfully.</p>\
      <p><strong>Amount:</strong> -€' + Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</p>\
      <p><strong>Recipient:</strong> ' + recipientName + '</p>\
      <p><strong>IBAN:</strong> ' + iban + '</p>\
      <p><strong>Destination Bank:</strong> ' + bankName + '</p>' )
  );
}

function depositRequestEmail(user, amount) {
  return transactionEmail(user, 'Deposit pending · ' + money(amount), 'Deposit request received', 'we have received your deposit request and it is awaiting verification.', amount, '+', [
    ['Submitted', new Date().toLocaleString('en-GB')],
    ['Status', 'Pending verification']
  ], 'Pending', 'Deposit request received · awaiting verification');
}

function depositApprovedEmail(user, amount) {
  return sendMail(
    user.email,
    'Deposit Approved — NovBank',
    layout('\
      <h2>Deposit Approved</h2>\
      <p>Hi ' + user.firstName + ', your deposit has been approved and credited to your account.</p>\
      <p><strong>Amount Credited:</strong> +€' + Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '.</p>' )
  );
}

function depositDeclinedEmail(user, amount) {
  return sendMail(
    user.email,
    'Deposit Declined — NovBank',
    layout('\
      <h2>Deposit Declined</h2>\
      <p>Hi ' + user.firstName + ', your deposit request of €' + Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' was not approved.</p>\
      <p>Please contact support if you have questions.</p>' )
  );
}

function loanApprovedEmail(user, amount) {
  return sendMail(
    user.email,
    'Loan Approved — NovBank',
    layout('\
      <h2>Loan Approved</h2>\
      <p>Hi ' + user.firstName + ', your loan request has been approved and credited.</p>\
      <p><strong>Amount:</strong> +€' + Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</p>' )
  );
}

function loanDeclinedEmail(user, amount, reason) {
  return sendMail(
    user.email,
    'Loan Request Declined — NovBank',
    layout('\
      <h2>Loan Request Declined</h2>\
      <p>Hi ' + user.firstName + ', your loan request of €' + Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' was declined.</p>\
      <p><strong>Reason:</strong> ' + reason + '</p>' )
  );
}

function cardApprovedEmail(user, cardType) {
  return sendMail(
    user.email,
    'Card Approved — NovBank',
    layout('\
      <h2>Your Card Is Ready</h2>\
      <p>Hi ' + user.firstName + ', your ' + cardType.charAt(0).toUpperCase() + cardType.slice(1) + ' card has been approved and is now active.</p>\
      <p>Log in to your account to view card details.</p>' )
  );
}

function forgotPasswordEmail(user, resetUrl) {
  return sendMail(
    user.email,
    'Password Reset Request — NovBank',
    layout('\
      <p>Dear ' + user.firstName + ' ' + user.lastName + ',</p>\
      <p>We received a request to reset the password for your NovBank account.</p>\
      <p>Please click the link below to reset your password. This link will expire in 1 hour.</p>\
      <p><a href="' + resetUrl + '" style="color:#1a56db;">' + resetUrl + '</a></p>\
      <p>If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>\
      <p>Regards,<br/>NovBank Team</p>'
    )
  );
}

function forgotPinEmail(user, resetUrl) {
  return sendMail(
    user.email,
    'PIN Reset Request — NovBank',
    layout('\
      <p>Dear ' + user.firstName + ' ' + user.lastName + ',</p>\
      <p>We received a request to reset the transaction PIN for your NovBank account.</p>\
      <p>Please click the link below to reset your PIN. This link will expire in 1 hour.</p>\
      <p><a href="' + resetUrl + '" style="color:#1a56db;">' + resetUrl + '</a></p>\
      <p>If you did not request a PIN reset, please ignore this email. Your PIN will remain unchanged.</p>\
      <p>Regards,<br/>NovBank Team</p>'
    )
  );
}

function adminKycNotification(applicantName, applicantEmail, accountNumber) {
  return sendMail(
    process.env.ADMIN_EMAIL,
    'New KYC Submission — NovBank',
    layout('\
      <p>A new KYC verification request has been submitted and is pending review.</p>\
      <p>\
        Name: ' + applicantName + '<br/>\
        Email: ' + applicantEmail + '<br/>\
        Account Number: ' + accountNumber + '\
      </p>\
      <p>Please log in to the admin panel to review and process this submission.</p>\
      <p>Regards,<br/>NovBank System</p>'
    )
  );
}

function adminWithdrawalNotification(userName, userEmail, accountNumber, amount, type) {
  return sendMail(
    process.env.ADMIN_EMAIL,
    'New ' + type + ' — NovBank',
    layout('\
      <p>A new ' + type.toLowerCase() + ' has been submitted and requires processing.</p>\
      <p>\
        Name: ' + userName + '<br/>\
        Email: ' + userEmail + '<br/>\
        Account Number: ' + accountNumber + '<br/>\
        Amount: €' + Number(amount).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '<br/>\
        Type: ' + type + '\
      </p>\
      <p>Please log in to the admin panel to review and process this transaction.</p>\
      <p>Regards,<br/>NovBank System</p>'
    )
  );
}
function emailVerificationCode(user, code) {
  return sendMail(
    user.email,
    'Your NovBank Verification Code',
    layout('\
      <p>Dear ' + user.firstName + ' ' + user.lastName + ',</p>\
      <p>Thank you for registering with NovBank. Please use the verification code below to confirm your email address.</p>\
      <p style="font-size:2rem;font-weight:900;letter-spacing:8px;color:#1a56db;margin:24px 0;">' + code + '</p>\
      <p>This code will expire in 15 minutes. Do not share this code with anyone.</p>\
      <p>If you did not create a NovBank account, please ignore this email.</p>\
      <p>Regards,<br/>NovBank Team</p>'
    )
  );
}

function adminDepositEmail(user, amount, bankName, accountName, accountNumber, swiftCode, description) {
  return sendMail(
    user.email,
    'Deposit Received — NovBank',
    layout('\
      <p>Dear ' + user.firstName + ' ' + user.lastName + ',</p>\
      <p>A deposit has been credited to your NovBank account. Please find the details of the transaction below.</p>\
      <p>\
        Amount Credited: €' + amount.toFixed(2) + '.<br/>\
        Sending Bank: ' + bankName + '.<br/>\
        Account Name: ' + accountName + '.<br/>\
        Account Number: ' + accountNumber + '.<br/>\
        ' + (swiftCode ? 'SWIFT/BIC Code: ' + swiftCode + '.<br/>' : '') + '\
        ' + (description ? 'Description: ' + description + '.<br/>' : '') + '\
        Date: ' + new Date().toLocaleString('en-GB') + '.<br/>\
        Status: Completed.\
      </p>\
      <p>Your account balance has been updated. You can log in to your NovBank account to view your updated balance and full transaction history.</p>\
      <p>Regards,<br/>NovBank Team</p>'
    )
  );
}

module.exports = {
  welcomeEmail,
  kycApprovedEmail,
  kycDeclinedEmail,
  transferSentEmail,
  transferReceivedEmail,
  wireTransferEmail,
  wireTransferSuccessEmail,
  depositRequestEmail,
  depositApprovedEmail,
  depositDeclinedEmail,
  loanApprovedEmail,
  loanDeclinedEmail,
  cardApprovedEmail,
  forgotPasswordEmail,
  forgotPinEmail,
  adminKycNotification,
  emailVerificationCode,
  adminWithdrawalNotification,
  adminDepositEmail
};