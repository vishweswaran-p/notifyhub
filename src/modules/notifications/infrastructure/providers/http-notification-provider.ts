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

type HttpNotificationProviderOptions = {
  channel: NotificationChannel;
  endpointUrl?: string;
  apiKey?: string;
  timeoutMs: number;
};

export class HttpNotificationProvider implements NotificationProvider {
  public readonly name: string;

  public constructor(private readonly options: HttpNotificationProviderOptions) {
    this.name = `http-${options.channel}`;
  }

  public get channel(): NotificationChannel {
    return this.options.channel;
  }

  public async deliver(notification: Notification): Promise<ProviderDeliveryResult> {
    const endpointUrl = this.resolveEndpointUrl(notification);
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: this.createHeaders(),
      body: JSON.stringify({
        notificationId: notification.id,
        tenantId: notification.tenantId,
        channel: notification.channel,
        recipient: notification.recipient,
        subject: notification.subject,
        body: notification.body,
        variables: notification.variables,
        metadata: notification.metadata,
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });

    const metadata = await parseProviderResponse(response);

    if (!response.ok) {
      throw new ProviderDeliveryError(
        `HTTP provider rejected notification with status ${response.status}.`,
        'HTTP_PROVIDER_REJECTED',
        {
          providerStatus: response.status,
          providerResponse: metadata,
        },
      );
    }

    return {
      providerMessageId:
        getProviderMessageId(metadata) ?? this.createProviderMessageId(notification),
      metadata: {
        ...metadata,
        providerStatus: response.status,
      },
    };
  }

  private resolveEndpointUrl(notification: Notification): string {
    if (this.channel === 'webhook') {
      return notification.recipient;
    }

    if (!this.options.endpointUrl) {
      throw new ProviderDeliveryError(
        `No HTTP provider endpoint configured for channel "${this.channel}".`,
        'HTTP_PROVIDER_NOT_CONFIGURED',
        {
          channel: this.channel,
        },
      );
    }

    return this.options.endpointUrl;
  }

  private createHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (this.options.apiKey) {
      headers.authorization = `Bearer ${this.options.apiKey}`;
    }

    return headers;
  }

  private createProviderMessageId(notification: Notification): string {
    const digest = createHash('sha256')
      .update(`${this.name}:${notification.id}:${notification.recipient}`)
      .digest('hex')
      .slice(0, 24);

    return `${this.name}-${digest}`;
  }
}

async function parseProviderResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    return {};
  }

  const body: unknown = await response.json();

  return isRecord(body) ? body : {};
}

function getProviderMessageId(metadata: Record<string, unknown>): string | null {
  const providerMessageId = metadata.providerMessageId ?? metadata.id ?? metadata.messageId;

  return typeof providerMessageId === 'string' && providerMessageId.trim().length > 0
    ? providerMessageId
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
