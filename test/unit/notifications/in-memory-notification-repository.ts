import { randomUUID } from 'node:crypto';

import type { DeliveryAttempt } from '../../../src/modules/notifications/domain/delivery-attempt.js';
import type { Notification } from '../../../src/modules/notifications/domain/notification.js';
import type {
  CreateNotificationInput,
  GetTenantNotificationMetricsInput,
  ListNotificationsInput,
  ListNotificationsResult,
  NotificationRepository,
  RecordDeliveryAttemptInput,
  TenantNotificationMetrics,
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
      templateId: input.templateId,
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
      deadLetteredAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: now,
      updatedAt: now,
    };

    this.notifications.set(notification.id, notification);

    return Promise.resolve(notification);
  }

  public listForTenant(input: ListNotificationsInput): Promise<ListNotificationsResult> {
    const filtered = [...this.notifications.values()]
      .filter((notification) => notification.tenantId === input.tenantId)
      .filter((notification) => !input.status || notification.status === input.status)
      .filter((notification) => !input.channel || notification.channel === input.channel)
      .sort((left, right) => {
        const createdAtDifference = right.createdAt.getTime() - left.createdAt.getTime();

        return createdAtDifference || right.id.localeCompare(left.id);
      });

    return Promise.resolve({
      items: filtered.slice(input.offset, input.offset + input.limit),
      total: filtered.length,
    });
  }

  public getTenantMetrics(
    input: GetTenantNotificationMetricsInput,
  ): Promise<TenantNotificationMetrics> {
    const notifications = [...this.notifications.values()].filter(
      (notification) => notification.tenantId === input.tenantId,
    );
    const deliveryAttempts = this.deliveryAttempts.filter(
      (attempt) => attempt.tenantId === input.tenantId,
    );

    return Promise.resolve({
      total: notifications.length,
      byStatus: {
        queued: countNotificationsBy(notifications, 'status', 'queued'),
        scheduled: countNotificationsBy(notifications, 'status', 'scheduled'),
        processing: countNotificationsBy(notifications, 'status', 'processing'),
        delivered: countNotificationsBy(notifications, 'status', 'delivered'),
        failed: countNotificationsBy(notifications, 'status', 'failed'),
        dead_lettered: countNotificationsBy(notifications, 'status', 'dead_lettered'),
      },
      byChannel: {
        email: countNotificationsBy(notifications, 'channel', 'email'),
        sms: countNotificationsBy(notifications, 'channel', 'sms'),
        push: countNotificationsBy(notifications, 'channel', 'push'),
        webhook: countNotificationsBy(notifications, 'channel', 'webhook'),
      },
      deliveryAttempts: {
        total: deliveryAttempts.length,
        delivered: deliveryAttempts.filter((attempt) => attempt.status === 'delivered').length,
        failed: deliveryAttempts.filter((attempt) => attempt.status === 'failed').length,
      },
    });
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

  public markFailed(
    id: string,
    tenantId: string,
    error: { errorCode: string; errorMessage: string },
  ): Promise<Notification | null> {
    return Promise.resolve(this.updateStatus(id, tenantId, 'failed', ['processing'], error));
  }

  public markDeadLettered(
    id: string,
    tenantId: string,
    error: { errorCode: string; errorMessage: string },
  ): Promise<Notification | null> {
    return Promise.resolve(
      this.updateStatus(id, tenantId, 'dead_lettered', ['processing', 'failed'], error, new Date()),
    );
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
    error?: { errorCode: string; errorMessage: string },
    deadLetteredAt?: Date,
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
      deadLetteredAt: deadLetteredAt ?? notification.deadLetteredAt,
      lastErrorCode:
        status === 'delivered' ? null : (error?.errorCode ?? notification.lastErrorCode),
      lastErrorMessage:
        status === 'delivered' ? null : (error?.errorMessage ?? notification.lastErrorMessage),
      updatedAt: new Date(),
    };

    this.notifications.set(id, updated);

    return updated;
  }
}

function countNotificationsBy<TKey extends 'status' | 'channel', TValue extends Notification[TKey]>(
  notifications: Notification[],
  key: TKey,
  value: TValue,
): number {
  return notifications.filter((notification) => notification[key] === value).length;
}
