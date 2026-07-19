import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastify, { type FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

import { HealthCheckService } from '../../modules/health/application/health-check-service.js';
import { registerHealthRoutes } from '../../modules/health/interfaces/http/health-routes.js';
import { ApiKeySecretService } from '../../modules/identity/application/api-key-secret-service.js';
import { AuthenticateApiKeyUseCase } from '../../modules/identity/application/authenticate-api-key-use-case.js';
import { CreateTenantUseCase } from '../../modules/identity/application/create-tenant-use-case.js';
import { GetCurrentTenantUseCase } from '../../modules/identity/application/get-current-tenant-use-case.js';
import { PostgresIdentityRepository } from '../../modules/identity/infrastructure/persistence/postgres-identity-repository.js';
import { registerIdentityRoutes } from '../../modules/identity/interfaces/http/identity-routes.js';
import { CreateNotificationTemplateUseCase } from '../../modules/notifications/application/create-notification-template-use-case.js';
import { CreateNotificationUseCase } from '../../modules/notifications/application/create-notification-use-case.js';
import { TemplateRenderer } from '../../modules/notifications/application/template-renderer.js';
import { PostgresNotificationTemplateRepository } from '../../modules/notifications/infrastructure/persistence/postgres-notification-template-repository.js';
import { PostgresNotificationRepository } from '../../modules/notifications/infrastructure/persistence/postgres-notification-repository.js';
import { BullMqNotificationQueuePublisher } from '../../modules/notifications/infrastructure/queue/bullmq-notification-queue-publisher.js';
import { registerNotificationRoutes } from '../../modules/notifications/interfaces/http/notification-routes.js';
import type { AppConfig } from '../../shared/config/environment.js';
import { createPostgresPool } from '../../shared/database/postgres.js';
import { registerErrorHandler } from '../../shared/http/error-handler.js';
import { createLoggerOptions } from '../../shared/observability/logger.js';

export async function buildApiServer(config: AppConfig): Promise<FastifyInstance> {
  const app = fastify({
    genReqId: () => randomUUID(),
    logger: createLoggerOptions(config),
  });

  const healthCheckService = new HealthCheckService(config, app.log);
  const appPool = createPostgresPool(config);
  const identityRepository = new PostgresIdentityRepository(appPool);
  const apiKeySecretService = new ApiKeySecretService(config.API_KEY_PEPPER);
  const authenticateApiKeyUseCase = new AuthenticateApiKeyUseCase(
    identityRepository,
    apiKeySecretService,
  );
  const notificationQueuePublisher = new BullMqNotificationQueuePublisher(config.REDIS_URL, {
    maxAttempts: config.DELIVERY_MAX_ATTEMPTS,
    retryBackoffMs: config.DELIVERY_RETRY_BACKOFF_MS,
  });
  const notificationRepository = new PostgresNotificationRepository(appPool);
  const notificationTemplateRepository = new PostgresNotificationTemplateRepository(appPool);
  const templateRenderer = new TemplateRenderer();

  registerErrorHandler(app);

  await app.register(sensible);
  await app.register(helmet);
  await app.register(jwt, {
    secret: config.JWT_SECRET,
  });
  await app.register(cors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'NotifyHub API',
        description: 'Multi-tenant notification platform API.',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'x-api-key',
          },
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  app.addHook('onClose', async () => {
    await healthCheckService.close();
    await notificationQueuePublisher.close();
    await appPool.end();
  });

  registerHealthRoutes(app, healthCheckService);
  registerIdentityRoutes(app, {
    authenticateApiKeyUseCase,
    createTenantUseCase: new CreateTenantUseCase(identityRepository, apiKeySecretService),
    getCurrentTenantUseCase: new GetCurrentTenantUseCase(identityRepository),
    identityRepository,
    jwtExpiresInSeconds: config.JWT_EXPIRES_IN_SECONDS,
  });
  registerNotificationRoutes(app, {
    authenticateApiKeyUseCase,
    createNotificationTemplateUseCase: new CreateNotificationTemplateUseCase(
      notificationTemplateRepository,
    ),
    createNotificationUseCase: new CreateNotificationUseCase(
      notificationRepository,
      notificationTemplateRepository,
      templateRenderer,
      notificationQueuePublisher,
    ),
  });

  app.get(
    '/v1',
    {
      schema: {
        tags: ['System'],
        response: {
          200: {
            type: 'object',
            required: ['name', 'version', 'status'],
            properties: {
              name: { type: 'string' },
              version: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
      },
    },
    () => ({
      name: 'notifyhub',
      version: '0.1.0',
      status: 'ok',
    }),
  );

  return app;
}
