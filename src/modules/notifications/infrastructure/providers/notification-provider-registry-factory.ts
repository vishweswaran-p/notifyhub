import { MockNotificationProvider } from './mock-notification-provider.js';
import { HttpNotificationProvider } from './http-notification-provider.js';
import { FcmPushNotificationProvider } from './fcm-push-notification-provider.js';
import { StaticNotificationProviderRegistry } from './static-notification-provider-registry.js';

import type { AppConfig } from '@shared/config/environment.js';
import type {
  NotificationProvider,
  NotificationProviderRegistry,
} from '@modules/notifications/application/providers/notification-provider.js';

export function createNotificationProviderRegistry(
  config: AppConfig,
): NotificationProviderRegistry {
  return new StaticNotificationProviderRegistry([
    createHttpOrMockProvider({
      channel: 'email',
      endpointUrl: config.EMAIL_PROVIDER_URL,
      apiKey: config.EMAIL_PROVIDER_API_KEY,
      timeoutMs: config.HTTP_PROVIDER_TIMEOUT_MS,
      useMock: config.NOTIFICATION_PROVIDER_MODE === 'mock',
    }),
    createHttpOrMockProvider({
      channel: 'sms',
      endpointUrl: config.SMS_PROVIDER_URL,
      apiKey: config.SMS_PROVIDER_API_KEY,
      timeoutMs: config.HTTP_PROVIDER_TIMEOUT_MS,
      useMock: config.NOTIFICATION_PROVIDER_MODE === 'mock',
    }),
    createPushProvider(config),
    createHttpOrMockProvider({
      channel: 'webhook',
      apiKey: config.WEBHOOK_PROVIDER_API_KEY,
      timeoutMs: config.HTTP_PROVIDER_TIMEOUT_MS,
      useMock: config.NOTIFICATION_PROVIDER_MODE === 'mock',
    }),
  ]);
}

function createHttpOrMockProvider(params: {
  channel: 'email' | 'sms' | 'webhook';
  endpointUrl?: string;
  apiKey?: string;
  timeoutMs: number;
  useMock: boolean;
}): NotificationProvider {
  if (params.useMock) {
    return new MockNotificationProvider(params.channel);
  }

  return new HttpNotificationProvider({
    channel: params.channel,
    endpointUrl: params.endpointUrl,
    apiKey: params.apiKey,
    timeoutMs: params.timeoutMs,
  });
}

function createPushProvider(config: AppConfig): NotificationProvider {
  const pushProviderMode = config.PUSH_PROVIDER_MODE ?? config.NOTIFICATION_PROVIDER_MODE;

  if (pushProviderMode === 'mock') {
    return new MockNotificationProvider('push');
  }

  if (pushProviderMode === 'fcm') {
    return new FcmPushNotificationProvider({
      projectId: config.FCM_PROJECT_ID ?? '',
      clientEmail: config.FCM_CLIENT_EMAIL ?? '',
      privateKey: config.FCM_PRIVATE_KEY ?? '',
      timeoutMs: config.HTTP_PROVIDER_TIMEOUT_MS,
    });
  }

  return new HttpNotificationProvider({
    channel: 'push',
    endpointUrl: config.PUSH_PROVIDER_URL,
    apiKey: config.PUSH_PROVIDER_API_KEY,
    timeoutMs: config.HTTP_PROVIDER_TIMEOUT_MS,
  });
}
