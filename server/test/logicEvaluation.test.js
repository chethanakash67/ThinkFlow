const test = require('node:test');
const assert = require('node:assert/strict');

const { generateExecutionSteps, evaluateLogic } = require('../services/logicEvaluationService');

test('generateExecutionSteps builds staged execution trace with conditions and final output', () => {
  const logicSteps = [
    { type: 'input', description: 'n = 3' },
    { type: 'process', description: 'sum = 0' },
    { type: 'loop', description: 'for i = 1 to n' },
    { type: 'condition', description: 'if (n > 0)' },
    { type: 'output', description: 'print sum' },
  ];

  const problem = {
    expected_outputs: [{ output: 6 }],
  };

  const testCase = {
    input: { n: 3 },
  };

  const trace = generateExecutionSteps(logicSteps, testCase, problem);

  assert.ok(trace.length >= 7);
  assert.equal(trace[0].stage, 'Input Initialization');
  assert.equal(trace.some((step) => step.stage === 'Iteration Handling'), true);
  assert.equal(trace.some((step) => step.stage === 'Condition Evaluation'), true);
  assert.equal(trace.some((step) => step.stage === 'Control Flow Movement'), true);
  assert.equal(trace.at(-1).stage, 'Final Output Generation');
  assert.equal(trace.at(-1).systemOutput, 6);
});

test('evaluateLogic fallback recognizes frequency-sort strategy for sort by frequency then value', async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = '';

  const problem = {
    title: 'Sort by Frequency then Value',
    description: 'Sort an array by increasing frequency, and if two values have the same frequency, sort by value.',
    difficulty: 'easy',
    test_cases: [{ input: { nums: [4, 5, 6, 5, 4, 3] } }],
    expected_outputs: [{ output: [3, 6, 4, 4, 5, 5] }],
  };

  const logicSteps = [
    { type: 'input', description: 'Read the array nums.' },
    { type: 'process', description: 'Count the frequency of each number using a map.' },
    { type: 'condition', description: 'If two numbers have the same frequency, compare their value.' },
    { type: 'process', description: 'Sort the array by increasing frequency and then by value.' },
    { type: 'output', description: 'Return the sorted array.' },
  ];

  const result = await evaluateLogic(logicSteps, problem);

  if (originalKey) {
    process.env.GEMINI_API_KEY = originalKey;
  } else {
    delete process.env.GEMINI_API_KEY;
  }

  assert.notEqual(result.status, 'incorrect');
  assert.ok(result.score >= 50);
});
