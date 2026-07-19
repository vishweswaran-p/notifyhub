import { randomUUID } from 'node:crypto';

import type { DeliveryAttempt } from '../../../src/modules/notifications/domain/delivery-attempt.js';
import type { Notification } from '../../../src/modules/notifications/domain/notification.js';
import type {
  CreateNotificationInput,
  NotificationRepository,
  RecordDeliveryAttemptInput,
} from '../../../src/modules/notifications/application/notification-repository.js';

export class InMemoryNotificationRepository implements NotificationRepository {
  public readonly notifications = new Map<string, Notification>();
  public readonly deliveryAttempts: DeliveryAttempt[] = [];

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

  public findByIdForTenant(id: string, tenantId: string): Promise<Notification | null> {
    const notification = this.notifications.get(id);

    return Promise.resolve(notification?.tenantId === tenantId ? notification : null);
  }

  public markProcessing(id: string, tenantId: string): Promise<Notification | null> {
    return Promise.resolve(
      this.updateStatus(id, tenantId, 'processing', ['queued', 'scheduled', 'failed']),
    );
  }

  public markDelivered(id: string, tenantId: string): Promise<Notification | null> {
    return Promise.resolve(this.updateStatus(id, tenantId, 'delivered', ['processing']));
  }

  public markFailed(id: string, tenantId: string): Promise<Notification | null> {
    return Promise.resolve(this.updateStatus(id, tenantId, 'failed', ['processing']));
  }

  public nextAttemptNumber(notificationId: string): Promise<number> {
    const latestAttempt = this.deliveryAttempts
      .filter((attempt) => attempt.notificationId === notificationId)
      .reduce((latest, attempt) => Math.max(latest, attempt.attemptNumber), 0);

    return Promise.resolve(latestAttempt + 1);
  }

  public recordDeliveryAttempt(input: RecordDeliveryAttemptInput): Promise<DeliveryAttempt> {
    const attempt: DeliveryAttempt = {
      id: randomUUID(),
      notificationId: input.notificationId,
      tenantId: input.tenantId,
      channel: input.channel,
      provider: input.provider,
      status: input.status,
      attemptNumber: input.attemptNumber,
      providerMessageId: input.providerMessageId,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      responseMetadata: input.responseMetadata,
      startedAt: input.startedAt,
      completedAt: input.completedAt,
    };

    this.deliveryAttempts.push(attempt);

    return Promise.resolve(attempt);
  }

  private updateStatus(
    id: string,
    tenantId: string,
    status: Notification['status'],
    allowedStatuses: Notification['status'][],
  ): Notification | null {
    const notification = this.notifications.get(id);

    if (
      !notification ||
      notification.tenantId !== tenantId ||
      !allowedStatuses.includes(notification.status)
    ) {
      return null;
    }

    const updated: Notification = {
      ...notification,
      status,
      updatedAt: new Date(),
    };

    this.notifications.set(id, updated);

    return updated;
  }
}
