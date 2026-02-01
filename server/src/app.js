/**
 * Express Application Setup
 * Configures middleware, routes, and error handling
 */
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const authRoutes = require('./routes/auth.routes');
const problemRoutes = require('../routes/problemRoutes');
const submissionRoutes = require('../routes/submissionRoutes');
const { errorHandler, notFound } = require('../middleware/errorHandler');

const app = express();

// CORS Configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// Body Parser Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request Logging (development only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/submissions', submissionRoutes);

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'ThinkFlow API is running',
    timestamp: new Date().toISOString()
  });
});

// 404 Handler (must be after all routes)
app.use(notFound);

// Error Handler (must be last)
app.use(errorHandler);

module.exports = app;
