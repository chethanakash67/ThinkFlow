const { query } = require('../src/config/db');
const { evaluateLogic, generateExecutionSteps } = require('../services/logicEvaluationService');
const { executeCode } = require('../services/codeExecutionService');

// Submit logic for evaluation
const submitLogic = async (req, res) => {
  try {
    const { problemId, logicSteps } = req.body;
    const userId = req.user.id;

    if (!problemId || !logicSteps) {
      return res.status(400).json({ error: 'Problem ID and logic steps are required' });
    }

    // Get problem
    const problemResult = await query('SELECT * FROM problems WHERE id = $1', [problemId]);
    if (problemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    const problem = problemResult.rows[0];

    // Evaluate logic
    const evaluation = await evaluateLogic(logicSteps, problem);

    // Get latest version for this user-problem combination
    const versionResult = await query(
      'SELECT MAX(version) as max_version FROM logic_submissions WHERE user_id = $1 AND problem_id = $2',
      [userId, problemId]
    );
    const nextVersion = (versionResult.rows[0].max_version || 0) + 1;

    // Save logic submission
    const submissionResult = await query(
      `INSERT INTO logic_submissions (user_id, problem_id, logic_steps, status, feedback, score, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        problemId,
        JSON.stringify(logicSteps),
        evaluation.status,
        evaluation.feedback,
        evaluation.score,
        nextVersion,
      ]
    );

    const submission = submissionResult.rows[0];

    // Generate execution steps
    const executionSteps = generateExecutionSteps(logicSteps, problem.test_cases[0]);
    
    // Save execution steps
    for (const step of executionSteps) {
      await query(
        `INSERT INTO execution_steps (logic_submission_id, step_number, step_description, variables_state, condition_result)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          submission.id,
          step.stepNumber,
          step.stepDescription,
          JSON.stringify(step.variablesState),
          step.conditionResult,
        ]
      );
    }

    res.status(201).json({
      submission: {
        id: submission.id,
        status: submission.status,
        score: submission.score,
        feedback: submission.feedback,
        version: submission.version,
        suggestions: evaluation.suggestions,
        analysis: evaluation.analysis,
      },
      executionSteps,
    });
  } catch (error) {
    console.error('Submit logic error:', error);
    res.status(500).json({ error: 'Failed to submit logic' });
  }
};

// Get user's logic submissions for a problem
const getSubmissions = async (req, res) => {
  try {
    const { problemId } = req.query;
    const userId = req.user.id;

    let submissions;
    if (problemId) {
      const result = await query(
        `SELECT id, problem_id, status, score, feedback, version, created_at
         FROM logic_submissions
         WHERE user_id = $1 AND problem_id = $2
         ORDER BY version DESC`,
        [userId, problemId]
      );
      submissions = result.rows;
    } else {
      const result = await query(
        `SELECT id, problem_id, status, score, feedback, version, created_at
         FROM logic_submissions
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );
      submissions = result.rows;
    }

    res.json({ submissions });
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
};

// Get execution steps for a submission
const getExecutionSteps = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const userId = req.user.id;

    // Verify submission belongs to user
    const submissionResult = await query(
      'SELECT id FROM logic_submissions WHERE id = $1 AND user_id = $2',
      [submissionId, userId]
    );

    if (submissionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    const result = await query(
      'SELECT * FROM execution_steps WHERE logic_submission_id = $1 ORDER BY step_number',
      [submissionId]
    );

    res.json({ executionSteps: result.rows });
  } catch (error) {
    console.error('Get execution steps error:', error);
    res.status(500).json({ error: 'Failed to fetch execution steps' });
  }
};

// Submit code
const submitCode = async (req, res) => {
  try {
    const { problemId, code, language, logicSubmissionId } = req.body;
    const userId = req.user.id;

    if (!problemId || !code) {
      return res.status(400).json({ error: 'Problem ID and code are required' });
    }

    // Validate language support
    const supportedLanguages = ['javascript', 'python', 'cpp', 'java', 'c'];
    const selectedLanguage = (language || 'javascript').toLowerCase();
    
    if (!supportedLanguages.includes(selectedLanguage)) {
      return res.status(400).json({ 
        error: `Unsupported language: ${language}. Supported languages: ${supportedLanguages.join(', ')}` 
      });
    }

    // Get problem with test cases
    const problemResult = await query('SELECT * FROM problems WHERE id = $1', [problemId]);
    if (problemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    const problem = problemResult.rows[0];

    // Combine test_cases and expected_outputs into a single array
    const testCases = problem.test_cases.map((testCase, index) => ({
      input: testCase.input,
      output: problem.expected_outputs[index].output
    }));

    // Execute code against test cases
    console.log(`Executing ${selectedLanguage} code for problem ${problemId} with ${testCases.length} test cases`);
    
    const executionResult = await executeCode(code, testCases, selectedLanguage);
    
    console.log('Execution result:', {
      status: executionResult.status,
      passed: executionResult.passedCount,
      total: executionResult.totalCount,
      error: executionResult.error
    });

    // If execution resulted in error, return it
    if (executionResult.status === 'error' && executionResult.error) {
      return res.status(400).json({ 
        error: executionResult.error,
        details: executionResult.errorDetails,
        submission: {
          status: 'error',
          results: executionResult.results,
          passedCount: 0,
          totalCount: testCases.length,
          score: 0,
          message: executionResult.error
        }
      });
    }

    // Save code submission with results
    const result = await query(
      `INSERT INTO code_submissions (user_id, problem_id, logic_submission_id, code, language, status, test_results, execution_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId, 
        problemId, 
        logicSubmissionId || null, 
        code, 
        selectedLanguage, 
        executionResult.status,
        JSON.stringify(executionResult.results),
        executionResult.results[0]?.executionTime || 0
      ]
    );

    res.status(201).json({
      submission: {
        id: result.rows[0].id,
        status: executionResult.status,
        passedCount: executionResult.passedCount,
        totalCount: executionResult.totalCount,
        score: executionResult.score,
        results: executionResult.results,
        message: executionResult.status === 'correct' 
          ? 'All test cases passed!' 
          : executionResult.status === 'partially_correct'
          ? `${executionResult.passedCount}/${executionResult.totalCount} test cases passed`
          : 'No test cases passed',
      },
    });
  } catch (error) {
    console.error('Submit code error:', error);
    res.status(500).json({ error: 'Failed to submit code', details: error.message });
  }
};

// Run code on a custom single test case without saving as a submission
const runCustomCodeTest = async (req, res) => {
  try {
    const { problemId, code, language, customInput, expectedOutput } = req.body;

    if (!problemId || !code) {
      return res.status(400).json({ error: 'Problem ID and code are required' });
    }

    if (customInput === undefined || expectedOutput === undefined) {
      return res.status(400).json({ error: 'Custom input and expected output are required' });
    }

    const supportedLanguages = ['javascript', 'python', 'cpp', 'java', 'c'];
    const selectedLanguage = (language || 'javascript').toLowerCase();

    if (!supportedLanguages.includes(selectedLanguage)) {
      return res.status(400).json({
        error: `Unsupported language: ${language}. Supported languages: ${supportedLanguages.join(', ')}`
      });
    }

    const problemResult = await query('SELECT id FROM problems WHERE id = $1', [problemId]);
    if (problemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    const customTestCase = [{ input: customInput, output: expectedOutput }];
    const executionResult = await executeCode(code, customTestCase, selectedLanguage);

    if (executionResult.status === 'error') {
      return res.status(400).json({
        error: executionResult.error || 'Execution error',
        details: executionResult.errorDetails,
        result: executionResult.results?.[0] || null
      });
    }

    return res.json({
      result: executionResult.results[0],
      status: executionResult.results[0]?.passed ? 'passed' : 'failed'
    });
  } catch (error) {
    console.error('Run custom code test error:', error);
    res.status(500).json({ error: 'Failed to run custom test case' });
  }
};

// Get user code submissions, optionally filtered by problem
const getCodeSubmissions = async (req, res) => {
  try {
    const { problemId } = req.query;
    const userId = req.user.id;

    let result;
    if (problemId) {
      result = await query(
        `SELECT id, problem_id, language, status, execution_time, test_results, created_at
         FROM code_submissions
         WHERE user_id = $1 AND problem_id = $2
         ORDER BY created_at DESC`,
        [userId, problemId]
      );
    } else {
      result = await query(
        `SELECT id, problem_id, language, status, execution_time, test_results, created_at
         FROM code_submissions
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );
    }

    const submissions = result.rows.map((submission) => {
      const results = Array.isArray(submission.test_results) ? submission.test_results : [];
      const passedCount = results.filter((test) => test.passed).length;
      const totalCount = results.length;
      const score = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;

      return {
        id: submission.id,
        problem_id: submission.problem_id,
        language: submission.language,
        status: submission.status,
        execution_time: submission.execution_time,
        created_at: submission.created_at,
        passedCount,
        totalCount,
        score
      };
    });

    res.json({ submissions });
  } catch (error) {
    console.error('Get code submissions error:', error);
    res.status(500).json({ error: 'Failed to fetch code submissions' });
  }
};

// Get user dashboard stats
const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get submission stats
    const submissionStats = await query(
      `SELECT 
        COUNT(*) as total_submissions,
        COUNT(DISTINCT problem_id) as problems_attempted,
        SUM(CASE WHEN status = 'correct' THEN 1 ELSE 0 END) as correct_count,
        SUM(CASE WHEN status = 'partially_correct' THEN 1 ELSE 0 END) as partially_correct_count,
        AVG(score) as average_score
       FROM logic_submissions
       WHERE user_id = $1`,
      [userId]
    );

    // Get recent submissions
    const recentSubmissions = await query(
      `SELECT ls.id, ls.problem_id, ls.status, ls.score, ls.version, ls.created_at, p.title, p.difficulty
       FROM logic_submissions ls
       JOIN problems p ON ls.problem_id = p.id
       WHERE ls.user_id = $1
       ORDER BY ls.created_at DESC
       LIMIT 10`,
      [userId]
    );

    res.json({
      stats: submissionStats.rows[0],
      recentSubmissions: recentSubmissions.rows,
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};

module.exports = {
  submitLogic,
  getSubmissions,
  getExecutionSteps,
  submitCode,
  runCustomCodeTest,
  getCodeSubmissions,
  getDashboardStats,
};
