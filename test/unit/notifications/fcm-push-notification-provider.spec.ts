import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProviderDeliveryError } from '@modules/notifications/application/providers/provider-delivery-error.js';
import { FcmPushNotificationProvider } from '@modules/notifications/infrastructure/providers/fcm-push-notification-provider.js';

import type { Notification } from '@modules/notifications/domain/notification.js';

const notification: Notification = {
  id: '2bfa7ac4-0750-4072-a3ac-12844955192d',
  tenantId: '55a163d6-e3ca-4bb4-8a96-78d98381a96e',
  idempotencyKey: null,
  templateId: null,
  channel: 'push',
  recipient: 'fcm-device-token',
  subject: 'Welcome',
  body: 'Hello from NotifyHub',
  variables: {},
  metadata: {
    campaign: 'welcome',
    retry: false,
  },
  status: 'processing',
  scheduledAt: null,
  acceptedAt: new Date('2026-07-20T05:00:00.000Z'),
  queuedAt: new Date('2026-07-20T05:00:00.000Z'),
  deadLetteredAt: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  createdAt: new Date('2026-07-20T05:00:00.000Z'),
  updatedAt: new Date('2026-07-20T05:00:00.000Z'),
};

describe('FcmPushNotificationProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends push notifications through the FCM HTTP v1 API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          name: 'projects/notifyhub/messages/message-1',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = new FcmPushNotificationProvider(
      {
        projectId: 'notifyhub',
        clientEmail: 'firebase-adminsdk@example.iam.gserviceaccount.com',
        privateKey: 'private-key',
        timeoutMs: 1000,
      },
      {
        getAccessToken: () => Promise.resolve('access-token'),
      },
    );

    const result = await provider.deliver(notification);

    expect(result).toMatchObject({
      providerMessageId: 'projects/notifyhub/messages/message-1',
      metadata: {
        name: 'projects/notifyhub/messages/message-1',
        providerStatus: 200,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://fcm.googleapis.com/v1/projects/notifyhub/messages:send',
      expect.objectContaining({
        method: 'POST',
        headers: {
          authorization: 'Bearer access-token',
          'content-type': 'application/json',
        },
      }),
    );
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(requestInit.body as string) as {
      message: {
        token: string;
        data: Record<string, string>;
      };
    };
    expect(requestBody.message).toMatchObject({
      token: 'fcm-device-token',
      data: {
        notificationId: notification.id,
        tenantId: notification.tenantId,
        campaign: 'welcome',
        retry: 'false',
      },
    });
  });

  it('raises provider delivery errors for rejected FCM responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT' } }), {
          status: 400,
          headers: {
            'content-type': 'application/json',
          },
        }),
      ),
    );
    const provider = new FcmPushNotificationProvider(
      {
        projectId: 'notifyhub',
        clientEmail: 'firebase-adminsdk@example.iam.gserviceaccount.com',
        privateKey: 'private-key',
        timeoutMs: 1000,
      },
      {
        getAccessToken: () => Promise.resolve('access-token'),
      },
    );

    await expect(provider.deliver(notification)).rejects.toBeInstanceOf(ProviderDeliveryError);
  });
});
