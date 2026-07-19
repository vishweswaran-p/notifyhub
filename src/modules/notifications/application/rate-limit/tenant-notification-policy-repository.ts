export type TenantNotificationPolicy = {
  tenantId: string;
  rateLimitPerMinute: number;
};

export interface TenantNotificationPolicyRepository {
  findByTenantId(tenantId: string): Promise<TenantNotificationPolicy | null>;
}
