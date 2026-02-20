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

  try {
    const [response] = await client.send(msg);
    console.log('✅ OTP email sent via SendGrid, status:', response.statusCode);
    return { success: true, statusCode: response.statusCode };
  } catch (err) {
    const errBody = err.response?.body || err.message;
    console.error('❌ SendGrid error:', errBody);
    throw new Error(typeof errBody === 'object' ? JSON.stringify(errBody) : errBody);
  }
}

module.exports = { sendOTPEmail };