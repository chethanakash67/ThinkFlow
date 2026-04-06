/**
 * Multi-language test script for the industry-standard code execution service.
 * Tests all 5 languages plus security & limits.
 *
 * Run with:  node test-judge.js
 */

const { executeCode } = require('./services/codeExecutionService');

// ─── Test Cases (Two Sum problem) ─────────────────────────────────────────────

const testCases = [
    { input: { nums: [2, 7, 11, 15], target: 9 }, output: [0, 1] },
    { input: { nums: [3, 2, 4], target: 6 }, output: [1, 2] },
    { input: { nums: [3, 3], target: 6 }, output: [0, 1] },
];

// ─── Solutions in each language ───────────────────────────────────────────────

const solutions = {
    javascript: `
function solution(nums, target) {
  const map = {};
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map[complement] !== undefined) return [map[complement], i];
    map[nums[i]] = i;
  }
  return [];
}`,

    python: `
def solution(nums, target):
    seen = {}
    for i, num in enumerate(nums):
        complement = target - num
        if complement in seen:
            return [seen[complement], i]
        seen[num] = i
    return []`,

    cpp: `
#include <vector>
#include <unordered_map>
using namespace std;

vector<int> solution(vector<int> nums, int target) {
    unordered_map<int, int> seen;
    for (int i = 0; i < nums.size(); i++) {
        int complement = target - nums[i];
        if (seen.count(complement)) return {seen[complement], i};
        seen[nums[i]] = i;
    }
    return {};
}`,

    java: `
public static int[] solution(int[] nums, int target) {
    java.util.HashMap<Integer, Integer> map = new java.util.HashMap<>();
    for (int i = 0; i < nums.length; i++) {
        int complement = target - nums[i];
        if (map.containsKey(complement)) return new int[]{map.get(complement), i};
        map.put(nums[i], i);
    }
    return new int[]{};
}`,

    c: `
#include <stdlib.h>

int* solution(int* nums, int nums_len, int target) {
    static int result[2];
    for (int i = 0; i < nums_len; i++) {
        for (int j = i + 1; j < nums_len; j++) {
            if (nums[i] + nums[j] == target) {
                result[0] = i;
                result[1] = j;
                return result;
            }
        }
    }
    return result;
}`,
};

// ─── Limit Tests ──────────────────────────────────────────────────────────────

const tleSolution = {
    code: `
def solution(nums, target):
    while True:
        pass
    return []`,
    language: 'python',
    name: 'Time Limit Exceeded (Python infinite loop)',
    expectStatus: 'incorrect',
};

const oleSolution = {
    code: `
def solution(nums, target):
    print("x" * 100000)
    return [0, 1]`,
    language: 'python',
    name: 'Output Limit (100KB print)',
    expectStatus: 'incorrect',
};

// ─── Runner ───────────────────────────────────────────────────────────────────

const COLORS = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
    reset: '\x1b[0m',
    bold: '\x1b[1m',
};

const runTests = async () => {
    console.log(`\n${COLORS.bold}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
    console.log(`${COLORS.bold}  ThinkFlow Judge — Industry Standard Test Suite${COLORS.reset}`);
    console.log(`${COLORS.bold}═══════════════════════════════════════════════════════════════${COLORS.reset}\n`);

    let totalPassed = 0;
    let totalFailed = 0;

    // Test each language with Two Sum
    for (const [language, code] of Object.entries(solutions)) {
        console.log(`${COLORS.cyan}▶ Testing ${language.toUpperCase()}...${COLORS.reset}`);

        try {
            const result = await executeCode(code, testCases, language);

            const icon = result.status === 'correct' ? `${COLORS.green}✓` : `${COLORS.red}✗`;
            console.log(`  ${icon} ${result.passedCount}/${result.totalCount} test cases passed ${COLORS.dim}(${result.results[0]?.executionTime || 0}ms)${COLORS.reset}`);

            if (result.status === 'correct') {
                totalPassed++;
            } else {
                totalFailed++;
                result.results.forEach((r, i) => {
                    if (!r.passed) {
                        console.log(`  ${COLORS.red}  TC${i + 1}: expected ${JSON.stringify(r.expectedOutput)}, got ${JSON.stringify(r.actualOutput)}${COLORS.reset}`);
                        if (r.error) console.log(`  ${COLORS.red}  Error: ${r.error}${COLORS.reset}`);
                    }
                });
            }
        } catch (error) {
            totalFailed++;
            console.log(`  ${COLORS.red}✗ CRASH: ${error.message}${COLORS.reset}`);
        }

        console.log('');
    }

    // Test TLE
    console.log(`${COLORS.cyan}▶ Testing TLE enforcement...${COLORS.reset}`);
    try {
        const result = await executeCode(tleSolution.code, [testCases[0]], tleSolution.language);
        const hasTLE = result.results.some((r) => r.error && r.error.includes('Time Limit'));
        if (hasTLE) {
            totalPassed++;
            console.log(`  ${COLORS.green}✓ Time Limit Exceeded correctly enforced${COLORS.reset}`);
        } else {
            totalFailed++;
            console.log(`  ${COLORS.red}✗ TLE not enforced — got status: ${result.status}${COLORS.reset}`);
        }
    } catch (error) {
        totalFailed++;
        console.log(`  ${COLORS.red}✗ CRASH: ${error.message}${COLORS.reset}`);
    }

    console.log('');

    // Summary
    console.log(`${COLORS.bold}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
    const summaryColor = totalFailed === 0 ? COLORS.green : COLORS.red;
    console.log(`${summaryColor}${COLORS.bold}  Results: ${totalPassed} passed, ${totalFailed} failed${COLORS.reset}`);
    console.log(`${COLORS.bold}═══════════════════════════════════════════════════════════════${COLORS.reset}\n`);

    process.exit(totalFailed > 0 ? 1 : 0);
};

runTests();
