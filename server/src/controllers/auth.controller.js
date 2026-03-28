/**
 * Authentication Controller
 * Handles user registration, login, and authentication-related operations with OTP verification
 */
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query } = require('../config/db');
const { generateToken } = require('../middlewares/auth.middleware');
const { validationResult } = require('express-validator');
const nodemailer = require('nodemailer');
const { getUserPointsSummary, getUserRanks } = require('../../services/gamificationService');
const {
  decryptText,
  encryptText,
  hashLookupValue,
  hashOtp,
  verifyStoredOtp,
} = require('../utils/secureData');


const { sendOTPEmail } = require('../services/emailService');
let OAuth2Client;
try {
  ({ OAuth2Client } = require('google-auth-library'));
} catch (error) {
  OAuth2Client = null;
}

const googleClient = process.env.GOOGLE_CLIENT_ID
  && OAuth2Client
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

/**
 * Generate 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const normalizeEmail = (email) => email.trim().toLowerCase();

const userSelectColumns = `
  id,
  name,
  email,
  email_encrypted,
  email_sha256,
  password_hash,
  role,
  bio,
  bio_encrypted,
  country,
  country_encrypted,
  github_url,
  github_url_encrypted,
  preferred_language,
  email_verified,
  otp_code,
  otp_expires,
  otp_type,
  created_at
`;

const hydrateUserRow = (user) => ({
  ...user,
  email: decryptText(user.email_encrypted || user.email),
  bio: decryptText(user.bio_encrypted || user.bio),
  country: decryptText(user.country_encrypted || user.country),
  github_url: decryptText(user.github_url_encrypted || user.github_url),
});

const buildActivitySummary = (rows = []) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dayMap = new Map();
  rows.forEach((row) => {
    const key = row.activity_date instanceof Date
      ? row.activity_date.toISOString().slice(0, 10)
      : String(row.activity_date).slice(0, 10);
    dayMap.set(key, parseInt(row.activity_count, 10) || 0);
  });

  let currentStreak = 0;
  let maxStreak = 0;
  let runningStreak = 0;

  for (let offset = 364; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    const count = dayMap.get(key) || 0;

    if (count > 0) {
      runningStreak += 1;
      maxStreak = Math.max(maxStreak, runningStreak);
    } else {
      runningStreak = 0;
    }
  }

  for (let offset = 0; offset < 365; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = date.toISOString().slice(0, 10);
    if ((dayMap.get(key) || 0) > 0) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  return {
    calendar: rows.map((row) => ({
      date: row.activity_date instanceof Date
        ? row.activity_date.toISOString().slice(0, 10)
        : String(row.activity_date).slice(0, 10),
      count: parseInt(row.activity_count, 10) || 0,
    })),
    totalActiveDays: rows.length,
    totalSubmissions: rows.reduce((sum, row) => sum + (parseInt(row.activity_count, 10) || 0), 0),
    currentStreak,
    maxStreak,
  };
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
    const normalizedEmail = normalizeEmail(email);
    const emailHash = hashLookupValue(normalizedEmail);

    console.log(`\n📝 Signup request for: ${normalizedEmail}`);

    // Check if user already exists
    let existingUser;
    try {
      existingUser = await query(
        'SELECT id, email_verified FROM users WHERE email_sha256 = $1',
        [emailHash]
      );
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

    const otpHash = await hashOtp(otpCode);
    console.log('  🔐 Generated signup OTP');
    console.log(`  ⏰ Expires: ${otpExpires.toLocaleString()}`);

    // Store user data (or update if exists)
    try {
      if (existingUser.rows.length > 0) {
        // Update existing unverified user
        await query(
          `UPDATE users 
           SET name = $1, email_encrypted = $2, email_sha256 = $3, password_hash = $4, otp_code = $5, otp_expires = $6, otp_type = 'signup'
           WHERE id = $7`,
          [name.trim(), encryptText(normalizedEmail), emailHash, passwordHash, otpHash, otpExpires, existingUser.rows[0].id]
        );
        console.log(`  ✅ Updated user record`);
      } else {
        // Insert new user (not verified yet)
        await query(
          `INSERT INTO users (name, email_encrypted, email_sha256, password_hash, otp_code, otp_expires, otp_type, email_verified)
           VALUES ($1, $2, $3, $4, $5, $6, 'signup', FALSE)`,
          [name.trim(), encryptText(normalizedEmail), emailHash, passwordHash, otpHash, otpExpires]
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

    // Check if email service is configured (SendGrid HTTP API)
    const sendgridConfigured = !!process.env.SENDGRID_API_KEY;
    const emailConfigured = sendgridConfigured;

    console.log(`  📧 Email configured: ${emailConfigured ? 'Yes' : 'No'} (SendGrid: ${sendgridConfigured})`);

    if (!emailConfigured) {
      // No email service configured - return error, don't auto-verify
      console.log(`  ❌ No email service configured - cannot send OTP`);
      return res.status(503).json({
        success: false,
        error: 'Email service not configured. Please contact support.'
      });
    }

    // Send OTP email
    try {
      await sendOTPEmail(normalizedEmail, otpCode, 'signup');
      console.log(`✅ OTP email sent to ${normalizedEmail}\n`);

      res.json({
        success: true,
        message: 'Verification code sent to your email. Please check your inbox (and spam folder).',
      });
    } catch (emailError) {
      console.error(`\n❌ EMAIL SEND FAILED:`, emailError.message);

      // Email failed - return error, don't auto-verify
      return res.status(503).json({
        success: false,
        error: 'Unable to send verification email. Please try again later.',
        details: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }
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

    const normalizedEmail = normalizeEmail(email);
    const normalizedOtp = otp.trim();

    console.log(`\n🔍 Verifying OTP for ${normalizedEmail} (type: ${type})`);

    // Find user with matching OTP
    const result = await query(
      `SELECT ${userSelectColumns}
       FROM users WHERE email_sha256 = $1 AND otp_type = $2`,
      [hashLookupValue(normalizedEmail), type]
    );

    if (result.rows.length === 0) {
      console.log(`  ❌ Invalid OTP`);
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP code',
      });
    }

    const user = hydrateUserRow(result.rows[0]);
    const isValidOtp = await verifyStoredOtp(user.otp_code, normalizedOtp);

    if (!isValidOtp) {
      console.log(`  ❌ Invalid OTP`);
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP code',
      });
    }

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

    const normalizedEmail = normalizeEmail(email);

    console.log(`\n🔄 Resending OTP to ${normalizedEmail} (type: ${type})`);

    // Check if user exists
    const result = await query('SELECT id FROM users WHERE email_sha256 = $1', [hashLookupValue(normalizedEmail)]);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    const otpHash = await hashOtp(otpCode);
    console.log('  🔐 Generated resend OTP');

    // Update OTP
    await query(
      `UPDATE users SET otp_code = $1, otp_expires = $2, otp_type = $3 WHERE id = $4`,
      [otpHash, otpExpires, type, result.rows[0].id]
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
    const normalizedEmail = normalizeEmail(email);

    console.log(`\n🔐 Sign in attempt for: ${normalizedEmail}`);

    // Find user
    const result = await query(`SELECT ${userSelectColumns} FROM users WHERE email_sha256 = $1`, [hashLookupValue(normalizedEmail)]);
    if (result.rows.length === 0) {
      console.log(`  ❌ User not found`);
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const user = hydrateUserRow(result.rows[0]);

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
 * Google Sign-In
 * POST /api/auth/google-signin
 */
const googleSignin = async (req, res) => {
  try {
    if (!OAuth2Client) {
      return res.status(503).json({
        success: false,
        error: 'Google sign-in dependency is missing. Install server dependencies and try again.'
      });
    }

    if (!googleClient || !process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({
        success: false,
        error: 'Google sign-in is not configured.'
      });
    }

    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: 'Google ID token is required'
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      return res.status(400).json({
        success: false,
        error: 'Google account email is missing'
      });
    }

    if (!payload.email_verified) {
      return res.status(400).json({
        success: false,
        error: 'Google email is not verified'
      });
    }

    const normalizedEmail = normalizeEmail(payload.email);
    const googleName = (payload.name || normalizedEmail.split('@')[0]).trim();

    let userResult = await query(
      `SELECT ${userSelectColumns} FROM users WHERE email_sha256 = $1`,
      [hashLookupValue(normalizedEmail)]
    );

    let user;
    if (userResult.rows.length > 0) {
      user = hydrateUserRow(userResult.rows[0]);

      if (!user.email_verified) {
        await query(
          `UPDATE users
           SET email_verified = TRUE, otp_code = NULL, otp_expires = NULL, otp_type = NULL
           WHERE id = $1`,
          [user.id]
        );
        user.email_verified = true;
      }
    } else {
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 10);

      const createdUser = await query(
        `INSERT INTO users (name, email_encrypted, email_sha256, password_hash, email_verified)
         VALUES ($1, $2, $3, $4, TRUE)
         RETURNING ${userSelectColumns}`,
        [googleName, encryptText(normalizedEmail), hashLookupValue(normalizedEmail), passwordHash]
      );

      user = hydrateUserRow(createdUser.rows[0]);
    }

    const token = generateToken(user.id);

    return res.json({
      success: true,
      message: 'Google sign-in successful',
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
    console.error('\n❌ Google signin error:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Google sign-in failed. Please try again.'
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
      `SELECT ${userSelectColumns}
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = hydrateUserRow(result.rows[0]);

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        bio: user.bio,
        country: user.country,
        githubUrl: user.github_url,
        preferredLanguage: user.preferred_language,
        emailVerified: user.email_verified,
        createdAt: user.created_at,
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

const getProfile = async (req, res) => {
  try {
    const userResult = await query(
      `SELECT ${userSelectColumns}
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const competitionResult = await query(
      `SELECT COUNT(*) AS joined_competitions
       FROM competition_participants
       WHERE user_id = $1`,
      [req.user.id]
    );

    const problemResult = await query(
      `SELECT COUNT(DISTINCT problem_id) AS solved_problems
       FROM logic_submissions
       WHERE user_id = $1 AND status = 'correct'`,
      [req.user.id]
    );

    const languageResult = await query(
      `SELECT language, COUNT(*)::int AS usage_count
       FROM code_submissions
       WHERE user_id = $1
       GROUP BY language
       ORDER BY usage_count DESC, language ASC
       LIMIT 1`,
      [req.user.id]
    );

    const successRateResult = await query(
      `SELECT
         COUNT(*)::int AS total_submissions,
         COALESCE(SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END), 0)::int AS correct_submissions
       FROM logic_submissions
       WHERE user_id = $1`,
      [req.user.id]
    );

    const totalSubmissions = successRateResult.rows[0]?.total_submissions || 0;
    const correctSubmissions = successRateResult.rows[0]?.correct_submissions || 0;
    const successRate = totalSubmissions > 0 ? Math.round((correctSubmissions / totalSubmissions) * 100) : 0;

    const [gamification, ranks] = await Promise.all([
      getUserPointsSummary(req.user.id),
      getUserRanks(req.user.id),
    ]);

    const activityResult = await query(
      `WITH combined_activity AS (
         SELECT created_at
         FROM logic_submissions
         WHERE user_id = $1
         UNION ALL
         SELECT created_at
         FROM code_submissions
         WHERE user_id = $1
       )
       SELECT DATE(created_at) AS activity_date,
              COUNT(*)::int AS activity_count
       FROM combined_activity
       WHERE created_at >= CURRENT_DATE - INTERVAL '364 days'
       GROUP BY DATE(created_at)
       ORDER BY activity_date ASC`,
      [req.user.id]
    );

    const user = hydrateUserRow(userResult.rows[0]);
    const activity = buildActivitySummary(activityResult.rows);

    return res.json({
      success: true,
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        bio: user.bio || '',
        country: user.country || '',
        githubUrl: user.github_url || '',
        preferredLanguage: user.preferred_language || languageResult.rows[0]?.language || '',
        emailVerified: user.email_verified,
        createdAt: user.created_at,
      },
      metrics: {
        joinedCompetitions: parseInt(competitionResult.rows[0].joined_competitions, 10) || 0,
        solvedProblems: parseInt(problemResult.rows[0].solved_problems, 10) || 0,
        topLanguage: languageResult.rows[0]?.language || user.preferred_language || null,
      },
      stats: {
        problemsSolved: gamification.solvedCount,
        competitionsJoined: parseInt(competitionResult.rows[0].joined_competitions, 10) || 0,
        successRate,
        totalPoints: gamification.totalPoints,
        weeklyPoints: gamification.weeklyPoints,
      },
      activity,
      rankings: ranks,
      badges: gamification.badges,
    });
  } catch (error) {
    console.error('Get profile error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch profile',
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const {
      name,
      bio = '',
      country = '',
      githubUrl = '',
      preferredLanguage = '',
    } = req.body;

    const trimmedName = (name || '').trim();
    const trimmedBio = bio.trim().slice(0, 500);
    const trimmedCountry = country.trim().slice(0, 120);
    const trimmedGithubUrl = githubUrl.trim().slice(0, 255);
    const trimmedPreferredLanguage = preferredLanguage.trim().slice(0, 50);

    if (trimmedName.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Name must be at least 2 characters long',
      });
    }

    if (trimmedGithubUrl && !/^https?:\/\//i.test(trimmedGithubUrl)) {
      return res.status(400).json({
        success: false,
        error: 'GitHub URL must start with http:// or https://',
      });
    }

    const result = await query(
      `UPDATE users
       SET name = $1,
           bio = NULL,
           bio_encrypted = $2,
           country = NULL,
           country_encrypted = $3,
           github_url = NULL,
           github_url_encrypted = $4,
           preferred_language = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING ${userSelectColumns}`,
      [
        trimmedName,
        encryptText(trimmedBio || null),
        encryptText(trimmedCountry || null),
        encryptText(trimmedGithubUrl || null),
        trimmedPreferredLanguage || null,
        req.user.id,
      ]
    );

    const user = hydrateUserRow(result.rows[0]);

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        bio: user.bio || '',
        country: user.country || '',
        githubUrl: user.github_url || '',
        preferredLanguage: user.preferred_language || '',
        emailVerified: user.email_verified,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to update profile',
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

    const normalizedEmail = normalizeEmail(email);
    console.log(`\n🔐 Password reset requested for: ${normalizedEmail}`);

    const result = await query(
      'SELECT id FROM users WHERE email_sha256 = $1 AND email_verified = TRUE',
      [hashLookupValue(normalizedEmail)]
    );
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

    const otpHash = await hashOtp(otpCode);
    console.log('  🔐 Generated password reset OTP');

    // Store OTP
    await query(
      `UPDATE users SET otp_code = $1, otp_expires = $2, otp_type = 'forgot-password' WHERE id = $3`,
      [otpHash, otpExpires, result.rows[0].id]
    );

    // Send OTP email
    try {
      await sendOTPEmail(normalizedEmail, otpCode, 'forgot-password');
      console.log(`✅ Password reset code sent\n`);

      return res.json({
        success: true,
        emailSent: true,
        message: 'Password reset code sent to your email'
      });
    } catch (emailError) {
      // Log the detailed error for debugging
      console.error(`\n❌ Email send failed:`, emailError.message);
      // Return success: false with a user-friendly error so the UI doesn't advance to OTP step
      // This is important - we need to tell the user the email couldn't be sent
      return res.status(503).json({
        success: false,
        emailSent: false,
        error: 'Unable to send email. Please try again later or contact support.',
        details: process.env.NODE_ENV === 'development' ? emailError.message : undefined
      });
    }
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

    const normalizedEmail = normalizeEmail(email);

    console.log(`\n🔐 Password reset for: ${normalizedEmail}`);

    // Verify OTP
    const result = await query(
      `SELECT id, otp_code, otp_expires FROM users 
       WHERE email_sha256 = $1 AND otp_type = 'forgot-password' AND otp_expires > NOW()`,
      [hashLookupValue(normalizedEmail)]
    );

    if (result.rows.length === 0) {
      console.log(`  ❌ Invalid or expired OTP`);
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset code'
      });
    }

    const isValidOtp = await verifyStoredOtp(result.rows[0].otp_code, otp);
    if (!isValidOtp) {
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

    const normalizedEmail = normalizeEmail(email);
    const normalizedOtp = otp.trim();

    console.log(`\n🔍 Verifying reset OTP for ${normalizedEmail}`);

    // Find user with matching OTP
    const result = await query(
      `SELECT id, otp_code, otp_expires, otp_type
       FROM users WHERE email_sha256 = $1 AND otp_type = 'forgot-password'`,
      [hashLookupValue(normalizedEmail)]
    );

    if (result.rows.length === 0) {
      console.log(`  ❌ Invalid OTP`);
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP. Please try again.',
      });
    }

    const user = result.rows[0];
    const isValidOtp = await verifyStoredOtp(user.otp_code, normalizedOtp);

    if (!isValidOtp) {
      console.log(`  ❌ Invalid OTP`);
      return res.status(400).json({
        success: false,
        error: 'Invalid OTP. Please try again.',
      });
    }

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
  googleSignin,
  getMe,
  getProfile,
  updateProfile,
  verifyOTP,
  resendOTP,
  forgotPassword,
  resetPassword,
  verifyResetOtp,
};
