/**
 * Authentication Routes
 * Defines all authentication-related endpoints
 */
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { authenticateToken } = require('../middlewares/auth.middleware');

// Validation rules
const signupValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Name must be between 2 and 255 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
];

const signinValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

const verifyOTPValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits')
    .matches(/^\d{6}$/)
    .withMessage('OTP must contain only numbers'),
  body('type')
    .isIn(['signup', 'forgot-password'])
    .withMessage('Invalid OTP type'),
];

const resetPasswordValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .withMessage('OTP must be 6 digits')
    .matches(/^\d{6}$/)
    .withMessage('OTP must contain only numbers'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
];

const resendOTPValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Invalid email address'),
  body('type')
    .isIn(['signup', 'forgot-password'])
    .withMessage('Invalid OTP type'),
];

const googleSigninValidation = [
  body('idToken')
    .isString()
    .notEmpty()
    .withMessage('Google ID token is required'),
];

const updateProfileValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Name must be between 2 and 255 characters'),
  body('bio')
    .optional({ nullable: true })
    .isLength({ max: 500 })
    .withMessage('Bio must be 500 characters or fewer'),
  body('country')
    .optional({ nullable: true })
    .isLength({ max: 120 })
    .withMessage('Country must be 120 characters or fewer'),
  body('githubUrl')
    .optional({ nullable: true, checkFalsy: true })
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('GitHub URL must be a valid http(s) URL'),
  body('preferredLanguage')
    .optional({ nullable: true })
    .isLength({ max: 50 })
    .withMessage('Preferred language must be 50 characters or fewer'),
];

// Routes
router.post('/signup', signupValidation, authController.signup);
router.post('/signin', signinValidation, authController.signin);
router.post('/google-signin', googleSigninValidation, authController.googleSignin);
router.post('/verify-otp', verifyOTPValidation, authController.verifyOTP);
router.post('/resend-otp', resendOTPValidation, authController.resendOTP);
router.get('/me', authenticateToken, authController.getMe);
router.get('/profile', authenticateToken, authController.getProfile);
router.put('/profile', authenticateToken, updateProfileValidation, authController.updateProfile);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-reset-otp', authController.verifyResetOtp);
router.post('/reset-password', resetPasswordValidation, authController.resetPassword);

module.exports = router;
