import { InvalidCredentialsError } from './identity-errors.js';

import type { ApiKeySecretService } from './api-key-secret-service.js';
import type { AuthPrincipal } from './auth-principal.js';
import type { IdentityRepository } from './identity-repository.js';

export class AuthenticateApiKeyUseCase {
  public constructor(
    private readonly repository: IdentityRepository,
    private readonly apiKeySecretService: ApiKeySecretService,
  ) {}

  public async execute(secret: string): Promise<AuthPrincipal> {
    const prefix = this.apiKeySecretService.extractPrefix(secret);

    if (!prefix) {
      throw new InvalidCredentialsError();
    }

    const candidates = await this.repository.findApiKeysByPrefix(prefix);
    const now = new Date();

    for (const apiKey of candidates) {
      const isUsable =
        apiKey.status === 'active' &&
        (!apiKey.expiresAt || apiKey.expiresAt.getTime() > now.getTime());

      if (!isUsable || !this.apiKeySecretService.verify(secret, apiKey.keyHash)) {
        continue;
      }

      const tenant = await this.repository.findTenantById(apiKey.tenantId);

      if (!tenant || tenant.status !== 'active') {
        throw new InvalidCredentialsError();
      }

      await this.repository.markApiKeyUsed(apiKey.id, now);

      return {
        tenantId: tenant.id,
        actorType: 'api_key',
        actorId: apiKey.id,
      };
    }

    throw new InvalidCredentialsError();
  }
}
