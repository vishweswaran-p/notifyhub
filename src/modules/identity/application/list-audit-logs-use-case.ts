import { z } from 'zod';

import type { AuthPrincipal } from './auth-principal.js';
import type { IdentityRepository } from './identity-repository.js';
import type { AuditLog } from '../domain/audit-log.js';

const listAuditLogsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  actorType: z.enum(['system', 'api_key', 'jwt', 'admin']).optional(),
  action: z.string().trim().min(1).max(120).optional(),
  resourceType: z.string().trim().min(1).max(120).optional(),
});

export type ListAuditLogsQuery = z.input<typeof listAuditLogsSchema>;

export type ListAuditLogsResult = {
  items: AuditLog[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
};

export class ListAuditLogsUseCase {
  public constructor(private readonly repository: IdentityRepository) {}

  public async execute(params: {
    principal: AuthPrincipal;
    query: ListAuditLogsQuery;
  }): Promise<ListAuditLogsResult> {
    const query = listAuditLogsSchema.parse(params.query);
    const result = await this.repository.listAuditLogs({
      tenantId: params.principal.tenantId,
      limit: query.limit,
      offset: query.offset,
      actorType: query.actorType,
      action: query.action,
      resourceType: query.resourceType,
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
