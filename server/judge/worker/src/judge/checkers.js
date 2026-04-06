const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { resolveCheckerPath } = require('../../../shared/languages');

const normalizeTrimmed = (value) => value.replace(/\s+$/g, '').split(/\r?\n/).map((line) => line.trimEnd()).join('\n');

const exactCompare = async ({ expectedOutput, actualOutput }) => ({
  passed: expectedOutput === actualOutput,
  message: expectedOutput === actualOutput ? null : 'exact_mismatch',
});

const trimmedCompare = async ({ expectedOutput, actualOutput }) => ({
  passed: normalizeTrimmed(expectedOutput) === normalizeTrimmed(actualOutput),
  message: normalizeTrimmed(expectedOutput) === normalizeTrimmed(actualOutput) ? null : 'trimmed_mismatch',
});

const customCompare = async ({ checkerFile, testcase, actualOutput, workDir }) => {
  const checkerPath = resolveCheckerPath(checkerFile);
  const inputPath = path.join(workDir, `${testcase.id}.in`);
  const expectedPath = path.join(workDir, `${testcase.id}.expected`);
  const actualPath = path.join(workDir, `${testcase.id}.actual`);

  await Promise.all([
    fs.writeFile(inputPath, testcase.stdin, 'utf8'),
    fs.writeFile(expectedPath, testcase.expectedOutput, 'utf8'),
    fs.writeFile(actualPath, actualOutput, 'utf8'),
  ]);

  return new Promise((resolve) => {
    const child = spawn('python3', [checkerPath, inputPath, expectedPath, actualPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      resolve({
        passed: code === 0,
        message: code === 0 ? null : (stderr.trim() || 'custom_checker_failed'),
      });
    });
  });
};

const compareOutputs = async ({ checker, testcase, actualOutput, workDir }) => {
  if (checker.type === 'trimmed') {
    return trimmedCompare({ expectedOutput: testcase.expectedOutput, actualOutput });
  }

  if (checker.type === 'custom') {
    return customCompare({
      checkerFile: checker.checkerFile,
      testcase,
      actualOutput,
      workDir,
    });
  }

  return exactCompare({ expectedOutput: testcase.expectedOutput, actualOutput });
};

module.exports = {
  compareOutputs,
};
