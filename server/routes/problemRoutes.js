const express = require('express');
const router = express.Router();
const problemController = require('../controllers/problemController');

// Public routes (no auth required for viewing)
router.get('/', problemController.getProblems);
router.post('/reasoning-evaluate', problemController.evaluateReasoning);
router.post('/:id/ai-help', problemController.getAIHelp);
router.get('/:id', problemController.getProblemById);

module.exports = router;
