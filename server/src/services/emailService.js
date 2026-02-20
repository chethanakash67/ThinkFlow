/**
 * Email Service — Nodemailer + Gmail SMTP
 */
const nodemailer = require('nodemailer');

// Create a reusable transporter using Gmail SMTP
const createTransporter = () => {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be set in .env');
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for 587 (STARTTLS)
    auth: { user, pass },
  });
};

/**
 * Send OTP email via Gmail SMTP using Nodemailer
 */
async function sendOTPEmail(email, otp, type = 'signup') {
  const transporter = createTransporter();

  const from = `"ThinkFlow" <${process.env.SMTP_USER}>`;

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

  console.log(`📧 Sending OTP email via Gmail SMTP to: ${email}`);

  try {
    const info = await transporter.sendMail({
      from,
      to: email,
      subject,
      html,
      text: `Your ThinkFlow ${type} verification code is: ${otp}. Valid for 10 minutes.`,
    });

    console.log('✅ OTP email sent via Gmail SMTP, messageId:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('❌ Failed to send OTP email via SMTP:', err.message);
    throw err;
  }
}

module.exports = { sendOTPEmail };