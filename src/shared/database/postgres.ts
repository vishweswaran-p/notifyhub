import { Pool } from 'pg';

import type { AppConfig } from '@shared/config/environment.js';

export function createPostgresPool(config: Pick<AppConfig, 'DATABASE_URL'>): Pool {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
  });
}
