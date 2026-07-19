import { loadConfig } from '../../shared/config/environment.js';
import { createLogger } from '../../shared/observability/logger.js';

const config = loadConfig();
const logger = createLogger(config);

logger.info(
  {
    redisUrl: config.REDIS_URL,
  },
  'NotifyHub worker process bootstrapped. Delivery queues will be registered in a later phase.',
);

process.on('SIGTERM', () => {
  logger.info('Shutting down worker process.');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Shutting down worker process.');
  process.exit(0);
});
