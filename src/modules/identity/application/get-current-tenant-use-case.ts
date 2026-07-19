import { TenantNotFoundError } from './identity-errors.js';

import type { AuthPrincipal } from './auth-principal.js';
import type { IdentityRepository } from './identity-repository.js';
import type { Tenant } from '../domain/tenant.js';

export class GetCurrentTenantUseCase {
  public constructor(private readonly repository: IdentityRepository) {}

  public async execute(principal: AuthPrincipal): Promise<Tenant> {
    const tenant = await this.repository.findTenantById(principal.tenantId);

    if (!tenant) {
      throw new TenantNotFoundError();
    }

    return tenant;
  }
}
