import type { ApiKey, ApiKeySecret } from '../domain/api-key.js';
import type { AuditLogInput } from '../domain/audit-log.js';
import type { Tenant } from '../domain/tenant.js';

export type CreateTenantInput = {
  name: string;
  slug: string;
  rateLimitPerMinute: number;
  apiKeyName: string;
  apiKeySecret: ApiKeySecret;
};

export type CreatedTenantCredentials = {
  tenant: Tenant;
  apiKey: ApiKey;
};

export interface IdentityRepository {
  createTenantWithApiKey(input: CreateTenantInput): Promise<CreatedTenantCredentials>;
  findTenantById(id: string): Promise<Tenant | null>;
  findApiKeysByPrefix(prefix: string): Promise<ApiKey[]>;
  markApiKeyUsed(id: string, usedAt: Date): Promise<void>;
  recordAuditLog(input: AuditLogInput): Promise<void>;
}
