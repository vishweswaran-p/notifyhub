import type { Pool } from 'pg';

import type {
  TenantNotificationPolicy,
  TenantNotificationPolicyRepository,
} from '../../application/rate-limit/tenant-notification-policy-repository.js';

type TenantPolicyRow = {
  id: string;
  rate_limit_per_minute: number;
};

export class PostgresTenantNotificationPolicyRepository implements TenantNotificationPolicyRepository {
  public constructor(private readonly pool: Pool) {}

  public async findByTenantId(tenantId: string): Promise<TenantNotificationPolicy | null> {
    const result = await this.pool.query<TenantPolicyRow>(
      `
        select id, rate_limit_per_minute
        from tenants
        where id = $1 and status = 'active'
      `,
      [tenantId],
    );
    const row = result.rows[0];

    return row
      ? {
          tenantId: row.id,
          rateLimitPerMinute: row.rate_limit_per_minute,
        }
      : null;
  }
}
