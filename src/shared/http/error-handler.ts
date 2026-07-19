import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { ApplicationError } from '../errors/application-error.js';

type ErrorResponse = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: Record<string, unknown>;
  };
};

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    async (
      error: FastifyError | ApplicationError,
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<ErrorResponse> => {
      if (error instanceof ApplicationError) {
        request.log.warn(
          {
            errorCode: error.code,
            details: error.details,
          },
          error.message,
        );

        reply.status(error.statusCode);

        return {
          error: {
            code: error.code,
            message: error.message,
            requestId: request.id,
            details: error.details,
          },
        };
      }

      if (error instanceof ZodError) {
        request.log.warn(
          {
            issues: error.issues,
          },
          'Request validation failed.',
        );

        reply.status(400);

        return {
          error: {
            code: 'REQUEST_VALIDATION_FAILED',
            message: 'Request validation failed.',
            requestId: request.id,
            details: {
              issues: error.issues,
            },
          },
        };
      }

      const statusCode = error.statusCode ?? 500;
      const errorCode = statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_VALIDATION_FAILED';

      request.log.error({ err: error, errorCode }, error.message);
      reply.status(statusCode);

      return {
        error: {
          code: errorCode,
          message: statusCode >= 500 ? 'An unexpected error occurred.' : error.message,
          requestId: request.id,
        },
      };
    },
  );
}
