import type { Pool, PoolClient } from 'pg';

import type { ApiKey } from '@modules/identity/domain/api-key.js';
import type { AuditLog, AuditLogInput } from '@modules/identity/domain/audit-log.js';
import type { Tenant } from '@modules/identity/domain/tenant.js';
import type {
  CreatedTenantCredentials,
  CreateTenantInput,
  IdentityRepository,
  ListAuditLogsInput,
  ListAuditLogsResult,
} from '@modules/identity/application/identity-repository.js';

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: Tenant['status'];
  rate_limit_per_minute: number;
  created_at: Date;
  updated_at: Date;
};

type ApiKeyRow = {
  id: string;
  tenant_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  status: ApiKey['status'];
  last_used_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  revoked_at: Date | null;
};

type AuditLogRow = {
  id: string;
  tenant_id: string | null;
  actor_type: AuditLog['actorType'];
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

type CountRow = {
  count: string;
};

export class PostgresIdentityRepository implements IdentityRepository {
  public constructor(private readonly pool: Pool) {}

  public async createTenantWithApiKey(input: CreateTenantInput): Promise<CreatedTenantCredentials> {
    const client = await this.pool.connect();

    try {
      await client.query('begin');

      const tenantResult = await client.query<TenantRow>(
        `
          insert into tenants (name, slug, rate_limit_per_minute)
          values ($1, $2, $3)
          returning id, name, slug, status, rate_limit_per_minute, created_at, updated_at
        `,
        [input.name, input.slug, input.rateLimitPerMinute],
      );
      const tenantRow = requireSingleRow(tenantResult.rows);

      const apiKeyResult = await client.query<ApiKeyRow>(
        `
          insert into api_keys (tenant_id, name, key_prefix, key_hash)
          values ($1, $2, $3, $4)
          returning id, tenant_id, name, key_prefix, key_hash, status, last_used_at, expires_at, created_at, revoked_at
        `,
        [tenantRow.id, input.apiKeyName, input.apiKeySecret.prefix, input.apiKeySecret.hash],
      );
      const apiKeyRow = requireSingleRow(apiKeyResult.rows);

      await this.insertAuditLog(client, {
        tenantId: tenantRow.id,
        actorType: 'system',
        actorId: null,
        action: 'tenant.created',
        resourceType: 'tenant',
        resourceId: tenantRow.id,
        metadata: {
          apiKeyId: apiKeyRow.id,
          apiKeyPrefix: apiKeyRow.key_prefix,
        },
      });

      await client.query('commit');

      return {
        tenant: mapTenantRow(tenantRow),
        apiKey: mapApiKeyRow(apiKeyRow),
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  public async findTenantById(id: string): Promise<Tenant | null> {
    const result = await this.pool.query<TenantRow>(
      `
        select id, name, slug, status, rate_limit_per_minute, created_at, updated_at
        from tenants
        where id = $1
      `,
      [id],
    );

    const row = result.rows[0];
    return row ? mapTenantRow(row) : null;
  }

  public async findApiKeysByPrefix(prefix: string): Promise<ApiKey[]> {
    const result = await this.pool.query<ApiKeyRow>(
      `
        select id, tenant_id, name, key_prefix, key_hash, status, last_used_at, expires_at, created_at, revoked_at
        from api_keys
        where key_prefix = $1
      `,
      [prefix],
    );

    return result.rows.map(mapApiKeyRow);
  }

  public async listAuditLogs(input: ListAuditLogsInput): Promise<ListAuditLogsResult> {
    const filters = ['tenant_id = $1'];
    const values: unknown[] = [input.tenantId];

    if (input.actorType) {
      values.push(input.actorType);
      filters.push(`actor_type = $${values.length}`);
    }

    if (input.action) {
      values.push(input.action);
      filters.push(`action = $${values.length}`);
    }

    if (input.resourceType) {
      values.push(input.resourceType);
      filters.push(`resource_type = $${values.length}`);
    }

    const whereClause = filters.join(' and ');
    const totalResult = await this.pool.query<CountRow>(
      `select count(*) as count from audit_logs where ${whereClause}`,
      values,
    );
    const listValues = [...values, input.limit, input.offset];
    const itemsResult = await this.pool.query<AuditLogRow>(
      `
        select
          id,
          tenant_id,
          actor_type,
          actor_id,
          action,
          resource_type,
          resource_id,
          metadata,
          created_at
        from audit_logs
        where ${whereClause}
        order by created_at desc, id desc
        limit $${values.length + 1}
        offset $${values.length + 2}
      `,
      listValues,
    );

    return {
      items: itemsResult.rows.map(mapAuditLogRow),
      total: Number(requireSingleRow(totalResult.rows).count),
    };
  }

  public async markApiKeyUsed(id: string, usedAt: Date): Promise<void> {
    await this.pool.query('update api_keys set last_used_at = $2 where id = $1', [id, usedAt]);
  }

  public async recordAuditLog(input: AuditLogInput): Promise<void> {
    await this.insertAuditLog(this.pool, input);
  }

  private async insertAuditLog(client: Pool | PoolClient, input: AuditLogInput): Promise<void> {
    await client.query(
      `
        insert into audit_logs (
          tenant_id,
          actor_type,
          actor_id,
          action,
          resource_type,
          resource_id,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        input.tenantId,
        input.actorType,
        input.actorId,
        input.action,
        input.resourceType,
        input.resourceId,
        input.metadata ?? {},
      ],
    );
  }
}

function requireSingleRow<T>(rows: T[]): T {
  const row = rows[0];

  if (!row) {
    throw new Error('Expected database operation to return one row.');
  }

  return row;
}

function mapTenantRow(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    rateLimitPerMinute: row.rate_limit_per_minute,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapApiKeyRow(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    keyHash: row.key_hash,
    status: row.status,
    lastUsedAt: row.last_used_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

function mapAuditLogRow(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}
