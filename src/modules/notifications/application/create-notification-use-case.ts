import { z } from 'zod';

import type { AuthPrincipal } from '../../identity/application/auth-principal.js';
import type { Notification } from '../domain/notification.js';
import type { NotificationQueuePublisher } from './notification-queue-publisher.js';
import type { NotificationRepository } from './notification-repository.js';

const jsonObjectSchema = z.record(z.string(), z.unknown());

const createNotificationSchema = z.object({
  channel: z.enum(['email', 'sms', 'push', 'webhook']),
  recipient: z.string().trim().min(1).max(512),
  subject: z.string().trim().min(1).max(255).optional(),
  body: z.string().trim().min(1).max(10_000),
  variables: jsonObjectSchema.default({}),
  metadata: jsonObjectSchema.default({}),
  scheduledAt: z.string().datetime().optional(),
});

export type CreateNotificationCommand = z.input<typeof createNotificationSchema>;

export type CreateNotificationResult = {
  notification: Notification;
  idempotentReplay: boolean;
};

export class CreateNotificationUseCase {
  public constructor(
    private readonly repository: NotificationRepository,
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
    const notification = await this.repository.create({
      tenantId: params.principal.tenantId,
      idempotencyKey: params.idempotencyKey,
      channel: input.channel,
      recipient: input.recipient,
      subject: input.subject ?? null,
      body: input.body,
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
}
