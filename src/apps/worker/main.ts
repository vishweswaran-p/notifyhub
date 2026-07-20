import { loadConfig } from '../../shared/config/environment.js';
import { initializeOpenTelemetry } from '../../shared/observability/tracing.js';

const config = loadConfig();
const telemetry = initializeOpenTelemetry(config);
const [
  { DeliverNotificationUseCase },
  { PostgresNotificationRepository },
  { createNotificationProviderRegistry },
  { NotificationDeliveryWorker },
  { createPostgresPool },
  { createLogger },
] = await Promise.all([
  import('../../modules/notifications/application/deliver-notification-use-case.js'),
  import('../../modules/notifications/infrastructure/persistence/postgres-notification-repository.js'),
  import('../../modules/notifications/infrastructure/providers/notification-provider-registry-factory.js'),
  import('../../modules/notifications/infrastructure/worker/notification-delivery-worker.js'),
  import('../../shared/database/postgres.js'),
  import('../../shared/observability/logger.js'),
]);
const logger = createLogger(config);
const pool = createPostgresPool(config);
const notificationRepository = new PostgresNotificationRepository(pool);
const providerRegistry = createNotificationProviderRegistry(config);
const deliveryWorker = new NotificationDeliveryWorker({
  redisUrl: config.REDIS_URL,
  deliverNotificationUseCase: new DeliverNotificationUseCase(
    notificationRepository,
    providerRegistry,
    config.DELIVERY_MAX_ATTEMPTS,
  ),
  logger,
});

logger.info(
  {
    redisUrl: config.REDIS_URL,
    providerMode: config.NOTIFICATION_PROVIDER_MODE,
  },
  'NotifyHub worker process bootstrapped.',
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down worker process.');
  await deliveryWorker.close();
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
