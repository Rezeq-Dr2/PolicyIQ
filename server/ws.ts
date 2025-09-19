import { Server as HttpServer } from 'http';
import { WebSocketServer } from 'ws';
import { redis } from './services/queue';
import { trace, propagation, context } from '@opentelemetry/api';

export function setupWs(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const subs: Set<any> = new Set();

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const topic = url.searchParams.get('topic') || '';
    const reportId = url.searchParams.get('reportId') || '';
    (ws as any).__filter = { topic, reportId };
    subs.add(ws);
    ws.on('close', () => { subs.delete(ws); });
  });

  const sub = redis.duplicate();
  sub.subscribe('events');
  sub.on('message', (_channel: string, message: string) => {
    try {
      const event = JSON.parse(message);
      const tracer = trace.getTracer('policyiq');
      const carrier: Record<string, string> = event.headers || {};
      const ctx = propagation.extract(context.active(), carrier);
      tracer.startActiveSpan('ws.broadcast', {}, ctx, (span: any) => {
        try {
          span.setAttribute('event.topic', event.topic || 'unknown');
          for (const ws of subs) {
            const f = (ws as any).__filter || {};
            if (f.topic && event.topic !== f.topic) continue;
            if (f.reportId && event.payload?.reportId !== f.reportId) continue;
            try { ws.send(JSON.stringify(event)); } catch {}
          }
        } finally { span.end(); }
      });
    } catch {}
  });
}
