import { loadConfig } from '../../shared/config/environment.js';
import { initializeOpenTelemetry } from '../../shared/observability/tracing.js';

const config = loadConfig();
const telemetry = initializeOpenTelemetry(config);
const [
  { PromoteScheduledNotificationsUseCase },
  { PostgresNotificationRepository },
  { BullMqNotificationQueuePublisher },
  { ScheduledNotificationScheduler },
  { createPostgresPool },
  { createLogger },
] = await Promise.all([
  import('../../modules/notifications/application/promote-scheduled-notifications-use-case.js'),
  import('../../modules/notifications/infrastructure/persistence/postgres-notification-repository.js'),
  import('../../modules/notifications/infrastructure/queue/bullmq-notification-queue-publisher.js'),
  import('../../modules/notifications/infrastructure/scheduler/scheduled-notification-scheduler.js'),
  import('../../shared/database/postgres.js'),
  import('../../shared/observability/logger.js'),
]);
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
  await telemetry.shutdown();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
