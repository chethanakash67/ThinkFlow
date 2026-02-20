/**
 * Email Service — Brevo (formerly Sendinblue) HTTP API
 * Uses the Transactional Email API (no SMTP, works on Render)
 */

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

async function sendOTPEmail(email, otp, type = 'signup') {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY environment variable is not set');
  }

  const senderName = 'ThinkFlow';
  const senderEmail = process.env.EMAIL_FROM_ADDRESS || 'noreply@thinkflow.app';

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

  const payload = {
    sender: { name: senderName, email: senderEmail },
    to: [{ email }],
    subject,
    htmlContent: html,
    textContent: `Your ThinkFlow ${type} verification code is: ${otp}. Valid for 10 minutes.`
  };

  console.log(`📧 Sending OTP email via Brevo to: ${email}`);

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('❌ Brevo API error:', data);
    throw new Error(data.message || `Brevo API responded with status ${response.status}`);
  }

  console.log('✅ OTP email sent via Brevo, messageId:', data.messageId);
  return { success: true, messageId: data.messageId };
}

module.exports = { sendOTPEmail };