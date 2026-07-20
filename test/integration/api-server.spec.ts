import { afterEach, describe, expect, it } from 'vitest';

import { buildApiServer } from '@apps/api/server.js';
import { loadConfig } from '@shared/config/environment.js';

import type { FastifyInstance } from 'fastify';

describe('API server', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('returns liveness status', async () => {
    app = await buildApiServer(
      loadConfig({
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
      }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'up',
    });
  });

  it('exposes the versioned API root', async () => {
    app = await buildApiServer(
      loadConfig({
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
      }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/v1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      name: 'notifyhub',
      status: 'ok',
    });
  });
});
