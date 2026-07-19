import type { NotificationTemplate } from '../domain/notification-template.js';
import type { NotificationChannel } from '../domain/notification.js';

export type CreateNotificationTemplateInput = {
  tenantId: string;
  name: string;
  channel: NotificationChannel;
  subjectTemplate: string | null;
  bodyTemplate: string;
};

export interface NotificationTemplateRepository {
  create(input: CreateNotificationTemplateInput): Promise<NotificationTemplate>;
  findByIdForTenant(id: string, tenantId: string): Promise<NotificationTemplate | null>;
}
