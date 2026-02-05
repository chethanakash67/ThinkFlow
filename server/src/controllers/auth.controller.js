/**
 * Authentication Controller
 * Handles user registration, login, and authentication-related operations with OTP verification
 */
const bcrypt = require('bcrypt');
const { query } = require('../config/db');
const { generateToken } = require('../middlewares/auth.middleware');
const { validationResult } = require('express-validator');
const nodemailer = require('nodemailer');

/**
 * Generate 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Initialize email transporter
 * Logs clear errors if configuration is missing
 */
const getTransporter = () => {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const emailFrom = process.env.EMAIL_FROM || smtpUser;

  console.log('📧 Email configuration check:');
  console.log(`  SMTP_HOST: ${smtpHost ? '✅ Set' : '❌ Missing'}`);
  console.log(`  SMTP_PORT: ${smtpPort ? `✅ ${smtpPort}` : '❌ Missing'}`);
  console.log(`  SMTP_USER: ${smtpUser ? '✅ Set' : '❌ Missing'}`);
  console.log(`  SMTP_PASS: ${smtpPass ? '✅ Set' : '❌ Missing'}`);
  console.log(`  EMAIL_FROM: ${emailFrom ? `✅ ${emailFrom}` : '❌ Missing'}`);

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.error('❌ Email configuration incomplete!');
    console.error('Required environment variables:');
    console.error('  SMTP_HOST (required)');
    console.error('  SMTP_PORT (optional, defaults to 587)');
    console.error('  SMTP_USER (required)');
    console.error('  SMTP_PASS (required)');
    console.error('  EMAIL_FROM (optional, defaults to SMTP_USER)');
    return null;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    connectionTimeout: 30000, // 30 seconds for production
    greetingTimeout: 30000,
    socketTimeout: 30000,
  });

  console.log(`✅ Email transporter configured: ${smtpHost}:${smtpPort}`);
  return transporter;
};

/**
 * Send OTP email
 */
const sendOTPEmail = async (email, otp, type) => {
  const transporter = getTransporter();
  
  if (!transporter) {
    throw new Error('Email service not configured. Please set SMTP environment variables.');
  }

  const emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER;
  
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

  try {
    console.log(`📧 Sending ${type} OTP email to ${email}...`);
    const info = await transporter.sendMail({
      from: `"ThinkFlow" <${emailFrom}>`,
      to: email,
      subject,
      html,
    });
    console.log(`✅ OTP email sent successfully!`);
    console.log(`📬 Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to send OTP email:');
    console.error('  Error:', error.message);
    console.error('  Code:', error.code);
    console.error('  Command:', error.command);
    
    // Provide more specific error messages
    if (error.code === 'EAUTH') {
      throw new Error('Email authentication failed. Check SMTP_USER and SMTP_PASS in .env file.');
    } else if (error.code === 'ECONNECTION' || error.code === 'ESOCKET') {
      throw new Error('Cannot connect to email server. Check SMTP_HOST and SMTP_PORT.');
    } else if (error.code === 'ETIMEDOUT') {
      throw new Error('Email server connection timed out. Try again later.');
    } else {
      throw new Error(`Email error: ${error.message}`);
    }
  }
};

/**
 * User Signup - Step 1: Send OTP
 * POST /api/auth/signup
 */
const signup = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        error: errors.array()[0].msg || 'Validation failed'
      });
    }

    const { name, email, password } = req.body;

    // Normalize email
    const normalizedEmail = email.trim().toLowerCase();

    console.log(`\n📝 Signup request for: ${normalizedEmail}`);

    // Check if user already exists
    let existingUser;
    try {
      existingUser = await query('SELECT id, email_verified FROM users WHERE email = $1', [normalizedEmail]);
    } catch (dbError) {
      console.error('❌ Database error checking user:', dbError.message);
      return res.status(500).json({
        success: false,
        error: 'Database error. Please try again later.'
      });
    }

    if (existingUser.rows.length > 0) {
      if (existingUser.rows[0].email_verified) {
        return res.status(400).json({ 
          success: false,
          error: 'Email already registered. Please login instead.'
        });
      }
      // User exists but not verified - allow resending OTP
      console.log(`  ℹ️  Email exists but not verified - updating OTP`);
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Generate OTP
    const otpCode = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    console.log(`  🔐 Generated OTP: ${otpCode}`);
    console.log(`  ⏰ Expires: ${otpExpires.toLocaleString()}`);

    // Store user data (or update if exists)
    try {
      if (existingUser.rows.length > 0) {
        // Update existing unverified user
        await query(
          `UPDATE users 
           SET name = $1, password_hash = $2, otp_code = $3, otp_expires = $4, otp_type = 'signup'
           WHERE email = $5`,
          [name.trim(), passwordHash, otpCode, otpExpires, normalizedEmail]
        );
        console.log(`  ✅ Updated user record`);
      } else {
        // Insert new user (not verified yet)
        await query(
          `INSERT INTO users (name, email, password_hash, otp_code, otp_expires, otp_type, email_verified)
           VALUES ($1, $2, $3, $4, $5, 'signup', FALSE)`,
          [name.trim(), normalizedEmail, passwordHash, otpCode, otpExpires]
        );
        console.log(`  ✅ Created new user record`);
      }
    } catch (dbError) {
      console.error('❌ Database error saving user:', dbError.message, dbError.code);
      return res.status(500).json({
        success: false,
        error: 'Failed to create account. Please try again.'
      });
    }

    // Check if SMTP is configured
    const smtpConfigured = process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_HOST;
    console.log(`  📧 SMTP configured: ${smtpConfigured ? 'Yes' : 'No'}`);

    if (!smtpConfigured) {
      // Auto-verify user when SMTP is not configured
      console.log(`  ℹ️  SMTP not configured - auto-verifying user`);
      
      await query('UPDATE users SET email_verified = TRUE, otp_code = NULL WHERE email = $1', [normalizedEmail]);
      
      const userResult = await query('SELECT id, name, email, role FROM users WHERE email = $1', [normalizedEmail]);
      const user = userResult.rows[0];
      const token = generateToken(user.id);
      
      console.log(`✅ User auto-verified (SMTP not configured)\n`);
      
      return res.json({
        success: true,
        message: 'Account created successfully!',
        autoVerified: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        }
      });
    }

    // Send OTP email
    try {
      await sendOTPEmail(normalizedEmail, otpCode, 'signup');
      console.log(`✅ OTP email sent to ${normalizedEmail}\n`);
    } catch (emailError) {
      console.error(`\n⚠️  EMAIL SEND FAILED:`, emailError.message);
      
      // Email failed - auto-verify the user so they can still use the app
      console.log(`  ℹ️  Email failed - auto-verifying user`);
      
      await query('UPDATE users SET email_verified = TRUE, otp_code = NULL WHERE email = $1', [normalizedEmail]);
      
      const userResult = await query('SELECT id, name, email, role FROM users WHERE email = $1', [normalizedEmail]);
      const user = userResult.rows[0];
      const token = generateToken(user.id);
      
      return res.json({
        success: true,
        message: 'Account created successfully!',
        autoVerified: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        }
      });
    }

    res.json({
      success: true,
      message: 'Verification code sent to your email. Please check your inbox (and spam folder).',
    });
  } catch (error) {
    console.error('\n❌ Signup error:', error.message);
    console.error('Stack:', error.stack);
    console.error('Error code:', error.code);
    console.error('Error detail:', error.detail);
    
    // Provide detailed error messages for debugging
    let errorMessage = 'Registration failed. Please try again.';
    
    // PostgreSQL error codes
    if (error.code === '23505') {
      errorMessage = 'Email already registered. Please use a different email or login.';
    } else if (error.code === '42P01') {
      errorMessage = 'Database configuration error. Please contact support. (Table does not exist)';
      console.error('⚠️  CRITICAL: users table does not exist! Check schema.sql');
    } else if (error.code === '42703') {
      errorMessage = 'Database configuration error. Please contact support. (Column does not exist)';
      console.error('⚠️  CRITICAL: Column missing in users table! Check schema.sql');
    } else if (error.message) {
      // In development, expose the real error
      if (process.env.NODE_ENV === 'development') {
        errorMessage = error.message;
      }
    }
    
    res.status(500).json({ 
      success: false,
      error: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { debug: error.message })
    });
  }
};

/**
 * Verify OTP - Step 2: Verify and activate account
 * POST /api/auth/verify-otp
 */
const verifyOTP = async (req, res) => {
  try {
    const { email, otp, type } = req.body;

    if (!email || !otp || !type) {
      return res.status(400).json({
        success: false,
        error: 'Email, OTP, and type are required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedOtp = otp.trim();

    console.log(`\n🔍 Verifying OTP for ${normalizedEmail} (type: ${type})`);

    // Find user with matching OTP
    const result = await query(
      `SELECT id, name, email, password_hash, otp_code, otp_expires, otp_type, email_verified
       FROM users WHERE email = $1 AND otp_code = $2 AND otp_type = $3`,
      [normalizedEmail, normalizedOtp, type]
    );

    if (result.rows.length === 0) {
      console.log(`  ❌ Invalid OTP`);
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP code',
      });
    }

    const user = result.rows[0];

    // Check if OTP expired
    if (new Date(user.otp_expires) < new Date()) {
      console.log(`  ❌ OTP expired`);
      return res.status(400).json({
        success: false,
        error: 'OTP has expired. Please request a new one.',
      });
    }

    // Verify and activate account
    await query(
      `UPDATE users 
       SET email_verified = TRUE, otp_code = NULL, otp_expires = NULL, otp_type = NULL
       WHERE id = $1`,
      [user.id]
    );

    console.log(`  ✅ Email verified successfully`);

    // Generate token for auto-login
    const token = generateToken(user.id);

    console.log(`✅ OTP verification successful for ${normalizedEmail}\n`);

    res.json({
      success: true,
      message: 'Email verified successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'user',
        emailVerified: true,
      },
    });
  } catch (error) {
    console.error('\n❌ OTP verification error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to verify OTP',
    });
  }
};

/**
 * Resend OTP
 * POST /api/auth/resend-otp
 */
const resendOTP = async (req, res) => {
  try {
    const { email, type } = req.body;

    if (!email || !type) {
      return res.status(400).json({
        success: false,
        error: 'Email and type are required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    console.log(`\n🔄 Resending OTP to ${normalizedEmail} (type: ${type})`);

    // Check if user exists
    const result = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    console.log(`  🔐 New OTP: ${otpCode}`);

    // Update OTP
    await query(
      `UPDATE users SET otp_code = $1, otp_expires = $2, otp_type = $3 WHERE email = $4`,
      [otpCode, otpExpires, type, normalizedEmail]
    );

    // Send OTP email
    try {
      await sendOTPEmail(normalizedEmail, otpCode, type);
    } catch (emailError) {
      console.error(`\n❌ Email send failed:`, emailError.message);
      return res.status(500).json({
        success: false,
        error: `Unable to send OTP: ${emailError.message}`,
      });
    }

    console.log(`✅ OTP resent successfully\n`);

    res.json({
      success: true,
      message: 'New verification code sent to your email',
    });
  } catch (error) {
    console.error('\n❌ Resend OTP error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to resend OTP',
    });
  }
};

/**
 * User Signin
 * POST /api/auth/signin
 */
const signin = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        error: errors.array()[0].msg || 'Validation failed'
      });
    }

    const { email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    console.log(`\n🔐 Sign in attempt for: ${normalizedEmail}`);

    // Find user
    const result = await query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (result.rows.length === 0) {
      console.log(`  ❌ User not found`);
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password'
      });
    }

    const user = result.rows[0];

    // Check if email is verified
    if (!user.email_verified) {
      console.log(`  ❌ Email not verified`);
      return res.status(403).json({
        success: false,
        error: 'Please verify your email first. Check your inbox for the verification code.',
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      console.log(`  ❌ Invalid password`);
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Generate JWT token
    const token = generateToken(user.id);

    console.log(`  ✅ Sign in successful\n`);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.email_verified,
      },
    });
  } catch (error) {
    console.error('\n❌ Signin error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Login failed. Please try again.'
    });
  }
};

/**
 * Get Current User
 * GET /api/auth/me (protected)
 */
const getMe = async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, email, role, email_verified, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: result.rows[0].id,
        name: result.rows[0].name,
        email: result.rows[0].email,
        role: result.rows[0].role,
        emailVerified: result.rows[0].email_verified,
        createdAt: result.rows[0].created_at,
      },
    });
  } catch (error) {
    console.error('Get current user error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get user information'
    });
  }
};

/**
 * Request Password Reset - Step 1: Send OTP
 * POST /api/auth/forgot-password
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log(`\n🔐 Password reset requested for: ${normalizedEmail}`);

    const result = await query('SELECT id FROM users WHERE email = $1 AND email_verified = TRUE', [normalizedEmail]);
    if (result.rows.length === 0) {
      // Don't reveal if email exists for security
      console.log(`  ℹ️  Email not found or not verified`);
      return res.json({ 
        success: true,
        message: 'If this email is registered, a reset code has been sent'
      });
    }

    // Generate OTP
    const otpCode = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    
    console.log(`  🔐 Generated OTP: ${otpCode}`);

    // Store OTP
    await query(
      `UPDATE users SET otp_code = $1, otp_expires = $2, otp_type = 'forgot-password' WHERE email = $3`,
      [otpCode, otpExpires, normalizedEmail]
    );

    // Send OTP email
    try {
      await sendOTPEmail(normalizedEmail, otpCode, 'forgot-password');
    } catch (emailError) {
      console.error(`\n❌ Email send failed:`, emailError.message);
      return res.status(500).json({
        success: false,
        error: `Unable to send reset code: ${emailError.message}`,
      });
    }

    console.log(`✅ Password reset code sent\n`);

    res.json({ 
      success: true,
      message: 'If this email is registered, a reset code has been sent'
    });
  } catch (error) {
    console.error('\n❌ Password reset request error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to process password reset request'
    });
  }
};

/**
 * Reset Password - Step 2: Verify OTP and reset password
 * POST /api/auth/reset-password
 */
const resetPassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false,
        error: errors.array()[0].msg || 'Validation failed'
      });
    }

    const { email, otp, password } = req.body;

    if (!email || !otp || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email, OTP, and password are required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    console.log(`\n🔐 Password reset for: ${normalizedEmail}`);

    // Verify OTP
    const result = await query(
      `SELECT id FROM users 
       WHERE email = $1 AND otp_code = $2 AND otp_type = 'forgot-password' AND otp_expires > NOW()`,
      [normalizedEmail, otp]
    );

    if (result.rows.length === 0) {
      console.log(`  ❌ Invalid or expired OTP`);
      return res.status(400).json({ 
        success: false,
        error: 'Invalid or expired reset code'
      });
    }

    // Hash new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Update password and clear OTP
    await query(
      `UPDATE users 
       SET password_hash = $1, otp_code = NULL, otp_expires = NULL, otp_type = NULL,
           password_reset_token = NULL, password_reset_expires = NULL
       WHERE id = $2`,
      [passwordHash, result.rows[0].id]
    );

    console.log(`  ✅ Password reset successful\n`);

    res.json({ 
      success: true,
      message: 'Password reset successfully. You can now login with your new password.'
    });
  } catch (error) {
    console.error('\n❌ Password reset error:', error.message);
    res.status(500).json({ 
      success: false,
      error: 'Failed to reset password'
    });
  }
};

/**
 * Verify Reset OTP - Step 2 (intermediate): Validate OTP without clearing it
 * POST /api/auth/verify-reset-otp
 */
const verifyResetOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        error: 'Email and OTP are required',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedOtp = otp.trim();

    console.log(`\n🔍 Verifying reset OTP for ${normalizedEmail}`);

    // Find user with matching OTP
    const result = await query(
      `SELECT id, otp_code, otp_expires, otp_type
       FROM users WHERE email = $1 AND otp_code = $2 AND otp_type = 'forgot-password'`,
      [normalizedEmail, normalizedOtp]
    );

    if (result.rows.length === 0) {
      console.log(`  ❌ Invalid OTP`);
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP. Please try again.',
      });
    }

    const user = result.rows[0];

    // Check if OTP expired
    if (new Date(user.otp_expires) < new Date()) {
      console.log(`  ❌ OTP expired`);
      return res.status(400).json({
        success: false,
        error: 'OTP has expired. Please request a new one.',
      });
    }

    console.log(`  ✅ Reset OTP verified successfully\n`);

    // Don't clear the OTP here - it will be used in reset-password step
    res.json({
      success: true,
      message: 'OTP verified successfully. You can now reset your password.',
    });
  } catch (error) {
    console.error('\n❌ Reset OTP verification error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to verify OTP',
    });
  }
};

module.exports = {
  signup,
  signin,
  getMe,
  verifyOTP,
  resendOTP,
  forgotPassword,
  resetPassword,
  verifyResetOtp,
};