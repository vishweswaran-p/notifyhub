import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProviderDeliveryError } from '@modules/notifications/application/providers/provider-delivery-error.js';
import { HttpNotificationProvider } from '@modules/notifications/infrastructure/providers/http-notification-provider.js';

import type { Notification } from '@modules/notifications/domain/notification.js';

const notification: Notification = {
  id: '2bfa7ac4-0750-4072-a3ac-12844955192d',
  tenantId: '55a163d6-e3ca-4bb4-8a96-78d98381a96e',
  idempotencyKey: null,
  templateId: null,
  channel: 'email',
  recipient: 'user@example.com',
  subject: 'Welcome',
  body: 'Hello',
  variables: {
    name: 'Vishnu',
  },
  metadata: {
    campaign: 'welcome',
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

describe('HttpNotificationProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts notification payload to the configured provider endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ providerMessageId: 'provider-message-1' }), {
        status: 202,
        headers: {
          'content-type': 'application/json',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = new HttpNotificationProvider({
      channel: 'email',
      endpointUrl: 'https://email.example.com/send',
      apiKey: 'email-secret',
      timeoutMs: 1000,
    });

    const result = await provider.deliver(notification);

    expect(result).toMatchObject({
      providerMessageId: 'provider-message-1',
      metadata: {
        providerMessageId: 'provider-message-1',
        providerStatus: 202,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://email.example.com/send',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer email-secret',
        },
      }),
    );
  });

  it('uses the recipient URL for webhook delivery', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new HttpNotificationProvider({
      channel: 'webhook',
      timeoutMs: 1000,
    });

    await provider.deliver({
      ...notification,
      channel: 'webhook',
      recipient: 'https://tenant.example.com/hooks/notify',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tenant.example.com/hooks/notify',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('raises provider delivery errors for rejected responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'invalid_recipient' }), {
          status: 422,
          headers: {
            'content-type': 'application/json',
          },
        }),
      ),
    );
    const provider = new HttpNotificationProvider({
      channel: 'email',
      endpointUrl: 'https://email.example.com/send',
      timeoutMs: 1000,
    });

    await expect(provider.deliver(notification)).rejects.toBeInstanceOf(ProviderDeliveryError);
  });
});
