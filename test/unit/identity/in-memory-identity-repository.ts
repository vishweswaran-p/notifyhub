import { randomUUID } from 'node:crypto';

import type { ApiKey } from '../../../src/modules/identity/domain/api-key.js';
import type { AuditLog, AuditLogInput } from '../../../src/modules/identity/domain/audit-log.js';
import type { Tenant } from '../../../src/modules/identity/domain/tenant.js';
import type {
  CreatedTenantCredentials,
  CreateTenantInput,
  IdentityRepository,
  ListAuditLogsInput,
  ListAuditLogsResult,
} from '../../../src/modules/identity/application/identity-repository.js';

export class InMemoryIdentityRepository implements IdentityRepository {
  public readonly tenants = new Map<string, Tenant>();
  public readonly apiKeys = new Map<string, ApiKey>();
  public readonly auditLogs: AuditLog[] = [];

  public createTenantWithApiKey(input: CreateTenantInput): Promise<CreatedTenantCredentials> {
    const now = new Date();
    const tenant: Tenant = {
      id: randomUUID(),
      name: input.name,
      slug: input.slug,
      status: 'active',
      rateLimitPerMinute: input.rateLimitPerMinute,
      createdAt: now,
      updatedAt: now,
    };
    const apiKey: ApiKey = {
      id: randomUUID(),
      tenantId: tenant.id,
      name: input.apiKeyName,
      keyPrefix: input.apiKeySecret.prefix,
      keyHash: input.apiKeySecret.hash,
      status: 'active',
      lastUsedAt: null,
      expiresAt: null,
      createdAt: now,
      revokedAt: null,
    };

    this.tenants.set(tenant.id, tenant);
    this.apiKeys.set(apiKey.id, apiKey);

    return Promise.resolve({ tenant, apiKey });
  }

  public findTenantById(id: string): Promise<Tenant | null> {
    return Promise.resolve(this.tenants.get(id) ?? null);
  }

  public findApiKeysByPrefix(prefix: string): Promise<ApiKey[]> {
    return Promise.resolve(
      [...this.apiKeys.values()].filter((apiKey) => apiKey.keyPrefix === prefix),
    );
  }

  public markApiKeyUsed(id: string, usedAt: Date): Promise<void> {
    const apiKey = this.apiKeys.get(id);

    if (apiKey) {
      this.apiKeys.set(id, {
        ...apiKey,
        lastUsedAt: usedAt,
      });
    }

    return Promise.resolve();
  }

  public listAuditLogs(input: ListAuditLogsInput): Promise<ListAuditLogsResult> {
    const filtered = this.auditLogs
      .filter((auditLog) => auditLog.tenantId === input.tenantId)
      .filter((auditLog) => !input.actorType || auditLog.actorType === input.actorType)
      .filter((auditLog) => !input.action || auditLog.action === input.action)
      .filter((auditLog) => !input.resourceType || auditLog.resourceType === input.resourceType)
      .sort((left, right) => {
        const createdAtDifference = right.createdAt.getTime() - left.createdAt.getTime();

        return createdAtDifference || right.id.localeCompare(left.id);
      });

    return Promise.resolve({
      items: filtered.slice(input.offset, input.offset + input.limit),
      total: filtered.length,
    });
  }

  public recordAuditLog(input: AuditLogInput): Promise<void> {
    this.auditLogs.push({
      id: randomUUID(),
      tenantId: input.tenantId,
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata ?? {},
      createdAt: new Date(),
    });

    return Promise.resolve();
  }
}
