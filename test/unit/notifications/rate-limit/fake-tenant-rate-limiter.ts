import type {
  ConsumeTenantRateLimitInput,
  ConsumeTenantRateLimitResult,
  TenantRateLimiter,
} from '../../../../src/modules/notifications/application/rate-limit/tenant-rate-limiter.js';

export class FakeTenantRateLimiter implements TenantRateLimiter {
  public readonly inputs: ConsumeTenantRateLimitInput[] = [];
  public nextResult: ConsumeTenantRateLimitResult = {
    allowed: true,
    limit: 60,
    remaining: 59,
    resetAt: new Date(Date.now() + 60_000),
  };

  public consume(input: ConsumeTenantRateLimitInput): Promise<ConsumeTenantRateLimitResult> {
    this.inputs.push(input);

    return Promise.resolve(this.nextResult);
  }
}
