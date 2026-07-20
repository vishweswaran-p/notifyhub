import { describe, expect, it } from 'vitest';

import { ApiKeySecretService } from '@modules/identity/application/api-key-secret-service.js';

describe('ApiKeySecretService', () => {
  it('generates opaque API keys and verifies only the original secret', () => {
    const service = new ApiKeySecretService('test-pepper-with-enough-entropy-for-hashing');
    const apiKey = service.generate();

    expect(apiKey.secret).toMatch(/^nh_live_[a-f0-9]{12}_/);
    expect(apiKey.prefix).toHaveLength(12);
    expect(service.extractPrefix(apiKey.secret)).toBe(apiKey.prefix);
    expect(service.verify(apiKey.secret, apiKey.hash)).toBe(true);
    expect(service.verify(`${apiKey.secret}-tampered`, apiKey.hash)).toBe(false);
  });
});
