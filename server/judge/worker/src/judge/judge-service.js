const fs = require('fs/promises');
const path = require('path');
const { randomUUID, createHash } = require('crypto');
const { getProblemById } = require('../../../shared/problems');
const { LANGUAGE_CONFIGS } = require('../../../shared/languages');
const { connection } = require('../../../shared/queue');
const { logger } = require('../../../shared/logger');
const { compareOutputs } = require('./checkers');
const { cleanupBox, runIsolated } = require('./sandbox');

const submissionKey = (submissionId) => `judge:submission:${submissionId}`;
const logsKey = (submissionId) => `judge:submission:${submissionId}:logs`;

const mergeLimits = (base, override) => ({
  cpuTimeMs: override?.cpuTimeMs ?? base.cpuTimeMs ?? 1000,
  realTimeMs: override?.realTimeMs ?? base.realTimeMs ?? 3000,
  memoryKb: override?.memoryKb ?? base.memoryKb ?? 262144,
  fileSizeKb: override?.fileSizeKb ?? base.fileSizeKb ?? 65536,
  outputLimitKb: override?.outputLimitKb ?? base.outputLimitKb ?? 256,
  processCount: override?.processCount ?? base.processCount ?? 16,
});

const appendLog = async (submissionId, event, payload) => {
  await connection.rpush(logsKey(submissionId), JSON.stringify({
    time: new Date().toISOString(),
    event,
    ...payload,
  }));
  await connection.expire(logsKey(submissionId), 60 * 60 * 24);
};

const updateSubmission = async (submissionId, patch) => {
  const current = JSON.parse(await connection.get(submissionKey(submissionId)));
  const updated = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await connection.set(submissionKey(submissionId), JSON.stringify(updated), 'EX', 60 * 60 * 24);
  return updated;
};

const createWorkDir = async (submissionId) => {
  const workDir = path.join(process.env.JUDGE_WORKDIR || '/tmp/judge-work', submissionId, randomUUID());
  await fs.mkdir(workDir, { recursive: true });
  return workDir;
};

const buildCompileResult = async ({ languageConfig, sourceCode, workDir, limits }) => {
  const sourcePath = path.join(workDir, languageConfig.sourceFile);
  await fs.writeFile(sourcePath, sourceCode, 'utf8');

  if (!languageConfig.compile) {
    return {
      compile: {
        verdict: 'SKIPPED',
        cpuTimeMs: 0,
        realTimeMs: 0,
        memoryKb: 0,
        stderr: '',
      },
      artifactDir: workDir,
    };
  }

  const stdoutPath = path.join(workDir, 'compile.stdout');
  const stderrPath = path.join(workDir, 'compile.stderr');
  const compileLimits = mergeLimits(limits, languageConfig.compile);
  const compileBoxId = Math.floor(Math.random() * 900) + 100;

  try {
    const started = Date.now();
    const result = await runIsolated({
      boxId: compileBoxId,
      workDir,
      command: languageConfig.compile.command,
      args: languageConfig.compile.args,
      stdoutPath,
      stderrPath,
      limits: compileLimits,
    });
    const stderr = await fs.readFile(stderrPath, 'utf8').catch(() => '');
    const stdout = await fs.readFile(stdoutPath, 'utf8').catch(() => '');

    if (result.verdict !== 'OK') {
      return {
        compile: {
          verdict: 'CE',
          cpuTimeMs: Number(result.meta.time || 0) * 1000,
          realTimeMs: Number(result.meta.time-wall || 0) * 1000,
          memoryKb: Math.ceil(Number(result.meta['cg-mem'] || 0) / 1024),
          stderr: stderr || stdout,
        },
        artifactDir: workDir,
      };
    }

    await connection.incrbyfloat('judge:metrics:compile_time_ms_total', Date.now() - started);
    await connection.incr('judge:metrics:compile_count');

    return {
      compile: {
        verdict: 'OK',
        cpuTimeMs: Number(result.meta.time || 0) * 1000,
        realTimeMs: Number(result.meta.time-wall || 0) * 1000,
        memoryKb: Math.ceil(Number(result.meta['cg-mem'] || 0) / 1024),
        stderr,
      },
      artifactDir: workDir,
    };
  } finally {
    await cleanupBox(compileBoxId, workDir);
  }
};

const judgeSubmission = async ({ submissionId, problemId, language, sourceCode }) => {
  const problem = getProblemById(problemId);
  if (!problem) {
    await updateSubmission(submissionId, {
      status: 'system_error',
      error: {
        code: 'problem_not_found',
        message: `Unknown problem ${problemId}`,
      },
    });
    return;
  }

  const languageConfig = LANGUAGE_CONFIGS[language];
  if (!languageConfig) {
    await updateSubmission(submissionId, {
      status: 'system_error',
      error: {
        code: 'unsupported_language',
        message: `Unsupported language ${language}`,
      },
    });
    return;
  }

  const limits = mergeLimits(problem.limits, null);
  const workDir = await createWorkDir(submissionId);
  await updateSubmission(submissionId, { status: 'running', startedAt: new Date().toISOString() });
  await appendLog(submissionId, 'submission_started', { problemId, language });

  try {
    const compileResult = await buildCompileResult({ languageConfig, sourceCode, workDir, limits });
    await appendLog(submissionId, 'compile_finished', compileResult.compile);

    if (compileResult.compile.verdict === 'CE') {
      await updateSubmission(submissionId, {
        status: 'finished',
        verdict: 'CE',
        compile: compileResult.compile,
        testcases: [],
      });
      return;
    }

    const testcaseResults = [];
    for (let index = 0; index < problem.testcases.length; index += 1) {
      const testcase = problem.testcases[index];
      const testcaseDir = path.join(workDir, `tc-${index + 1}`);
      await fs.mkdir(testcaseDir, { recursive: true });

      const sourcePath = path.join(workDir, languageConfig.sourceFile);
      const runSourcePath = path.join(testcaseDir, languageConfig.sourceFile);
      await fs.copyFile(sourcePath, runSourcePath).catch(() => {});

      if (languageConfig.executable && languageConfig.executable !== languageConfig.sourceFile) {
        await fs.copyFile(path.join(workDir, languageConfig.executable), path.join(testcaseDir, languageConfig.executable)).catch(() => {});
      }

      const stdinPath = path.join(testcaseDir, 'input.txt');
      const stdoutPath = path.join(testcaseDir, 'stdout.txt');
      const stderrPath = path.join(testcaseDir, 'stderr.txt');
      await fs.writeFile(stdinPath, testcase.stdin, 'utf8');

      const runBoxId = Math.floor(Math.random() * 900) + 1000 + index;
      let verdict = 'SE';
      let meta = {};
      try {
        const runResult = await runIsolated({
          boxId: runBoxId,
          workDir: testcaseDir,
          command: languageConfig.run.command,
          args: languageConfig.run.args,
          stdinPath,
          stdoutPath,
          stderrPath,
          limits,
        });
        verdict = runResult.verdict;
        meta = runResult.meta;
      } finally {
        await cleanupBox(runBoxId, testcaseDir);
      }

      const actualOutput = await fs.readFile(stdoutPath, 'utf8').catch(() => '');
      const stderr = await fs.readFile(stderrPath, 'utf8').catch(() => '');
      const compare = verdict === 'OK'
        ? await compareOutputs({ checker: problem.checker, testcase, actualOutput, workDir: testcaseDir })
        : { passed: false, message: verdict };

      if (verdict === 'OK' && !compare.passed) {
        verdict = 'WA';
      }

      if (actualOutput.length > limits.outputLimitKb * 1024) {
        verdict = 'OLE';
      }

      const runtimeMs = Number(meta.time || 0) * 1000;
      await connection.incrbyfloat('judge:metrics:run_time_ms_total', runtimeMs);
      await connection.incr('judge:metrics:run_count');

      const testcaseResult = {
        testcaseId: testcase.id,
        verdict,
        passed: verdict === 'OK',
        cpuTimeMs: runtimeMs,
        realTimeMs: Number(meta['time-wall'] || 0) * 1000,
        memoryKb: Math.ceil(Number(meta['cg-mem'] || 0) / 1024),
        outputBytes: Buffer.byteLength(actualOutput, 'utf8'),
        stderr,
        checkerMessage: compare.message,
        outputSha256: createHash('sha256').update(actualOutput).digest('hex'),
      };

      testcaseResults.push(testcaseResult);
      await appendLog(submissionId, 'testcase_finished', testcaseResult);

      if (verdict !== 'OK') {
        break;
      }
    }

    const overallVerdict = testcaseResults.every((result) => result.verdict === 'OK')
      ? 'AC'
      : testcaseResults.find((result) => result.verdict !== 'OK').verdict;

    await updateSubmission(submissionId, {
      status: 'finished',
      verdict: overallVerdict,
      compile: compileResult.compile,
      testcases: testcaseResults,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ submissionId, error: error.message, stack: error.stack }, 'judge execution failed');
    await updateSubmission(submissionId, {
      status: 'system_error',
      error: {
        code: 'judge_failed',
        message: error.message,
      },
      finishedAt: new Date().toISOString(),
    });
    await appendLog(submissionId, 'submission_failed', { error: error.message });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
};

module.exports = {
  judgeSubmission,
};
