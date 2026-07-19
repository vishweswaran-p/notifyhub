import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/shared/config/environment.js';

describe('loadConfig', () => {
  it('loads safe defaults for local development', () => {
    const config = loadConfig({});

    expect(config.NODE_ENV).toBe('development');
    expect(config.API_PORT).toBe(3000);
    expect(config.DATABASE_URL).toBe('postgres://notifyhub:notifyhub@localhost:5432/notifyhub');
    expect(config.JWT_EXPIRES_IN_SECONDS).toBe(900);
  });

  it('rejects default secrets in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
      }),
    ).toThrow(/JWT_SECRET|API_KEY_PEPPER/);
  });
});
