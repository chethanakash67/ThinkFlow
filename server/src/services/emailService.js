/**
 * Email Service — SendGrid HTTP API
 * Uses @sendgrid/mail (HTTPS on port 443 — works on Render)
 */
const sgMail = require('@sendgrid/mail');

const getClient = () => {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY environment variable is not set');
  }
  sgMail.setApiKey(apiKey);
  return sgMail;
};

async function sendEmail(message) {
  const client = getClient();

  try {
    const [response] = await client.send(message);
    console.log('✅ Email sent via SendGrid, status:', response.statusCode);
    return { success: true, statusCode: response.statusCode };
  } catch (err) {
    const errBody = err.response?.body || err.message;
    console.error('❌ SendGrid error:', errBody);
    throw new Error(typeof errBody === 'object' ? JSON.stringify(errBody) : errBody);
  }
}

/**
 * Send OTP email via SendGrid
 */
async function sendOTPEmail(email, otp, type = 'signup') {
  const client = getClient();

  const from = process.env.EMAIL_FROM_ADDRESS || 'chethanakash67@gmail.com';

  const subject = type === 'signup'
    ? 'Verify your ThinkFlow account'
    : 'Reset your ThinkFlow password';

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
      <h2 style="color: #4f46e5;">${heading}</h2>
      <p style="font-size: 16px;">${bodyLine}</p>
      <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <h1 style="font-size: 48px; color: #4f46e5; letter-spacing: 10px; margin: 0;">${otp}</h1>
      </div>
      <p style="color: #666;">This code will expire in 10 minutes.</p>
      <p style="color: #999; font-size: 14px;">${footerNote}</p>
    </div>
  `;

  const msg = {
    to: email,
    from,                // must be verified in SendGrid Single Sender
    subject,
    html,
    text: `Your ThinkFlow ${type} verification code is: ${otp}. Valid for 10 minutes.`,
  };

  console.log(`📧 Sending OTP email via SendGrid to: ${email}`);

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
  const from = process.env.EMAIL_FROM_ADDRESS || 'chethanakash67@gmail.com';

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
    from,
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
  const from = process.env.EMAIL_FROM_ADDRESS || 'chethanakash67@gmail.com';
  const subject = approved
    ? `Your ThinkFlow competition is live: ${competitionName}`
    : `Competition update: ${competitionName}`;

  const message = approved
    ? `Your competition "${competitionName}" has been approved and is now live on ThinkFlow.`
    : `Your competition "${competitionName}" was not approved this time.${reason ? ` Reason: ${reason}` : ''}`;

  return sendEmail({
    to: creatorEmail,
    from,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #0f172a;">Hi ${creatorName},</h2>
        <p style="color: #475569; line-height: 1.6;">${message}</p>
      </div>
    `,
    text: `Hi ${creatorName},\n\n${message}`,
  });
}

module.exports = {
  sendCompetitionApprovalRequest,
  sendCompetitionDecisionEmail,
  sendEmail,
  sendOTPEmail,
};
