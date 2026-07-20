import type { FastifyInstance } from 'fastify';

import { ApplicationError } from '../../../../shared/errors/application-error.js';
import {
  createRequireTenantAuth,
  requireAuth,
} from '../../../identity/interfaces/http/auth-hooks.js';

import type { AuthenticateApiKeyUseCase } from '../../../identity/application/authenticate-api-key-use-case.js';
import type {
  CreateNotificationTemplateCommand,
  CreateNotificationTemplateUseCase,
} from '../../application/create-notification-template-use-case.js';
import type {
  CreateNotificationCommand,
  CreateNotificationUseCase,
} from '../../application/create-notification-use-case.js';
import type { GetNotificationMetricsUseCase } from '../../application/get-notification-metrics-use-case.js';
import type { GetQueueMetricsUseCase } from '../../application/get-queue-metrics-use-case.js';
import type {
  ListDeadLetterNotificationsQuery,
  ListDeadLetterNotificationsUseCase,
} from '../../application/list-dead-letter-notifications-use-case.js';
import type {
  ListDeliveryAttemptsQuery,
  ListDeliveryAttemptsUseCase,
} from '../../application/list-delivery-attempts-use-case.js';
import type {
  ListNotificationsQuery,
  ListNotificationsUseCase,
} from '../../application/list-notifications-use-case.js';
import type { ReplayDeadLetterNotificationUseCase } from '../../application/replay-dead-letter-notification-use-case.js';
import type { DeliveryAttempt } from '../../domain/delivery-attempt.js';
import type { Notification } from '../../domain/notification.js';
import type { NotificationTemplate } from '../../domain/notification-template.js';

type RegisterNotificationRoutesDependencies = {
  authenticateApiKeyUseCase: AuthenticateApiKeyUseCase;
  createNotificationTemplateUseCase: CreateNotificationTemplateUseCase;
  createNotificationUseCase: CreateNotificationUseCase;
  getNotificationMetricsUseCase: GetNotificationMetricsUseCase;
  getQueueMetricsUseCase: GetQueueMetricsUseCase;
  listDeadLetterNotificationsUseCase: ListDeadLetterNotificationsUseCase;
  listDeliveryAttemptsUseCase: ListDeliveryAttemptsUseCase;
  listNotificationsUseCase: ListNotificationsUseCase;
  replayDeadLetterNotificationUseCase: ReplayDeadLetterNotificationUseCase;
};

export function registerNotificationRoutes(
  app: FastifyInstance,
  dependencies: RegisterNotificationRoutesDependencies,
): void {
  const requireTenantAuth = createRequireTenantAuth(dependencies);

  app.post<{ Body: CreateNotificationTemplateCommand }>(
    '/v1/templates',
    {
      preHandler: requireTenantAuth,
      schema: {
        tags: ['Templates'],
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        body: createTemplateBodySchema,
        response: {
          201: templateResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const template = await dependencies.createNotificationTemplateUseCase.execute({
        principal: requireAuth(request),
        command: request.body,
      });

      reply.status(201);

      return {
        template: serializeTemplate(template),
      };
    },
  );

  app.get<{ Querystring: ListNotificationsQuery }>(
    '/v1/notifications',
    {
      preHandler: requireTenantAuth,
      schema: {
        tags: ['Notifications'],
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        querystring: listNotificationsQuerySchema,
        response: {
          200: listNotificationsResponseSchema,
        },
      },
    },
    async (request) => {
      const result = await dependencies.listNotificationsUseCase.execute({
        principal: requireAuth(request),
        query: request.query,
      });

      return {
        notifications: result.items.map(serializeNotification),
        pagination: result.pagination,
      };
    },
  );

  app.get<{ Querystring: ListDeadLetterNotificationsQuery }>(
    '/v1/dlq/notifications',
    {
      preHandler: requireTenantAuth,
      schema: {
        tags: ['Dead Letter Queue'],
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        querystring: listDeadLetterNotificationsQuerySchema,
        response: {
          200: listDeadLetterNotificationsResponseSchema,
        },
      },
    },
    async (request) => {
      const result = await dependencies.listDeadLetterNotificationsUseCase.execute({
        principal: requireAuth(request),
        query: request.query,
      });

      return {
        notifications: result.items.map(serializeNotification),
        pagination: result.pagination,
      };
    },
  );

  app.post<{ Params: { notificationId: string } }>(
    '/v1/dlq/notifications/:notificationId/replay',
    {
      preHandler: requireTenantAuth,
      schema: {
        tags: ['Dead Letter Queue'],
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        params: notificationIdParamsSchema,
        response: {
          202: replayDeadLetterNotificationResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const notification = await dependencies.replayDeadLetterNotificationUseCase.execute({
        principal: requireAuth(request),
        notificationId: request.params.notificationId,
      });

      reply.status(202);

      return {
        notification: serializeNotification(notification),
      };
    },
  );

  app.get<{
    Params: { notificationId: string };
    Querystring: ListDeliveryAttemptsQuery;
  }>(
    '/v1/notifications/:notificationId/delivery-attempts',
    {
      preHandler: requireTenantAuth,
      schema: {
        tags: ['Delivery Attempts'],
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        params: notificationIdParamsSchema,
        querystring: listDeliveryAttemptsQuerySchema,
        response: {
          200: listDeliveryAttemptsResponseSchema,
        },
      },
    },
    async (request) => {
      const result = await dependencies.listDeliveryAttemptsUseCase.execute({
        principal: requireAuth(request),
        notificationId: request.params.notificationId,
        query: request.query,
      });

      return {
        deliveryAttempts: result.items.map(serializeDeliveryAttempt),
        pagination: result.pagination,
      };
    },
  );

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

  app.get(
    '/v1/analytics/notifications',
    {
      preHandler: requireTenantAuth,
      schema: {
        tags: ['Analytics'],
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        response: {
          200: notificationMetricsResponseSchema,
        },
      },
    },
    async (request) => {
      const metrics = await dependencies.getNotificationMetricsUseCase.execute({
        principal: requireAuth(request),
      });

      return {
        metrics,
      };
    },
  );

  app.get(
    '/v1/queues/notification-delivery/metrics',
    {
      preHandler: requireTenantAuth,
      schema: {
        tags: ['Queues'],
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        response: {
          200: queueMetricsResponseSchema,
        },
      },
    },
    async () => {
      const metrics = await dependencies.getQueueMetricsUseCase.execute();

      return {
        queue: metrics,
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
    templateId: notification.templateId,
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

function serializeTemplate(template: NotificationTemplate): Record<string, unknown> {
  return {
    id: template.id,
    tenantId: template.tenantId,
    name: template.name,
    channel: template.channel,
    subjectTemplate: template.subjectTemplate,
    bodyTemplate: template.bodyTemplate,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

function serializeDeliveryAttempt(attempt: DeliveryAttempt): Record<string, unknown> {
  return {
    id: attempt.id,
    notificationId: attempt.notificationId,
    tenantId: attempt.tenantId,
    channel: attempt.channel,
    provider: attempt.provider,
    status: attempt.status,
    attemptNumber: attempt.attemptNumber,
    providerMessageId: attempt.providerMessageId,
    errorCode: attempt.errorCode,
    errorMessage: attempt.errorMessage,
    responseMetadata: attempt.responseMetadata,
    startedAt: attempt.startedAt.toISOString(),
    completedAt: attempt.completedAt?.toISOString() ?? null,
  };
}

const notificationIdParamsSchema = {
  type: 'object',
  required: ['notificationId'],
  properties: {
    notificationId: { type: 'string', format: 'uuid' },
  },
} as const;

const notificationHeadersSchema = {
  type: 'object',
  properties: {
    'idempotency-key': { type: 'string', minLength: 8, maxLength: 128 },
  },
} as const;

const createNotificationBodySchema = {
  type: 'object',
  required: ['channel', 'recipient'],
  additionalProperties: false,
  properties: {
    channel: { type: 'string', enum: ['email', 'sms', 'push', 'webhook'] },
    recipient: { type: 'string', minLength: 1, maxLength: 512 },
    templateId: { type: 'string', format: 'uuid' },
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
    'templateId',
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
    templateId: { type: ['string', 'null'], format: 'uuid' },
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

const replayDeadLetterNotificationResponseSchema = {
  type: 'object',
  required: ['notification'],
  properties: {
    notification: notificationSchema,
  },
} as const;

const listNotificationsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
    offset: { type: 'integer', minimum: 0, default: 0 },
    status: {
      type: 'string',
      enum: ['queued', 'scheduled', 'processing', 'delivered', 'failed', 'dead_lettered'],
    },
    channel: { type: 'string', enum: ['email', 'sms', 'push', 'webhook'] },
  },
} as const;

const listNotificationsResponseSchema = {
  type: 'object',
  required: ['notifications', 'pagination'],
  properties: {
    notifications: {
      type: 'array',
      items: notificationSchema,
    },
    pagination: {
      type: 'object',
      required: ['limit', 'offset', 'total'],
      properties: {
        limit: { type: 'integer' },
        offset: { type: 'integer' },
        total: { type: 'integer' },
      },
    },
  },
} as const;

const listDeadLetterNotificationsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
    offset: { type: 'integer', minimum: 0, default: 0 },
    channel: { type: 'string', enum: ['email', 'sms', 'push', 'webhook'] },
  },
} as const;

const listDeadLetterNotificationsResponseSchema = {
  type: 'object',
  required: ['notifications', 'pagination'],
  properties: {
    notifications: {
      type: 'array',
      items: notificationSchema,
    },
    pagination: {
      type: 'object',
      required: ['limit', 'offset', 'total'],
      properties: {
        limit: { type: 'integer' },
        offset: { type: 'integer' },
        total: { type: 'integer' },
      },
    },
  },
} as const;

const deliveryAttemptSchema = {
  type: 'object',
  required: [
    'id',
    'notificationId',
    'tenantId',
    'channel',
    'provider',
    'status',
    'attemptNumber',
    'providerMessageId',
    'errorCode',
    'errorMessage',
    'responseMetadata',
    'startedAt',
    'completedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    notificationId: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string', format: 'uuid' },
    channel: { type: 'string', enum: ['email', 'sms', 'push', 'webhook'] },
    provider: { type: 'string' },
    status: { type: 'string', enum: ['processing', 'delivered', 'failed'] },
    attemptNumber: { type: 'integer' },
    providerMessageId: { type: ['string', 'null'] },
    errorCode: { type: ['string', 'null'] },
    errorMessage: { type: ['string', 'null'] },
    responseMetadata: { type: 'object', additionalProperties: true },
    startedAt: { type: 'string', format: 'date-time' },
    completedAt: { type: ['string', 'null'], format: 'date-time' },
  },
} as const;

const listDeliveryAttemptsQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
    offset: { type: 'integer', minimum: 0, default: 0 },
  },
} as const;

const listDeliveryAttemptsResponseSchema = {
  type: 'object',
  required: ['deliveryAttempts', 'pagination'],
  properties: {
    deliveryAttempts: {
      type: 'array',
      items: deliveryAttemptSchema,
    },
    pagination: {
      type: 'object',
      required: ['limit', 'offset', 'total'],
      properties: {
        limit: { type: 'integer' },
        offset: { type: 'integer' },
        total: { type: 'integer' },
      },
    },
  },
} as const;

const notificationMetricsResponseSchema = {
  type: 'object',
  required: ['metrics'],
  properties: {
    metrics: {
      type: 'object',
      required: ['total', 'byStatus', 'byChannel', 'deliveryAttempts'],
      properties: {
        total: { type: 'integer' },
        byStatus: {
          type: 'object',
          required: ['queued', 'scheduled', 'processing', 'delivered', 'failed', 'dead_lettered'],
          properties: {
            queued: { type: 'integer' },
            scheduled: { type: 'integer' },
            processing: { type: 'integer' },
            delivered: { type: 'integer' },
            failed: { type: 'integer' },
            dead_lettered: { type: 'integer' },
          },
        },
        byChannel: {
          type: 'object',
          required: ['email', 'sms', 'push', 'webhook'],
          properties: {
            email: { type: 'integer' },
            sms: { type: 'integer' },
            push: { type: 'integer' },
            webhook: { type: 'integer' },
          },
        },
        deliveryAttempts: {
          type: 'object',
          required: ['total', 'delivered', 'failed'],
          properties: {
            total: { type: 'integer' },
            delivered: { type: 'integer' },
            failed: { type: 'integer' },
          },
        },
      },
    },
  },
} as const;

const queueMetricsResponseSchema = {
  type: 'object',
  required: ['queue'],
  properties: {
    queue: {
      type: 'object',
      required: ['name', 'counts'],
      properties: {
        name: { type: 'string' },
        counts: {
          type: 'object',
          required: ['waiting', 'active', 'delayed', 'completed', 'failed', 'paused'],
          properties: {
            waiting: { type: 'integer' },
            active: { type: 'integer' },
            delayed: { type: 'integer' },
            completed: { type: 'integer' },
            failed: { type: 'integer' },
            paused: { type: 'integer' },
          },
        },
      },
    },
  },
} as const;

const createTemplateBodySchema = {
  type: 'object',
  required: ['name', 'channel', 'bodyTemplate'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    channel: { type: 'string', enum: ['email', 'sms', 'push', 'webhook'] },
    subjectTemplate: { type: 'string', minLength: 1, maxLength: 255 },
    bodyTemplate: { type: 'string', minLength: 1, maxLength: 10000 },
  },
} as const;

const templateSchema = {
  type: 'object',
  required: [
    'id',
    'tenantId',
    'name',
    'channel',
    'subjectTemplate',
    'bodyTemplate',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    tenantId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    channel: { type: 'string', enum: ['email', 'sms', 'push', 'webhook'] },
    subjectTemplate: { type: ['string', 'null'] },
    bodyTemplate: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const templateResponseSchema = {
  type: 'object',
  required: ['template'],
  properties: {
    template: templateSchema,
  },
} as const;
