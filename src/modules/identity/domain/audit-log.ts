export type AuditActorType = 'system' | 'api_key' | 'jwt' | 'admin';

export type AuditLogInput = {
  tenantId: string | null;
  actorType: AuditActorType;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata?: Record<string, unknown>;
};
