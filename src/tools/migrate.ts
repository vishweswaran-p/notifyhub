import path from 'node:path';

import { loadConfig } from '@shared/config/environment.js';
import { runMigrations } from '@shared/database/migrator.js';
import { createPostgresPool } from '@shared/database/postgres.js';
import { createLoggerOptions } from '@shared/observability/logger.js';

import pino from 'pino';

const config = loadConfig();
const logger = pino(createLoggerOptions(config));
const pool = createPostgresPool(config);

try {
  const result = await runMigrations({
    pool,
    migrationsDirectory: path.resolve('migrations'),
  });

  logger.info(result, 'Database migrations completed.');
} catch (error) {
  logger.error({ err: error }, 'Database migration failed.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
