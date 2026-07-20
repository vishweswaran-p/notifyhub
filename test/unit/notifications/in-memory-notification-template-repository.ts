import { randomUUID } from 'node:crypto';

import type { NotificationTemplate } from '@modules/notifications/domain/notification-template.js';
import type {
  CreateNotificationTemplateInput,
  NotificationTemplateRepository,
} from '@modules/notifications/application/notification-template-repository.js';

export class InMemoryNotificationTemplateRepository implements NotificationTemplateRepository {
  public readonly templates = new Map<string, NotificationTemplate>();

  public create(input: CreateNotificationTemplateInput): Promise<NotificationTemplate> {
    const now = new Date();
    const template: NotificationTemplate = {
      id: randomUUID(),
      tenantId: input.tenantId,
      name: input.name,
      channel: input.channel,
      subjectTemplate: input.subjectTemplate,
      bodyTemplate: input.bodyTemplate,
      createdAt: now,
      updatedAt: now,
    };

    this.templates.set(template.id, template);

    return Promise.resolve(template);
  }

  public findByIdForTenant(id: string, tenantId: string): Promise<NotificationTemplate | null> {
    const template = this.templates.get(id);

    return Promise.resolve(template?.tenantId === tenantId ? template : null);
  }
}
