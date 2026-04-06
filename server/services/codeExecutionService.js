const { spawn, execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// ─── Configuration ────────────────────────────────────────────────────────────

const DOCKER_IMAGE = 'thinkflow-judge:latest';
const MAX_OUTPUT_BYTES = 64 * 1024; // 64 KB output cap (industry standard)
const MAX_CONCURRENT = 5;           // Max concurrent submissions
const TEMP_ROOT = path.resolve(__dirname, '..', '.judge-tmp');

// Industry-standard timeouts (milliseconds)
const TIMEOUTS = {
  javascript: { execute: 3000 },
  python: { execute: 5000 },
  cpp: { compile: 15000, execute: 2000 },
  java: { compile: 15000, execute: 3000 },
  c: { compile: 15000, execute: 2000 },
};

// Industry-standard compiler/runtime flags
const COMPILE_COMMANDS = {
  cpp: (src, out) => ['g++', '-std=c++17', '-O2', '-DONLINE_JUDGE', '-o', out, src],
  c: (src, out) => ['gcc', '-std=c11', '-O2', '-DONLINE_JUDGE', '-lm', '-o', out, src],
  java: (src) => ['javac', src],
};

const RUN_COMMANDS = {
  javascript: (src) => ['node', '--max-old-space-size=256', src],
  python: (src) => ['python3', '-u', src],
  cpp: (bin) => [bin],
  c: (bin) => [bin],
  java: (cls, dir) => ['java', '-Xmx256m', '-cp', dir, cls],
};

// Docker resource limits (matching LeetCode / Codeforces)
const DOCKER_LIMITS = [
  '--memory=256m',
  '--memory-swap=256m',    // No swap
  '--cpus=1',
  '--network=none',        // No internet
  '--pids-limit=64',       // Prevent fork bombs
  '--read-only',           // Read-only root filesystem
  '--tmpfs=/tmp:rw,noexec,nosuid,size=64m',  // Writable /tmp
  '--security-opt=no-new-privileges',
  '--rm',                  // Auto-remove container
];

// ─── Concurrency Limiter ──────────────────────────────────────────────────────

let activeSubmissions = 0;
const waitQueue = [];

const acquireSlot = () =>
  new Promise((resolve) => {
    if (activeSubmissions < MAX_CONCURRENT) {
      activeSubmissions++;
      resolve();
    } else {
      waitQueue.push(resolve);
    }
  });

const releaseSlot = () => {
  activeSubmissions--;
  if (waitQueue.length > 0) {
    activeSubmissions++;
    const next = waitQueue.shift();
    next();
  }
};

// ─── Docker Availability Detection ────────────────────────────────────────────

let _dockerAvailable = null;

const isDockerAvailable = () => {
  if (_dockerAvailable !== null) return _dockerAvailable;
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 });
    // Check if our judge image exists
    execSync(`docker image inspect ${DOCKER_IMAGE}`, { stdio: 'ignore', timeout: 5000 });
    _dockerAvailable = true;
    console.log('[Judge] Docker mode: ENABLED (production-grade sandboxing)');
  } catch {
    _dockerAvailable = false;
    console.warn('[Judge] Docker mode: DISABLED — falling back to subprocess mode');
    console.warn('[Judge] ⚠ Run "docker compose build" to enable secure sandboxed execution');
  }
  return _dockerAvailable;
};

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Execute code against test cases (multi-language support)
 * @param {string} code - The user's code to execute
 * @param {Array} testCases - Array of test cases from the problem
 * @param {string} language - Programming language (javascript, python, cpp, java, c)
 * @param {number} timeoutMs - Maximum execution time in milliseconds (override)
 * @returns {Object} Execution results
 */
const executeCode = async (code, testCases, language = 'javascript', timeoutMs = null) => {
  const lang = language.toLowerCase();
  const config = getLanguageConfig(lang);

  if (!config) {
    return {
      status: 'error',
      error: `Unsupported language: ${language}`,
      results: [],
      passedCount: 0,
      totalCount: testCases.length,
      score: 0,
    };
  }

  // Acquire concurrency slot
  await acquireSlot();

  try {
    const results = [];

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      const result = await config.executor(code, testCase, timeoutMs || config.timeout);
      results.push(result);
    }

    const passedCount = results.filter((r) => r.passed).length;
    const totalCount = results.length;

    let status;
    if (passedCount === totalCount) {
      status = 'correct';
    } else if (passedCount > 0) {
      status = 'partially_correct';
    } else {
      status = 'incorrect';
    }

    return { status, results, passedCount, totalCount, score: Math.round((passedCount / totalCount) * 100) };
  } catch (error) {
    console.error('[Judge] Execution error:', error.message);
    return {
      status: 'error',
      error: error.message || 'Unknown execution error',
      errorDetails: error.stack,
      results: [],
      passedCount: 0,
      totalCount: testCases.length,
      score: 0,
    };
  } finally {
    releaseSlot();
  }
};

// ─── Docker Execution ─────────────────────────────────────────────────────────

/**
 * Execute a command inside a Docker container with sandboxing.
 * Files in `hostDir` are mounted as the isolated workspace at /sandbox so
 * compiled artifacts persist across the compile and run phases of one job.
 */
const dockerExec = (hostDir, command, args, timeoutMs, stdinData = '') => {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const quotedArgs = args.map(shellEscape).join(' ');
    const commandLine = [shellEscape(command), quotedArgs].filter(Boolean).join(' ');

    const dockerArgs = [
      'run',
      ...DOCKER_LIMITS,
      '-v', `${hostDir}:/sandbox`,           // Mount isolated job workspace
      '-w', '/sandbox',
      DOCKER_IMAGE,
      'bash', '-c',
      commandLine,
    ];

    const proc = spawn('docker', dockerArgs);

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, timeoutMs + 2000); // Extra 2s for Docker overhead

    proc.stdout.on('data', (data) => {
      stdoutBytes += data.length;
      if (stdoutBytes <= MAX_OUTPUT_BYTES) {
        stdout += data.toString();
      }
    });

    proc.stderr.on('data', (data) => {
      stderrBytes += data.length;
      if (stderrBytes <= MAX_OUTPUT_BYTES) {
        stderr += data.toString();
      }
    });

    if (stdinData) {
      proc.stdin.write(stdinData);
    }
    proc.stdin.end();

    proc.on('close', (exitCode) => {
      clearTimeout(timer);
      const executionTime = Date.now() - startTime;

      if (stdoutBytes > MAX_OUTPUT_BYTES) {
        resolve({ exitCode: 1, stdout: stdout.slice(0, MAX_OUTPUT_BYTES), stderr: 'Output Limit Exceeded', executionTime, timedOut: false, ole: true });
        return;
      }

      resolve({ exitCode, stdout: stdout.trim(), stderr: stderr.trim(), executionTime, timedOut, ole: false });
    });

    proc.on('error', (error) => {
      clearTimeout(timer);
      resolve({ exitCode: 1, stdout: '', stderr: error.message, executionTime: Date.now() - startTime, timedOut: false, ole: false });
    });
  });
};

const shellEscape = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

const makeTempDir = async (prefix) => {
  await fs.mkdir(TEMP_ROOT, { recursive: true });
  return fs.mkdtemp(path.join(TEMP_ROOT, prefix));
};

// ─── Subprocess Fallback (Dev Mode) ───────────────────────────────────────────

/**
 * Execute a command as a subprocess (no Docker).
 * Used when Docker is not available (local development).
 */
const subprocessExec = (command, args, timeoutMs, stdinData = '') => {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL'); // Use SIGKILL, not SIGTERM
    }, timeoutMs);

    proc.stdout.on('data', (data) => {
      stdoutBytes += data.length;
      if (stdoutBytes <= MAX_OUTPUT_BYTES) {
        stdout += data.toString();
      }
    });

    proc.stderr.on('data', (data) => {
      stderrBytes += data.length;
      if (stderrBytes <= MAX_OUTPUT_BYTES) {
        stderr += data.toString();
      }
    });

    if (stdinData) {
      proc.stdin.write(stdinData);
    }
    proc.stdin.end();

    proc.on('close', (exitCode) => {
      clearTimeout(timer);
      const executionTime = Date.now() - startTime;

      if (stdoutBytes > MAX_OUTPUT_BYTES) {
        resolve({ exitCode: 1, stdout: stdout.slice(0, MAX_OUTPUT_BYTES), stderr: 'Output Limit Exceeded', executionTime, timedOut: false, ole: true });
        return;
      }

      resolve({ exitCode, stdout: stdout.trim(), stderr: stderr.trim(), executionTime, timedOut, ole: false });
    });

    proc.on('error', (error) => {
      clearTimeout(timer);
      if (error.code === 'ENOENT') {
        resolve({ exitCode: 1, stdout: '', stderr: `${command} is not installed or not found in PATH`, executionTime: Date.now() - startTime, timedOut: false, ole: false });
      } else {
        resolve({ exitCode: 1, stdout: '', stderr: error.message, executionTime: Date.now() - startTime, timedOut: false, ole: false });
      }
    });
  });
};

// ─── Unified Execution Wrapper ────────────────────────────────────────────────

/**
 * Run a command with either Docker or subprocess fallback.
 * For Docker mode, `hostDir` is mounted into the container.
 * For subprocess mode, `command + args` are run directly.
 */
const runCommand = async (hostDir, command, args, timeoutMs, stdinData = '') => {
  if (isDockerAvailable()) {
    return dockerExec(hostDir, command, args, timeoutMs, stdinData);
  }
  return subprocessExec(command, args, timeoutMs, stdinData);
};

// ─── Language Executors ───────────────────────────────────────────────────────

const executeJavaScript = async (code, testCase, timeoutMs) => {
  const tempDir = await makeTempDir('tf-js-');
  const sourceFile = path.join(tempDir, 'solution.js');

  try {
    const functionNames = extractFunctionNames(code, 'javascript');
    const wrappedCode = `
${code}

const __testInput = ${JSON.stringify(testCase.input)};
const __argValues = ${JSON.stringify(getInvocationArgs(testCase.input))};
const __candidateNames = ${JSON.stringify(functionNames)};

const __invoke = (fn) => {
  if (typeof fn !== 'function') return { found: false };
  if (__argValues.length > 1) return { found: true, value: fn(...__argValues) };
  if (__argValues.length === 1) {
    try { return { found: true, value: fn(__argValues[0]) }; }
    catch { return { found: true, value: fn(__testInput) }; }
  }
  return { found: true, value: fn(__testInput) };
};

let __result;
for (const __name of __candidateNames) {
  const __fn = typeof global[__name] === 'function' ? global[__name]
             : typeof globalThis[__name] === 'function' ? globalThis[__name]
             : eval('typeof ' + __name + ' === "function" ? ' + __name + ' : null');
  const __out = __invoke(__fn);
  if (__out.found) { __result = __out.value; break; }
}
if (__result === undefined && __candidateNames.length === 0) {
  throw new Error('No runnable function found. Define solution(...) or solve(...).');
}
console.log(JSON.stringify(__result));
`;
    await fs.writeFile(sourceFile, wrappedCode);

    const execTimeout = timeoutMs || TIMEOUTS.javascript.execute;
    const result = isDockerAvailable()
      ? await runCommand(tempDir, 'node', ['--max-old-space-size=256', 'solution.js'], execTimeout)
      : await subprocessExec('node', ['--max-old-space-size=256', sourceFile], execTimeout);

    return buildTestResult(result, testCase);
  } finally {
    await cleanup(tempDir);
  }
};

const executePython = async (code, testCase, timeoutMs) => {
  const tempDir = await makeTempDir('tf-py-');
  const sourceFile = path.join(tempDir, 'solution.py');

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
    await fs.writeFile(sourceFile, wrappedCode);

    const execTimeout = timeoutMs || TIMEOUTS.python.execute;
    const result = isDockerAvailable()
      ? await runCommand(tempDir, 'python3', ['-u', 'solution.py'], execTimeout)
      : await subprocessExec('python3', ['-u', sourceFile], execTimeout);

    return buildTestResult(result, testCase);
  } finally {
    await cleanup(tempDir);
  }
};

const executeCpp = async (code, testCase, timeoutMs) => {
  const tempDir = await makeTempDir('tf-cpp-');
  const sourceFile = path.join(tempDir, 'solution.cpp');

  try {
    const normalizedCode = normalizeCppSource(code);
    const hasMain = normalizedCode.includes('int main');
    const functionName = extractPrimaryFunctionName(normalizedCode, 'cpp');
    const signature = extractCppFunctionSignature(normalizedCode, functionName);
    const shouldWrapFunction = Boolean(functionName && signature);

    let finalCode;
    if (hasMain && !shouldWrapFunction) {
      finalCode = normalizedCode;
    } else {
      if (!functionName) {
        throw new Error('No C++ function found. Define solution(...), solve(...), or a named function.');
      }

      const inputEntries = buildInputEntries(testCase.input);
      const declarations = buildCppDeclarations(inputEntries);
      const invocationArgs = signature?.parameterCount === 0
        ? ''
        : inputEntries.map(({ name }) => sanitizeIdentifier(name)).join(', ');

      finalCode = `
#include <algorithm>
#include <climits>
#include <cmath>
#include <cstring>
#include <deque>
#include <functional>
#include <iostream>
#include <map>
#include <numeric>
#include <queue>
#include <set>
#include <stack>
#include <string>
#include <type_traits>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>
using namespace std;

${stripFunctionByName(normalizedCode, 'main')}

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
    const compileCmd = COMPILE_COMMANDS.cpp('solution.cpp', 'solution');
    const compileResult = isDockerAvailable()
      ? await runCommand(tempDir, compileCmd[0], compileCmd.slice(1), TIMEOUTS.cpp.compile)
      : await subprocessExec('g++', ['-std=c++17', '-O2', '-DONLINE_JUDGE', '-o', path.join(tempDir, 'solution'), sourceFile], TIMEOUTS.cpp.compile);

    if (compileResult.exitCode !== 0) {
      return buildCompileError(compileResult, testCase);
    }

    // Execute
    const execTimeout = timeoutMs || TIMEOUTS.cpp.execute;
    const stdinPayload = (hasMain && !shouldWrapFunction) || signature?.parameterCount === 0
      ? buildStdinPayload(testCase.input)
      : '';
    const execResult = isDockerAvailable()
      ? await runCommand(tempDir, './solution', [], execTimeout, stdinPayload)
      : await subprocessExec(path.join(tempDir, 'solution'), [], execTimeout, stdinPayload);

    return buildTestResult(execResult, testCase);
  } finally {
    await cleanup(tempDir);
  }
};

const executeJava = async (code, testCase, timeoutMs) => {
  const tempDir = await makeTempDir('tf-java-');

  try {
    const hasMain = /\bpublic\s+static\s+void\s+main\s*\(/.test(code);
    const declaredClassName = extractJavaClassName(code);
    const functionName = extractPrimaryFunctionName(code, 'java');
    const inputEntries = buildInputEntries(testCase.input);
    const invocationArgs = inputEntries.map(({ name }) => sanitizeIdentifier(name)).join(', ');
    const userClassName = declaredClassName || 'Solution';
    const shouldWrapFunction = Boolean(functionName);
    const mainClassName = hasMain ? userClassName : 'Solution';
    const sourceFile = path.join(tempDir, `${mainClassName}.java`);

    let finalCode = code;
    if (!hasMain || shouldWrapFunction) {
      if (!functionName) {
        throw new Error('No Java method found. Define solution(...), solve(...), or a named method.');
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

    // For Java, we need the runner class file too
    const runnerFile = path.join(tempDir, 'Runner.java');
    if (!hasMain || shouldWrapFunction) {
      // Write the Solution class and Runner class separately
      const solutionCode = declaredClassName ? code : `import java.util.*;\n\npublic class Solution {\n${code}\n}\n`;
      await fs.writeFile(path.join(tempDir, 'Solution.java'), solutionCode);
      // Write Runner
      const runnerCode = finalCode.replace(solutionCode, '').replace(/import java\.util\.\*;\s*/, '');
      // Actually, write the full combined file under mainClassName
      await fs.writeFile(sourceFile, finalCode);
    } else {
      await fs.writeFile(sourceFile, finalCode);
    }

    // Compile
    const compileResult = isDockerAvailable()
      ? await runCommand(tempDir, 'javac', [`${mainClassName}.java`], TIMEOUTS.java.compile)
      : await subprocessExec('javac', [sourceFile], TIMEOUTS.java.compile);

    if (compileResult.exitCode !== 0) {
      return buildCompileError(compileResult, testCase);
    }

    // Execute
    const runClass = (!hasMain || shouldWrapFunction) ? 'Runner' : mainClassName;
    const execTimeout = timeoutMs || TIMEOUTS.java.execute;
    const stdinPayload = (hasMain && !shouldWrapFunction) ? buildStdinPayload(testCase.input) : '';
    const execResult = isDockerAvailable()
      ? await runCommand(tempDir, 'java', ['-Xmx256m', '-cp', '/sandbox', runClass], execTimeout, stdinPayload)
      : await subprocessExec('java', ['-Xmx256m', '-cp', tempDir, runClass], execTimeout, stdinPayload);

    return buildTestResult(execResult, testCase);
  } finally {
    await cleanup(tempDir);
  }
};

const executeC = async (code, testCase, timeoutMs) => {
  const tempDir = await makeTempDir('tf-c-');
  const sourceFile = path.join(tempDir, 'solution.c');

  try {
    const hasMain = code.includes('int main');
    const functionName = extractPrimaryFunctionName(code, 'c');
    const signature = extractCFunctionSignature(code, functionName);
    const shouldWrapFunction = Boolean(functionName && signature);

    let finalCode;
    if (hasMain && !shouldWrapFunction) {
      finalCode = code;
    } else {
      if (!functionName) {
        throw new Error('No C function found. Define solution(...), solve(...), or write a full program with main().');
      }

      const inputEntries = buildInputEntries(testCase.input);
      const declarations = buildCDeclarations(inputEntries);
      const invocationArgs = buildCInvocationArgs(inputEntries, signature?.parameterCount || 0).join(', ');

      finalCode = `
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

${stripFunctionByName(code, 'main')}

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

${buildCInvocationCode(functionName, inputEntries, signature?.returnType || '', signature?.parameterCount || 0, testCase.output)}
    return 0;
}
`;
    }

    await fs.writeFile(sourceFile, finalCode);

    // Compile
    const compileCmd = COMPILE_COMMANDS.c('solution.c', 'solution');
    const compileResult = isDockerAvailable()
      ? await runCommand(tempDir, compileCmd[0], compileCmd.slice(1), TIMEOUTS.c.compile)
      : await subprocessExec('gcc', ['-std=c11', '-O2', '-DONLINE_JUDGE', '-lm', '-o', path.join(tempDir, 'solution'), sourceFile], TIMEOUTS.c.compile);

    if (compileResult.exitCode !== 0) {
      return buildCompileError(compileResult, testCase);
    }

    // Execute
    const execTimeout = timeoutMs || TIMEOUTS.c.execute;
    const stdinPayload = (hasMain && !shouldWrapFunction) ? buildStdinPayload(testCase.input) : '';
    const execResult = isDockerAvailable()
      ? await runCommand(tempDir, './solution', [], execTimeout, stdinPayload)
      : await subprocessExec(path.join(tempDir, 'solution'), [], execTimeout, stdinPayload);

    return buildTestResult(execResult, testCase);
  } finally {
    await cleanup(tempDir);
  }
};

// ─── Result Builders ──────────────────────────────────────────────────────────

const buildTestResult = (execResult, testCase) => {
  const { exitCode, stdout, stderr, executionTime, timedOut, ole } = execResult;

  if (timedOut) {
    return {
      input: testCase.input,
      expectedOutput: testCase.output,
      actualOutput: null,
      passed: false,
      executionTime,
      error: 'Time Limit Exceeded',
      errorDetails: { message: 'Code execution exceeded time limit. Check for infinite loops or optimize your algorithm.' },
    };
  }

  if (ole) {
    return {
      input: testCase.input,
      expectedOutput: testCase.output,
      actualOutput: null,
      passed: false,
      executionTime,
      error: 'Output Limit Exceeded',
      errorDetails: { message: 'Your program produced too much output. Limit: 64KB.' },
    };
  }

  if (exitCode !== 0) {
    const isMemoryError = stderr.includes('bad_alloc') ||
      stderr.includes('MemoryError') ||
      stderr.includes('OutOfMemoryError') ||
      stderr.includes('JavaScript heap out of memory') ||
      stderr.includes('ENOMEM') ||
      exitCode === 137; // OOM killed

    if (isMemoryError) {
      return {
        input: testCase.input,
        expectedOutput: testCase.output,
        actualOutput: null,
        passed: false,
        executionTime,
        error: 'Memory Limit Exceeded',
        errorDetails: { message: 'Your program exceeded the 256MB memory limit.' },
      };
    }

    return {
      input: testCase.input,
      expectedOutput: testCase.output,
      actualOutput: null,
      passed: false,
      executionTime,
      error: `Runtime Error:\n${stderr || 'Process exited with code ' + exitCode}`,
      errorDetails: { message: stderr },
    };
  }

  // Parse output and compare
  try {
    const comparableStdout = extractComparableOutput(stdout);
    const output = parseExecutionOutput(comparableStdout);
    const passed = outputsMatch(output, testCase.output);

    return {
      input: testCase.input,
      expectedOutput: testCase.output,
      actualOutput: output,
      passed,
      executionTime,
      error: null,
      errorDetails: null,
    };
  } catch {
    const comparableStdout = extractComparableOutput(stdout);
    const passed = outputsMatch(comparableStdout, testCase.output);
    return {
      input: testCase.input,
      expectedOutput: testCase.output,
      actualOutput: comparableStdout,
      passed,
      executionTime,
      error: passed ? null : 'Output format mismatch',
      errorDetails: passed ? null : { message: `Expected: ${testCase.output}, Got: ${comparableStdout}` },
    };
  }
};

const buildCompileError = (compileResult, testCase) => ({
  input: testCase.input,
  expectedOutput: testCase.output,
  actualOutput: null,
  passed: false,
  executionTime: compileResult.executionTime,
  error: `Compilation Error:\n${compileResult.stderr}`,
  errorDetails: { message: compileResult.stderr },
});

// ─── Helper Utilities ─────────────────────────────────────────────────────────

const cleanup = async (tempDir) => {
  try {
    await fs.rm(tempDir, { recursive: true, force: true });
  } catch { }
};

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

const extractPrimaryFunctionName = (code, language) => {
  const names = extractFunctionNames(code, language);
  const existsInCode = (name) => new RegExp(`\\b${name}\\s*\\(`).test(code);
  const preferred = ['solution', 'solve', 'frequencySort', 'sortByFrequency']
    .find((candidate) => names.includes(candidate) && existsInCode(candidate));
  return preferred || names.find(existsInCode) || null;
};

// ─── C++ Helpers ──────────────────────────────────────────────────────────────

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
  if (Array.isArray(value)) return `{${value.map(toCppLiteral).join(', ')}}`;
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
      '#include <climits>',
      '#include <cmath>',
      '#include <cstring>',
      '#include <deque>',
      '#include <functional>',
      '#include <iostream>',
      '#include <map>',
      '#include <numeric>',
      '#include <queue>',
      '#include <set>',
      '#include <stack>',
      '#include <string>',
      '#include <unordered_map>',
      '#include <unordered_set>',
      '#include <utility>',
      '#include <vector>',
    ].join('\n')
  );

const stripFunctionByName = (code, functionName) => {
  if (!functionName) return code;

  const pattern = new RegExp(`(^|\\n)([^\\n]*\\b${functionName}\\s*\\([^\\n]*\\)\\s*\\{)`, 'm');
  const match = pattern.exec(code);
  if (!match) return code;

  const startIndex = match.index + match[1].length;
  const openBraceIndex = code.indexOf('{', startIndex);
  if (openBraceIndex === -1) return code;

  let depth = 0;
  let endIndex = openBraceIndex;
  for (; endIndex < code.length; endIndex++) {
    const char = code[endIndex];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        endIndex += 1;
        break;
      }
    }
  }

  while (endIndex < code.length && /\s/.test(code[endIndex])) {
    endIndex += 1;
  }

  return `${code.slice(0, startIndex)}\n${code.slice(endIndex)}`.trim();
};

const extractCppFunctionSignature = (code, functionName) => {
  if (!functionName) return null;
  const pattern = new RegExp(`([\\w:<>,~*&\\s]+?)\\s+${functionName}\\s*\\(([^)]*)\\)\\s*\\{`);
  const match = code.match(pattern);
  if (!match) return null;

  const params = match[2].trim();
  const parameterCount = !params || params === 'void' ? 0 : params.split(',').length;

  return { returnType: match[1].trim(), parameterCount };
};

// ─── Java Helpers ─────────────────────────────────────────────────────────────

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

// ─── C Helpers ────────────────────────────────────────────────────────────────

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

  return { returnType: match[1].trim(), parameterCount };
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

const buildCInvocationCode = (functionName, entries, returnType, parameterCount, expectedOutput) => {
  const args = buildCInvocationArgs(entries, parameterCount).join(', ');

  if (/\*/.test(returnType)) {
    // Use expected output length if available (more accurate than input array length)
    let arrayLen;
    if (Array.isArray(expectedOutput)) {
      arrayLen = String(expectedOutput.length);
    } else {
      const arrayEntry = entries.find(({ value }) => Array.isArray(value));
      arrayLen = arrayEntry ? `${sanitizeIdentifier(arrayEntry.name)}_len` : '0';
    }
    return `    __result_array = ${functionName}(${args});\n    __result_len = ${arrayLen};\n    __print_int_array(__result_array, __result_len);\n`;
  }

  return `    __result_scalar = ${functionName}(${args});\n    printf("%d", __result_scalar);\n`;
};

// ─── stdin / stdout helpers ───────────────────────────────────────────────────

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

const extractComparableOutput = (rawOutput) => {
  const text = String(rawOutput || '').trim();
  if (!text) return '';

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) return text;
  return lines[lines.length - 1];
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
      } catch { }
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

// ─── Output Comparison ────────────────────────────────────────────────────────

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

// ─── Legacy API ───────────────────────────────────────────────────────────────

const validateCode = (code) => {
  try {
    if (!code || code.trim().length === 0) {
      return { valid: false, error: 'Code cannot be empty' };
    }
    new Function(code);
    if (!code.includes('function') && !code.includes('=>')) {
      return { valid: false, error: 'Code must define a function (solution or solve)' };
    }
    return { valid: true, error: null };
  } catch (error) {
    return { valid: false, error: `Syntax error: ${error.message}`, details: parseError(error, code) };
  }
};

const parseError = (error, code) => {
  const errorMessage = error.message || 'Unknown error';
  const errorType = error.name || 'Error';

  let lineNumber = null;
  let columnNumber = null;
  let errorLine = null;

  const lineMatch = errorMessage.match(/line (\d+)/i);
  if (lineMatch) lineNumber = parseInt(lineMatch[1]);

  if (!lineNumber && error.stack) {
    const stackMatch = error.stack.match(/:(\d+):(\d+)/);
    if (stackMatch) {
      lineNumber = parseInt(stackMatch[1]);
      columnNumber = parseInt(stackMatch[2]);
    }
  }

  if (lineNumber) {
    const lines = code.split('\n');
    if (lineNumber > 0 && lineNumber <= lines.length) {
      errorLine = lines[lineNumber - 1];
    }
  }

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

  return { type: errorType, message: errorMessage, lineNumber, columnNumber, errorLine, suggestion, fullStack: error.stack };
};

// ─── Language Configuration ───────────────────────────────────────────────────

const getLanguageConfig = (language) => {
  const configs = {
    javascript: {
      extension: 'js',
      timeout: TIMEOUTS.javascript.execute,
      executor: executeJavaScript,
    },
    python: {
      extension: 'py',
      timeout: TIMEOUTS.python.execute,
      executor: executePython,
    },
    cpp: {
      extension: 'cpp',
      timeout: TIMEOUTS.cpp.execute,
      executor: executeCpp,
    },
    java: {
      extension: 'java',
      timeout: TIMEOUTS.java.execute,
      executor: executeJava,
    },
    c: {
      extension: 'c',
      timeout: TIMEOUTS.c.execute,
      executor: executeC,
    },
  };

  return configs[language] || null;
};

// ─── Backward Compatibility ───────────────────────────────────────────────────

const executeSingleTestCase = executeJavaScript;

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  executeCode,
  executeSingleTestCase,
  validateCode,
  deepEqual,
  parseError,
};
