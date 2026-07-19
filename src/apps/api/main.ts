import { loadConfig } from '../../shared/config/environment.js';
import { buildApiServer } from './server.js';

const config = loadConfig();
const server = await buildApiServer(config);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  server.log.info({ signal }, 'Shutting down API server.');
  await server.close();
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

try {
  await server.listen({
    host: config.API_HOST,
    port: config.API_PORT,
  });
} catch (error) {
  server.log.fatal({ err: error }, 'Failed to start API server.');
  process.exit(1);
}
