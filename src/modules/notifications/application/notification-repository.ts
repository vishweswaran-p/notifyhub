import type {
  Notification,
  NotificationChannel,
  NotificationStatus,
} from '../domain/notification.js';

export type CreateNotificationInput = {
  tenantId: string;
  idempotencyKey: string | null;
  channel: NotificationChannel;
  recipient: string;
  subject: string | null;
  body: string;
  variables: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: NotificationStatus;
  scheduledAt: Date | null;
  queuedAt: Date | null;
};

export interface NotificationRepository {
  create(input: CreateNotificationInput): Promise<Notification>;
  findByTenantAndIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<Notification | null>;
}
