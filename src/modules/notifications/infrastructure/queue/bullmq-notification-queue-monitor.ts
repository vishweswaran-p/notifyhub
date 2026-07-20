import { Queue } from 'bullmq';

import {
  notificationDeliveryQueueName,
  type NotificationDeliveryJobPayload,
} from '../../application/notification-queue-publisher.js';
import { parseRedisConnectionOptions } from '../../../../shared/queue/redis-connection-options.js';

import type {
  NotificationQueueMetrics,
  NotificationQueueMonitor,
} from '../../application/notification-queue-monitor.js';

export class BullMqNotificationQueueMonitor implements NotificationQueueMonitor {
  private readonly queue: Queue<NotificationDeliveryJobPayload>;

  public constructor(redisUrl: string) {
    this.queue = new Queue<NotificationDeliveryJobPayload>(notificationDeliveryQueueName, {
      connection: parseRedisConnectionOptions(redisUrl),
    });
  }

  public async getMetrics(): Promise<NotificationQueueMetrics> {
    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'completed',
      'failed',
      'paused',
    );

    return {
      name: notificationDeliveryQueueName,
      counts: {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
        paused: counts.paused ?? 0,
      },
    };
  }

  public async close(): Promise<void> {
    await this.queue.close();
  }
}
