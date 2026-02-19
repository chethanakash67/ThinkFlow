const nodemailer = require('nodemailer');

// Initialize transporter with standard environment variables
const createTransporter = () => {
  // Check for required environment variables
  const config = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  };

  // Log configuration status (without exposing password)
  console.log('📧 Initializing Email Service:', {
    host: config.host || 'MISSING',
    port: config.port,
    user: config.user || 'MISSING',
    pass: config.pass ? '******' : 'MISSING'
  });

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465, // true for 465, false for other ports
    auth: {
      user: config.user,
      pass: config.pass
    },
    // optimize for delivery
    pool: true, // use pooled connections
    maxConnections: 5, // max connections
    maxMessages: 100, // max messages per connection
    // timeouts
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000, // 10 seconds
    socketTimeout: 10000, // 10 seconds
    // debug options
    debug: process.env.NODE_ENV !== 'production',
    logger: process.env.NODE_ENV !== 'production'
  });
};

// Create a singleton instance
let transporter = null;

const getTransporter = () => {
  if (!transporter) {
    transporter = createTransporter();
  }
  return transporter;
};

/**
 * Send OTP email
 */
async function sendOTPEmail(email, otp, type = 'signup') {
  const mailTransporter = getTransporter();

  // Verify connection before sending if not verified yet
  try {
    if (!mailTransporter.isIdle() && !mailTransporter.verified) {
      await mailTransporter.verify();
      mailTransporter.verified = true;
      console.log('✅ SMTP connection verified');
    }
  } catch (error) {
    console.error('❌ SMTP Connection Error:', error.message);
    // Continue anyway to try sending, might work on a fresh connection
  }

  const subject = type === 'signup'
    ? 'Verify your ThinkFlow account'
    : 'Reset your ThinkFlow password';

  const html = type === 'signup'
    ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4f46e5;">Welcome to ThinkFlow!</h2>
        <p style="font-size: 16px;">Your verification code is:</p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <h1 style="font-size: 48px; color: #4f46e5; letter-spacing: 10px; margin: 0;">${otp}</h1>
        </div>
        <p style="color: #666;">This code will expire in 10 minutes.</p>
        <p style="color: #999; font-size: 14px;">If you didn't create an account, please ignore this email.</p>
      </div>
    `
    : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4f46e5;">Password Reset Request</h2>
        <p style="font-size: 16px;">Your password reset code is:</p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <h1 style="font-size: 48px; color: #4f46e5; letter-spacing: 10px; margin: 0;">${otp}</h1>
        </div>
        <p style="color: #666;">This code will expire in 10 minutes.</p>
        <p style="color: #999; font-size: 14px;">If you didn't request a password reset, please ignore this email.</p>
      </div>
    `;

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'ThinkFlow'}" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
    to: email,
    subject: subject,
    html: html,
    text: `Your ThinkFlow ${type} verification code is: ${otp}. Valid for 10 minutes.`
  };

  try {
    const info = await mailTransporter.sendMail(mailOptions);
    console.log('✅ OTP email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Failed to send OTP email:', error);
    throw error;
  }
}

module.exports = { sendOTPEmail, getTransporter };