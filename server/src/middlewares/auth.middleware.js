/**
 * Authentication Middleware
 * Handles JWT token verification and user authentication
 */
const jwt = require('jsonwebtoken');
const { query } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Middleware to verify JWT token
 * Attaches user object to req.user if token is valid
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Extract token from Authorization header (Bearer TOKEN)
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'Access token required. Please login to continue.' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch user from database
    const result = await query(
      'SELECT id, name, email, role, email_verified FROM users WHERE id = $1',
      [decoded.userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token. User not found.' 
      });
    }

    // Attach user to request object
    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token format.' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        error: 'Token expired. Please login again.' 
      });
    }
    console.error('Authentication error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Authentication error' 
    });
  }
};

/**
 * Middleware to check admin role
 * Must be used after authenticateToken
 */
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ 
      success: false,
      error: 'Admin access required. Insufficient permissions.' 
    });
  }
};

/**
 * Generate JWT token for user
 * @param {number} userId - User ID
 * @returns {string} JWT token
 */
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

module.exports = {
  authenticateToken,
  requireAdmin,
  generateToken,
  JWT_SECRET
};
