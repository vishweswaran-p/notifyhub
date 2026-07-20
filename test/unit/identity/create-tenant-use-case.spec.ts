import { describe, expect, it } from 'vitest';

import { ApiKeySecretService } from '@modules/identity/application/api-key-secret-service.js';
import { CreateTenantUseCase } from '@modules/identity/application/create-tenant-use-case.js';

import { InMemoryIdentityRepository } from './in-memory-identity-repository.js';

describe('CreateTenantUseCase', () => {
  it('creates a tenant and returns the one-time API key secret', async () => {
    const repository = new InMemoryIdentityRepository();
    const apiKeySecretService = new ApiKeySecretService(
      'test-pepper-with-enough-entropy-for-hashing',
    );
    const useCase = new CreateTenantUseCase(repository, apiKeySecretService);

    const result = await useCase.execute({
      name: 'Acme',
      slug: 'acme',
      rateLimitPerMinute: 120,
      apiKeyName: 'CI key',
    });

    expect(result.tenant).toMatchObject({
      name: 'Acme',
      slug: 'acme',
      rateLimitPerMinute: 120,
    });
    expect(result.apiKeySecret).toMatch(/^nh_live_[a-f0-9]{12}_/);
    expect(result.apiKey.keyHash).not.toBe(result.apiKeySecret);
    expect(repository.tenants.size).toBe(1);
    expect(repository.apiKeys.size).toBe(1);
  });
});
