/**
 * Test script for code execution service
 * Run with: node test-code-execution.js
 */

const { executeCode, validateCode } = require('./services/codeExecutionService');

// Sample test cases
const testCases = [
  {
    input: [2, 7, 11, 15],
    output: [0, 1],
  },
  {
    input: [3, 2, 4],
    output: [1, 2],
  },
  {
    input: [3, 3],
    output: [0, 1],
  },
];

// Sample user code (Two Sum problem)
const userCode = `
function solution(nums) {
  const target = nums[0] + nums[1]; // Simplified for testing
  const map = {};
  
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map[complement] !== undefined) {
      return [map[complement], i];
    }
    map[nums[i]] = i;
  }
  
  return [];
}
`;

// Test validation
console.log('Testing code validation...');
const validation = validateCode(userCode);
console.log('Validation result:', validation);
console.log('');

// Test execution
console.log('Testing code execution...');
executeCode(userCode, testCases)
  .then(result => {
    console.log('Execution result:', JSON.stringify(result, null, 2));
    console.log('');
    console.log('Individual test results:');
    result.results.forEach((testResult, index) => {
      console.log(`Test ${index + 1}:`, testResult.passed ? '✓ PASSED' : '✗ FAILED');
      console.log('  Input:', testResult.input);
      console.log('  Expected:', testResult.expectedOutput);
      console.log('  Got:', testResult.actualOutput);
      if (testResult.error) {
        console.log('  Error:', testResult.error);
      }
      console.log('');
    });
  })
  .catch(error => {
    console.error('Execution error:', error);
  });
