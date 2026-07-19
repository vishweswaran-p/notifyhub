import type {
  NotificationDeliveryJobPayload,
  NotificationQueuePublisher,
} from '../../../src/modules/notifications/application/notification-queue-publisher.js';

export class FakeNotificationQueuePublisher implements NotificationQueuePublisher {
  public readonly jobs: Array<{
    payload: NotificationDeliveryJobPayload;
    delayMs?: number;
  }> = [];

  public enqueueDelivery(
    payload: NotificationDeliveryJobPayload,
    options?: { delayMs?: number },
  ): Promise<void> {
    this.jobs.push({
      payload,
      delayMs: options?.delayMs,
    });

    return Promise.resolve();
  }
}
