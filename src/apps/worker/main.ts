import { DeliverNotificationUseCase } from '../../modules/notifications/application/deliver-notification-use-case.js';
import { PostgresNotificationRepository } from '../../modules/notifications/infrastructure/persistence/postgres-notification-repository.js';
import { MockNotificationProvider } from '../../modules/notifications/infrastructure/providers/mock-notification-provider.js';
import { StaticNotificationProviderRegistry } from '../../modules/notifications/infrastructure/providers/static-notification-provider-registry.js';
import { NotificationDeliveryWorker } from '../../modules/notifications/infrastructure/worker/notification-delivery-worker.js';
import { loadConfig } from '../../shared/config/environment.js';
import { createPostgresPool } from '../../shared/database/postgres.js';
import { createLogger } from '../../shared/observability/logger.js';

const config = loadConfig();
const logger = createLogger(config);
const pool = createPostgresPool(config);
const notificationRepository = new PostgresNotificationRepository(pool);
const providerRegistry = new StaticNotificationProviderRegistry([
  new MockNotificationProvider('email'),
  new MockNotificationProvider('sms'),
  new MockNotificationProvider('push'),
  new MockNotificationProvider('webhook'),
]);
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
  },
  'NotifyHub worker process bootstrapped.',
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down worker process.');
  await deliveryWorker.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
