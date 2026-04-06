const { Worker } = require('bullmq');
const { submissionQueueName, connection } = require('../../shared/queue');
const { logger } = require('../../shared/logger');
const { judgeSubmission } = require('./judge/judge-service');

const worker = new Worker(
  submissionQueueName,
  async (job) => {
    logger.info({ submissionId: job.data.submissionId, jobId: job.id }, 'judging submission');
    return judgeSubmission(job.data);
  },
  {
    connection,
    concurrency: Number(process.env.JUDGE_WORKER_CONCURRENCY || 2),
  }
);

worker.on('completed', (job) => {
  logger.info({ submissionId: job.data.submissionId, jobId: job.id }, 'submission judged');
});

worker.on('failed', (job, error) => {
  logger.error({ submissionId: job?.data?.submissionId, jobId: job?.id, error: error.message }, 'submission failed');
});

logger.info('judge worker started');
