const express = require('express');
const router = express.Router();
const submissionController = require('../controllers/submissionController');
const { authenticateToken } = require('../src/middlewares/auth.middleware');

// All routes require authentication
router.use(authenticateToken);

router.post('/logic', submissionController.submitLogic);
router.get('/logic', submissionController.getSubmissions);
router.get('/logic/:submissionId/steps', submissionController.getExecutionSteps);
router.post('/code', submissionController.submitCode);
router.get('/dashboard', submissionController.getDashboardStats);

module.exports = router;
