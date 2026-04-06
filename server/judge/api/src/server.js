const express = require('express');
const { randomUUID } = require('crypto');
const { z } = require('zod');
const { submissionQueue, connection } = require('../../shared/queue');
const { logger } = require('../../shared/logger');
const { getProblemById, loadProblems } = require('../../shared/problems');

const app = express();
app.use(express.json({ limit: '1mb' }));

const port = Number(process.env.JUDGE_API_PORT || 4010);
const submissionSchema = z.object({
  problemId: z.string().min(1),
  language: z.enum(['c', 'cpp', 'java', 'python', 'javascript']),
  sourceCode: z.string().min(1),
});

const submissionKey = (submissionId) => `judge:submission:${submissionId}`;

app.get('/healthz', async (_req, res) => {
  try {
    await connection.ping();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/problems', (_req, res) => {
  res.json({
    problems: loadProblems().map((problem) => ({
      id: problem.id,
      title: problem.title,
      testcaseCount: problem.testcases.length,
      checker: problem.checker.type,
      limits: problem.limits,
    })),
  });
});

app.post('/submissions', async (req, res) => {
  const parsed = submissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'invalid_submission',
      details: parsed.error.flatten(),
    });
  }

  const problem = getProblemById(parsed.data.problemId);
  if (!problem) {
    return res.status(404).json({
      error: 'problem_not_found',
    });
  }

  const submissionId = randomUUID();
  const now = new Date().toISOString();
  const submissionRecord = {
    id: submissionId,
    problemId: parsed.data.problemId,
    language: parsed.data.language,
    sourceCode: parsed.data.sourceCode,
    status: 'queued',
    queuedAt: now,
    updatedAt: now,
  };

  await connection.set(submissionKey(submissionId), JSON.stringify(submissionRecord), 'EX', 60 * 60 * 24);
  await submissionQueue.add('submission', {
    submissionId,
    problemId: parsed.data.problemId,
    language: parsed.data.language,
    sourceCode: parsed.data.sourceCode,
  }, {
    removeOnComplete: 1000,
    removeOnFail: 1000,
    attempts: 1,
  });

  logger.info({ submissionId, problemId: parsed.data.problemId, language: parsed.data.language }, 'submission queued');

  res.status(202).json({
    submissionId,
    status: 'queued',
  });
});

app.get('/submissions/:submissionId', async (req, res) => {
  const stored = await connection.get(submissionKey(req.params.submissionId));
  if (!stored) {
    return res.status(404).json({ error: 'submission_not_found' });
  }

  res.json(JSON.parse(stored));
});

app.get('/metrics', async (_req, res) => {
  const [counts, compileTotal, compileCount, runTotal, runCount] = await Promise.all([
    submissionQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
    connection.get('judge:metrics:compile_time_ms_total'),
    connection.get('judge:metrics:compile_count'),
    connection.get('judge:metrics:run_time_ms_total'),
    connection.get('judge:metrics:run_count'),
  ]);

  const avgCompile = Number(compileCount || 0) > 0 ? Number(compileTotal || 0) / Number(compileCount) : 0;
  const avgRun = Number(runCount || 0) > 0 ? Number(runTotal || 0) / Number(runCount) : 0;

  res.type('text/plain').send([
    '# HELP judge_queue_waiting Number of queued submissions',
    '# TYPE judge_queue_waiting gauge',
    `judge_queue_waiting ${counts.waiting || 0}`,
    '# HELP judge_queue_active Number of active submissions',
    '# TYPE judge_queue_active gauge',
    `judge_queue_active ${counts.active || 0}`,
    '# HELP judge_avg_compile_time_ms Average compile time in ms',
    '# TYPE judge_avg_compile_time_ms gauge',
    `judge_avg_compile_time_ms ${avgCompile}`,
    '# HELP judge_avg_run_time_ms Average testcase runtime in ms',
    '# TYPE judge_avg_run_time_ms gauge',
    `judge_avg_run_time_ms ${avgRun}`,
  ].join('\n'));
});

app.listen(port, () => {
  logger.info({ port }, 'judge api listening');
});
