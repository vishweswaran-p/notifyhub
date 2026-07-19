import type { FastifyInstance } from 'fastify';

import { ApplicationError } from '../../../../shared/errors/application-error.js';
import {
  createRequireTenantAuth,
  requireAuth,
} from '../../../identity/interfaces/http/auth-hooks.js';

import type { AuthenticateApiKeyUseCase } from '../../../identity/application/authenticate-api-key-use-case.js';
import type {
  CreateNotificationCommand,
  CreateNotificationUseCase,
} from '../../application/create-notification-use-case.js';
import type { Notification } from '../../domain/notification.js';

type RegisterNotificationRoutesDependencies = {
  authenticateApiKeyUseCase: AuthenticateApiKeyUseCase;
  createNotificationUseCase: CreateNotificationUseCase;
};

export function registerNotificationRoutes(
  app: FastifyInstance,
  dependencies: RegisterNotificationRoutesDependencies,
): void {
  const requireTenantAuth = createRequireTenantAuth(dependencies);

  app.post<{ Body: CreateNotificationCommand; Headers: { 'idempotency-key'?: string } }>(
    '/v1/notifications',
    {
      preHandler: requireTenantAuth,
      schema: {
        tags: ['Notifications'],
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        headers: notificationHeadersSchema,
        body: createNotificationBodySchema,
        response: {
          202: notificationResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await dependencies.createNotificationUseCase.execute({
        principal: requireAuth(request),
        command: request.body,
        idempotencyKey: normalizeIdempotencyKey(request.headers['idempotency-key']),
      });

      reply.status(202);
      reply.header('x-idempotent-replay', result.idempotentReplay ? 'true' : 'false');

      return {
        notification: serializeNotification(result.notification),
        idempotentReplay: result.idempotentReplay,
      };
    },
  );
}

function normalizeIdempotencyKey(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length < 8 || trimmed.length > 128) {
    throw new ApplicationError({
      code: 'INVALID_IDEMPOTENCY_KEY',
      message: 'Idempotency-Key must be between 8 and 128 characters.',
      statusCode: 400,
    });
  }

  return trimmed;
}

function serializeNotification(notification: Notification): Record<string, unknown> {
  return {
    id: notification.id,
    tenantId: notification.tenantId,
    channel: notification.channel,
    recipient: notification.recipient,
    subject: notification.subject,
    body: notification.body,
    variables: notification.variables,
    metadata: notification.metadata,
    status: notification.status,
    scheduledAt: notification.scheduledAt?.toISOString() ?? null,
    acceptedAt: notification.acceptedAt.toISOString(),
    queuedAt: notification.queuedAt?.toISOString() ?? null,
    deadLetteredAt: notification.deadLetteredAt?.toISOString() ?? null,
    lastErrorCode: notification.lastErrorCode,
    lastErrorMessage: notification.lastErrorMessage,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
  };
}

const notificationHeadersSchema = {
  type: 'object',
  properties: {
    'idempotency-key': { type: 'string', minLength: 8, maxLength: 128 },
  },
} as const;

const createNotificationBodySchema = {
  type: 'object',
  required: ['channel', 'recipient', 'body'],
  additionalProperties: false,
  properties: {
    channel: { type: 'string', enum: ['email', 'sms', 'push', 'webhook'] },
    recipient: { type: 'string', minLength: 1, maxLength: 512 },
    subject: { type: 'string', minLength: 1, maxLength: 255 },
    body: { type: 'string', minLength: 1, maxLength: 10000 },
    variables: { type: 'object', additionalProperties: true, default: {} },
    metadata: { type: 'object', additionalProperties: true, default: {} },
    scheduledAt: { type: 'string', format: 'date-time' },
  },
} as const;

const notificationSchema = {
  type: 'object',
  required: [
    'id',
    'tenantId',
    'channel',
    'recipient',
    'subject',
    'body',
    'variables',
    'metadata',
    'status',
    'scheduledAt',
    'acceptedAt',
    'queuedAt',
    'deadLetteredAt',
    'lastErrorCode',
    'lastErrorMessage',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string', format: 'uuid' },
    channel: { type: 'string', enum: ['email', 'sms', 'push', 'webhook'] },
    recipient: { type: 'string' },
    subject: { type: ['string', 'null'] },
    body: { type: 'string' },
    variables: { type: 'object', additionalProperties: true },
    metadata: { type: 'object', additionalProperties: true },
    status: {
      type: 'string',
      enum: ['queued', 'scheduled', 'processing', 'delivered', 'failed', 'dead_lettered'],
    },
    scheduledAt: { type: ['string', 'null'], format: 'date-time' },
    acceptedAt: { type: 'string', format: 'date-time' },
    queuedAt: { type: ['string', 'null'], format: 'date-time' },
    deadLetteredAt: { type: ['string', 'null'], format: 'date-time' },
    lastErrorCode: { type: ['string', 'null'] },
    lastErrorMessage: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const notificationResponseSchema = {
  type: 'object',
  required: ['notification', 'idempotentReplay'],
  properties: {
    notification: notificationSchema,
    idempotentReplay: { type: 'boolean' },
  },
} as const;
