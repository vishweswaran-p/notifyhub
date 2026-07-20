import { z } from 'zod';

import type { AuthPrincipal } from '../../identity/application/auth-principal.js';
import type { Notification } from '../domain/notification.js';
import type { NotificationRepository } from './notification-repository.js';

const listNotificationsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  status: z
    .enum(['queued', 'scheduled', 'processing', 'delivered', 'failed', 'dead_lettered'])
    .optional(),
  channel: z.enum(['email', 'sms', 'push', 'webhook']).optional(),
});

export type ListNotificationsQuery = z.input<typeof listNotificationsSchema>;

export type ListNotificationsResult = {
  items: Notification[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
};

export class ListNotificationsUseCase {
  public constructor(private readonly repository: NotificationRepository) {}

  public async execute(params: {
    principal: AuthPrincipal;
    query: ListNotificationsQuery;
  }): Promise<ListNotificationsResult> {
    const query = listNotificationsSchema.parse(params.query);
    const result = await this.repository.listForTenant({
      tenantId: params.principal.tenantId,
      limit: query.limit,
      offset: query.offset,
      status: query.status,
      channel: query.channel,
    });

    return {
      items: result.items,
      pagination: {
        limit: query.limit,
        offset: query.offset,
        total: result.total,
      },
    };
  }
}
