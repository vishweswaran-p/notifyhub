import { Redis } from 'ioredis';

import type {
  ConsumeTenantRateLimitInput,
  ConsumeTenantRateLimitResult,
  TenantRateLimiter,
} from '@modules/notifications/application/rate-limit/tenant-rate-limiter.js';

export class RedisTenantRateLimiter implements TenantRateLimiter {
  private readonly redis: Redis;

  public constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  public async consume(input: ConsumeTenantRateLimitInput): Promise<ConsumeTenantRateLimitResult> {
    const now = new Date();
    const windowStartedAtMs =
      Math.floor(now.getTime() / (input.windowSeconds * 1_000)) * input.windowSeconds * 1_000;
    const resetAt = new Date(windowStartedAtMs + input.windowSeconds * 1_000);
    const key = `notifyhub:rate-limit:notifications:${input.tenantId}:${windowStartedAtMs}`;

    if (this.redis.status === 'wait') {
      await this.redis.connect();
    }

    const count = await this.redis.incr(key);

    if (count === 1) {
      await this.redis.expire(key, input.windowSeconds + 5);
    }

    const remaining = Math.max(input.limit - count, 0);

    return {
      allowed: count <= input.limit,
      limit: input.limit,
      remaining,
      resetAt,
    };
  }

  public disconnect(): void {
    this.redis.disconnect();
  }
}
