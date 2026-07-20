import { createHash } from 'node:crypto';

import { ProviderDeliveryError } from '@modules/notifications/application/providers/provider-delivery-error.js';

import type {
  NotificationProvider,
  ProviderDeliveryResult,
} from '@modules/notifications/application/providers/notification-provider.js';
import type {
  Notification,
  NotificationChannel,
} from '@modules/notifications/domain/notification.js';

export class MockNotificationProvider implements NotificationProvider {
  public readonly name: string;

  public constructor(public readonly channel: NotificationChannel) {
    this.name = `mock-${channel}`;
  }

  public deliver(notification: Notification): Promise<ProviderDeliveryResult> {
    if (notification.recipient.includes('fail')) {
      throw new ProviderDeliveryError(
        'Mock provider rejected recipient.',
        'MOCK_PROVIDER_REJECTED',
        {
          recipient: notification.recipient,
        },
      );
    }

    return Promise.resolve({
      providerMessageId: this.createProviderMessageId(notification),
      metadata: {
        mock: true,
        channel: this.channel,
      },
    });
  }

  private createProviderMessageId(notification: Notification): string {
    const digest = createHash('sha256')
      .update(`${this.name}:${notification.id}:${notification.recipient}`)
      .digest('hex')
      .slice(0, 24);

    return `${this.name}-${digest}`;
  }
}
