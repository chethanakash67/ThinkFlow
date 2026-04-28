const { query } = require('../src/config/db');
const { evaluateLogic, generateExecutionSteps } = require('../services/logicEvaluationService');
const { executeCode } = require('../services/codeExecutionService');
const { awardSolvePoints, getLeaderboard, getUserPointsSummary } = require('../services/gamificationService');

const COMPLEXITY_RANK = {
  'O(1)': 1,
  'O(log n)': 2,
  'O(n)': 3,
  'O(n log n)': 4,
  'O(n^2)': 5,
  'O(n^3)': 6,
  'O(2^n)': 7,
  'O(?)': 99,
};

const normalizeCodeForComplexity = (code) => String(code || '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/.*$/gm, ' ')
  .replace(/#.*$/gm, ' ')
  .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, ' ')
  .toLowerCase();

const inferCodeComplexity = (code, language = 'javascript') => {
  const source = normalizeCodeForComplexity(code);
  const loopMatches = source.match(/\b(for|while)\b/g) || [];
  const hasSort = /\b(sort|sorted|priority_queue|heapq|collections\.counter|treeset|treemap)\b/.test(source);
  const hasHashStructure = /\b(unordered_map|unordered_set|hashmap|hashset|map<|set<|new map|new set|dictionary|dict\(|counter\(|object\.create)\b/.test(source);
  const hasExtraArray = /\b(vector\s*<[^>]+>\s+\w+\s*(?:=|;)|arraylist\s*<[^>]+>\s+\w+|list\s*<[^>]+>\s+\w+|new\s+array|new\s+int\s*\[|push_back\s*\(|append\s*\(|\.push\s*\()\b/.test(source);
  const hasRecursion = (() => {
    const names = [...source.matchAll(/\b(?:function|def|int|long|double|bool|void|vector<[^>]+>|public\s+static\s+[\w<>\[\]]+)\s+([a-z_]\w*)\s*\(/g)]
      .map((match) => match[1])
      .filter((name) => name && !['if', 'for', 'while', 'switch'].includes(name));
    return names.some((name) => new RegExp(`\\b${name}\\s*\\(`, 'g').test(source.replace(new RegExp(`\\b${name}\\s*\\([^)]*\\)\\s*\\{?`), '')));
  })();
  const hasNestedLoopText = /\b(for|while)\b[\s\S]{0,260}\b(for|while)\b/.test(source);
  const sortInsideLoop = /\b(for|while)\b[\s\S]{0,260}\bsort\s*\(/.test(source);

  let time = 'O(n)';
  let note = 'Inferred from loops, sorting calls, recursion, and common data structures.';

  if (hasRecursion && /fib|subset|permutation|backtrack|dfs/.test(source)) {
    time = 'O(2^n)';
  } else if (sortInsideLoop) {
    time = 'O(n^2 log n)';
  } else if (hasNestedLoopText && loopMatches.length >= 2 && !hasSort) {
    time = 'O(n^2)';
  } else if (hasSort) {
    time = 'O(n log n)';
  } else if (loopMatches.length === 0) {
    time = 'O(1)';
  }

  let space = 'O(1)';
  if (hasHashStructure || hasExtraArray) {
    space = 'O(n)';
  } else if (hasSort || hasRecursion) {
    space = 'O(log n)';
  }

  if (language === 'cpp' && /\bsort\s*\(/.test(source) && /\bproduct\b|\bdigit\b/.test(source)) {
    note = 'Digit processing is treated as constant per number for nums[i] up to 10^6.';
  }

  return { time, space, note };
};

const getComplexityRank = (complexity) => {
  if (COMPLEXITY_RANK[complexity]) return COMPLEXITY_RANK[complexity];
  if (/n\^2/.test(complexity)) return 5;
  if (/n\s*log\s*n/.test(complexity)) return 4;
  if (/\bo\(n\)/i.test(complexity)) return 3;
  return 99;
};

const getTotalExecutionTime = (results = []) => results.reduce((sum, result) => (
  sum + (Number.isFinite(Number(result.executionTime)) ? Number(result.executionTime) : 0)
), 0);

const buildPerformanceSummary = async ({ submissionId, userId, problemId, code, language, executionResult }) => {
  const currentComplexity = inferCodeComplexity(code, language);
  const currentExecutionTime = getTotalExecutionTime(executionResult.results);

  const base = {
    current: {
      executionTime: currentExecutionTime,
      timeComplexity: currentComplexity.time,
      spaceComplexity: currentComplexity.space,
      note: currentComplexity.note,
    },
    ranking: null,
    best: null,
  };

  if (executionResult.status !== 'correct') {
    return {
      ...base,
      ranking: {
        eligible: false,
        message: 'Pass all test cases to enter the accepted-submission ranking.',
      },
    };
  }

  const acceptedResult = await query(
    `SELECT id, user_id, code, language, execution_time, created_at
     FROM code_submissions
     WHERE problem_id = $1 AND status = 'correct'
     ORDER BY created_at ASC`,
    [problemId]
  );

  const ranked = acceptedResult.rows
    .map((submission) => {
      const complexity = Number(submission.id) === Number(submissionId)
        ? currentComplexity
        : inferCodeComplexity(submission.code, submission.language);
      const executionTime = Number(submission.id) === Number(submissionId)
        ? currentExecutionTime
        : Number(submission.execution_time || 0);

      return {
        id: submission.id,
        userId: submission.user_id,
        executionTime,
        timeComplexity: complexity.time,
        spaceComplexity: complexity.space,
        createdAt: submission.created_at,
        timeRank: getComplexityRank(complexity.time),
        spaceRank: getComplexityRank(complexity.space),
      };
    })
    .sort((a, b) => (
      a.timeRank - b.timeRank ||
      a.spaceRank - b.spaceRank ||
      a.executionTime - b.executionTime ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    ));

  const currentIndex = ranked.findIndex((submission) => Number(submission.id) === Number(submissionId));
  const rank = currentIndex >= 0 ? currentIndex + 1 : null;
  const totalAccepted = ranked.length;
  const best = ranked[0] || null;

  return {
    ...base,
    ranking: {
      eligible: true,
      rank,
      totalAccepted,
      beatsPercent: rank && totalAccepted
        ? Math.round(((totalAccepted - rank + 1) / totalAccepted) * 100)
        : null,
      betterSubmissions: rank ? Math.max(rank - 1, 0) : null,
    },
    best: best ? {
      executionTime: best.executionTime,
      timeComplexity: best.timeComplexity,
      spaceComplexity: best.spaceComplexity,
      isYourSubmission: Number(best.userId) === Number(userId),
    } : null,
  };
};

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
    const executionSteps = generateExecutionSteps(logicSteps, problem.test_cases[0], problem);
    
    // Save execution steps
    for (const step of executionSteps) {
      const persistedVariablesState = {
        ...(step.variablesState || {}),
        stage: step.stage || null,
        flowAction: step.flowAction || null,
        iteration: step.iteration || null,
        systemOutput: step.systemOutput ?? null,
        purpose: step.purpose || null,
        sourceStep: step.sourceStep || null,
      };

      await query(
        `INSERT INTO execution_steps (logic_submission_id, step_number, step_description, variables_state, condition_result)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          submission.id,
          step.stepNumber,
          step.stepDescription,
          JSON.stringify(persistedVariablesState),
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

    const executionSteps = result.rows.map((step) => ({
      id: step.id,
      stepNumber: step.step_number,
      stage: step.variables_state?.stage || null,
      stepDescription: step.step_description,
      variablesState: step.variables_state || {},
      conditionResult: step.condition_result,
      flowAction: step.variables_state?.flowAction || null,
      iteration: step.variables_state?.iteration || null,
      systemOutput: step.variables_state?.systemOutput ?? null,
      purpose: step.variables_state?.purpose || null,
      sourceStep: step.variables_state?.sourceStep || null,
      createdAt: step.created_at,
    }));

    res.json({ executionSteps });
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

    const totalExecutionTime = getTotalExecutionTime(executionResult.results);

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
        totalExecutionTime
      ]
    );

    let pointsAwarded = 0;
    if (executionResult.status === 'correct') {
      const awardResult = await awardSolvePoints({
        userId,
        problemId,
        difficulty: problem.difficulty,
      });
      pointsAwarded = awardResult.points;
    }

    const performance = await buildPerformanceSummary({
      submissionId: result.rows[0].id,
      userId,
      problemId,
      code,
      language: selectedLanguage,
      executionResult,
    });

    res.status(201).json({
      submission: {
        id: result.rows[0].id,
        status: executionResult.status,
        passedCount: executionResult.passedCount,
        totalCount: executionResult.totalCount,
        score: executionResult.score,
        pointsAwarded,
        results: executionResult.results,
        error: executionResult.error,
        errorDetails: executionResult.errorDetails,
        performance,
        message: executionResult.status === 'correct' 
          ? 'All test cases passed!' 
          : executionResult.status === 'partially_correct'
          ? `${executionResult.passedCount}/${executionResult.totalCount} test cases passed`
          : executionResult.status === 'error'
          ? executionResult.errorDetails?.title || executionResult.error || 'Execution error'
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

    return res.json({
      result: executionResult.results[0] || {
        input: customInput,
        expectedOutput,
        actualOutput: null,
        passed: false,
        error: executionResult.error || 'Execution error',
        errorDetails: executionResult.errorDetails || null,
      },
      error: executionResult.error,
      errorDetails: executionResult.errorDetails,
      status: executionResult.status === 'error'
        ? 'error'
        : executionResult.results[0]?.passed ? 'passed' : 'failed'
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

    const gamification = await getUserPointsSummary(userId);

    res.json({
      stats: submissionStats.rows[0],
      recentSubmissions: recentSubmissions.rows,
      gamification,
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};

const getLeaderboardOverview = async (req, res) => {
  try {
    const [global, weekly] = await Promise.all([
      getLeaderboard('global', 20),
      getLeaderboard('weekly', 20),
    ]);

    res.json({ global, weekly });
  } catch (error) {
    console.error('Get leaderboard overview error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard overview' });
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
  getLeaderboardOverview,
};
