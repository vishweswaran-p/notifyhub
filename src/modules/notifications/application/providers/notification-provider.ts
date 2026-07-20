import type {
  Notification,
  NotificationChannel,
} from '@modules/notifications/domain/notification.js';

export type ProviderDeliveryResult = {
  providerMessageId: string;
  metadata: Record<string, unknown>;
};

export interface NotificationProvider {
  readonly name: string;
  readonly channel: NotificationChannel;
  deliver(notification: Notification): Promise<ProviderDeliveryResult>;
}

export interface NotificationProviderRegistry {
  get(channel: NotificationChannel): NotificationProvider;
}
