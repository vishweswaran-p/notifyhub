import { z } from 'zod';

import { ApplicationError } from '../../../shared/errors/application-error.js';

import type { AuthPrincipal } from '../../identity/application/auth-principal.js';
import type { DeliveryAttempt } from '../domain/delivery-attempt.js';
import type { NotificationRepository } from './notification-repository.js';

const listDeliveryAttemptsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListDeliveryAttemptsQuery = z.input<typeof listDeliveryAttemptsSchema>;

export type ListDeliveryAttemptsResult = {
  items: DeliveryAttempt[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
};

export class ListDeliveryAttemptsUseCase {
  public constructor(private readonly repository: NotificationRepository) {}

  public async execute(params: {
    principal: AuthPrincipal;
    notificationId: string;
    query: ListDeliveryAttemptsQuery;
  }): Promise<ListDeliveryAttemptsResult> {
    const query = listDeliveryAttemptsSchema.parse(params.query);
    const notification = await this.repository.findByIdForTenant(
      params.notificationId,
      params.principal.tenantId,
    );

    if (!notification) {
      throw new ApplicationError({
        code: 'NOTIFICATION_NOT_FOUND',
        message: 'Notification was not found.',
        statusCode: 404,
      });
    }

    const result = await this.repository.listDeliveryAttempts({
      tenantId: params.principal.tenantId,
      notificationId: params.notificationId,
      limit: query.limit,
      offset: query.offset,
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
