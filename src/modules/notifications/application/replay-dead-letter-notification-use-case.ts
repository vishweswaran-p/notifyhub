import { ApplicationError } from '../../../shared/errors/application-error.js';

import type { AuthPrincipal } from '../../identity/application/auth-principal.js';
import type { Notification } from '../domain/notification.js';
import type { NotificationQueuePublisher } from './notification-queue-publisher.js';
import type { NotificationRepository } from './notification-repository.js';

export class ReplayDeadLetterNotificationUseCase {
  public constructor(
    private readonly repository: NotificationRepository,
    private readonly queuePublisher: NotificationQueuePublisher,
  ) {}

  public async execute(params: {
    principal: AuthPrincipal;
    notificationId: string;
  }): Promise<Notification> {
    const notification = await this.repository.replayDeadLettered({
      tenantId: params.principal.tenantId,
      notificationId: params.notificationId,
      replayedAt: new Date(),
    });

    if (!notification) {
      throw new ApplicationError({
        code: 'DEAD_LETTER_NOTIFICATION_NOT_FOUND',
        message: 'Dead-letter notification was not found.',
        statusCode: 404,
      });
    }

    await this.queuePublisher.enqueueDelivery({
      notificationId: notification.id,
      tenantId: notification.tenantId,
      channel: notification.channel,
    });

    return notification;
  }
}
