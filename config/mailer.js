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

// Minimal layout wrapper for emails. Keeps styling simple and adds a disclaimer.
function layout(content) {
  return '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e9ecef;">' +
    '<div style="background:#1a56db;padding:32px 40px;">' +
      '<h1 style="color:#fff;margin:0;font-size:1.5rem;">NovBank</h1>' +
    '</div>' +
    '<div style="padding:32px 40px;color:#0f172a;">' + content + '</div>' +
    '<div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e9ecef;">' +
      '<p style="color:#94a3b8;font-size:0.78rem;margin:0;">Disclaimer: This email was sent by NovBank. Do not share sensitive account information via email.</p>' +
      '<p style="color:#94a3b8;font-size:0.78rem;margin-top:8px;">© ' + new Date().getFullYear() + ' NovBank. All rights reserved.</p>' +
    '</div>' +
  '</div>';
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
  return sendMail(
    user.email,
    'Transfer Sent — NovBank',
    layout('\
      <h2>Transfer Sent</h2>\
      <p>Hi ' + user.firstName + ', your transfer completed successfully.</p>\
      <p><strong>Amount:</strong> -€' + amount.toFixed(2) + '</p>\
      <p><strong>To:</strong> ' + recipient + '</p>\
      <p>If you did not authorize this, contact support.</p>' )
  );
}

function transferReceivedEmail(user, amount, sender) {
  return sendMail(
    user.email,
    'Money Received — NovBank',
    layout('\
      <h2>Money Received</h2>\
      <p>Hi ' + user.firstName + ', you have received a payment.</p>\
      <p><strong>Amount:</strong> +€' + amount.toFixed(2) + '</p>\
      <p><strong>From:</strong> ' + sender + '</p>\
      <p><strong>Date:</strong> ' + new Date().toLocaleString('en-GB') + '</p>' )
  );
}

function wireTransferEmail(user, amount, recipientName, iban, bankName) {
  return sendMail(
    user.email,
    'Wire Transfer Initiated — NovBank',
    layout('\
      <h2>Wire Transfer Initiated</h2>\
      <p>Hi ' + user.firstName + ', your wire transfer has been submitted and is pending.</p>\
      <p><strong>Amount:</strong> -€' + amount.toFixed(2) + '</p>\
      <p><strong>Recipient:</strong> ' + recipientName + '</p>\
      <p><strong>IBAN:</strong> ' + iban + '</p>\
      <p><strong>Bank:</strong> ' + bankName + '</p>' )
  );
}

function wireTransferSuccessEmail(user, amount, recipientName, iban, bankName) {
  return sendMail(
    user.email,
    'Wire Transfer Processed Successfully — NovBank',
    layout('\
      <h2>Wire Transfer Successful ✓</h2>\
      <p>Hi ' + user.firstName + ', your wire transfer was processed successfully.</p>\
      <p><strong>Amount:</strong> -€' + amount.toFixed(2) + '</p>\
      <p><strong>Recipient:</strong> ' + recipientName + '</p>\
      <p><strong>IBAN:</strong> ' + iban + '</p>\
      <p><strong>Destination Bank:</strong> ' + bankName + '</p>' )
  );
}

function depositRequestEmail(user, amount) {
  return sendMail(
    user.email,
    'Deposit Request Received — NovBank',
    layout('\
      <h2>Deposit Request Received</h2>\
      <p>Hi ' + user.firstName + ', we have received your deposit request.</p>\
      <p><strong>Amount:</strong> €' + amount.toFixed(2) + '</p>\
      <p>Status: Pending Verification</p>' )
  );
}

function depositApprovedEmail(user, amount) {
  return sendMail(
    user.email,
    'Deposit Approved — NovBank',
    layout('\
      <h2>Deposit Approved</h2>\
      <p>Hi ' + user.firstName + ', your deposit has been approved and credited to your account.</p>\
      <p><strong>Amount Credited:</strong> +€' + amount.toFixed(2) + '</p>' )
  );
}

function depositDeclinedEmail(user, amount) {
  return sendMail(
    user.email,
    'Deposit Declined — NovBank',
    layout('\
      <h2>Deposit Declined</h2>\
      <p>Hi ' + user.firstName + ', your deposit request of €' + amount.toFixed(2) + ' was not approved.</p>\
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
      <p><strong>Amount:</strong> +€' + amount.toFixed(2) + '</p>' )
  );
}

function loanDeclinedEmail(user, amount, reason) {
  return sendMail(
    user.email,
    'Loan Request Declined — NovBank',
    layout('\
      <h2>Loan Request Declined</h2>\
      <p>Hi ' + user.firstName + ', your loan request of €' + amount.toFixed(2) + ' was declined.</p>\
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
    'New Withdrawal Request — NovBank',
    layout('\
      <p>A new withdrawal request has been submitted and requires processing.</p>\
      <p>\
        Name: ' + userName + '<br/>\
        Email: ' + userEmail + '<br/>\
        Account Number: ' + accountNumber + '<br/>\
        Amount: €' + amount.toFixed(2) + '<br/>\
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
  adminWithdrawalNotification
};