import type { RedisOptions } from 'ioredis';

export function parseRedisConnectionOptions(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);
  const db = url.pathname ? Number.parseInt(url.pathname.slice(1), 10) : undefined;

  return {
    host: url.hostname,
    port: url.port ? Number.parseInt(url.port, 10) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number.isNaN(db) ? undefined : db,
    maxRetriesPerRequest: null,
  };
}
