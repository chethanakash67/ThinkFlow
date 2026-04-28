const express = require('express');
const router = express.Router();
const { parseLogic } = require('../services/logicParserService');
const {
  validateLogicAgainstProblem,
  validateLogicInsights
} = require('../services/logicValidationService');

router.post('/parse-logic', async (req, res) => {
  try {
    const { userLogic, problemContext } = req.body || {};

    if (!String(userLogic || '').trim()) {
      return res.json({ nodes: [] });
    }

    const nodes = await parseLogic({
      userLogic: String(userLogic),
      problemContext: problemContext || {}
    });

    res.json({ nodes });
  } catch (error) {
    console.error('Parse logic route error:', error);
    res.status(500).json({ error: 'Failed to parse logic' });
  }
});

router.post('/validateLogic', async (req, res) => {
  try {
    const { userBlueprintText, problemDescription } = req.body || {};

    if (!String(userBlueprintText || '').trim()) {
      return res.json([]);
    }

    const insights = await validateLogicInsights({
      userBlueprintText: String(userBlueprintText),
      problemDescription: problemDescription || ''
    });

    res.json(insights);
  } catch (error) {
    console.error('Validate logic route error:', error);
    res.status(500).json({ error: 'Failed to validate logic' });
  }
});

router.post('/validateLogicAgainstProblem', async (req, res) => {
  try {
    const { userBlueprintText, problem } = req.body || {};

    if (!String(userBlueprintText || '').trim()) {
      return res.json([]);
    }

    const insights = await validateLogicAgainstProblem({
      userBlueprintText: String(userBlueprintText),
      problem: problem || {}
    });

    res.json(insights);
  } catch (error) {
    console.error('Validate logic against problem route error:', error);
    res.status(500).json({ error: 'Failed to validate logic against problem' });
  }
});

module.exports = router;
