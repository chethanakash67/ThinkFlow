/**
 * Email Service
 * Prefers SMTP when EMAIL_USER/EMAIL_PASSWORD or SMTP_USER/SMTP_PASS are set.
 * Falls back to SendGrid when SENDGRID_API_KEY is configured.
 */
const nodemailer = require('nodemailer');
const sgMail = require('@sendgrid/mail');

const getSmtpUser = () => process.env.SMTP_USER || process.env.EMAIL_USER || '';
const getSmtpPassword = () => process.env.SMTP_PASS || process.env.EMAIL_PASSWORD || '';
const normalizeSmtpPassword = (password) => String(password || '').replace(/\s+/g, '');

const isSmtpConfigured = () => Boolean(getSmtpUser() && getSmtpPassword());
const isSendGridConfigured = () => Boolean(process.env.SENDGRID_API_KEY);
const isEmailConfigured = () => isSmtpConfigured() || isSendGridConfigured();
const getEmailProvider = () => {
  if (isSmtpConfigured()) return 'smtp';
  if (isSendGridConfigured()) return 'sendgrid';
  return 'none';
};

const getSender = () => {
  const email = process.env.EMAIL_FROM_ADDRESS || getSmtpUser() || 'chethanakash67@gmail.com';
  const name = process.env.EMAIL_FROM_NAME || 'ThinkFlow';
  return { email, name };
};

const getReplyTo = () => {
  const email = process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM_ADDRESS || getSmtpUser() || 'chethanakash67@gmail.com';
  const name = process.env.EMAIL_FROM_NAME || 'ThinkFlow Support';
  return { email, name };
};

const getSendGridClient = () => {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY environment variable is not set');
  }
  sgMail.setApiKey(apiKey);
  return sgMail;
};

const getSmtpTransporter = () => {
  if (!isSmtpConfigured()) {
    throw new Error('SMTP credentials are not set. Use EMAIL_USER/EMAIL_PASSWORD or SMTP_USER/SMTP_PASS.');
  }

  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE
    ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
    : port === 465;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port,
    secure,
    auth: {
      user: getSmtpUser(),
      pass: normalizeSmtpPassword(getSmtpPassword()),
    },
  });
};

const sendViaSmtp = async (message) => {
  const transporter = getSmtpTransporter();
  const normalizedMessage = {
    from: message.from || getSender(),
    replyTo: message.replyTo || getReplyTo(),
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    text: message.text,
    html: message.html,
    attachments: message.attachments,
  };

  const info = await transporter.sendMail(normalizedMessage);
  console.log('✅ Email sent via SMTP, message-id:', info.messageId || 'n/a');
  return {
    success: true,
    provider: 'smtp',
    messageId: info.messageId || null,
  };
};

const sendViaSendGrid = async (message) => {
  const client = getSendGridClient();
  const normalizedMessage = {
    ...message,
    from: message.from || getSender(),
    replyTo: message.replyTo || getReplyTo(),
    trackingSettings: {
      clickTracking: { enable: false, enableText: false },
      openTracking: { enable: false },
      subscriptionTracking: { enable: false },
      ...(message.trackingSettings || {}),
    },
    mailSettings: {
      sandboxMode: { enable: false },
      ...(message.mailSettings || {}),
    },
  };

  const [response] = await client.send(normalizedMessage);
  console.log('✅ Email sent via SendGrid, status:', response.statusCode, 'message-id:', response.headers?.['x-message-id'] || 'n/a');
  return {
    success: true,
    provider: 'sendgrid',
    statusCode: response.statusCode,
    messageId: response.headers?.['x-message-id'] || null,
  };
};

async function sendEmail(message) {
  try {
    if (isSmtpConfigured()) {
      return sendViaSmtp(message);
    }

    return sendViaSendGrid(message);
  } catch (err) {
    const errBody = err.response?.body || err.message;
    console.error(`❌ ${getEmailProvider().toUpperCase()} email error:`, errBody);
    throw new Error(typeof errBody === 'object' ? JSON.stringify(errBody) : errBody);
  }
}

/**
 * Send OTP email
 */
async function sendOTPEmail(email, otp, type = 'signup') {
  const subject = type === 'signup'
    ? 'Your ThinkFlow verification code'
    : 'Your ThinkFlow password reset code';

  const heading = type === 'signup'
    ? 'Welcome to ThinkFlow!'
    : 'Password Reset Request';

  const bodyLine = type === 'signup'
    ? 'Your verification code is:'
    : 'Your password reset code is:';

  const footerNote = type === 'signup'
    ? "If you didn't create an account, please ignore this email."
    : "If you didn't request a password reset, please ignore this email.";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #4f46e5; margin-bottom: 12px;">${heading}</h2>
      <p style="font-size: 16px; color: #334155; line-height: 1.6;">${bodyLine}</p>
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <h1 style="font-size: 48px; color: #4f46e5; letter-spacing: 10px; margin: 0;">${otp}</h1>
      </div>
      <p style="color: #475569; line-height: 1.6;">This code will expire in 10 minutes.</p>
      <p style="color: #64748b; font-size: 14px; line-height: 1.6;">If you don&apos;t see this email in your inbox, please check your spam folder.</p>
      <p style="color: #94a3b8; font-size: 13px; line-height: 1.6;">${footerNote}</p>
    </div>
  `;

  const msg = {
    to: email,
    subject,
    html,
    text: [
      heading,
      '',
      `${bodyLine} ${otp}`,
      'This code will expire in 10 minutes.',
      "If you don't see this email in your inbox, please check your spam folder.",
      footerNote,
    ].join('\n'),
    categories: ['thinkflow', 'transactional', type === 'signup' ? 'otp-signup' : 'otp-reset'],
  };

  console.log(`📧 Sending OTP email via ${getEmailProvider().toUpperCase()} to: ${email}`);

  return sendEmail(msg);
}

async function sendCompetitionApprovalRequest({
  adminEmail,
  creatorName,
  creatorEmail,
  phone,
  organization,
  competitionName,
  competitionDate,
  startTime,
  endTime,
  durationMinutes,
  questionCount,
  questions,
  approveUrl,
  rejectUrl,
}) {
  const questionHtml = questions
    .map(
      (question, index) => `
        <li style="margin-bottom: 16px;">
          <strong>Q${index + 1}: ${question.title}</strong><br />
          <span style="color: #475569;">${question.description}</span><br />
          <span style="font-size: 13px; color: #64748b;">Constraints: ${question.constraints || 'Not provided'}</span>
        </li>
      `
    )
    .join('');

  const msg = {
    to: adminEmail,
    subject: `Competition approval needed: ${competitionName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #0f172a;">New competition pending approval</h2>
        <p style="color: #475569;">A user submitted a competition and is waiting for review.</p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0;">
          <p><strong>Competition:</strong> ${competitionName}</p>
          <p><strong>Creator:</strong> ${creatorName} (${creatorEmail})</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Organization:</strong> ${organization || 'Not provided'}</p>
          <p><strong>Date:</strong> ${competitionDate}</p>
          <p><strong>Time:</strong> ${startTime} - ${endTime}</p>
          <p><strong>Duration:</strong> ${durationMinutes} minutes</p>
          <p><strong>Questions:</strong> ${questionCount}</p>
          <ol>${questionHtml}</ol>
        </div>
        <div style="margin-top: 24px;">
          <a href="${approveUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 18px; border-radius: 999px; text-decoration: none; margin-right: 12px;">Approve</a>
          <a href="${rejectUrl}" style="display: inline-block; background: #ffffff; color: #b91c1c; border: 1px solid #fecaca; padding: 12px 18px; border-radius: 999px; text-decoration: none;">Reject</a>
        </div>
      </div>
    `,
    text: [
      `Competition: ${competitionName}`,
      `Creator: ${creatorName} (${creatorEmail})`,
      `Phone: ${phone}`,
      `Organization: ${organization || 'Not provided'}`,
      `Date: ${competitionDate}`,
      `Time: ${startTime} - ${endTime}`,
      `Duration: ${durationMinutes} minutes`,
      `Questions: ${questionCount}`,
      `Approve: ${approveUrl}`,
      `Reject: ${rejectUrl}`,
    ].join('\n'),
    categories: ['thinkflow', 'transactional', 'competition-approval'],
  };

  console.log(`📧 Sending competition approval email to admin: ${adminEmail}`);
  return sendEmail(msg);
}

async function sendCompetitionDecisionEmail({
  creatorEmail,
  creatorName,
  competitionName,
  approved,
  reason,
}) {
  const subject = approved
    ? `Your ThinkFlow competition is live: ${competitionName}`
    : `Competition update: ${competitionName}`;

  const message = approved
    ? `Your competition "${competitionName}" has been approved and is now live on ThinkFlow.`
    : `Your competition "${competitionName}" was not approved this time.${reason ? ` Reason: ${reason}` : ''}`;

  return sendEmail({
    to: creatorEmail,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #0f172a;">Hi ${creatorName},</h2>
        <p style="color: #475569; line-height: 1.6;">${message}</p>
      </div>
    `,
    text: `Hi ${creatorName},\n\n${message}`,
    categories: ['thinkflow', 'transactional', approved ? 'competition-approved' : 'competition-rejected'],
  });
}

module.exports = {
  getEmailProvider,
  isEmailConfigured,
  isSendGridConfigured,
  isSmtpConfigured,
  sendCompetitionApprovalRequest,
  sendCompetitionDecisionEmail,
  sendEmail,
  sendOTPEmail,
};
