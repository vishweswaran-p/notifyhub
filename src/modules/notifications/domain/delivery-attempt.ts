import type { NotificationChannel } from './notification.js';

export type DeliveryAttemptStatus = 'processing' | 'delivered' | 'failed';

export type DeliveryAttempt = {
  id: string;
  notificationId: string;
  tenantId: string;
  channel: NotificationChannel;
  provider: string;
  status: DeliveryAttemptStatus;
  attemptNumber: number;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  responseMetadata: Record<string, unknown>;
  startedAt: Date;
  completedAt: Date | null;
};
