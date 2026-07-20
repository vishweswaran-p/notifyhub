import type { NotificationQueuePublisher } from './notification-queue-publisher.js';
import type { NotificationRepository } from './notification-repository.js';

export type PromoteScheduledNotificationsResult = {
  promoted: number;
};

export class PromoteScheduledNotificationsUseCase {
  public constructor(
    private readonly repository: NotificationRepository,
    private readonly queuePublisher: NotificationQueuePublisher,
  ) {}

  public async execute(params: {
    now?: Date;
    limit: number;
  }): Promise<PromoteScheduledNotificationsResult> {
    const now = params.now ?? new Date();
    const notifications = await this.repository.claimDueScheduled({
      now,
      limit: params.limit,
    });

    await Promise.all(
      notifications.map((notification) =>
        this.queuePublisher.enqueueDelivery({
          notificationId: notification.id,
          tenantId: notification.tenantId,
          channel: notification.channel,
        }),
      ),
    );

    return {
      promoted: notifications.length,
    };
  }
}
