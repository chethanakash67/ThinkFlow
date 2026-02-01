const express = require('express');
const bcrypt = require('bcryptjs'); // ✓ Correct CommonJS import
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { sendOTPEmail } = require('../services/emailService');

const router = express.Router();

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * POST /api/auth/register
 * Step 1: Validate data, send OTP, store pending user
 */
router.post('/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    console.log('📝 Registration attempt:', { email, fullName });

    // Validation
    if (!fullName || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required' 
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email format' 
      });
    }

    // Password validation
    if (password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 8 characters' 
      });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email already registered' 
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Hash password using bcryptjs
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store pending registration
    await pool.query(
      `INSERT INTO pending_registrations (full_name, email, password_hash, otp, otp_expiry, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (email) 
       DO UPDATE SET otp = $4, otp_expiry = $5, created_at = NOW()`,
      [fullName, email.toLowerCase(), hashedPassword, otp, otpExpiry]
    );

    // Send OTP email
    try {
      await sendOTPEmail(email, otp, fullName);
      console.log('✅ OTP sent to:', email);
    } catch (emailError) {
      console.error('❌ Email sending failed:', emailError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to send OTP email. Please check your email address.' 
      });
    }

    res.status(200).json({
      success: true,
      message: 'OTP sent to your email. Please verify to complete registration.',
      requiresOTP: true
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: `Registration failed: ${error.message}` 
    });
  }
});

/**
 * POST /api/auth/verify-otp
 * Step 2: Verify OTP and create user account
 */
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    console.log('🔍 OTP verification attempt:', { email });

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and OTP are required' 
      });
    }

    // Get pending registration
    const pending = await pool.query(
      'SELECT * FROM pending_registrations WHERE email = $1',
      [email.toLowerCase()]
    );

    if (pending.rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No pending registration found' 
      });
    }

    const registration = pending.rows[0];

    // Check OTP expiry
    if (new Date() > new Date(registration.otp_expiry)) {
      return res.status(400).json({ 
        success: false, 
        message: 'OTP expired. Please register again.' 
      });
    }

    // Verify OTP
    if (registration.otp !== otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid OTP' 
      });
    }

    // Create user account
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, created_at) 
       VALUES ($1, $2, $3, NOW()) 
       RETURNING id, full_name, email, created_at`,
      [registration.full_name, registration.email, registration.password_hash]
    );

    const user = result.rows[0];

    // Delete pending registration
    await pool.query('DELETE FROM pending_registrations WHERE email = $1', [email.toLowerCase()]);

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('✅ User registered successfully:', user.email);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('❌ OTP verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: `Verification failed: ${error.message}` 
    });
  }
});

/**
 * POST /api/auth/login
 * User login
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    // Get user
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    const user = result.rows[0];

    // Verify password using bcryptjs
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: `Login failed: ${error.message}` 
    });
  }
});

/**
 * POST /api/auth/resend-otp
 * Resend OTP email
 */
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    const pending = await pool.query(
      'SELECT * FROM pending_registrations WHERE email = $1',
      [email.toLowerCase()]
    );

    if (pending.rows.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No pending registration found' 
      });
    }

    const registration = pending.rows[0];
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'UPDATE pending_registrations SET otp = $1, otp_expiry = $2 WHERE email = $3',
      [otp, otpExpiry, email.toLowerCase()]
    );

    await sendOTPEmail(email, otp, registration.full_name);

    res.json({
      success: true,
      message: 'OTP resent successfully'
    });

  } catch (error) {
    console.error('❌ Resend OTP error:', error);
    res.status(500).json({ 
      success: false, 
      message: `Failed to resend OTP: ${error.message}` 
    });
  }
});

module.exports = router;