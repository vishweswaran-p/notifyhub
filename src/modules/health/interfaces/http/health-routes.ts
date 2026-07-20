import type { FastifyInstance } from 'fastify';

import type { HealthCheckService } from '@modules/health/application/health-check-service.js';

export function registerHealthRoutes(
  app: FastifyInstance,
  healthCheckService: HealthCheckService,
): void {
  app.get(
    '/health/live',
    {
      schema: {
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            required: ['status'],
            properties: {
              status: { type: 'string', enum: ['up'] },
            },
          },
        },
      },
    },
    () => healthCheckService.liveness(),
  );

  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['Health'],
        response: {
          200: readinessSchema,
          503: readinessSchema,
        },
      },
    },
    async (_request, reply) => {
      const report = await healthCheckService.readiness();

      if (report.status === 'down') {
        reply.status(503);
      }

      return report;
    },
  );
}

const readinessSchema = {
  type: 'object',
  required: ['status', 'checks'],
  properties: {
    status: { type: 'string', enum: ['up', 'down'] },
    checks: {
      type: 'object',
      required: ['postgres', 'redis'],
      properties: {
        postgres: { type: 'string', enum: ['up', 'down'] },
        redis: { type: 'string', enum: ['up', 'down'] },
      },
    },
  },
} as const;
