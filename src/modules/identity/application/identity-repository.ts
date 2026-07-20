import type { ApiKey, ApiKeySecret } from '../domain/api-key.js';
import type { AuditActorType, AuditLog, AuditLogInput } from '../domain/audit-log.js';
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
  listAuditLogs(input: ListAuditLogsInput): Promise<ListAuditLogsResult>;
  markApiKeyUsed(id: string, usedAt: Date): Promise<void>;
  recordAuditLog(input: AuditLogInput): Promise<void>;
}

export type ListAuditLogsInput = {
  tenantId: string;
  limit: number;
  offset: number;
  actorType?: AuditActorType;
  action?: string;
  resourceType?: string;
};

export type ListAuditLogsResult = {
  items: AuditLog[];
  total: number;
};
