import type {
  TenantNotificationPolicy,
  TenantNotificationPolicyRepository,
} from '@modules/notifications/application/rate-limit/tenant-notification-policy-repository.js';

export class InMemoryTenantNotificationPolicyRepository implements TenantNotificationPolicyRepository {
  public readonly policies = new Map<string, TenantNotificationPolicy>();

  public findByTenantId(tenantId: string): Promise<TenantNotificationPolicy | null> {
    return Promise.resolve(this.policies.get(tenantId) ?? null);
  }
}
