import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

import type { AppConfig } from '../config/environment.js';

export type TelemetryHandle = {
  shutdown(): Promise<void>;
};

export function initializeOpenTelemetry(config: AppConfig): TelemetryHandle {
  if (!config.OTEL_ENABLED) {
    return {
      shutdown: () => Promise.resolve(),
    };
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: config.OTEL_SERVICE_NAME,
      [ATTR_SERVICE_VERSION]: '0.1.0',
    }),
    ...(config.OTEL_EXPORTER_OTLP_ENDPOINT
      ? {
          traceExporter: new OTLPTraceExporter({
            url: config.OTEL_EXPORTER_OTLP_ENDPOINT,
          }),
        }
      : {}),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  return {
    shutdown: () => sdk.shutdown(),
  };
}
