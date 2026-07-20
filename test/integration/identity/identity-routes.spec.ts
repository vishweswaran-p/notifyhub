import jwt from '@fastify/jwt';
import fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ApiKeySecretService } from '../../../src/modules/identity/application/api-key-secret-service.js';
import { AuthenticateApiKeyUseCase } from '../../../src/modules/identity/application/authenticate-api-key-use-case.js';
import { CreateTenantUseCase } from '../../../src/modules/identity/application/create-tenant-use-case.js';
import { GetCurrentTenantUseCase } from '../../../src/modules/identity/application/get-current-tenant-use-case.js';
import { ListAuditLogsUseCase } from '../../../src/modules/identity/application/list-audit-logs-use-case.js';
import { registerIdentityRoutes } from '../../../src/modules/identity/interfaces/http/identity-routes.js';
import { registerErrorHandler } from '../../../src/shared/http/error-handler.js';

import { InMemoryIdentityRepository } from '../../unit/identity/in-memory-identity-repository.js';

describe('identity routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const repository = new InMemoryIdentityRepository();
    const apiKeySecretService = new ApiKeySecretService(
      'test-pepper-with-enough-entropy-for-hashing',
    );

    app = fastify({ logger: false });
    registerErrorHandler(app);
    await app.register(jwt, {
      secret: 'test-jwt-secret-with-enough-entropy-for-signing',
    });
    registerIdentityRoutes(app, {
      authenticateApiKeyUseCase: new AuthenticateApiKeyUseCase(repository, apiKeySecretService),
      createTenantUseCase: new CreateTenantUseCase(repository, apiKeySecretService),
      getCurrentTenantUseCase: new GetCurrentTenantUseCase(repository),
      identityRepository: repository,
      listAuditLogsUseCase: new ListAuditLogsUseCase(repository),
      jwtExpiresInSeconds: 900,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('onboards a tenant, issues a JWT, and returns the current tenant', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/tenants',
      payload: {
        name: 'Acme',
        slug: 'acme',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json<{
      tenant: { id: string; slug: string };
      apiKey: { secret: string };
    }>();

    const tokenResponse = await app.inject({
      method: 'POST',
      url: '/v1/auth/tokens',
      headers: {
        'x-api-key': created.apiKey.secret,
      },
    });

    expect(tokenResponse.statusCode).toBe(201);
    const token = tokenResponse.json<{ accessToken: string }>().accessToken;

    const currentTenantResponse = await app.inject({
      method: 'GET',
      url: '/v1/tenants/me',
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(currentTenantResponse.statusCode).toBe(200);
    expect(currentTenantResponse.json()).toMatchObject({
      tenant: {
        id: created.tenant.id,
        slug: 'acme',
      },
    });
  });

  it('rejects unauthenticated current tenant requests', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/tenants/me',
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: 'INVALID_CREDENTIALS',
      },
    });
  });

  it('lists tenant audit logs with filters and pagination metadata', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/tenants',
      payload: {
        name: 'Acme',
        slug: 'audit-acme',
      },
    });
    const created = createResponse.json<{
      apiKey: { secret: string };
    }>();

    await app.inject({
      method: 'POST',
      url: '/v1/auth/tokens',
      headers: {
        'x-api-key': created.apiKey.secret,
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/v1/audit-logs?action=auth.token_issued&limit=10&offset=0',
      headers: {
        'x-api-key': created.apiKey.secret,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      auditLogs: [
        {
          action: 'auth.token_issued',
          resourceType: 'tenant',
        },
      ],
      pagination: {
        limit: 10,
        offset: 0,
        total: 1,
      },
    });
  });
});
