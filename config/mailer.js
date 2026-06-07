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
  return '\
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;">\
      <div style="padding:24px;">' + content + '\
        <p style="color:#94a3b8;font-size:0.78rem;margin-top:20px;">Disclaimer: This email was sent by NovBank. Do not share sensitive account information via email.</p>\
        <p style="color:#94a3b8;font-size:0.78rem;margin-top:8px;">© ' + new Date().getFullYear() + ' NovBank</p>\
      </div>\
    </div>';
}


// ── Email Templates ───────────────────────────────

function welcomeEmail(user) {
  return sendMail(
    user.email,
    'Welcome to NovBank',
    '\
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e9ecef;">\
      <div style="background:#1a56db;padding:32px 40px;">\
        <h1 style="color:#fff;margin:0;font-size:1.5rem;">NovBank</h1>\
      </div>\
      <div style="padding:32px 40px;">\
        <h2 style="color:#0f172a;font-size:1.2rem;">Welcome, ' + user.firstName + '!</h2>\
        <p style="color:#64748b;line-height:1.7;">Your NovBank account has been created successfully. Here are your account details:</p>\
        <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:8px;padding:20px;margin:20px 0;">\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Account Number:</strong> <span style="color:#0f172a;font-family:monospace;">' + user.accountNumber + '</span></p>\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Username:</strong> <span style="color:#0f172a;">@' + user.username + '</span></p>\
          <p style="margin:0;font-size:0.9rem;"><strong style="color:#64748b;">Email:</strong> <span style="color:#0f172a;">' + user.email + '</span></p>\
        </div>\
        <p style="color:#64748b;line-height:1.7;">Please complete your identity verification to unlock all features.</p>\
        <p style="color:#94a3b8;font-size:0.82rem;margin-top:32px;">If you did not create this account, please contact support immediately.</p>\
      </div>\
      <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e9ecef;">\
        <p style="color:#94a3b8;font-size:0.78rem;margin:0;">© ' + new Date().getFullYear() + ' NovBank. All rights reserved.</p>\
      </div>\
    </div>'
  );
}

function kycApprovedEmail(user) {
  return sendMail(
    user.email,
    'Your Identity Has Been Verified — NovBank',
    '\
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e9ecef;">\
      <div style="background:#1a56db;padding:32px 40px;">\
        <h1 style="color:#fff;margin:0;font-size:1.5rem;">NovBank</h1>\
      </div>\
      <div style="padding:32px 40px;">\
        <h2 style="color:#0f172a;font-size:1.2rem;">Identity Verified ✓</h2>\
        <p style="color:#64748b;line-height:1.7;">Hi ' + user.firstName + ', your identity verification has been approved. You now have full access to all NovBank features.</p>\
        <p style="color:#94a3b8;font-size:0.82rem;margin-top:32px;">If you have any questions, contact our support team.</p>\
      </div>\
      <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e9ecef;">\
        <p style="color:#94a3b8;font-size:0.78rem;margin:0;">© ' + new Date().getFullYear() + ' NovBank. All rights reserved.</p>\
      </div>\
    </div>'
  );
}

function kycDeclinedEmail(user, reason) {
  return sendMail(
    user.email,
    'Identity Verification Declined — NovBank',
    '\
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e9ecef;">\
      <div style="background:#1a56db;padding:32px 40px;">\
        <h1 style="color:#fff;margin:0;font-size:1.5rem;">NovBank</h1>\
      </div>\
      <div style="padding:32px 40px;">\
        <h2 style="color:#0f172a;font-size:1.2rem;">Verification Declined</h2>\
        <p style="color:#64748b;line-height:1.7;">Hi ' + user.firstName + ', unfortunately your identity verification was declined.</p>\
        <div style="background:#fee2e2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0;">\
          <p style="margin:0;color:#991b1b;font-size:0.9rem;"><strong>Reason:</strong> ' + reason + '</p>\
        </div>\
        <p style="color:#64748b;line-height:1.7;">Please log in and resubmit your documents with the correct information.</p>\
        <p style="color:#94a3b8;font-size:0.82rem;margin-top:32px;">If you believe this is a mistake, please contact support.</p>\
      </div>\
      <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e9ecef;">\
        <p style="color:#94a3b8;font-size:0.78rem;margin:0;">© ' + new Date().getFullYear() + ' NovBank. All rights reserved.</p>\
      </div>\
    </div>'
  );
}

function transferSentEmail(user, amount, recipient) {
  return sendMail(
    user.email,
    'Transfer Sent — NovBank',
    '\
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e9ecef;">\
      <div style="background:#1a56db;padding:32px 40px;">\
        <h1 style="color:#fff;margin:0;font-size:1.5rem;">NovBank</h1>\
      </div>\
      <div style="padding:32px 40px;">\
        <h2 style="color:#0f172a;font-size:1.2rem;">Transfer Sent</h2>\
        <p style="color:#64748b;line-height:1.7;">Hi ' + user.firstName + ', your transfer has been completed successfully.</p>\
        <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:8px;padding:20px;margin:20px 0;">\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Amount:</strong> <span style="color:#ef4444;font-weight:700;">-€' + amount.toFixed(2) + '</span></p>\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">To:</strong> <span style="color:#0f172a;">' + recipient + '</span></p>\
          <p style="margin:0;font-size:0.9rem;"><strong style="color:#64748b;">Date:</strong> <span style="color:#0f172a;">' + new Date().toLocaleString('en-GB') + '</span></p>\
        </div>\
        <p style="color:#94a3b8;font-size:0.82rem;margin-top:32px;">If you did not authorize this transaction, contact support immediately.</p>\
      </div>\
      <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e9ecef;">\
        <p style="color:#94a3b8;font-size:0.78rem;margin:0;">© ' + new Date().getFullYear() + ' NovBank. All rights reserved.</p>\
      </div>\
    </div>'
  );
}

function transferReceivedEmail(user, amount, sender) {
  return sendMail(
    user.email,
    'Money Received — NovBank',
    '\
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e9ecef;">\
      <div style="background:#1a56db;padding:32px 40px;">\
        <h1 style="color:#fff;margin:0;font-size:1.5rem;">NovBank</h1>\
      </div>\
      <div style="padding:32px 40px;">\
        <h2 style="color:#0f172a;font-size:1.2rem;">Money Received</h2>\
        <p style="color:#64748b;line-height:1.7;">Hi ' + user.firstName + ', you have received a payment.</p>\
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:20px 0;">\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Amount:</strong> <span style="color:#16a34a;font-weight:700;">+€' + amount.toFixed(2) + '</span></p>\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">From:</strong> <span style="color:#0f172a;">' + sender + '</span></p>\
          <p style="margin:0;font-size:0.9rem;"><strong style="color:#64748b;">Date:</strong> <span style="color:#0f172a;">' + new Date().toLocaleString('en-GB') + '</span></p>\
        </div>\
      </div>\
      <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e9ecef;">\
        <p style="color:#94a3b8;font-size:0.78rem;margin:0;">© ' + new Date().getFullYear() + ' NovBank. All rights reserved.</p>\
      </div>\
    </div>'
  );
}

function wireTransferEmail(user, amount, recipientName, iban, bankName) {
  return sendMail(
    user.email,
    'Wire Transfer Initiated — NovBank',
    '\
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e9ecef;">\
      <div style="background:#1a56db;padding:32px 40px;">\
        <h1 style="color:#fff;margin:0;font-size:1.5rem;">NovBank</h1>\
      </div>\
      <div style="padding:32px 40px;">\
        <h2 style="color:#0f172a;font-size:1.2rem;">Wire Transfer Initiated</h2>\
        <p style="color:#64748b;line-height:1.7;">Hi ' + user.firstName + ', your wire transfer has been submitted and is pending processing.</p>\
        <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:8px;padding:20px;margin:20px 0;">\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Amount:</strong> <span style="color:#ef4444;font-weight:700;">-€' + amount.toFixed(2) + '</span></p>\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Recipient:</strong> <span style="color:#0f172a;">' + recipientName + '</span></p>\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">IBAN:</strong> <span style="color:#0f172a;font-family:monospace;">' + iban + '</span></p>\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Bank:</strong> <span style="color:#0f172a;">' + bankName + '</span></p>\
          <p style="margin:0;font-size:0.9rem;"><strong style="color:#64748b;">Date:</strong> <span style="color:#0f172a;">' + new Date().toLocaleString('en-GB') + '</span></p>\
        </div>\
        <p style="color:#64748b;line-height:1.7;">Wire transfers typically take 1 to 3 business days to process.</p>\
        <p style="color:#94a3b8;font-size:0.82rem;margin-top:32px;">If you did not authorize this transaction, contact support immediately.</p>\
      </div>\
      <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e9ecef;">\
        <p style="color:#94a3b8;font-size:0.78rem;margin:0;">© ' + new Date().getFullYear() + ' NovBank. All rights reserved.</p>\
      </div>\
    </div>'
  );
}

function wireTransferSuccessEmail(user, amount, recipientName, iban, bankName) {
  return sendMail(
    user.email,
    'Wire Transfer Processed Successfully — NovBank',
    '\
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e9ecef;">\
      <div style="background:#1a56db;padding:32px 40px;">\
        <h1 style="color:#fff;margin:0;font-size:1.5rem;">NovBank</h1>\
      </div>\
      <div style="padding:32px 40px;">\
        <h2 style="color:#0f172a;font-size:1.2rem;">Wire Transfer Successful ✓</h2>\
        <p style="color:#64748b;line-height:1.7;">Hi ' + user.firstName + ', your wire transfer has been processed and successfully sent to the recipient\'s bank.</p>\
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:20px 0;">\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Amount Debited:</strong> <span style="color:#ef4444;font-weight:700;">-€' + amount.toFixed(2) + '</span></p>\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Recipient:</strong> <span style="color:#0f172a;">' + recipientName + '</span></p>\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">IBAN:</strong> <span style="color:#0f172a;font-family:monospace;">' + iban + '</span></p>\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Destination Bank:</strong> <span style="color:#0f172a;">' + bankName + '</span></p>\
          <p style="margin:0;font-size:0.9rem;"><strong style="color:#64748b;">Completion Date:</strong> <span style="color:#0f172a;">' + new Date().toLocaleString('en-GB') + '</span></p>\
        </div>\
        <p style="color:#94a3b8;font-size:0.82rem;margin-top:32px;">If you notice any discrepancies with this transaction, please contact support immediately.</p>\
      </div>\
      <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e9ecef;">\
        <p style="color:#94a3b8;font-size:0.78rem;margin:0;">© ' + new Date().getFullYear() + ' NovBank. All rights reserved.</p>\
      </div>\
    </div>'
  );
}

function depositRequestEmail(user, amount) {
  return sendMail(
    user.email,
    'Deposit Request Received — NovBank',
    '\
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e9ecef;">\
      <div style="background:#1a56db;padding:32px 40px;">\
        <h1 style="color:#fff;margin:0;font-size:1.5rem;">NovBank</h1>\
      </div>\
      <div style="padding:32px 40px;">\
        <h2 style="color:#0f172a;font-size:1.2rem;">Deposit Request Received</h2>\
        <p style="color:#64748b;line-height:1.7;">Hi ' + user.firstName + ', we have received your deposit request.</p>\
        <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:8px;padding:20px;margin:20px 0;">\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Amount:</strong> <span style="color:#0f172a;font-weight:700;">€' + amount.toFixed(2) + '</span></p>\
          <p style="margin:0;font-size:0.9rem;"><strong style="color:#64748b;">Status:</strong> <span style="color:#d97706;font-weight:600;">Pending Verification</span></p>\
        </div>\
        <p style="color:#64748b;line-height:1.7;">Your balance will be updated once our team verifies and approves the transfer.</p>\
      </div>\
      <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e9ecef;">\
        <p style="color:#94a3b8;font-size:0.78rem;margin:0;">© ' + new Date().getFullYear() + ' NovBank. All rights reserved.</p>\
      </div>\
    </div>'
  );
}

function depositApprovedEmail(user, amount) {
  return sendMail(
    user.email,
    'Deposit Approved — NovBank',
    '\
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e9ecef;">\
      <div style="background:#1a56db;padding:32px 40px;">\
        <h1 style="color:#fff;margin:0;font-size:1.5rem;">NovBank</h1>\
      </div>\
      <div style="padding:32px 40px;">\
        <h2 style="color:#0f172a;font-size:1.2rem;">Deposit Approved</h2>\
        <p style="color:#64748b;line-height:1.7;">Hi ' + user.firstName + ', your deposit has been approved and credited to your account.</p>\
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:20px 0;">\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Amount Credited:</strong> <span style="color:#16a34a;font-weight:700;">+€' + amount.toFixed(2) + '</span></p>\
          <p style="margin:0;font-size:0.9rem;"><strong style="color:#64748b;">Date:</strong> <span style="color:#0f172a;">' + new Date().toLocaleString('en-GB') + '</span></p>\
        </div>\
      </div>\
      <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e9ecef;">\
        <p style="color:#94a3b8;font-size:0.78rem;margin:0;">© ' + new Date().getFullYear() + ' NovBank. All rights reserved.</p>\
      </div>\
    </div>'
  );
}

function depositDeclinedEmail(user, amount) {
  return sendMail(
    user.email,
    'Deposit Declined — NovBank',
    '\
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e9ecef;">\
      <div style="background:#1a56db;padding:32px 40px;">\
        <h1 style="color:#fff;margin:0;font-size:1.5rem;">NovBank</h1>\
      </div>\
      <div style="padding:32px 40px;">\
        <h2 style="color:#0f172a;font-size:1.2rem;">Deposit Declined</h2>\
        <p style="color:#64748b;line-height:1.7;">Hi ' + user.firstName + ', your deposit request of €' + amount.toFixed(2) + ' was not approved.</p>\
        <p style="color:#64748b;line-height:1.7;">Please contact support if you have any questions or if you believe this is an error.</p>\
      </div>\
      <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e9ecef;">\
        <p style="color:#94a3b8;font-size:0.78rem;margin:0;">© ' + new Date().getFullYear() + ' NovBank. All rights reserved.</p>\
      </div>\
    </div>'
  );
}

function loanApprovedEmail(user, amount) {
  return sendMail(
    user.email,
    'Loan Approved — NovBank',
    '\
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e9ecef;">\
      <div style="background:#1a56db;padding:32px 40px;">\
        <h1 style="color:#fff;margin:0;font-size:1.5rem;">NovBank</h1>\
      </div>\
      <div style="padding:32px 40px;">\
        <h2 style="color:#0f172a;font-size:1.2rem;">Loan Approved</h2>\
        <p style="color:#64748b;line-height:1.7;">Hi ' + user.firstName + ', your loan request has been approved and credited to your account.</p>\
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin:20px 0;">\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Amount Credited:</strong> <span style="color:#16a34a;font-weight:700;">+€' + amount.toFixed(2) + '</span></p>\
          <p style="margin:0;font-size:0.9rem;"><strong style="color:#64748b;">Date:</strong> <span style="color:#0f172a;">' + new Date().toLocaleString('en-GB') + '</span></p>\
        </div>\
        <p style="color:#94a3b8;font-size:0.82rem;margin-top:32px;">Please ensure timely repayment as per your agreed schedule.</p>\
      </div>\
      <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e9ecef;">\
        <p style="color:#94a3b8;font-size:0.78rem;margin:0;">© ' + new Date().getFullYear() + ' NovBank. All rights reserved.</p>\
      </div>\
    </div>'
  );
}

function loanDeclinedEmail(user, amount, reason) {
  return sendMail(
    user.email,
    'Loan Request Declined — NovBank',
    '\
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e9ecef;">\
      <div style="background:#1a56db;padding:32px 40px;">\
        <h1 style="color:#fff;margin:0;font-size:1.5rem;">NovBank</h1>\
      </div>\
      <div style="padding:32px 40px;">\
        <h2 style="color:#0f172a;font-size:1.2rem;">Loan Request Declined</h2>\
        <p style="color:#64748b;line-height:1.7;">Hi ' + user.firstName + ', your loan request of €' + amount.toFixed(2) + ' was declined.</p>\
        <div style="background:#fee2e2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0;">\
          <p style="margin:0;color:#991b1b;font-size:0.9rem;"><strong>Reason:</strong> ' + reason + '</p>\
        </div>\
      </div>\
      <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e9ecef;">\
        <p style="color:#94a3b8;font-size:0.78rem;margin:0;">© ' + new Date().getFullYear() + ' NovBank. All rights reserved.</p>\
      </div>\
    </div>'
  );
}

function cardApprovedEmail(user, cardType) {
  return sendMail(
    user.email,
    'Card Approved — NovBank',
    '\
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e9ecef;">\
      <div style="background:#1a56db;padding:32px 40px;">\
        <h1 style="color:#fff;margin:0;font-size:1.5rem;">NovBank</h1>\
      </div>\
      <div style="padding:32px 40px;">\
        <h2 style="color:#0f172a;font-size:1.2rem;">Your Card Is Ready</h2>\
        <p style="color:#64748b;line-height:1.7;">Hi ' + user.firstName + ', your ' + cardType.charAt(0).toUpperCase() + cardType.slice(1) + ' card has been approved and is now active.</p>\
        <p style="color:#64748b;line-height:1.7;">You can view your card details by logging into your NovBank account.</p>\
      </div>\
      <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e9ecef;">\
        <p style="color:#94a3b8;font-size:0.78rem;margin:0;">© ' + new Date().getFullYear() + ' NovBank. All rights reserved.</p>\
      </div>\
    </div>'
  );
}

function airtimeEmail(user, amount, phone, network) {
  return sendMail(
    user.email,
    'Airtime Recharge Successful — NovBank',
    '\
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e9ecef;">\
      <div style="background:#1a56db;padding:32px 40px;">\
        <h1 style="color:#fff;margin:0;font-size:1.5rem;">NovBank</h1>\
      </div>\
      <div style="padding:32px 40px;">\
        <h2 style="color:#0f172a;font-size:1.2rem;">Airtime Recharge Successful</h2>\
        <p style="color:#64748b;line-height:1.7;">Hi ' + user.firstName + ', your airtime recharge was successful.</p>\
        <div style="background:#f8faff;border:1px solid #e0e7ff;border-radius:8px;padding:20px;margin:20px 0;">\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Amount:</strong> <span style="color:#ef4444;font-weight:700;">-€' + amount.toFixed(2) + '</span></p>\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Phone:</strong> <span style="color:#0f172a;">' + phone + '</span></p>\
          <p style="margin:0 0 8px;font-size:0.9rem;"><strong style="color:#64748b;">Network:</strong> <span style="color:#0f172a;">' + network + '</span></p>\
          <p style="margin:0;font-size:0.9rem;"><strong style="color:#64748b;">Date:</strong> <span style="color:#0f172a;">' + new Date().toLocaleString('en-GB') + '</span></p>\
        </div>\
      </div>\
      <div style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e9ecef;">\
        <p style="color:#94a3b8;font-size:0.78rem;margin:0;">© ' + new Date().getFullYear() + ' NovBank. All rights reserved.</p>\
      </div>\
    </div>'
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
  airtimeEmail,
  forgotPasswordEmail,
  forgotPinEmail,
  adminKycNotification,
  adminWithdrawalNotification
};