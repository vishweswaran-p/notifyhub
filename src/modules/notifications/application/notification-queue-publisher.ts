import type { NotificationChannel } from '../domain/notification.js';

export const notificationDeliveryQueueName = 'notification-delivery';

export type NotificationDeliveryJobPayload = {
  notificationId: string;
  tenantId: string;
  channel: NotificationChannel;
};

export interface NotificationQueuePublisher {
  enqueueDelivery(
    payload: NotificationDeliveryJobPayload,
    options?: { delayMs?: number },
  ): Promise<void>;
}
