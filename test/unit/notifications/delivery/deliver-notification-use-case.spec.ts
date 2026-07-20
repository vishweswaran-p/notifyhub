import { describe, expect, it } from 'vitest';

import { DeliverNotificationUseCase } from '@modules/notifications/application/deliver-notification-use-case.js';
import { MockNotificationProvider } from '@modules/notifications/infrastructure/providers/mock-notification-provider.js';
import { StaticNotificationProviderRegistry } from '@modules/notifications/infrastructure/providers/static-notification-provider-registry.js';

import { InMemoryNotificationRepository } from '@test/unit/notifications/in-memory-notification-repository.js';

const tenantId = '55a163d6-e3ca-4bb4-8a96-78d98381a96e';

describe('DeliverNotificationUseCase', () => {
  it('delivers a queued notification and records attempt history', async () => {
    const repository = new InMemoryNotificationRepository();
    const notification = await repository.create({
      tenantId,
      idempotencyKey: 'delivery-success',
      templateId: null,
      channel: 'email',
      recipient: 'user@example.com',
      subject: 'Welcome',
      body: 'Hello',
      variables: {},
      metadata: {},
      status: 'queued',
      scheduledAt: null,
      queuedAt: new Date(),
    });
    const useCase = new DeliverNotificationUseCase(repository, createProviderRegistry(), 3);

    const result = await useCase.execute({
      notificationId: notification.id,
      tenantId,
      channel: 'email',
    });

    expect(result).toMatchObject({
      outcome: 'delivered',
      notificationId: notification.id,
      provider: 'mock-email',
    });
    expect(repository.notifications.get(notification.id)?.status).toBe('delivered');
    expect(repository.deliveryAttempts.map((attempt) => attempt.status)).toEqual([
      'processing',
      'delivered',
    ]);
  });

  it('marks notification failed when the provider rejects delivery', async () => {
    const repository = new InMemoryNotificationRepository();
    const notification = await repository.create({
      tenantId,
      idempotencyKey: 'delivery-failure',
      templateId: null,
      channel: 'sms',
      recipient: 'fail-user',
      subject: null,
      body: 'Hello',
      variables: {},
      metadata: {},
      status: 'queued',
      scheduledAt: null,
      queuedAt: new Date(),
    });
    const useCase = new DeliverNotificationUseCase(repository, createProviderRegistry(), 3);

    const result = await useCase.execute({
      notificationId: notification.id,
      tenantId,
      channel: 'sms',
    });

    expect(result).toEqual({
      outcome: 'failed',
      notificationId: notification.id,
      provider: 'mock-sms',
      errorCode: 'MOCK_PROVIDER_REJECTED',
      attemptNumber: 1,
      shouldRetry: true,
    });
    expect(repository.notifications.get(notification.id)?.status).toBe('failed');
    expect(repository.deliveryAttempts.at(-1)).toMatchObject({
      status: 'failed',
      errorCode: 'MOCK_PROVIDER_REJECTED',
    });
  });

  it('moves notification to the dead letter queue on the final failed attempt', async () => {
    const repository = new InMemoryNotificationRepository();
    const notification = await repository.create({
      tenantId,
      idempotencyKey: 'delivery-dead-letter',
      templateId: null,
      channel: 'webhook',
      recipient: 'https://fail.example.com/webhook',
      subject: null,
      body: '{}',
      variables: {},
      metadata: {},
      status: 'queued',
      scheduledAt: null,
      queuedAt: new Date(),
    });
    const useCase = new DeliverNotificationUseCase(repository, createProviderRegistry(), 1);

    const result = await useCase.execute({
      notificationId: notification.id,
      tenantId,
      channel: 'webhook',
    });

    expect(result).toEqual({
      outcome: 'dead_lettered',
      notificationId: notification.id,
      provider: 'mock-webhook',
      errorCode: 'MOCK_PROVIDER_REJECTED',
      attemptNumber: 1,
    });
    expect(repository.notifications.get(notification.id)).toMatchObject({
      status: 'dead_lettered',
      lastErrorCode: 'MOCK_PROVIDER_REJECTED',
      lastErrorMessage: 'Mock provider rejected recipient.',
    });
    expect(repository.notifications.get(notification.id)?.deadLetteredAt).toBeInstanceOf(Date);
  });

  it('skips delivery when the queue payload does not match persisted channel', async () => {
    const repository = new InMemoryNotificationRepository();
    const notification = await repository.create({
      tenantId,
      idempotencyKey: 'delivery-skip',
      templateId: null,
      channel: 'push',
      recipient: 'device-token',
      subject: null,
      body: 'Hello',
      variables: {},
      metadata: {},
      status: 'queued',
      scheduledAt: null,
      queuedAt: new Date(),
    });
    const useCase = new DeliverNotificationUseCase(repository, createProviderRegistry(), 3);

    const result = await useCase.execute({
      notificationId: notification.id,
      tenantId,
      channel: 'email',
    });

    expect(result).toEqual({
      outcome: 'skipped',
      notificationId: notification.id,
      reason: 'channel_mismatch',
    });
    expect(repository.deliveryAttempts).toHaveLength(0);
  });
});

function createProviderRegistry(): StaticNotificationProviderRegistry {
  return new StaticNotificationProviderRegistry([
    new MockNotificationProvider('email'),
    new MockNotificationProvider('sms'),
    new MockNotificationProvider('push'),
    new MockNotificationProvider('webhook'),
  ]);
}
