import { Worker } from 'bullmq';

import {
  notificationDeliveryQueueName,
  type NotificationDeliveryJobPayload,
} from '../../application/notification-queue-publisher.js';
import { parseRedisConnectionOptions } from '../../../../shared/queue/redis-connection-options.js';

import type { Logger } from 'pino';
import type {
  DeliverNotificationResult,
  DeliverNotificationUseCase,
} from '../../application/deliver-notification-use-case.js';

export class NotificationDeliveryWorker {
  private readonly worker: Worker<NotificationDeliveryJobPayload, DeliverNotificationResult>;

  public constructor(params: {
    redisUrl: string;
    deliverNotificationUseCase: DeliverNotificationUseCase;
    logger: Logger;
  }) {
    this.worker = new Worker<NotificationDeliveryJobPayload, DeliverNotificationResult>(
      notificationDeliveryQueueName,
      async (job) => {
        const result = await params.deliverNotificationUseCase.execute(job.data);

        params.logger.info(
          {
            jobId: job.id,
            notificationId: job.data.notificationId,
            tenantId: job.data.tenantId,
            outcome: result.outcome,
          },
          'Processed notification delivery job.',
        );

        return result;
      },
      {
        connection: parseRedisConnectionOptions(params.redisUrl),
        concurrency: 10,
      },
    );

    this.worker.on('failed', (job, error) => {
      params.logger.error(
        {
          err: error,
          jobId: job?.id,
          notificationId: job?.data.notificationId,
          tenantId: job?.data.tenantId,
        },
        'Notification delivery job failed.',
      );
    });
  }

  public async close(): Promise<void> {
    await this.worker.close();
  }
}
