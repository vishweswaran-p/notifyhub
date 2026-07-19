import type {
  Notification,
  NotificationChannel,
  NotificationStatus,
} from '../domain/notification.js';
import type { DeliveryAttempt } from '../domain/delivery-attempt.js';

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
  findByIdForTenant(id: string, tenantId: string): Promise<Notification | null>;
  findByTenantAndIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ): Promise<Notification | null>;
  markProcessing(id: string, tenantId: string): Promise<Notification | null>;
  markDelivered(id: string, tenantId: string): Promise<Notification | null>;
  markFailed(
    id: string,
    tenantId: string,
    error: NotificationFailureMetadata,
  ): Promise<Notification | null>;
  markDeadLettered(
    id: string,
    tenantId: string,
    error: NotificationFailureMetadata,
  ): Promise<Notification | null>;
  nextAttemptNumber(notificationId: string): Promise<number>;
  recordDeliveryAttempt(input: RecordDeliveryAttemptInput): Promise<DeliveryAttempt>;
}

export type RecordDeliveryAttemptInput = {
  notificationId: string;
  tenantId: string;
  channel: NotificationChannel;
  provider: string;
  status: 'processing' | 'delivered' | 'failed';
  attemptNumber: number;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  responseMetadata: Record<string, unknown>;
  startedAt: Date;
  completedAt: Date | null;
};

export type NotificationFailureMetadata = {
  errorCode: string;
  errorMessage: string;
};
