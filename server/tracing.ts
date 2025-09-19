import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

let sdk: NodeSDK | null = null;

export async function initTracing() {
  if (sdk || process.env.OTEL_ENABLED !== '1') return;
  const exporter = new OTLPTraceExporter({});
  sdk = new NodeSDK({
    traceExporter: exporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });
  await sdk.start();
}

export async function shutdownTracing() {
  if (!sdk) return;
  await sdk.shutdown();
  sdk = null;
}


