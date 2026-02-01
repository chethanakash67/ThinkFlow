const { VM } = require('vm2');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Execute code against test cases (multi-language support)
 * @param {string} code - The user's code to execute
 * @param {Array} testCases - Array of test cases from the problem
 * @param {string} language - Programming language (javascript, python, cpp, java, c)
 * @param {number} timeoutMs - Maximum execution time in milliseconds
 * @returns {Object} Execution results
 */
const executeCode = async (code, testCases, language = 'javascript', timeoutMs = null) => {
  // Get language configuration
  const langConfig = getLanguageConfig(language.toLowerCase());
  
  if (!langConfig) {
    return {
      status: 'error',
      error: `Unsupported language: ${language}`,
      results: [],
      passedCount: 0,
      totalCount: testCases.length,
      score: 0,
    };
  }

  const timeout = timeoutMs || langConfig.timeout;
  const results = [];
  
  try {
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      const result = await langConfig.executor(code, testCase, timeout);
      results.push(result);
    }

    // Calculate overall status
    const passedCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    
    let status;
    if (passedCount === totalCount) {
      status = 'correct';
    } else if (passedCount > 0) {
      status = 'partially_correct';
    } else {
      status = 'incorrect';
    }

    return {
      status,
      results,
      passedCount,
      totalCount,
      score: Math.round((passedCount / totalCount) * 100),
    };
  } catch (error) {
    console.error('Code execution error:', error);
    console.error('Error stack:', error.stack);
    return {
      status: 'error',
      error: error.message || 'Unknown execution error',
      errorDetails: error.stack,
      results: [],
      passedCount: 0,
      totalCount: testCases.length,
      score: 0,
    };
  }
};

/**
 * Execute JavaScript code against a single test case
 * @param {string} code - The user's code
 * @param {Object} testCase - Single test case
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Object} Test case result
 */
const executeJavaScript = async (code, testCase, timeoutMs) => {
  const startTime = Date.now();
  
  try {
    // Create a sandboxed VM
    const vm = new VM({
      timeout: timeoutMs,
      sandbox: {
        console: {
          log: () => {}, // Disable console.log in sandbox
        },
      },
    });

    // Prepare the execution context
    const wrappedCode = `
      ${code}
      
      // Execute the function with test input
      const testInput = ${JSON.stringify(testCase.input)};
      const result = typeof solution === 'function' 
        ? solution(testInput) 
        : (typeof solve === 'function' ? solve(testInput) : null);
      result;
    `;

    // Execute the code
    const output = vm.run(wrappedCode);
    const executionTime = Date.now() - startTime;

    // Compare output with expected
    const expected = testCase.output;
    const passed = deepEqual(output, expected);

    return {
      input: testCase.input,
      expectedOutput: expected,
      actualOutput: output,
      passed,
      executionTime,
      error: null,
      errorDetails: null,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // Parse error to extract useful information
    const errorInfo = parseError(error, code);
    
    return {
      input: testCase.input,
      expectedOutput: testCase.output,
      actualOutput: null,
      passed: false,
      executionTime,
      error: errorInfo.message,
      errorDetails: errorInfo,
    };
  }
};

/**
 * Execute Python code against a single test case
 */
const executePython = async (code, testCase, timeoutMs) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thinkflow-'));
  const fileName = path.join(tempDir, 'solution.py');
  
  try {
    const wrappedCode = `
import json
import sys

${code}

if __name__ == "__main__":
    test_input = ${JSON.stringify(JSON.stringify(testCase.input))}
    input_data = json.loads(test_input)
    result = solution(input_data) if 'solution' in dir() else solve(input_data)
    print(json.dumps(result))
`;
    
    await fs.writeFile(fileName, wrappedCode);
    
    const result = await executeProcess('python3', [fileName], timeoutMs, testCase);
    
    // Cleanup
    await fs.unlink(fileName);
    await fs.rmdir(tempDir);
    
    return result;
  } catch (error) {
    // Cleanup on error
    try {
      await fs.unlink(fileName);
      await fs.rmdir(tempDir);
    } catch {}
    
    return {
      input: testCase.input,
      expectedOutput: testCase.output,
      actualOutput: null,
      passed: false,
      executionTime: 0,
      error: error.message,
      errorDetails: parseError(error, code),
    };
  }
};

/**
 * Execute C++ code against a single test case
 */
const executeCpp = async (code, testCase, timeoutMs) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thinkflow-'));
  const sourceFile = path.join(tempDir, 'solution.cpp');
  const execFile = path.join(tempDir, 'solution');
  
  try {
    // Check if code already has main function
    const hasMain = code.includes('int main');
    
    let finalCode;
    if (hasMain) {
      // User provided complete program - use as is
      finalCode = code;
    } else {
      // Wrap user's function (simplified wrapper)
      finalCode = `
#include <iostream>
#include <vector>
#include <string>

using namespace std;

${code}

int main() {
    // Call user's solution function
    // Note: This is a basic wrapper, users should write complete programs for complex I/O
    cout << solution() << endl;
    return 0;
}
`;
    }
    
    await fs.writeFile(sourceFile, finalCode);
    
    // Compile
    const compileResult = await executeProcess('g++', ['-std=c++17', sourceFile, '-o', execFile], 10000, testCase, true);
    
    if (compileResult.error) {
      // Compilation error
      await fs.unlink(sourceFile);
      await fs.rmdir(tempDir);
      return compileResult;
    }
    
    // Execute
    const result = await executeProcess(execFile, [], timeoutMs, testCase, false);
    
    // Cleanup
    await fs.unlink(sourceFile);
    try { await fs.unlink(execFile); } catch {}
    await fs.rmdir(tempDir);
    
    return result;
  } catch (error) {
    // Cleanup on error
    try {
      await fs.unlink(sourceFile);
      try { await fs.unlink(execFile); } catch {}
      await fs.rmdir(tempDir);
    } catch {}
    
    return {
      input: testCase.input,
      expectedOutput: testCase.output,
      actualOutput: null,
      passed: false,
      executionTime: 0,
      error: error.message,
      errorDetails: parseError(error, code),
    };
  }
};

/**
 * Execute Java code against a single test case
 */
const executeJava = async (code, testCase, timeoutMs) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thinkflow-'));
  const fileName = path.join(tempDir, 'Solution.java');
  
  try {
    const wrappedCode = `
import com.google.gson.Gson;

public class Solution {
    ${code}
    
    public static void main(String[] args) {
        Gson gson = new Gson();
        String inputStr = "${JSON.stringify(testCase.input).replace(/"/g, '\\"')}";
        Object input = gson.fromJson(inputStr, Object.class);
        Object result = solution(input);
        System.out.println(gson.toJson(result));
    }
}
`;
    
    await fs.writeFile(fileName, wrappedCode);
    
    // Compile
    await executeProcess('javac', [fileName], 10000, testCase);
    
    // Execute
    const result = await executeProcess('java', ['-cp', tempDir, 'Solution'], timeoutMs, testCase);
    
    // Cleanup
    await fs.unlink(fileName);
    try { await fs.unlink(path.join(tempDir, 'Solution.class')); } catch {}
    await fs.rmdir(tempDir);
    
    return result;
  } catch (error) {
    // Cleanup on error
    try {
      await fs.unlink(fileName);
      try { await fs.unlink(path.join(tempDir, 'Solution.class')); } catch {}
      await fs.rmdir(tempDir);
    } catch {}
    
    return {
      input: testCase.input,
      expectedOutput: testCase.output,
      actualOutput: null,
      passed: false,
      executionTime: 0,
      error: error.message,
      errorDetails: parseError(error, code),
    };
  }
};

/**
 * Execute C code against a single test case
 */
const executeC = async (code, testCase, timeoutMs) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'thinkflow-'));
  const sourceFile = path.join(tempDir, 'solution.c');
  const execFile = path.join(tempDir, 'solution');
  
  try {
    // Check if code already has main function
    const hasMain = code.includes('int main');
    
    let finalCode;
    if (hasMain) {
      // User provided complete program - use as is
      finalCode = code;
    } else {
      // Wrap user's function in a main that handles I/O
      finalCode = `
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

${code}

int main() {
    // Parse input and call solution function
    // This is a simplified wrapper - adjust based on your problem format
    printf("{\\"result\\": %d}", solution(${JSON.stringify(testCase.input)}));
    return 0;
}
`;
    }
    
    await fs.writeFile(sourceFile, finalCode);
    
    // Compile
    const compileResult = await executeProcess('gcc', [sourceFile, '-o', execFile, '-lm'], 10000, testCase, true);
    
    if (compileResult.error) {
      // Compilation error
      await fs.unlink(sourceFile);
      await fs.rmdir(tempDir);
      return compileResult;
    }
    
    // Execute
    const result = await executeProcess(execFile, [], timeoutMs, testCase, false);
    
    // Cleanup
    await fs.unlink(sourceFile);
    try { await fs.unlink(execFile); } catch {}
    await fs.rmdir(tempDir);
    
    return result;
  } catch (error) {
    // Cleanup on error
    try {
      await fs.unlink(sourceFile);
      try { await fs.unlink(execFile); } catch {}
      await fs.rmdir(tempDir);
    } catch {}
    
    return {
      input: testCase.input,
      expectedOutput: testCase.output,
      actualOutput: null,
      passed: false,
      executionTime: 0,
      error: error.message,
      errorDetails: parseError(error, code),
    };
  }
};

/**
 * Execute a process and capture output
 */
const executeProcess = (command, args, timeoutMs, testCase, isCompilation = false) => {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    try {
      const process = spawn(command, args);
      
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      
      const timeout = setTimeout(() => {
        timedOut = true;
        process.kill();
        reject(new Error('Execution timeout'));
      }, timeoutMs);
      
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      process.on('close', (code) => {
        clearTimeout(timeout);
        const executionTime = Date.now() - startTime;
      
      if (timedOut) {
        resolve({
          input: testCase.input,
          expectedOutput: testCase.output,
          actualOutput: null,
          passed: false,
          executionTime,
          error: 'Execution timeout',
          errorDetails: { message: 'Code execution exceeded time limit' },
        });
        return;
      }
      
      if (code !== 0) {
        resolve({
          input: testCase.input,
          expectedOutput: testCase.output,
          actualOutput: null,
          passed: false,
          executionTime,
          error: isCompilation ? `Compilation Error:\n${stderr}` : (stderr || 'Execution error'),
          errorDetails: { message: stderr },
        });
        return;
      }
      
      // If this is compilation, just return success
      if (isCompilation) {
        resolve({ success: true });
        return;
      }
      
      // For execution, try to parse output
      // If it's JSON, parse it; otherwise use raw output
      try {
        const output = JSON.parse(stdout.trim());
        const passed = deepEqual(output, testCase.output);
        
        resolve({
          input: testCase.input,
          expectedOutput: testCase.output,
          actualOutput: output,
          passed,
          executionTime,
          error: null,
          errorDetails: null,
        });
      } catch (error) {
        // If JSON parsing fails, treat stdout as raw output
        const actualOutput = stdout.trim();
        const passed = actualOutput === String(testCase.output);
        
        resolve({
          input: testCase.input,
          expectedOutput: testCase.output,
          actualOutput: actualOutput,
          passed,
          executionTime,
          error: passed ? null : 'Output format mismatch',
          errorDetails: passed ? null : { message: `Expected: ${testCase.output}, Got: ${actualOutput}` },
        });
      }
    });
    
    process.on('error', (error) => {
      clearTimeout(timeout);
      console.error(`Process error for command '${command}':`, error);
      
      // Check if it's a "command not found" error
      if (error.code === 'ENOENT') {
        resolve({
          input: testCase.input,
          expectedOutput: testCase.output,
          actualOutput: null,
          passed: false,
          executionTime: Date.now() - startTime,
          error: `${command} is not installed or not found in PATH`,
          errorDetails: { 
            message: `Please install ${command} to run ${isCompilation ? 'compile' : 'execute'} code`,
            code: error.code
          },
        });
      } else {
        reject(error);
      }
    });
    } catch (error) {
      console.error(`Failed to spawn process '${command}':`, error);
      resolve({
        input: testCase.input,
        expectedOutput: testCase.output,
        actualOutput: null,
        passed: false,
        executionTime: 0,
        error: `Failed to ${isCompilation ? 'compile' : 'execute'}: ${error.message}`,
        errorDetails: { message: error.message },
      });
    }
  });
};

/**
 * Execute code against a single test case (kept for backward compatibility)
 * @deprecated Use executeJavaScript instead
 */
const executeSingleTestCase = executeJavaScript;

/**
 * Deep equality check for comparing outputs
 * @param {*} a - First value
 * @param {*} b - Second value
 * @returns {boolean} Whether values are deeply equal
 */
const deepEqual = (a, b) => {
  if (a === b) return true;
  
  if (a == null || b == null) return false;
  
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  
  return false;
};

/**
 * Validate JavaScript code syntax
 * @param {string} code - The code to validate
 * @returns {Object} Validation result
 */
const validateCode = (code) => {
  try {
    // Check if code is empty
    if (!code || code.trim().length === 0) {
      return {
        valid: false,
        error: 'Code cannot be empty',
      };
    }

    // Try to parse the code to check for syntax errors
    new Function(code);
    
    // Check if code defines a function
    if (!code.includes('function') && !code.includes('=>')) {
      return {
        valid: false,
        error: 'Code must define a function (solution or solve)',
      };
    }

    return {
      valid: true,
      error: null,
    };
  } catch (error) {
    return {
      valid: false,
      error: `Syntax error: ${error.message}`,
      details: parseError(error, code),
    };
  }
};

/**
 * Parse error to extract useful debugging information
 * @param {Error} error - The error object
 * @param {string} code - The code that caused the error
 * @returns {Object} Parsed error information
 */
const parseError = (error, code) => {
  const errorMessage = error.message || 'Unknown error';
  const errorType = error.name || 'Error';
  
  // Try to extract line number from error stack
  let lineNumber = null;
  let columnNumber = null;
  let errorLine = null;
  
  // Check for line number in error message
  const lineMatch = errorMessage.match(/line (\d+)/i);
  if (lineMatch) {
    lineNumber = parseInt(lineMatch[1]);
  }
  
  // Check stack trace for line number
  if (!lineNumber && error.stack) {
    const stackMatch = error.stack.match(/:(\d+):(\d+)/);
    if (stackMatch) {
      lineNumber = parseInt(stackMatch[1]);
      columnNumber = parseInt(stackMatch[2]);
    }
  }
  
  // Extract the problematic line from code
  if (lineNumber) {
    const lines = code.split('\n');
    if (lineNumber > 0 && lineNumber <= lines.length) {
      errorLine = lines[lineNumber - 1];
    }
  }
  
  // Provide helpful error message based on error type
  let suggestion = '';
  if (errorMessage.includes('is not defined')) {
    suggestion = 'Check if all variables are properly declared and spelled correctly.';
  } else if (errorMessage.includes('Unexpected token')) {
    suggestion = 'Check for missing or extra brackets, parentheses, or commas.';
  } else if (errorMessage.includes('Cannot read property')) {
    suggestion = 'Check if the object or array exists before accessing its properties.';
  } else if (errorMessage.includes('timeout')) {
    suggestion = 'Your code took too long to execute. Check for infinite loops.';
  }
  
  return {
    type: errorType,
    message: errorMessage,
    lineNumber,
    columnNumber,
    errorLine,
    suggestion,
    fullStack: error.stack,
  };
};

/**
 * Get language configuration
 * @param {string} language - Programming language
 * @returns {Object|null} Language configuration or null if unsupported
 */
const getLanguageConfig = (language) => {
  const configs = {
    javascript: {
      extension: 'js',
      timeout: 5000,
      executor: executeJavaScript,
    },
    python: {
      extension: 'py',
      timeout: 5000,
      executor: executePython,
    },
    cpp: {
      extension: 'cpp',
      timeout: 10000,
      executor: executeCpp,
    },
    java: {
      extension: 'java',
      timeout: 10000,
      executor: executeJava,
    },
    c: {
      extension: 'c',
      timeout: 10000,
      executor: executeC,
    },
  };
  
  return configs[language] || null;
};

module.exports = {
  executeCode,
  executeSingleTestCase,
  validateCode,
  deepEqual,
  parseError,
};
