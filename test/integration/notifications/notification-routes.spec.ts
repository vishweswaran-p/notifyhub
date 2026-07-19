import jwt from '@fastify/jwt';
import fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ApiKeySecretService } from '../../../src/modules/identity/application/api-key-secret-service.js';
import { AuthenticateApiKeyUseCase } from '../../../src/modules/identity/application/authenticate-api-key-use-case.js';
import { CreateTenantUseCase } from '../../../src/modules/identity/application/create-tenant-use-case.js';
import { GetCurrentTenantUseCase } from '../../../src/modules/identity/application/get-current-tenant-use-case.js';
import { registerIdentityRoutes } from '../../../src/modules/identity/interfaces/http/identity-routes.js';
import { CreateNotificationTemplateUseCase } from '../../../src/modules/notifications/application/create-notification-template-use-case.js';
import { CreateNotificationUseCase } from '../../../src/modules/notifications/application/create-notification-use-case.js';
import { TemplateRenderer } from '../../../src/modules/notifications/application/template-renderer.js';
import { registerNotificationRoutes } from '../../../src/modules/notifications/interfaces/http/notification-routes.js';
import { registerErrorHandler } from '../../../src/shared/http/error-handler.js';

import { InMemoryIdentityRepository } from '../../unit/identity/in-memory-identity-repository.js';
import { FakeNotificationQueuePublisher } from '../../unit/notifications/fake-notification-queue-publisher.js';
import { InMemoryNotificationRepository } from '../../unit/notifications/in-memory-notification-repository.js';
import { InMemoryNotificationTemplateRepository } from '../../unit/notifications/in-memory-notification-template-repository.js';

describe('notification routes', () => {
  let app: FastifyInstance;
  let queuePublisher: FakeNotificationQueuePublisher;

  beforeEach(async () => {
    const identityRepository = new InMemoryIdentityRepository();
    const notificationRepository = new InMemoryNotificationRepository();
    const notificationTemplateRepository = new InMemoryNotificationTemplateRepository();
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
      createNotificationTemplateUseCase: new CreateNotificationTemplateUseCase(
        notificationTemplateRepository,
      ),
      createNotificationUseCase: new CreateNotificationUseCase(
        notificationRepository,
        notificationTemplateRepository,
        new TemplateRenderer(),
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
