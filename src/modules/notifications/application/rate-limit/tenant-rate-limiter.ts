export type ConsumeTenantRateLimitInput = {
  tenantId: string;
  limit: number;
  windowSeconds: number;
};

export type ConsumeTenantRateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
};

export interface TenantRateLimiter {
  consume(input: ConsumeTenantRateLimitInput): Promise<ConsumeTenantRateLimitResult>;
}
