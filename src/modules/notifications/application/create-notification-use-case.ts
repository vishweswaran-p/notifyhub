import { z } from 'zod';

import {
  NotificationTemplateChannelMismatchError,
  NotificationTemplateNotFoundError,
} from './notification-template-errors.js';

import type { AuthPrincipal } from '../../identity/application/auth-principal.js';
import type { Notification } from '../domain/notification.js';
import type { NotificationQueuePublisher } from './notification-queue-publisher.js';
import type { NotificationRepository } from './notification-repository.js';
import type { NotificationTemplateRepository } from './notification-template-repository.js';
import type { TemplateRenderer } from './template-renderer.js';

const jsonObjectSchema = z.record(z.string(), z.unknown());

const createNotificationSchema = z
  .object({
    channel: z.enum(['email', 'sms', 'push', 'webhook']),
    recipient: z.string().trim().min(1).max(512),
    templateId: z.string().uuid().optional(),
    subject: z.string().trim().min(1).max(255).optional(),
    body: z.string().trim().min(1).max(10_000).optional(),
    variables: jsonObjectSchema.default({}),
    metadata: jsonObjectSchema.default({}),
    scheduledAt: z.string().datetime().optional(),
  })
  .superRefine((input, context) => {
    if (!input.templateId && !input.body) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['body'],
        message: 'body is required when templateId is not provided.',
      });
    }
  });

export type CreateNotificationCommand = z.input<typeof createNotificationSchema>;

export type CreateNotificationResult = {
  notification: Notification;
  idempotentReplay: boolean;
};

export class CreateNotificationUseCase {
  public constructor(
    private readonly repository: NotificationRepository,
    private readonly templateRepository: NotificationTemplateRepository,
    private readonly templateRenderer: TemplateRenderer,
    private readonly queuePublisher: NotificationQueuePublisher,
  ) {}

  public async execute(params: {
    principal: AuthPrincipal;
    command: CreateNotificationCommand;
    idempotencyKey: string | null;
  }): Promise<CreateNotificationResult> {
    const input = createNotificationSchema.parse(params.command);

    if (params.idempotencyKey) {
      const existing = await this.repository.findByTenantAndIdempotencyKey(
        params.principal.tenantId,
        params.idempotencyKey,
      );

      if (existing) {
        return {
          notification: existing,
          idempotentReplay: true,
        };
      }
    }

    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    const now = new Date();
    const shouldDelay = scheduledAt !== null && scheduledAt.getTime() > now.getTime();
    const renderedContent = await this.resolveContent({
      tenantId: params.principal.tenantId,
      channel: input.channel,
      templateId: input.templateId ?? null,
      subject: input.subject ?? null,
      body: input.body ?? null,
      variables: input.variables,
    });
    const notification = await this.repository.create({
      tenantId: params.principal.tenantId,
      idempotencyKey: params.idempotencyKey,
      templateId: renderedContent.templateId,
      channel: input.channel,
      recipient: input.recipient,
      subject: renderedContent.subject,
      body: renderedContent.body,
      variables: input.variables,
      metadata: input.metadata,
      status: shouldDelay ? 'scheduled' : 'queued',
      scheduledAt,
      queuedAt: shouldDelay ? null : now,
    });

    await this.queuePublisher.enqueueDelivery(
      {
        notificationId: notification.id,
        tenantId: notification.tenantId,
        channel: notification.channel,
      },
      shouldDelay ? { delayMs: scheduledAt.getTime() - now.getTime() } : undefined,
    );

    return {
      notification,
      idempotentReplay: false,
    };
  }

  private async resolveContent(params: {
    tenantId: string;
    channel: CreateNotificationCommand['channel'];
    templateId: string | null;
    subject: string | null;
    body: string | null;
    variables: Record<string, unknown>;
  }): Promise<{
    templateId: string | null;
    subject: string | null;
    body: string;
  }> {
    if (!params.templateId) {
      return {
        templateId: null,
        subject: params.subject,
        body: params.body ?? '',
      };
    }

    const template = await this.templateRepository.findByIdForTenant(
      params.templateId,
      params.tenantId,
    );

    if (!template) {
      throw new NotificationTemplateNotFoundError(params.templateId);
    }

    if (template.channel !== params.channel) {
      throw new NotificationTemplateChannelMismatchError({
        templateChannel: template.channel,
        requestedChannel: params.channel,
      });
    }

    return {
      templateId: template.id,
      subject: template.subjectTemplate
        ? this.templateRenderer.render(template.subjectTemplate, params.variables)
        : params.subject,
      body: this.templateRenderer.render(template.bodyTemplate, params.variables),
    };
  }
}
