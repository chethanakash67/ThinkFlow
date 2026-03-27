// Load environment variables FIRST
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { assertEncryptionConfigured } = require('./utils/secureData');
const authRoutes = require('./routes/auth.routes'); // ✓ Using OTP-based routes
const problemRoutes = require('../routes/problemRoutes');
const submissionRoutes = require('../routes/submissionRoutes');
const competitionRoutes = require('../routes/competitionRoutes');
const { init: initDB, pool, runMigrations } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS Configuration - Allow Vercel frontend
const allowedOrigins = [
  'http://localhost:3000',
  'https://think-flow-tau.vercel.app',
  'https://think-and-code-in-a-flow.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      // Still allow for now to debug
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/competitions', competitionRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
async function startServer() {
  try {
    assertEncryptionConfigured();
    await initDB();
    await runMigrations(); // Run migrations to add missing columns
    app.listen(PORT, () => {
      console.log('━'.repeat(60));
      console.log(`🚀 ThinkFlow Server Running`);
      console.log('━'.repeat(60));
      console.log(`📍 Port: ${PORT}`);
      console.log(`📧 SMTP: ${process.env.SMTP_USER ? '✓ Configured' : '✗ Not configured'}`);
      console.log(`🔐 JWT: ${process.env.JWT_SECRET ? '✓ Configured' : '✗ Not configured'}`);
      console.log(`🤖 Gemini AI: ${process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here' ? '✓ Configured' : '⚠️  NOT CONFIGURED'}`);

      if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
        console.log('');
        console.log('⚠️  WARNING: Gemini API Key not configured!');
        console.log('   Logic evaluation will use basic fallback (less accurate)');
        console.log('   📖 See GEMINI_SETUP.md for instructions');
        console.log('   🔗 Get free API key: https://makersuite.google.com/app/apikey');
      }

      console.log(`📊 Node: ${process.version}`);
      console.log('━'.repeat(60));
      console.log(`✅ Ready to accept connections`);
      console.log('━'.repeat(60));
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

startServer();

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled rejection:', err);
  process.exit(1);
});
