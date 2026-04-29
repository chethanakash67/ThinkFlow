// Load environment variables FIRST
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { assertEncryptionConfigured } = require('./utils/secureData');
const authRoutes = require('./routes/auth.routes'); // ✓ Using OTP-based routes
const problemRoutes = require('../routes/problemRoutes');
const submissionRoutes = require('../routes/submissionRoutes');
const competitionRoutes = require('../routes/competitionRoutes');
const logicRoutes = require('../routes/logicRoutes');
const { init: initDB, pool, runMigrations } = require('./config/db');
const { getOpenAIModel, hasOpenAIKey } = require('../services/aiClient');
const { getEmailProvider, isEmailConfigured } = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration for deployed frontends
const allowedOrigins = [
  'http://localhost:3000',
  'https://think-flow-tau.vercel.app',
  'https://think-and-code-in-a-flow.vercel.app',
  'https://thinkflow-6t7n.onrender.com',
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
app.use('/api', logicRoutes);
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
    const server = app.listen(PORT, () => {
      console.log('━'.repeat(60));
      console.log(`🚀 ThinkFlow Server Running`);
      console.log('━'.repeat(60));
      console.log(`📍 Port: ${PORT}`);
      console.log(`📧 Email: ${isEmailConfigured() ? `✓ Configured (${getEmailProvider()})` : '✗ Not configured'}`);
      console.log(`🔐 JWT: ${process.env.JWT_SECRET ? '✓ Configured' : '✗ Not configured'}`);
      console.log(`🤖 OpenAI: ${hasOpenAIKey ? `✓ Configured (${getOpenAIModel()})` : '⚠️  NOT CONFIGURED'}`);

      if (!hasOpenAIKey) {
        console.log('');
        console.log('⚠️  WARNING: OpenAI API key not configured!');
        console.log('   Logic evaluation will use basic fallback (less accurate)');
        console.log('   Add OPENAI_API_KEY to server/.env');
        console.log('   Optional: set OPENAI_MODEL to choose a different GPT model');
      }

      console.log(`📊 Node: ${process.version}`);
      console.log('━'.repeat(60));
      console.log(`✅ Ready to accept connections`);
      console.log('━'.repeat(60));
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use.`);
        console.error(`   Stop the existing process or run the server with a different PORT.`);
        console.error(`   Example: PORT=3003 npm run dev:server`);
        process.exit(1);
      }

      throw error;
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
