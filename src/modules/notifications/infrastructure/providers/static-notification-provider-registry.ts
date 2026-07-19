import { ApplicationError } from '../../../../shared/errors/application-error.js';

import type {
  NotificationProvider,
  NotificationProviderRegistry,
} from '../../application/providers/notification-provider.js';
import type { NotificationChannel } from '../../domain/notification.js';

export class StaticNotificationProviderRegistry implements NotificationProviderRegistry {
  private readonly providersByChannel = new Map<NotificationChannel, NotificationProvider>();

  public constructor(providers: NotificationProvider[]) {
    for (const provider of providers) {
      this.providersByChannel.set(provider.channel, provider);
    }
  }

  public get(channel: NotificationChannel): NotificationProvider {
    const provider = this.providersByChannel.get(channel);

    if (!provider) {
      throw new ApplicationError({
        code: 'NOTIFICATION_PROVIDER_NOT_CONFIGURED',
        message: `No notification provider is configured for channel "${channel}".`,
        statusCode: 500,
        details: { channel },
      });
    }

    return provider;
  }
}
