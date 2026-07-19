import './authenticated-request.js';

import type { FastifyRequest } from 'fastify';

import { InvalidCredentialsError } from '../../application/identity-errors.js';

import type { AuthenticateApiKeyUseCase } from '../../application/authenticate-api-key-use-case.js';

type JwtTenantPayload = {
  tenantId: string;
  actorType: 'api_key';
  apiKeyId: string;
};

export type AuthHookDependencies = {
  authenticateApiKeyUseCase: AuthenticateApiKeyUseCase;
};

export function createRequireApiKey(dependencies: AuthHookDependencies) {
  return async (request: FastifyRequest): Promise<void> => {
    const apiKey = extractApiKey(request);

    if (!apiKey) {
      throw new InvalidCredentialsError();
    }

    request.auth = await dependencies.authenticateApiKeyUseCase.execute(apiKey);
  };
}

export function createRequireTenantAuth(dependencies: AuthHookDependencies) {
  return async (request: FastifyRequest): Promise<void> => {
    const apiKey = extractApiKey(request);

    if (apiKey) {
      request.auth = await dependencies.authenticateApiKeyUseCase.execute(apiKey);
      return;
    }

    if (!extractBearerToken(request)) {
      throw new InvalidCredentialsError();
    }

    try {
      const payload = await request.jwtVerify<JwtTenantPayload>();

      request.auth = {
        tenantId: payload.tenantId,
        actorType: 'jwt',
        actorId: payload.apiKeyId,
      };
    } catch {
      throw new InvalidCredentialsError();
    }
  };
}

export function requireAuth(request: FastifyRequest): NonNullable<FastifyRequest['auth']> {
  if (!request.auth) {
    throw new InvalidCredentialsError();
  }

  return request.auth;
}

function extractApiKey(request: FastifyRequest): string | null {
  const headerApiKey = request.headers['x-api-key'];

  if (typeof headerApiKey === 'string' && headerApiKey.trim()) {
    return headerApiKey.trim();
  }

  const authorization = request.headers.authorization;

  if (authorization?.startsWith('ApiKey ')) {
    return authorization.slice('ApiKey '.length).trim();
  }

  return null;
}

function extractBearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;

  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}
