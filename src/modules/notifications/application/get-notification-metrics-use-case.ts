import type { AuthPrincipal } from '@modules/identity/application/auth-principal.js';
import type {
  NotificationRepository,
  TenantNotificationMetrics,
} from './notification-repository.js';

export class GetNotificationMetricsUseCase {
  public constructor(private readonly repository: NotificationRepository) {}

  public execute(params: { principal: AuthPrincipal }): Promise<TenantNotificationMetrics> {
    return this.repository.getTenantMetrics({
      tenantId: params.principal.tenantId,
    });
  }
}
