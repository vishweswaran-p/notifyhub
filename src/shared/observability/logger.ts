import pino, { type LoggerOptions } from 'pino';

import type { AppConfig } from '@shared/config/environment.js';

export function createLoggerOptions(
  config: Pick<AppConfig, 'LOG_LEVEL' | 'NODE_ENV'>,
): LoggerOptions {
  const options: LoggerOptions = {
    level: config.LOG_LEVEL,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (config.NODE_ENV === 'development') {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
      },
    };
  }

  return options;
}

export function createLogger(config: Pick<AppConfig, 'LOG_LEVEL' | 'NODE_ENV'>) {
  return pino(createLoggerOptions(config));
}
