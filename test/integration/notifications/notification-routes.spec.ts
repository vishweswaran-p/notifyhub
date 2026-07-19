import jwt from '@fastify/jwt';
import fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ApiKeySecretService } from '../../../src/modules/identity/application/api-key-secret-service.js';
import { AuthenticateApiKeyUseCase } from '../../../src/modules/identity/application/authenticate-api-key-use-case.js';
import { CreateTenantUseCase } from '../../../src/modules/identity/application/create-tenant-use-case.js';
import { GetCurrentTenantUseCase } from '../../../src/modules/identity/application/get-current-tenant-use-case.js';
import { registerIdentityRoutes } from '../../../src/modules/identity/interfaces/http/identity-routes.js';
import { CreateNotificationUseCase } from '../../../src/modules/notifications/application/create-notification-use-case.js';
import { registerNotificationRoutes } from '../../../src/modules/notifications/interfaces/http/notification-routes.js';
import { registerErrorHandler } from '../../../src/shared/http/error-handler.js';

import { InMemoryIdentityRepository } from '../../unit/identity/in-memory-identity-repository.js';
import { FakeNotificationQueuePublisher } from '../../unit/notifications/fake-notification-queue-publisher.js';
import { InMemoryNotificationRepository } from '../../unit/notifications/in-memory-notification-repository.js';

describe('notification routes', () => {
  let app: FastifyInstance;
  let queuePublisher: FakeNotificationQueuePublisher;

  beforeEach(async () => {
    const identityRepository = new InMemoryIdentityRepository();
    const notificationRepository = new InMemoryNotificationRepository();
    queuePublisher = new FakeNotificationQueuePublisher();
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
      jwtExpiresInSeconds: 900,
    });
    registerNotificationRoutes(app, {
      authenticateApiKeyUseCase,
      createNotificationUseCase: new CreateNotificationUseCase(
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
