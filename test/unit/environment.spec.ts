import { describe, expect, it } from 'vitest';

import { loadConfig } from '@shared/config/environment.js';

describe('loadConfig', () => {
  it('loads safe defaults for local development', () => {
    const config = loadConfig({});

    expect(config.NODE_ENV).toBe('development');
    expect(config.API_PORT).toBe(3000);
    expect(config.DATABASE_URL).toBe('postgres://notifyhub:notifyhub@localhost:5432/notifyhub');
    expect(config.JWT_EXPIRES_IN_SECONDS).toBe(900);
    expect(config.DELIVERY_MAX_ATTEMPTS).toBe(3);
    expect(config.DELIVERY_RETRY_BACKOFF_MS).toBe(5000);
    expect(config.SCHEDULER_POLL_INTERVAL_MS).toBe(5000);
    expect(config.SCHEDULER_BATCH_SIZE).toBe(100);
    expect(config.NOTIFICATION_PROVIDER_MODE).toBe('mock');
    expect(config.HTTP_PROVIDER_TIMEOUT_MS).toBe(10000);
    expect(config.OTEL_ENABLED).toBe(false);
    expect(config.OTEL_SERVICE_NAME).toBe('notifyhub');
  });

  it('rejects default secrets in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
      }),
    ).toThrow(/JWT_SECRET|API_KEY_PEPPER/);
  });

  it('requires HTTP provider endpoints when HTTP provider mode is enabled', () => {
    expect(() =>
      loadConfig({
        NOTIFICATION_PROVIDER_MODE: 'http',
      }),
    ).toThrow(/EMAIL_PROVIDER_URL|SMS_PROVIDER_URL|PUSH_PROVIDER_URL/);
  });

  it('loads HTTP provider and telemetry configuration', () => {
    const config = loadConfig({
      NOTIFICATION_PROVIDER_MODE: 'http',
      EMAIL_PROVIDER_URL: 'https://email.example.com/send',
      EMAIL_PROVIDER_API_KEY: 'email-secret',
      SMS_PROVIDER_URL: 'https://sms.example.com/send',
      SMS_PROVIDER_API_KEY: 'sms-secret',
      PUSH_PROVIDER_URL: 'https://push.example.com/send',
      PUSH_PROVIDER_API_KEY: 'push-secret',
      WEBHOOK_PROVIDER_API_KEY: 'webhook-secret',
      OTEL_ENABLED: 'true',
      OTEL_SERVICE_NAME: 'notifyhub-worker',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318/v1/traces',
    });

    expect(config.NOTIFICATION_PROVIDER_MODE).toBe('http');
    expect(config.EMAIL_PROVIDER_API_KEY).toBe('email-secret');
    expect(config.OTEL_ENABLED).toBe(true);
    expect(config.OTEL_SERVICE_NAME).toBe('notifyhub-worker');
  });

  it('parses false boolean environment values explicitly', () => {
    const config = loadConfig({
      OTEL_ENABLED: 'false',
    });

    expect(config.OTEL_ENABLED).toBe(false);
  });
});
