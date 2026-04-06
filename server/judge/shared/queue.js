const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const redisUrl = process.env.JUDGE_REDIS_URL || 'redis://127.0.0.1:6379';
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const submissionQueueName = process.env.JUDGE_QUEUE_NAME || 'judge-submissions';
const submissionQueue = new Queue(submissionQueueName, { connection });

module.exports = {
  connection,
  redisUrl,
  submissionQueueName,
  submissionQueue,
};
