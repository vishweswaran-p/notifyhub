import { z } from 'zod';

import type { AuthPrincipal } from '../../identity/application/auth-principal.js';
import type { Notification } from '../domain/notification.js';
import type { NotificationRepository } from './notification-repository.js';

const listDeadLetterNotificationsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  channel: z.enum(['email', 'sms', 'push', 'webhook']).optional(),
});

export type ListDeadLetterNotificationsQuery = z.input<typeof listDeadLetterNotificationsSchema>;

export type ListDeadLetterNotificationsResult = {
  items: Notification[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
};

export class ListDeadLetterNotificationsUseCase {
  public constructor(private readonly repository: NotificationRepository) {}

  public async execute(params: {
    principal: AuthPrincipal;
    query: ListDeadLetterNotificationsQuery;
  }): Promise<ListDeadLetterNotificationsResult> {
    const query = listDeadLetterNotificationsSchema.parse(params.query);
    const result = await this.repository.listForTenant({
      tenantId: params.principal.tenantId,
      limit: query.limit,
      offset: query.offset,
      status: 'dead_lettered',
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
