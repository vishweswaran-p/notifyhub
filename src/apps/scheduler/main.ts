import { loadConfig } from '../../shared/config/environment.js';
import { createLogger } from '../../shared/observability/logger.js';

const config = loadConfig();
const logger = createLogger(config);

logger.info(
  {
    redisUrl: config.REDIS_URL,
  },
  'NotifyHub scheduler process bootstrapped. Scheduled notification promotion will be registered in a later phase.',
);

process.on('SIGTERM', () => {
  logger.info('Shutting down scheduler process.');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('Shutting down scheduler process.');
  process.exit(0);
});
