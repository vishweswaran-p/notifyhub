import { describe, expect, it } from 'vitest';

import { ApiKeySecretService } from '@modules/identity/application/api-key-secret-service.js';
import { AuthenticateApiKeyUseCase } from '@modules/identity/application/authenticate-api-key-use-case.js';
import { CreateTenantUseCase } from '@modules/identity/application/create-tenant-use-case.js';
import { InvalidCredentialsError } from '@modules/identity/application/identity-errors.js';

import { InMemoryIdentityRepository } from './in-memory-identity-repository.js';

describe('AuthenticateApiKeyUseCase', () => {
  it('authenticates an active API key and updates last-used timestamp', async () => {
    const repository = new InMemoryIdentityRepository();
    const apiKeySecretService = new ApiKeySecretService(
      'test-pepper-with-enough-entropy-for-hashing',
    );
    const tenant = await new CreateTenantUseCase(repository, apiKeySecretService).execute({
      name: 'Acme',
      slug: 'acme',
    });
    const useCase = new AuthenticateApiKeyUseCase(repository, apiKeySecretService);

    const principal = await useCase.execute(tenant.apiKeySecret);
    const apiKey = repository.apiKeys.get(tenant.apiKey.id);

    expect(principal).toEqual({
      tenantId: tenant.tenant.id,
      actorType: 'api_key',
      actorId: tenant.apiKey.id,
    });
    expect(apiKey?.lastUsedAt).toBeInstanceOf(Date);
  });

  it('rejects malformed or unknown API keys', async () => {
    const repository = new InMemoryIdentityRepository();
    const apiKeySecretService = new ApiKeySecretService(
      'test-pepper-with-enough-entropy-for-hashing',
    );
    const useCase = new AuthenticateApiKeyUseCase(repository, apiKeySecretService);

    await expect(useCase.execute('not-a-real-key')).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
