import { Redis } from 'ioredis';
import { Pool } from 'pg';

import type { AppConfig } from '@shared/config/environment.js';
import type { FastifyBaseLogger } from 'fastify';

type DependencyStatus = 'up' | 'down';

export type HealthReport = {
  status: DependencyStatus;
  checks: {
    postgres: DependencyStatus;
    redis: DependencyStatus;
  };
};

export class HealthCheckService {
  private readonly pool: Pool;
  private readonly redis: Redis;

  public constructor(
    config: Pick<AppConfig, 'DATABASE_URL' | 'REDIS_URL'>,
    private readonly logger: FastifyBaseLogger,
  ) {
    this.pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 2,
    });

    this.redis = new Redis(config.REDIS_URL, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  public liveness(): { status: 'up' } {
    return { status: 'up' };
  }

  public async readiness(): Promise<HealthReport> {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);
    const status: DependencyStatus = postgres === 'up' && redis === 'up' ? 'up' : 'down';

    return {
      status,
      checks: {
        postgres,
        redis,
      },
    };
  }

  public async close(): Promise<void> {
    await this.pool.end();
    this.redis.disconnect();
  }

  private async checkPostgres(): Promise<DependencyStatus> {
    try {
      await this.pool.query('select 1');
      return 'up';
    } catch (error) {
      this.logger.warn({ err: error }, 'PostgreSQL readiness check failed.');
      return 'down';
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    try {
      if (this.redis.status === 'wait') {
        await this.redis.connect();
      }

      await this.redis.ping();
      return 'up';
    } catch (error) {
      this.logger.warn({ err: error }, 'Redis readiness check failed.');
      return 'down';
    }
  }
}
