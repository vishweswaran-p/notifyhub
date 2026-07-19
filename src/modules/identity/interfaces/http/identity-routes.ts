import type { FastifyInstance } from 'fastify';

import type { AuthenticateApiKeyUseCase } from '../../application/authenticate-api-key-use-case.js';
import type {
  CreateTenantCommand,
  CreateTenantUseCase,
} from '../../application/create-tenant-use-case.js';
import type { GetCurrentTenantUseCase } from '../../application/get-current-tenant-use-case.js';
import type { IdentityRepository } from '../../application/identity-repository.js';
import { createRequireApiKey, createRequireTenantAuth, requireAuth } from './auth-hooks.js';

type RegisterIdentityRoutesDependencies = {
  authenticateApiKeyUseCase: AuthenticateApiKeyUseCase;
  createTenantUseCase: CreateTenantUseCase;
  getCurrentTenantUseCase: GetCurrentTenantUseCase;
  identityRepository: IdentityRepository;
  jwtExpiresInSeconds: number;
};

type JwtTenantPayload = {
  tenantId: string;
  actorType: 'api_key';
  apiKeyId: string;
};

export function registerIdentityRoutes(
  app: FastifyInstance,
  dependencies: RegisterIdentityRoutesDependencies,
): void {
  const requireApiKey = createRequireApiKey(dependencies);
  const requireTenantAuth = createRequireTenantAuth(dependencies);

  app.post<{ Body: CreateTenantCommand }>(
    '/v1/tenants',
    {
      schema: {
        tags: ['Tenants'],
        body: createTenantBodySchema,
        response: {
          201: createTenantResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await dependencies.createTenantUseCase.execute(request.body);

      reply.status(201);

      return {
        tenant: serializeTenant(result.tenant),
        apiKey: {
          id: result.apiKey.id,
          name: result.apiKey.name,
          prefix: result.apiKey.keyPrefix,
          secret: result.apiKeySecret,
          createdAt: result.apiKey.createdAt.toISOString(),
        },
      };
    },
  );

  app.post(
    '/v1/auth/tokens',
    {
      preHandler: requireApiKey,
      schema: {
        tags: ['Auth'],
        security: [{ ApiKeyAuth: [] }],
        response: {
          201: tokenResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const principal = requireAuth(request);
      const token = app.jwt.sign(
        {
          tenantId: principal.tenantId,
          actorType: 'api_key',
          apiKeyId: principal.actorId,
        } satisfies JwtTenantPayload,
        {
          expiresIn: dependencies.jwtExpiresInSeconds,
        },
      );

      await dependencies.identityRepository.recordAuditLog({
        tenantId: principal.tenantId,
        actorType: principal.actorType,
        actorId: principal.actorId,
        action: 'auth.token_issued',
        resourceType: 'tenant',
        resourceId: principal.tenantId,
      });

      reply.status(201);

      return {
        tokenType: 'Bearer',
        accessToken: token,
        expiresIn: dependencies.jwtExpiresInSeconds,
      };
    },
  );

  app.get(
    '/v1/tenants/me',
    {
      preHandler: requireTenantAuth,
      schema: {
        tags: ['Tenants'],
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        response: {
          200: currentTenantResponseSchema,
        },
      },
    },
    async (request) => {
      const tenant = await dependencies.getCurrentTenantUseCase.execute(requireAuth(request));

      return {
        tenant: serializeTenant(tenant),
      };
    },
  );
}

function serializeTenant(tenant: {
  id: string;
  name: string;
  slug: string;
  status: string;
  rateLimitPerMinute: number;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    status: tenant.status,
    rateLimitPerMinute: tenant.rateLimitPerMinute,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}

const tenantSchema = {
  type: 'object',
  required: ['id', 'name', 'slug', 'status', 'rateLimitPerMinute', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    slug: { type: 'string' },
    status: { type: 'string', enum: ['active', 'suspended'] },
    rateLimitPerMinute: { type: 'integer' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const createTenantBodySchema = {
  type: 'object',
  required: ['name', 'slug'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    slug: {
      type: 'string',
      minLength: 3,
      maxLength: 80,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    },
    rateLimitPerMinute: { type: 'integer', minimum: 1, maximum: 100000, default: 60 },
    apiKeyName: { type: 'string', minLength: 1, maxLength: 120, default: 'Default API key' },
  },
} as const;

const createTenantResponseSchema = {
  type: 'object',
  required: ['tenant', 'apiKey'],
  properties: {
    tenant: tenantSchema,
    apiKey: {
      type: 'object',
      required: ['id', 'name', 'prefix', 'secret', 'createdAt'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        prefix: { type: 'string' },
        secret: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  },
} as const;

const tokenResponseSchema = {
  type: 'object',
  required: ['tokenType', 'accessToken', 'expiresIn'],
  properties: {
    tokenType: { type: 'string', enum: ['Bearer'] },
    accessToken: { type: 'string' },
    expiresIn: { type: 'integer' },
  },
} as const;

const currentTenantResponseSchema = {
  type: 'object',
  required: ['tenant'],
  properties: {
    tenant: tenantSchema,
  },
} as const;
