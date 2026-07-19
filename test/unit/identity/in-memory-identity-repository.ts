import { randomUUID } from 'node:crypto';

import type { ApiKey } from '../../../src/modules/identity/domain/api-key.js';
import type { AuditLogInput } from '../../../src/modules/identity/domain/audit-log.js';
import type { Tenant } from '../../../src/modules/identity/domain/tenant.js';
import type {
  CreatedTenantCredentials,
  CreateTenantInput,
  IdentityRepository,
} from '../../../src/modules/identity/application/identity-repository.js';

export class InMemoryIdentityRepository implements IdentityRepository {
  public readonly tenants = new Map<string, Tenant>();
  public readonly apiKeys = new Map<string, ApiKey>();
  public readonly auditLogs: AuditLogInput[] = [];

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

  public recordAuditLog(input: AuditLogInput): Promise<void> {
    this.auditLogs.push(input);

    return Promise.resolve();
  }
}
