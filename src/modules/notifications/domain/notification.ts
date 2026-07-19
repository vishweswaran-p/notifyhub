export type NotificationChannel = 'email' | 'sms' | 'push' | 'webhook';

export type NotificationStatus =
  'queued' | 'scheduled' | 'processing' | 'delivered' | 'failed' | 'dead_lettered';

export type Notification = {
  id: string;
  tenantId: string;
  idempotencyKey: string | null;
  templateId: string | null;
  channel: NotificationChannel;
  recipient: string;
  subject: string | null;
  body: string;
  variables: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: NotificationStatus;
  scheduledAt: Date | null;
  acceptedAt: Date;
  queuedAt: Date | null;
  deadLetteredAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};
