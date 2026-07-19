import type { NotificationChannel } from './notification.js';

export type NotificationTemplate = {
  id: string;
  tenantId: string;
  name: string;
  channel: NotificationChannel;
  subjectTemplate: string | null;
  bodyTemplate: string;
  createdAt: Date;
  updatedAt: Date;
};
