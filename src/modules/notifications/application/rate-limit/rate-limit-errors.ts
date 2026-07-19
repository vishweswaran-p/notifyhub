import { ApplicationError } from '../../../../shared/errors/application-error.js';

export class NotificationRateLimitExceededError extends ApplicationError {
  public constructor(params: { limit: number; remaining: number; resetAt: Date }) {
    super({
      code: 'NOTIFICATION_RATE_LIMIT_EXCEEDED',
      message: 'Tenant notification rate limit exceeded.',
      statusCode: 429,
      details: {
        limit: params.limit,
        remaining: params.remaining,
        resetAt: params.resetAt.toISOString(),
      },
    });
  }
}
