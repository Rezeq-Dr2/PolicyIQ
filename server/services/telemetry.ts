import { context, trace, propagation } from '@opentelemetry/api';

export function withSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const tracer = trace.getTracer('policyiq');
  return tracer.startActiveSpan(name, async (span: any) => {
    try { return await fn(); } finally { span.end(); }
  });
}

export function extractContextFromHeaders(headers: Record<string, string | string[] | undefined>) {
  const carrier: Record<string, string> = {};
  for (const k of Object.keys(headers)) {
    const v = headers[k];
    if (typeof v === 'string') carrier[k.toLowerCase()] = v;
  }
  return propagation.extract(context.active(), carrier);
}

export function injectContextToHeaders(): Record<string, string> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

export function getTraceId(): string | undefined {
  const span = trace.getSpan(context.active());
  return span?.spanContext().traceId;
}


