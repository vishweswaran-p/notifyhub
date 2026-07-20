import { describe, expect, it } from 'vitest';

import { PromoteScheduledNotificationsUseCase } from '../../../src/modules/notifications/application/promote-scheduled-notifications-use-case.js';

import { FakeNotificationQueuePublisher } from './fake-notification-queue-publisher.js';
import { InMemoryNotificationRepository } from './in-memory-notification-repository.js';

const tenantId = '55a163d6-e3ca-4bb4-8a96-78d98381a96e';

describe('PromoteScheduledNotificationsUseCase', () => {
  it('promotes due scheduled notifications and enqueues delivery jobs', async () => {
    const repository = new InMemoryNotificationRepository();
    const queuePublisher = new FakeNotificationQueuePublisher();
    const useCase = new PromoteScheduledNotificationsUseCase(repository, queuePublisher);
    const now = new Date('2026-07-20T05:00:00.000Z');
    const dueNotification = await repository.create({
      tenantId,
      idempotencyKey: null,
      templateId: null,
      channel: 'email',
      recipient: 'user@example.com',
      subject: 'Welcome',
      body: 'Hello',
      variables: {},
      metadata: {},
      status: 'scheduled',
      scheduledAt: new Date('2026-07-20T04:59:00.000Z'),
      queuedAt: null,
    });

    await repository.create({
      tenantId,
      idempotencyKey: null,
      templateId: null,
      channel: 'sms',
      recipient: '+15555550123',
      subject: null,
      body: 'Later',
      variables: {},
      metadata: {},
      status: 'scheduled',
      scheduledAt: new Date('2026-07-20T05:01:00.000Z'),
      queuedAt: null,
    });

    const result = await useCase.execute({
      now,
      limit: 10,
    });

    expect(result).toEqual({
      promoted: 1,
    });
    expect(repository.notifications.get(dueNotification.id)).toMatchObject({
      status: 'queued',
      queuedAt: now,
    });
    expect(queuePublisher.jobs).toEqual([
      {
        payload: {
          notificationId: dueNotification.id,
          tenantId,
          channel: 'email',
        },
        delayMs: undefined,
      },
    ]);
  });

  it('honors the promotion batch limit', async () => {
    const repository = new InMemoryNotificationRepository();
    const queuePublisher = new FakeNotificationQueuePublisher();
    const useCase = new PromoteScheduledNotificationsUseCase(repository, queuePublisher);
    const now = new Date('2026-07-20T05:00:00.000Z');

    await Promise.all([
      repository.create({
        tenantId,
        idempotencyKey: null,
        templateId: null,
        channel: 'email',
        recipient: 'first@example.com',
        subject: 'First',
        body: 'First',
        variables: {},
        metadata: {},
        status: 'scheduled',
        scheduledAt: new Date('2026-07-20T04:58:00.000Z'),
        queuedAt: null,
      }),
      repository.create({
        tenantId,
        idempotencyKey: null,
        templateId: null,
        channel: 'email',
        recipient: 'second@example.com',
        subject: 'Second',
        body: 'Second',
        variables: {},
        metadata: {},
        status: 'scheduled',
        scheduledAt: new Date('2026-07-20T04:59:00.000Z'),
        queuedAt: null,
      }),
    ]);

    const result = await useCase.execute({
      now,
      limit: 1,
    });

    expect(result.promoted).toBe(1);
    expect(queuePublisher.jobs).toHaveLength(1);
  });
});
