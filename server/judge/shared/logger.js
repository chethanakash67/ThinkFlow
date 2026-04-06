const pino = require('pino');

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: {
    service: process.env.JUDGE_SERVICE_NAME || 'judge',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = { logger };
