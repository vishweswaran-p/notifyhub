import 'dotenv/config';

import { z } from 'zod';

const defaultDevelopmentJwtSecret = 'dev-only-change-me-notifyhub-local-secret';
const defaultDevelopmentApiKeyPepper = 'dev-only-change-me-notifyhub-api-key-pepper';

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
  });

export type AppConfig = z.infer<typeof environmentSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  return environmentSchema.parse(source);
}
