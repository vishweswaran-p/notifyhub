import { randomUUID } from 'node:crypto';

import type { Notification } from '../../../src/modules/notifications/domain/notification.js';
import type {
  CreateNotificationInput,
  NotificationRepository,
} from '../../../src/modules/notifications/application/notification-repository.js';

export class InMemoryNotificationRepository implements NotificationRepository {
  public readonly notifications = new Map<string, Notification>();

  public create(input: CreateNotificationInput): Promise<Notification> {
    const now = new Date();
    const notification: Notification = {
      id: randomUUID(),
      tenantId: input.tenantId,
      idempotencyKey: input.idempotencyKey,
      channel: input.channel,
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      variables: input.variables,
      metadata: input.metadata,
      status: input.status,
      scheduledAt: input.scheduledAt,
      acceptedAt: now,
      queuedAt: input.queuedAt,
      createdAt: now,
      updatedAt: now,
    };

    this.notifications.set(notification.id, notification);

    return Promise.resolve(notification);
  }

  public findByTenantAndIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<Notification | null> {
    const notification =
      [...this.notifications.values()].find(
        (candidate) =>
          candidate.tenantId === tenantId && candidate.idempotencyKey === idempotencyKey,
      ) ?? null;

    return Promise.resolve(notification);
  }
}
