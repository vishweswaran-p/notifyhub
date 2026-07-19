import { describe, expect, it } from 'vitest';

import { CreateNotificationUseCase } from '../../../src/modules/notifications/application/create-notification-use-case.js';

import { FakeNotificationQueuePublisher } from './fake-notification-queue-publisher.js';
import { InMemoryNotificationRepository } from './in-memory-notification-repository.js';

const principal = {
  tenantId: '55a163d6-e3ca-4bb4-8a96-78d98381a96e',
  actorType: 'api_key',
  actorId: '84e1a9c1-efbf-4c70-85b2-fce752a98605',
} as const;

describe('CreateNotificationUseCase', () => {
  it('creates an immediate notification and enqueues one delivery job', async () => {
    const repository = new InMemoryNotificationRepository();
    const queuePublisher = new FakeNotificationQueuePublisher();
    const useCase = new CreateNotificationUseCase(repository, queuePublisher);

    const result = await useCase.execute({
      principal,
      idempotencyKey: 'welcome-email-1',
      command: {
        channel: 'email',
        recipient: 'user@example.com',
        subject: 'Welcome',
        body: 'Hello {{name}}',
        variables: { name: 'Vishnu' },
      },
    });

    expect(result.idempotentReplay).toBe(false);
    expect(result.notification).toMatchObject({
      tenantId: principal.tenantId,
      channel: 'email',
      status: 'queued',
    });
    expect(result.notification.queuedAt).toBeInstanceOf(Date);
    expect(queuePublisher.jobs).toEqual([
      {
        payload: {
          notificationId: result.notification.id,
          tenantId: principal.tenantId,
          channel: 'email',
        },
        delayMs: undefined,
      },
    ]);
  });

  it('returns the original notification and skips enqueue for idempotent replays', async () => {
    const repository = new InMemoryNotificationRepository();
    const queuePublisher = new FakeNotificationQueuePublisher();
    const useCase = new CreateNotificationUseCase(repository, queuePublisher);

    const first = await useCase.execute({
      principal,
      idempotencyKey: 'same-request-key',
      command: {
        channel: 'sms',
        recipient: '+15555550123',
        body: 'Your code is 123456',
      },
    });
    const replay = await useCase.execute({
      principal,
      idempotencyKey: 'same-request-key',
      command: {
        channel: 'sms',
        recipient: '+15555550123',
        body: 'Your code is 123456',
      },
    });

    expect(replay.idempotentReplay).toBe(true);
    expect(replay.notification.id).toBe(first.notification.id);
    expect(queuePublisher.jobs).toHaveLength(1);
  });

  it('delays scheduled notification jobs', async () => {
    const repository = new InMemoryNotificationRepository();
    const queuePublisher = new FakeNotificationQueuePublisher();
    const useCase = new CreateNotificationUseCase(repository, queuePublisher);
    const scheduledAt = new Date(Date.now() + 60_000).toISOString();

    const result = await useCase.execute({
      principal,
      idempotencyKey: null,
      command: {
        channel: 'webhook',
        recipient: 'https://example.com/hooks/notify',
        body: '{"event":"created"}',
        scheduledAt,
      },
    });

    expect(result.notification.status).toBe('scheduled');
    expect(result.notification.queuedAt).toBeNull();
    expect(queuePublisher.jobs[0]?.delayMs).toBeGreaterThan(0);
  });
});
