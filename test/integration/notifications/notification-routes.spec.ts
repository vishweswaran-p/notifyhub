import jwt from '@fastify/jwt';
import fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ApiKeySecretService } from '../../../src/modules/identity/application/api-key-secret-service.js';
import { AuthenticateApiKeyUseCase } from '../../../src/modules/identity/application/authenticate-api-key-use-case.js';
import { CreateTenantUseCase } from '../../../src/modules/identity/application/create-tenant-use-case.js';
import { GetCurrentTenantUseCase } from '../../../src/modules/identity/application/get-current-tenant-use-case.js';
import { ListAuditLogsUseCase } from '../../../src/modules/identity/application/list-audit-logs-use-case.js';
import { registerIdentityRoutes } from '../../../src/modules/identity/interfaces/http/identity-routes.js';
import { CreateNotificationTemplateUseCase } from '../../../src/modules/notifications/application/create-notification-template-use-case.js';
import { CreateNotificationUseCase } from '../../../src/modules/notifications/application/create-notification-use-case.js';
import { GetNotificationMetricsUseCase } from '../../../src/modules/notifications/application/get-notification-metrics-use-case.js';
import { GetQueueMetricsUseCase } from '../../../src/modules/notifications/application/get-queue-metrics-use-case.js';
import { ListDeadLetterNotificationsUseCase } from '../../../src/modules/notifications/application/list-dead-letter-notifications-use-case.js';
import { ListDeliveryAttemptsUseCase } from '../../../src/modules/notifications/application/list-delivery-attempts-use-case.js';
import { ListNotificationsUseCase } from '../../../src/modules/notifications/application/list-notifications-use-case.js';
import { ReplayDeadLetterNotificationUseCase } from '../../../src/modules/notifications/application/replay-dead-letter-notification-use-case.js';
import { TemplateRenderer } from '../../../src/modules/notifications/application/template-renderer.js';
import { registerNotificationRoutes } from '../../../src/modules/notifications/interfaces/http/notification-routes.js';
import { registerErrorHandler } from '../../../src/shared/http/error-handler.js';

import { InMemoryIdentityRepository } from '../../unit/identity/in-memory-identity-repository.js';
import { FakeNotificationQueueMonitor } from '../../unit/notifications/fake-notification-queue-monitor.js';
import { FakeNotificationQueuePublisher } from '../../unit/notifications/fake-notification-queue-publisher.js';
import { InMemoryNotificationRepository } from '../../unit/notifications/in-memory-notification-repository.js';
import { InMemoryNotificationTemplateRepository } from '../../unit/notifications/in-memory-notification-template-repository.js';
import { FakeTenantRateLimiter } from '../../unit/notifications/rate-limit/fake-tenant-rate-limiter.js';

import type { TenantNotificationPolicyRepository } from '../../../src/modules/notifications/application/rate-limit/tenant-notification-policy-repository.js';

describe('notification routes', () => {
  let app: FastifyInstance;
  let notificationRepository: InMemoryNotificationRepository;
  let queueMonitor: FakeNotificationQueueMonitor;
  let queuePublisher: FakeNotificationQueuePublisher;
  let rateLimiter: FakeTenantRateLimiter;

  beforeEach(async () => {
    const identityRepository = new InMemoryIdentityRepository();
    notificationRepository = new InMemoryNotificationRepository();
    const notificationTemplateRepository = new InMemoryNotificationTemplateRepository();
    queueMonitor = new FakeNotificationQueueMonitor();
    queuePublisher = new FakeNotificationQueuePublisher();
    rateLimiter = new FakeTenantRateLimiter();
    const tenantPolicyRepository: TenantNotificationPolicyRepository = {
      findByTenantId: (tenantId) =>
        Promise.resolve({
          tenantId,
          rateLimitPerMinute: 60,
        }),
    };
    const apiKeySecretService = new ApiKeySecretService(
      'test-pepper-with-enough-entropy-for-hashing',
    );
    const authenticateApiKeyUseCase = new AuthenticateApiKeyUseCase(
      identityRepository,
      apiKeySecretService,
    );

    app = fastify({ logger: false });
    registerErrorHandler(app);
    await app.register(jwt, {
      secret: 'test-jwt-secret-with-enough-entropy-for-signing',
    });
    registerIdentityRoutes(app, {
      authenticateApiKeyUseCase,
      createTenantUseCase: new CreateTenantUseCase(identityRepository, apiKeySecretService),
      getCurrentTenantUseCase: new GetCurrentTenantUseCase(identityRepository),
      identityRepository,
      listAuditLogsUseCase: new ListAuditLogsUseCase(identityRepository),
      jwtExpiresInSeconds: 900,
    });
    registerNotificationRoutes(app, {
      authenticateApiKeyUseCase,
      createNotificationTemplateUseCase: new CreateNotificationTemplateUseCase(
        notificationTemplateRepository,
      ),
      createNotificationUseCase: new CreateNotificationUseCase(
        notificationRepository,
        notificationTemplateRepository,
        new TemplateRenderer(),
        tenantPolicyRepository,
        rateLimiter,
        queuePublisher,
      ),
      getNotificationMetricsUseCase: new GetNotificationMetricsUseCase(notificationRepository),
      getQueueMetricsUseCase: new GetQueueMetricsUseCase(queueMonitor),
      listDeadLetterNotificationsUseCase: new ListDeadLetterNotificationsUseCase(
        notificationRepository,
      ),
      listDeliveryAttemptsUseCase: new ListDeliveryAttemptsUseCase(notificationRepository),
      listNotificationsUseCase: new ListNotificationsUseCase(notificationRepository),
      replayDeadLetterNotificationUseCase: new ReplayDeadLetterNotificationUseCase(
        notificationRepository,
        queuePublisher,
      ),
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts an authenticated notification command and returns 202', async () => {
    const apiKey = await createTenantAndGetApiKey(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/notifications',
      headers: {
        'x-api-key': apiKey,
        'idempotency-key': 'notif-http-1',
      },
      payload: {
        channel: 'email',
        recipient: 'user@example.com',
        subject: 'Welcome',
        body: 'Hello from NotifyHub',
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.headers['x-idempotent-replay']).toBe('false');
    expect(response.json()).toMatchObject({
      notification: {
        channel: 'email',
        recipient: 'user@example.com',
        status: 'queued',
      },
      idempotentReplay: false,
    });
    expect(queuePublisher.jobs).toHaveLength(1);
  });

  it('returns the same notification for idempotent replay requests', async () => {
    const apiKey = await createTenantAndGetApiKey(app);
    const payload = {
      channel: 'sms',
      recipient: '+15555550123',
      body: 'Your code is 123456',
    };

    const first = await app.inject({
      method: 'POST',
      url: '/v1/notifications',
      headers: {
        'x-api-key': apiKey,
        'idempotency-key': 'same-http-key',
      },
      payload,
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/v1/notifications',
      headers: {
        'x-api-key': apiKey,
        'idempotency-key': 'same-http-key',
      },
      payload,
    });

    expect(replay.statusCode).toBe(202);
    expect(replay.headers['x-idempotent-replay']).toBe('true');
    expect(replay.json<{ notification: { id: string } }>().notification.id).toBe(
      first.json<{ notification: { id: string } }>().notification.id,
    );
    expect(queuePublisher.jobs).toHaveLength(1);
  });

  it('lists notifications with filters and pagination metadata', async () => {
    const apiKey = await createTenantAndGetApiKey(app);
    await createNotification(app, apiKey, {
      idempotencyKey: 'list-email-1',
      payload: {
        channel: 'email',
        recipient: 'user@example.com',
        body: 'Hello',
      },
    });
    await createNotification(app, apiKey, {
      idempotencyKey: 'list-sms-1',
      payload: {
        channel: 'sms',
        recipient: '+15555550123',
        body: 'Hello',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/notifications?channel=email&limit=10&offset=0',
      headers: {
        'x-api-key': apiKey,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      notifications: [
        {
          channel: 'email',
          recipient: 'user@example.com',
        },
      ],
      pagination: {
        limit: 10,
        offset: 0,
        total: 1,
      },
    });
  });

  it('returns tenant notification analytics', async () => {
    const apiKey = await createTenantAndGetApiKey(app);
    await createNotification(app, apiKey, {
      idempotencyKey: 'metrics-email-1',
      payload: {
        channel: 'email',
        recipient: 'user@example.com',
        body: 'Hello',
      },
    });
    await createNotification(app, apiKey, {
      idempotencyKey: 'metrics-webhook-1',
      payload: {
        channel: 'webhook',
        recipient: 'https://example.com/webhook',
        body: '{}',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/analytics/notifications',
      headers: {
        'x-api-key': apiKey,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      metrics: {
        total: 2,
        byStatus: {
          queued: 2,
        },
        byChannel: {
          email: 1,
          webhook: 1,
        },
        deliveryAttempts: {
          total: 0,
          delivered: 0,
          failed: 0,
        },
      },
    });
  });

  it('returns notification delivery queue metrics', async () => {
    const apiKey = await createTenantAndGetApiKey(app);
    queueMonitor.metrics = {
      name: 'notification-delivery',
      counts: {
        waiting: 2,
        active: 1,
        delayed: 3,
        completed: 10,
        failed: 4,
        paused: 0,
      },
    };

    const response = await app.inject({
      method: 'GET',
      url: '/v1/queues/notification-delivery/metrics',
      headers: {
        'x-api-key': apiKey,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      queue: queueMonitor.metrics,
    });
  });

  it('lists dead-lettered notifications for a tenant', async () => {
    const apiKey = await createTenantAndGetApiKey(app);
    const notificationId = await createDeadLetteredNotification(
      app,
      notificationRepository,
      apiKey,
      {
        idempotencyKey: 'dlq-list-1',
        payload: {
          channel: 'webhook',
          recipient: 'https://example.com/webhook',
          body: '{}',
        },
      },
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1/dlq/notifications?channel=webhook&limit=10&offset=0',
      headers: {
        'x-api-key': apiKey,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      notifications: [
        {
          id: notificationId,
          channel: 'webhook',
          status: 'dead_lettered',
          lastErrorCode: 'PROVIDER_DELIVERY_FAILED',
          lastErrorMessage: 'Provider rejected notification.',
        },
      ],
      pagination: {
        limit: 10,
        offset: 0,
        total: 1,
      },
    });
  });

  it('replays a dead-lettered notification and enqueues delivery', async () => {
    const apiKey = await createTenantAndGetApiKey(app);
    const notificationId = await createDeadLetteredNotification(
      app,
      notificationRepository,
      apiKey,
      {
        idempotencyKey: 'dlq-replay-1',
        payload: {
          channel: 'email',
          recipient: 'user@example.com',
          body: 'Hello',
        },
      },
    );
    queuePublisher.jobs.length = 0;

    const response = await app.inject({
      method: 'POST',
      url: `/v1/dlq/notifications/${notificationId}/replay`,
      headers: {
        'x-api-key': apiKey,
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      notification: {
        id: notificationId,
        status: 'queued',
        deadLetteredAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    expect(queuePublisher.jobs).toEqual([
      {
        payload: {
          notificationId,
          tenantId: response.json<{ notification: { tenantId: string } }>().notification.tenantId,
          channel: 'email',
        },
        delayMs: undefined,
      },
    ]);
  });

  it('returns 404 when replaying a non-dead-lettered notification', async () => {
    const apiKey = await createTenantAndGetApiKey(app);
    const notificationId = await createNotification(app, apiKey, {
      idempotencyKey: 'dlq-replay-missing-1',
      payload: {
        channel: 'sms',
        recipient: '+15555550123',
        body: 'Hello',
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/v1/dlq/notifications/${notificationId}/replay`,
      headers: {
        'x-api-key': apiKey,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: 'DEAD_LETTER_NOTIFICATION_NOT_FOUND',
      },
    });
  });

  it('lists delivery attempts for a tenant notification', async () => {
    const apiKey = await createTenantAndGetApiKey(app);
    const notificationId = await createNotification(app, apiKey, {
      idempotencyKey: 'attempt-history-1',
      payload: {
        channel: 'email',
        recipient: 'user@example.com',
        body: 'Hello',
      },
    });
    const notification = notificationRepository.notifications.get(notificationId);

    if (!notification) {
      throw new Error('Expected notification to be created.');
    }

    await notificationRepository.recordDeliveryAttempt({
      notificationId,
      tenantId: notification.tenantId,
      channel: 'email',
      provider: 'mock-email',
      status: 'processing',
      attemptNumber: 1,
      providerMessageId: null,
      errorCode: null,
      errorMessage: null,
      responseMetadata: {},
      startedAt: new Date('2026-07-20T04:59:00.000Z'),
      completedAt: null,
    });
    await notificationRepository.recordDeliveryAttempt({
      notificationId,
      tenantId: notification.tenantId,
      channel: 'email',
      provider: 'mock-email',
      status: 'delivered',
      attemptNumber: 1,
      providerMessageId: 'provider-message-1',
      errorCode: null,
      errorMessage: null,
      responseMetadata: {
        accepted: true,
      },
      startedAt: new Date('2026-07-20T05:00:00.000Z'),
      completedAt: new Date('2026-07-20T05:00:01.000Z'),
    });

    const response = await app.inject({
      method: 'GET',
      url: `/v1/notifications/${notificationId}/delivery-attempts?limit=10&offset=0`,
      headers: {
        'x-api-key': apiKey,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      deliveryAttempts: [
        {
          notificationId,
          channel: 'email',
          provider: 'mock-email',
          status: 'delivered',
          attemptNumber: 1,
          providerMessageId: 'provider-message-1',
          responseMetadata: {
            accepted: true,
          },
          completedAt: '2026-07-20T05:00:01.000Z',
        },
        {
          notificationId,
          channel: 'email',
          provider: 'mock-email',
          status: 'processing',
          attemptNumber: 1,
          completedAt: null,
        },
      ],
      pagination: {
        limit: 10,
        offset: 0,
        total: 2,
      },
    });
  });

  it('returns 404 when listing attempts for another tenant notification', async () => {
    const firstApiKey = await createTenantAndGetApiKey(app);
    const secondApiKey = await createTenantAndGetApiKey(app);
    const notificationId = await createNotification(app, firstApiKey, {
      idempotencyKey: 'attempt-cross-tenant-1',
      payload: {
        channel: 'sms',
        recipient: '+15555550123',
        body: 'Hello',
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: `/v1/notifications/${notificationId}/delivery-attempts`,
      headers: {
        'x-api-key': secondApiKey,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: 'NOTIFICATION_NOT_FOUND',
      },
    });
  });

  it('creates a template and renders a notification from it', async () => {
    const apiKey = await createTenantAndGetApiKey(app);
    const templateResponse = await app.inject({
      method: 'POST',
      url: '/v1/templates',
      headers: {
        'x-api-key': apiKey,
      },
      payload: {
        name: 'Welcome email',
        channel: 'email',
        subjectTemplate: 'Welcome {{name}}',
        bodyTemplate: 'Hello {{name}}',
      },
    });
    const templateId = templateResponse.json<{ template: { id: string } }>().template.id;

    const notificationResponse = await app.inject({
      method: 'POST',
      url: '/v1/notifications',
      headers: {
        'x-api-key': apiKey,
        'idempotency-key': 'template-http-key',
      },
      payload: {
        channel: 'email',
        recipient: 'user@example.com',
        templateId,
        variables: {
          name: 'Vishnu',
        },
      },
    });

    expect(templateResponse.statusCode).toBe(201);
    expect(notificationResponse.statusCode).toBe(202);
    expect(notificationResponse.json()).toMatchObject({
      notification: {
        templateId,
        subject: 'Welcome Vishnu',
        body: 'Hello Vishnu',
      },
    });
  });

  it('rejects unauthenticated notification commands', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/notifications',
      payload: {
        channel: 'email',
        recipient: 'user@example.com',
        body: 'Hello',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 429 when the tenant notification rate limit is exceeded', async () => {
    const apiKey = await createTenantAndGetApiKey(app);
    rateLimiter.nextResult = {
      allowed: false,
      limit: 1,
      remaining: 0,
      resetAt: new Date(Date.now() + 60_000),
    };

    const response = await app.inject({
      method: 'POST',
      url: '/v1/notifications',
      headers: {
        'x-api-key': apiKey,
      },
      payload: {
        channel: 'email',
        recipient: 'user@example.com',
        body: 'Hello',
      },
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      error: {
        code: 'NOTIFICATION_RATE_LIMIT_EXCEEDED',
      },
    });
    expect(queuePublisher.jobs).toHaveLength(0);
  });
});

async function createTenantAndGetApiKey(app: FastifyInstance): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/tenants',
    payload: {
      name: 'Acme',
      slug: `acme-${randomUUID()}`,
    },
  });

  return response.json<{ apiKey: { secret: string } }>().apiKey.secret;
}

async function createNotification(
  app: FastifyInstance,
  apiKey: string,
  params: {
    idempotencyKey: string;
    payload: Record<string, unknown>;
  },
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/notifications',
    headers: {
      'x-api-key': apiKey,
      'idempotency-key': params.idempotencyKey,
    },
    payload: params.payload,
  });

  return response.json<{ notification: { id: string } }>().notification.id;
}

async function createDeadLetteredNotification(
  app: FastifyInstance,
  repository: InMemoryNotificationRepository,
  apiKey: string,
  params: {
    idempotencyKey: string;
    payload: Record<string, unknown>;
  },
): Promise<string> {
  const notificationId = await createNotification(app, apiKey, params);
  const notification = repository.notifications.get(notificationId);

  if (!notification) {
    throw new Error('Expected notification to be created.');
  }

  const processing = await repository.markProcessing(notification.id, notification.tenantId);

  if (!processing) {
    throw new Error('Expected notification to transition to processing.');
  }

  const deadLettered = await repository.markDeadLettered(notification.id, notification.tenantId, {
    errorCode: 'PROVIDER_DELIVERY_FAILED',
    errorMessage: 'Provider rejected notification.',
  });

  if (!deadLettered) {
    throw new Error('Expected notification to transition to dead_lettered.');
  }

  return notificationId;
}
