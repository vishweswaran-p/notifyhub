import { z } from 'zod';

import { NotificationTemplateNameAlreadyExistsError } from './notification-template-errors.js';

import type { AuthPrincipal } from '../../identity/application/auth-principal.js';
import type { NotificationTemplate } from '../domain/notification-template.js';
import type { NotificationTemplateRepository } from './notification-template-repository.js';

const createNotificationTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  channel: z.enum(['email', 'sms', 'push', 'webhook']),
  subjectTemplate: z.string().trim().min(1).max(255).optional(),
  bodyTemplate: z.string().trim().min(1).max(10_000),
});

export type CreateNotificationTemplateCommand = z.input<typeof createNotificationTemplateSchema>;

export class CreateNotificationTemplateUseCase {
  public constructor(private readonly repository: NotificationTemplateRepository) {}

  public async execute(params: {
    principal: AuthPrincipal;
    command: CreateNotificationTemplateCommand;
  }): Promise<NotificationTemplate> {
    const input = createNotificationTemplateSchema.parse(params.command);

    try {
      return await this.repository.create({
        tenantId: params.principal.tenantId,
        name: input.name,
        channel: input.channel,
        subjectTemplate: input.subjectTemplate ?? null,
        bodyTemplate: input.bodyTemplate,
      });
    } catch (error) {
      if (isUniqueTemplateNameViolation(error)) {
        throw new NotificationTemplateNameAlreadyExistsError(input.name);
      }

      throw error;
    }
  }
}

function isUniqueTemplateNameViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505' &&
    'constraint' in error &&
    error.constraint === 'notification_templates_tenant_name_idx'
  );
}
