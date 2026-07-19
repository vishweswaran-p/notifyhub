import { Queue } from 'bullmq';

import {
  notificationDeliveryQueueName,
  type NotificationDeliveryJobPayload,
  type NotificationQueuePublisher,
} from '../../application/notification-queue-publisher.js';
import { parseRedisConnectionOptions } from '../../../../shared/queue/redis-connection-options.js';

export class BullMqNotificationQueuePublisher implements NotificationQueuePublisher {
  private readonly queue: Queue<NotificationDeliveryJobPayload>;

  public constructor(redisUrl: string) {
    this.queue = new Queue<NotificationDeliveryJobPayload>(notificationDeliveryQueueName, {
      connection: parseRedisConnectionOptions(redisUrl),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: 1_000,
        removeOnFail: false,
      },
    });
  }

  public async enqueueDelivery(
    payload: NotificationDeliveryJobPayload,
    options?: { delayMs?: number },
  ): Promise<void> {
    await this.queue.add('deliver-notification', payload, {
      delay: options?.delayMs,
      jobId: payload.notificationId,
    });
  }

  public async close(): Promise<void> {
    await this.queue.close();
  }
}
