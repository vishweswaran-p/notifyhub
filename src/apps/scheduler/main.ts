import { PromoteScheduledNotificationsUseCase } from '../../modules/notifications/application/promote-scheduled-notifications-use-case.js';
import { PostgresNotificationRepository } from '../../modules/notifications/infrastructure/persistence/postgres-notification-repository.js';
import { BullMqNotificationQueuePublisher } from '../../modules/notifications/infrastructure/queue/bullmq-notification-queue-publisher.js';
import { ScheduledNotificationScheduler } from '../../modules/notifications/infrastructure/scheduler/scheduled-notification-scheduler.js';
import { loadConfig } from '../../shared/config/environment.js';
import { createPostgresPool } from '../../shared/database/postgres.js';
import { createLogger } from '../../shared/observability/logger.js';

const config = loadConfig();
const logger = createLogger(config);
const pool = createPostgresPool(config);
const notificationRepository = new PostgresNotificationRepository(pool);
const queuePublisher = new BullMqNotificationQueuePublisher(config.REDIS_URL, {
  maxAttempts: config.DELIVERY_MAX_ATTEMPTS,
  retryBackoffMs: config.DELIVERY_RETRY_BACKOFF_MS,
});
const scheduler = new ScheduledNotificationScheduler({
  promoteScheduledNotificationsUseCase: new PromoteScheduledNotificationsUseCase(
    notificationRepository,
    queuePublisher,
  ),
  intervalMs: config.SCHEDULER_POLL_INTERVAL_MS,
  batchSize: config.SCHEDULER_BATCH_SIZE,
  logger,
});

scheduler.start();

logger.info(
  {
    redisUrl: config.REDIS_URL,
    pollIntervalMs: config.SCHEDULER_POLL_INTERVAL_MS,
    batchSize: config.SCHEDULER_BATCH_SIZE,
  },
  'NotifyHub scheduler process bootstrapped.',
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down scheduler process.');
  scheduler.stop();
  await queuePublisher.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
