import { JWT } from 'google-auth-library';

import { ProviderDeliveryError } from '@modules/notifications/application/providers/provider-delivery-error.js';

import type {
  NotificationProvider,
  ProviderDeliveryResult,
} from '@modules/notifications/application/providers/notification-provider.js';
import type { Notification } from '@modules/notifications/domain/notification.js';

type FcmPushNotificationProviderOptions = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  timeoutMs: number;
};

type FcmAccessTokenProvider = {
  getAccessToken(): Promise<string | { token?: string | null } | null | undefined>;
};

export class FcmPushNotificationProvider implements NotificationProvider {
  public readonly name = 'fcm-push';
  public readonly channel = 'push';
  private readonly authClient: FcmAccessTokenProvider;
  private readonly endpointUrl: string;

  public constructor(
    private readonly options: FcmPushNotificationProviderOptions,
    authClient?: FcmAccessTokenProvider,
  ) {
    this.endpointUrl = `https://fcm.googleapis.com/v1/projects/${options.projectId}/messages:send`;
    this.authClient =
      authClient ??
      new JWT({
        email: options.clientEmail,
        key: normalizePrivateKey(options.privateKey),
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      });
  }

  public async deliver(notification: Notification): Promise<ProviderDeliveryResult> {
    const accessToken = normalizeAccessToken(await this.authClient.getAccessToken());

    if (!accessToken) {
      throw new ProviderDeliveryError(
        'Firebase Cloud Messaging access token was not issued.',
        'FCM_ACCESS_TOKEN_UNAVAILABLE',
      );
    }

    const response = await fetch(this.endpointUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: notification.recipient,
          notification: {
            title: notification.subject ?? 'Notification',
            body: notification.body,
          },
          data: toFcmData({
            notificationId: notification.id,
            tenantId: notification.tenantId,
            ...notification.metadata,
          }),
        },
      }),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    const metadata = await parseFcmResponse(response);

    if (!response.ok) {
      throw new ProviderDeliveryError(
        `Firebase Cloud Messaging rejected notification with status ${response.status}.`,
        'FCM_PROVIDER_REJECTED',
        {
          providerStatus: response.status,
          providerResponse: metadata,
        },
      );
    }

    return {
      providerMessageId: getFcmMessageName(metadata) ?? notification.id,
      metadata: {
        ...metadata,
        providerStatus: response.status,
      },
    };
  }
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, '\n');
}

function normalizeAccessToken(
  response: string | { token?: string | null } | null | undefined,
): string | null {
  if (typeof response === 'string') {
    return response;
  }

  return response?.token ?? null;
}

function toFcmData(metadata: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      typeof value === 'string' ? value : JSON.stringify(value),
    ]),
  );
}

async function parseFcmResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    return {};
  }

  const body: unknown = await response.json();

  return isRecord(body) ? body : {};
}

function getFcmMessageName(metadata: Record<string, unknown>): string | null {
  const name = metadata.name;

  return typeof name === 'string' && name.trim().length > 0 ? name : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
