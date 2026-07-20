import { MockNotificationProvider } from './mock-notification-provider.js';
import { HttpNotificationProvider } from './http-notification-provider.js';
import { StaticNotificationProviderRegistry } from './static-notification-provider-registry.js';

import type { AppConfig } from '@shared/config/environment.js';
import type { NotificationProviderRegistry } from '@modules/notifications/application/providers/notification-provider.js';

export function createNotificationProviderRegistry(
  config: AppConfig,
): NotificationProviderRegistry {
  if (config.NOTIFICATION_PROVIDER_MODE === 'mock') {
    return new StaticNotificationProviderRegistry([
      new MockNotificationProvider('email'),
      new MockNotificationProvider('sms'),
      new MockNotificationProvider('push'),
      new MockNotificationProvider('webhook'),
    ]);
  }

  return new StaticNotificationProviderRegistry([
    new HttpNotificationProvider({
      channel: 'email',
      endpointUrl: config.EMAIL_PROVIDER_URL,
      apiKey: config.EMAIL_PROVIDER_API_KEY,
      timeoutMs: config.HTTP_PROVIDER_TIMEOUT_MS,
    }),
    new HttpNotificationProvider({
      channel: 'sms',
      endpointUrl: config.SMS_PROVIDER_URL,
      apiKey: config.SMS_PROVIDER_API_KEY,
      timeoutMs: config.HTTP_PROVIDER_TIMEOUT_MS,
    }),
    new HttpNotificationProvider({
      channel: 'push',
      endpointUrl: config.PUSH_PROVIDER_URL,
      apiKey: config.PUSH_PROVIDER_API_KEY,
      timeoutMs: config.HTTP_PROVIDER_TIMEOUT_MS,
    }),
    new HttpNotificationProvider({
      channel: 'webhook',
      apiKey: config.WEBHOOK_PROVIDER_API_KEY,
      timeoutMs: config.HTTP_PROVIDER_TIMEOUT_MS,
    }),
  ]);
}
