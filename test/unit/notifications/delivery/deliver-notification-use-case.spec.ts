import { describe, expect, it } from 'vitest';

import { DeliverNotificationUseCase } from '../../../../src/modules/notifications/application/deliver-notification-use-case.js';
import { MockNotificationProvider } from '../../../../src/modules/notifications/infrastructure/providers/mock-notification-provider.js';
import { StaticNotificationProviderRegistry } from '../../../../src/modules/notifications/infrastructure/providers/static-notification-provider-registry.js';

import { InMemoryNotificationRepository } from '../in-memory-notification-repository.js';

const tenantId = '55a163d6-e3ca-4bb4-8a96-78d98381a96e';

describe('DeliverNotificationUseCase', () => {
  it('delivers a queued notification and records attempt history', async () => {
    const repository = new InMemoryNotificationRepository();
    const notification = await repository.create({
      tenantId,
      idempotencyKey: 'delivery-success',
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
    const useCase = new DeliverNotificationUseCase(repository, createProviderRegistry());

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
    const useCase = new DeliverNotificationUseCase(repository, createProviderRegistry());

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
    });
    expect(repository.notifications.get(notification.id)?.status).toBe('failed');
    expect(repository.deliveryAttempts.at(-1)).toMatchObject({
      status: 'failed',
      errorCode: 'MOCK_PROVIDER_REJECTED',
    });
  });

  it('skips delivery when the queue payload does not match persisted channel', async () => {
    const repository = new InMemoryNotificationRepository();
    const notification = await repository.create({
      tenantId,
      idempotencyKey: 'delivery-skip',
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
    const useCase = new DeliverNotificationUseCase(repository, createProviderRegistry());

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
