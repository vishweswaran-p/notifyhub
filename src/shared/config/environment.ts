import 'dotenv/config';

import { z } from 'zod';

const defaultDevelopmentJwtSecret = 'dev-only-change-me-notifyhub-local-secret';
const defaultDevelopmentApiKeyPepper = 'dev-only-change-me-notifyhub-api-key-pepper';
const envBooleanSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  if (value === 'true' || value === '1') {
    return true;
  }

  if (value === 'false' || value === '0') {
    return false;
  }

  return value;
}, z.boolean());

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .url()
      .default('postgres://notifyhub:notifyhub@localhost:5432/notifyhub'),
    REDIS_URL: z.string().url().default('redis://localhost:6379'),
    JWT_SECRET: z.string().min(32).default(defaultDevelopmentJwtSecret),
    JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(900),
    API_KEY_PEPPER: z.string().min(32).default(defaultDevelopmentApiKeyPepper),
    DELIVERY_MAX_ATTEMPTS: z.coerce.number().int().positive().max(20).default(3),
    DELIVERY_RETRY_BACKOFF_MS: z.coerce.number().int().positive().default(5_000),
    SCHEDULER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
    SCHEDULER_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(100),
    NOTIFICATION_PROVIDER_MODE: z.enum(['mock', 'http']).default('mock'),
    HTTP_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    EMAIL_PROVIDER_URL: z.string().url().optional(),
    EMAIL_PROVIDER_API_KEY: z.string().min(1).optional(),
    SMS_PROVIDER_URL: z.string().url().optional(),
    SMS_PROVIDER_API_KEY: z.string().min(1).optional(),
    PUSH_PROVIDER_URL: z.string().url().optional(),
    PUSH_PROVIDER_API_KEY: z.string().min(1).optional(),
    WEBHOOK_PROVIDER_API_KEY: z.string().min(1).optional(),
    OTEL_ENABLED: envBooleanSchema.default(false),
    OTEL_SERVICE_NAME: z.string().min(1).default('notifyhub'),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    CORS_ORIGIN: z.string().default('*'),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'production' && env.JWT_SECRET === defaultDevelopmentJwtSecret) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET must be explicitly configured in production.',
      });
    }

    if (env.NODE_ENV === 'production' && env.API_KEY_PEPPER === defaultDevelopmentApiKeyPepper) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['API_KEY_PEPPER'],
        message: 'API_KEY_PEPPER must be explicitly configured in production.',
      });
    }

    if (env.NOTIFICATION_PROVIDER_MODE === 'http') {
      for (const [key, value] of Object.entries({
        EMAIL_PROVIDER_URL: env.EMAIL_PROVIDER_URL,
        SMS_PROVIDER_URL: env.SMS_PROVIDER_URL,
        PUSH_PROVIDER_URL: env.PUSH_PROVIDER_URL,
      })) {
        if (!value) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} must be configured when NOTIFICATION_PROVIDER_MODE is http.`,
          });
        }
      }
    }
  });

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  return environmentSchema.parse(source);
}
