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
    const functionNames = extractFunctionNames(code, 'javascript');

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
      
      const __testInput = ${JSON.stringify(testCase.input)};
      const __argValues = ${JSON.stringify(getInvocationArgs(testCase.input))};
      const __candidateNames = ${JSON.stringify(functionNames)};

      const __invoke = (fn) => {
        if (typeof fn !== 'function') return { found: false, value: undefined };
        if (__argValues.length > 1) return { found: true, value: fn(...__argValues) };
        if (__argValues.length === 1) {
          try {
            return { found: true, value: fn(__argValues[0]) };
          } catch (singleArgError) {
            return { found: true, value: fn(__testInput) };
          }
        }
        return { found: true, value: fn(__testInput) };
      };

      let __matched = false;
      let __result;
      for (const __name of __candidateNames) {
        const __candidate = typeof globalThis[__name] === 'function' ? globalThis[__name] : null;
        const __outcome = __invoke(__candidate);
        if (__outcome.found) {
          __matched = true;
          __result = __outcome.value;
          break;
        }
      }
      if (!__matched) {
        throw new Error('No runnable function found. Define solution(...) or solve(...).');
      }

      const result = __result;
      result;
    `;

    // Execute the code
    const output = vm.run(wrappedCode);
    const executionTime = Date.now() - startTime;

    // Compare output with expected
    const expected = testCase.output;
    const passed = outputsMatch(output, expected);

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
    const functionNames = extractFunctionNames(code, 'python');
    const wrappedCode = `
import json
import sys

${code}

def __invoke(fn, test_input, arg_values):
    if len(arg_values) > 1:
        return fn(*arg_values)
    if len(arg_values) == 1:
        try:
            return fn(arg_values[0])
        except TypeError:
            return fn(test_input)
    return fn(test_input)

if __name__ == "__main__":
    test_input = json.loads(${JSON.stringify(JSON.stringify(testCase.input))})
    arg_values = json.loads(${JSON.stringify(JSON.stringify(getInvocationArgs(testCase.input)))})
    candidate_names = json.loads(${JSON.stringify(JSON.stringify(functionNames))})
    result = None
    matched = False

    for name in candidate_names:
        fn = globals().get(name)
        if callable(fn):
            result = __invoke(fn, test_input, arg_values)
            matched = True
            break

    if not matched:
        raise RuntimeError("No runnable function found. Define solution(...) or solve(...).")

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
    const normalizedCode = normalizeCppSource(code);
    // Check if code already has main function
    const hasMain = normalizedCode.includes('int main');
    const functionName = extractPrimaryFunctionName(normalizedCode, 'cpp');
    const signature = extractCppFunctionSignature(normalizedCode, functionName);
    
    let finalCode;
    if (hasMain) {
      // User provided complete program - use as is
      finalCode = normalizedCode;
    } else {
      if (!functionName) {
        throw new Error('No C++ function found to execute. Define solution(...), solve(...), or a named helper function.');
      }

      const inputEntries = buildInputEntries(testCase.input);
      const declarations = buildCppDeclarations(inputEntries);
      const invocationArgs = signature?.parameterCount === 0
        ? ''
        : inputEntries.map(({ name }) => sanitizeIdentifier(name)).join(', ');

      finalCode = `
#include <algorithm>
#include <iostream>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>
using namespace std;

${normalizedCode}

string __escapeString(const string& value) {
    string out = "\\"";
    for (char ch : value) {
        if (ch == '\\\\' || ch == '\\"') out += '\\\\';
        out += ch;
    }
    out += "\\"";
    return out;
}

string __toJson(const string& value) { return __escapeString(value); }
string __toJson(const char* value) { return __escapeString(string(value)); }
string __toJson(char value) { return __escapeString(string(1, value)); }
string __toJson(bool value) { return value ? "true" : "false"; }

template <typename T>
typename enable_if<is_arithmetic<T>::value && !is_same<T, bool>::value, string>::type
__toJson(const T& value) { return to_string(value); }

template <typename T>
string __toJson(const vector<T>& values) {
    string out = "[";
    for (size_t i = 0; i < values.size(); ++i) {
        if (i) out += ",";
        out += __toJson(values[i]);
    }
    out += "]";
    return out;
}

template <typename A, typename B>
string __toJson(const pair<A, B>& value) {
    return "[" + __toJson(value.first) + "," + __toJson(value.second) + "]";
}

int main() {
${declarations}
    auto __result = ${functionName}(${invocationArgs});
    cout << __toJson(__result);
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
    const stdinPayload = hasMain || signature?.parameterCount === 0 ? buildStdinPayload(testCase.input) : '';
    const result = await executeProcess(execFile, [], timeoutMs, testCase, false, stdinPayload);
    
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
  
  try {
    const hasMain = /\bpublic\s+static\s+void\s+main\s*\(/.test(code);
    const declaredClassName = extractJavaClassName(code);
    const functionName = extractPrimaryFunctionName(code, 'java');
    const inputEntries = buildInputEntries(testCase.input);
    const invocationArgs = inputEntries.map(({ name }) => sanitizeIdentifier(name)).join(', ');
    const userClassName = declaredClassName || 'Solution';
    const mainClassName = hasMain ? userClassName : 'Solution';
    const sourceFile = path.join(tempDir, `${mainClassName}.java`);

    let finalCode = code;
    if (!hasMain) {
      if (!functionName) {
        throw new Error('No Java method found to execute. Define solution(...), solve(...), or a named helper method.');
      }

      const declarations = buildJavaDeclarations(inputEntries);
      const classBody = declaredClassName
        ? code
        : `public class Solution {\n${code}\n}\n`;

      finalCode = `
import java.util.*;

${classBody}

class Runner {
    private static String toJson(Object value) {
        if (value == null) return "null";
        if (value instanceof String) return "\\"" + ((String) value).replace("\\\\", "\\\\\\\\").replace("\\"", "\\\\\\"") + "\\"";
        if (value instanceof Character) return "\\"" + value + "\\"";
        if (value instanceof Boolean || value instanceof Number) return String.valueOf(value);
        Class<?> cls = value.getClass();
        if (cls.isArray()) {
            int len = java.lang.reflect.Array.getLength(value);
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < len; i++) {
                if (i > 0) sb.append(",");
                sb.append(toJson(java.lang.reflect.Array.get(value, i)));
            }
            sb.append("]");
            return sb.toString();
        }
        if (value instanceof List<?>) {
            List<?> list = (List<?>) value;
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < list.size(); i++) {
                if (i > 0) sb.append(",");
                sb.append(toJson(list.get(i)));
            }
            sb.append("]");
            return sb.toString();
        }
        if (value instanceof Map<?, ?>) {
            Map<?, ?> map = (Map<?, ?>) value;
            StringBuilder sb = new StringBuilder("{");
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!first) sb.append(",");
                first = false;
                sb.append("\\"").append(String.valueOf(entry.getKey())).append("\\":");
                sb.append(toJson(entry.getValue()));
            }
            sb.append("}");
            return sb.toString();
        }
        return String.valueOf(value);
    }

    public static void main(String[] args) {
${declarations}
        Object result = ${userClassName}.${functionName}(${invocationArgs});
        System.out.println(toJson(result));
    }
}
`;
    }

    await fs.writeFile(sourceFile, finalCode);
    
    const compileResult = await executeProcess('javac', [sourceFile], 10000, testCase, true);
    if (compileResult.error) {
      await fs.unlink(sourceFile);
      await cleanupTempDir(tempDir);
      return compileResult;
    }
    
    const runClass = hasMain ? mainClassName : 'Runner';
    const stdinPayload = hasMain ? buildStdinPayload(testCase.input) : '';
    const result = await executeProcess('java', ['-cp', tempDir, runClass], timeoutMs, testCase, false, stdinPayload);
    
    await fs.unlink(sourceFile);
    await cleanupTempDir(tempDir);
    
    return result;
  } catch (error) {
    // Cleanup on error
    try {
      await cleanupTempDir(tempDir);
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
    const functionName = extractPrimaryFunctionName(code, 'c');
    
    let finalCode;
    if (hasMain) {
      // User provided complete program - use as is
      finalCode = code;
    } else {
      if (!functionName) {
        throw new Error('No C function found to execute. Define solution(...), solve(...), or write a full program with main().');
      }

      const signature = extractCFunctionSignature(code, functionName);
      const inputEntries = buildInputEntries(testCase.input);
      const declarations = buildCDeclarations(inputEntries);
      const invocationArgs = buildCInvocationArgs(inputEntries, signature?.parameterCount || 0).join(', ');

      finalCode = `
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

${code}

void __print_int_array(const int* arr, int len) {
    printf("[");
    for (int i = 0; i < len; i++) {
        if (i > 0) printf(",");
        printf("%d", arr[i]);
    }
    printf("]");
}

int main() {
${declarations}
    int __result_len = 0;
    int* __result_array = NULL;
    int __result_scalar = 0;

${buildCInvocationCode(functionName, inputEntries, signature?.returnType || '', signature?.parameterCount || 0)}
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
    const stdinPayload = hasMain ? buildStdinPayload(testCase.input) : '';
    const result = await executeProcess(execFile, [], timeoutMs, testCase, false, stdinPayload);
    
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
const executeProcess = (command, args, timeoutMs, testCase, isCompilation = false, stdinData = '') => {
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

      if (stdinData) {
        process.stdin.write(stdinData);
      }
      process.stdin.end();
      
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
        const output = parseExecutionOutput(stdout.trim());
        const passed = outputsMatch(output, testCase.output);
        
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
        const passed = outputsMatch(actualOutput, testCase.output);
        
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

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const sanitizeIdentifier = (name) => String(name || 'inputData').replace(/[^a-zA-Z0-9_]/g, '_').replace(/^\d/, '_$&');

const buildInputEntries = (input) => {
  if (isPlainObject(input)) {
    return Object.entries(input).map(([name, value]) => ({ name, value }));
  }

  return [{ name: 'inputData', value: input }];
};

const getInvocationArgs = (input) => buildInputEntries(input).map(({ value }) => value);

const extractFunctionNames = (code, language) => {
  const names = [];
  const addName = (name) => {
    if (!name) return;
    if (['if', 'for', 'while', 'switch', 'catch', 'main'].includes(name)) return;
    if (!names.includes(name)) names.push(name);
  };

  const patterns = {
    javascript: /function\s+([a-zA-Z_]\w*)\s*\(|(?:const|let|var)\s+([a-zA-Z_]\w*)\s*=\s*\([^)]*\)\s*=>/g,
    python: /def\s+([a-zA-Z_]\w*)\s*\(/g,
    cpp: /(?:^|\n)\s*(?:template\s*<[^>]+>\s*)?(?:[\w:<>,~*&\s]+)\s+([a-zA-Z_]\w*)\s*\([^;{}]*\)\s*\{/g,
    c: /(?:^|\n)\s*(?:[\w\s\*]+)\s+([a-zA-Z_]\w*)\s*\([^;{}]*\)\s*\{/g,
    java: /(?:public|private|protected)?\s*(?:static\s+)?[\w<>\[\]]+\s+([a-zA-Z_]\w*)\s*\([^;{}]*\)\s*\{/g,
  };

  const pattern = patterns[language];
  if (!pattern) return names;

  let match;
  while ((match = pattern.exec(code)) !== null) {
    addName(match[1] || match[2]);
  }

  ['solution', 'solve', 'frequencySort', 'sortByFrequency'].forEach(addName);

  return names;
};

const extractPrimaryFunctionName = (code, language) => extractFunctionNames(code, language)[0] || null;

const escapeCppString = (value) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');

const toCppLiteral = (value) => {
  if (value === null || value === undefined) return 'nullptr';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return `"${escapeCppString(value)}"`;
  if (Array.isArray(value)) {
    return `{${value.map(toCppLiteral).join(', ')}}`;
  }
  return '{}';
};

const inferCppType = (value) => {
  if (Array.isArray(value)) {
    if (value.length === 0) return 'vector<int>';
    return `vector<${inferCppType(value[0])}>`;
  }
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'bool';
  if (Number.isInteger(value)) return 'int';
  if (typeof value === 'number') return 'double';
  return 'int';
};

const buildCppDeclarations = (entries) =>
  entries
    .map(({ name, value }) => `    ${inferCppType(value)} ${sanitizeIdentifier(name)} = ${toCppLiteral(value)};`)
    .join('\n');

const normalizeCppSource = (code) =>
  code.replace(
    /#include\s*<bits\/stdc\+\+\.h>/g,
    [
      '#include <algorithm>',
      '#include <iostream>',
      '#include <string>',
      '#include <unordered_map>',
      '#include <utility>',
      '#include <vector>',
    ].join('\n')
  );

const extractCppFunctionSignature = (code, functionName) => {
  if (!functionName) return null;
  const pattern = new RegExp(`([\\w:<>,~*&\\s]+?)\\s+${functionName}\\s*\\(([^)]*)\\)\\s*\\{`);
  const match = code.match(pattern);
  if (!match) return null;

  const params = match[2].trim();
  const parameterCount = !params || params === 'void' ? 0 : params.split(',').length;

  return {
    returnType: match[1].trim(),
    parameterCount,
  };
};

const toJavaLiteral = (value) => {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  if (Array.isArray(value)) {
    const componentType = inferJavaType(value[0]);
    return `new ${componentType.replace(/\[\]$/, '')}[]{${value.map(toJavaLiteral).join(', ')}}`;
  }
  return 'null';
};

const inferJavaType = (value) => {
  if (Array.isArray(value)) {
    const inner = value.length ? inferJavaType(value[0]) : 'int';
    return `${inner}[]`;
  }
  if (typeof value === 'string') return 'String';
  if (typeof value === 'boolean') return 'boolean';
  if (Number.isInteger(value)) return 'int';
  if (typeof value === 'number') return 'double';
  return 'Object';
};

const buildJavaDeclarations = (entries) =>
  entries
    .map(({ name, value }) => `        ${inferJavaType(value)} ${sanitizeIdentifier(name)} = ${toJavaLiteral(value)};`)
    .join('\n');

const extractJavaClassName = (code) => {
  const match = code.match(/\bclass\s+([A-Z][A-Za-z0-9_]*)\b/);
  return match ? match[1] : null;
};

const inferCScalarType = (value) => {
  if (typeof value === 'string') return 'char*';
  return 'int';
};

const buildCDeclarations = (entries) =>
  entries
    .map(({ name, value }) => {
      const safeName = sanitizeIdentifier(name);
      if (Array.isArray(value)) {
        const items = value.map((item) => (typeof item === 'number' ? String(item) : '0')).join(', ');
        return `    int ${safeName}[] = {${items}};\n    int ${safeName}_len = ${value.length};`;
      }
      if (typeof value === 'string') {
        return `    char ${safeName}[] = "${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}";`;
      }
      if (typeof value === 'boolean') {
        return `    int ${safeName} = ${value ? 1 : 0};`;
      }
      return `    ${inferCScalarType(value)} ${safeName} = ${value ?? 0};`;
    })
    .join('\n');

const extractCFunctionSignature = (code, functionName) => {
  const pattern = new RegExp(`([\\w\\s\\*]+?)\\s+${functionName}\\s*\\(([^)]*)\\)\\s*\\{`);
  const match = code.match(pattern);
  if (!match) return null;

  const params = match[2].trim();
  const parameterCount = !params || params === 'void' ? 0 : params.split(',').length;

  return {
    returnType: match[1].trim(),
    parameterCount,
  };
};

const buildCInvocationArgs = (entries, parameterCount) => {
  const args = [];

  for (const { name, value } of entries) {
    const safeName = sanitizeIdentifier(name);
    if (Array.isArray(value)) {
      args.push(safeName);
      if (args.length < parameterCount) {
        args.push(`${safeName}_len`);
      }
    } else {
      args.push(safeName);
    }
  }

  return args.slice(0, parameterCount);
};

const buildCInvocationCode = (functionName, entries, returnType, parameterCount) => {
  const args = buildCInvocationArgs(entries, parameterCount).join(', ');

  if (/\*/.test(returnType)) {
    const arrayEntry = entries.find(({ value }) => Array.isArray(value));
    const arrayLen = arrayEntry ? `${sanitizeIdentifier(arrayEntry.name)}_len` : '0';
    return `    __result_array = ${functionName}(${args});\n    __result_len = ${arrayLen};\n    __print_int_array(__result_array, __result_len);\n`;
  }

  return `    __result_scalar = ${functionName}(${args});\n    printf("%d", __result_scalar);\n`;
};

const buildStdinPayload = (input) => {
  const serialize = (value) => {
    if (Array.isArray(value)) {
      if (value.every((item) => !Array.isArray(item) && !isPlainObject(item))) {
        return `${value.length}\n${value.join(' ')}\n`;
      }

      return `${value.length}\n${value.map((item) => serialize(item).trim()).join('\n')}\n`;
    }

    if (isPlainObject(value)) {
      return Object.values(value).map(serialize).join('');
    }

    if (typeof value === 'string') return `${value}\n`;
    if (typeof value === 'boolean') return `${value ? 1 : 0}\n`;
    return `${value}\n`;
  };

  return serialize(input);
};

const parseExecutionOutput = (rawOutput) => {
  if (!rawOutput) return '';

  try {
    return JSON.parse(rawOutput);
  } catch {
    const compact = rawOutput.trim();
    if (/^\[.*\]$/.test(compact) || /^\{.*\}$/.test(compact)) {
      try {
        return JSON.parse(compact.replace(/'/g, '"'));
      } catch {}
    }

    if (/^-?\d+(?:\s+-?\d+)+$/.test(compact)) {
      return compact.split(/\s+/).map(Number);
    }

    const numberValue = Number(compact);
    if (!Number.isNaN(numberValue) && compact !== '') {
      return numberValue;
    }

    return compact;
  }
};

const normalizeValue = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const numberValue = Number(trimmed);
      return Number.isNaN(numberValue) ? trimmed : numberValue;
    }
  }

  if (Array.isArray(value)) return value.map(normalizeValue);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeValue(item)]));
  }

  return value;
};

const outputsMatch = (actual, expected) => deepEqual(normalizeValue(actual), normalizeValue(expected));

const cleanupTempDir = async (tempDir) => {
  await fs.rm(tempDir, { recursive: true, force: true });
};

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
