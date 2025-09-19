import express, { type Request, Response, NextFunction } from "express";
import helmet from 'helmet';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedCCPARegulations, seedGDPRRegulations, seedUKGDPRRegulations, seedHealthAndSafetyRegulations } from "./services/seedData";
import { seedRegulatorySources } from "./seed/regulatoryCrawlerSeed";
import { seedUKPolicyRequirements } from "./data/seedUKPolicyRequirements";
import "./services/analysisWorker";
import "./services/maintenanceWorker";
import { scheduleMaterializedViewRefresh, scheduleOutboxDispatch, scheduleAnomalyScan, scheduleIndexMaintenance, scheduleSyntheticChecks, scheduleQueueSagScan, scheduleRetentionScan, scheduleCollectorsRun, scheduleRetrievalWarmCache, scheduleHealthAlerts } from './services/queue';
import { redis } from "./services/queue";
import { pool } from "./db";
import { recordApiMetrics } from './services/metrics';
import { v4 as uuidv4 } from 'uuid';
import { initTracing } from './tracing';
import { withSpan, extractContextFromHeaders } from './services/telemetry';
import { context, trace } from '@opentelemetry/api';
import { setupCollab } from './collabWs';
import { setupWs } from './ws';
import { startLogicalCdc } from './services/logicalCdc';

const app = express();
// Optional HTTPS/mTLS: load certs if provided
let httpsServer: any = null;
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        upgradeInsecureRequests: [],
      },
    } : false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: process.env.NODE_ENV === 'production' ? { maxAge: 15552000, includeSubDomains: true, preload: true } : false,
    xssFilter: true,
  }) as any
);

// Request ID middleware
app.use((req, res, next) => {
  const existing = req.headers['x-request-id'] as string | undefined;
  const rid = existing || uuidv4();
  (req as any).id = rid;
  res.setHeader('x-request-id', rid);
  next();
});

// Per-request tracing span
app.use((req, res, next) => {
  if (process.env.OTEL_ENABLED !== '1') return next();
  try {
    const ctx = extractContextFromHeaders(req.headers as any);
    const tracer = trace.getTracer('policyiq');
    return context.with(ctx, () => {
      return tracer.startActiveSpan(`${req.method} ${req.path}`, (span: any) => {
        res.on('finish', () => {
          try {
            span.setAttribute('http.status_code', res.statusCode);
            span.setAttribute('http.target', req.path);
            span.setAttribute('http.method', req.method);
          } catch {}
          span.end();
        });
        next();
      });
    });
  } catch { return next(); }
});

// Liveness and readiness endpoints
app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/ready', async (_req, res) => {
  try {
    // Check DB
    const client = await pool.connect();
    try {
      await client.query('select 1');
    } finally {
      client.release();
    }
    // Check Redis
    await redis.ping();
    res.json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: (err as any)?.message || String(err) });
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const rid = (req as any).id ? ` reqId=${(req as any).id}` : '';
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms${rid}`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
      const org = (req as any).user?.organizationId || undefined;
      recordApiMetrics({ organizationId: org, path, status: res.statusCode, durationMs: duration }).catch(() => {});
    }
  });

  next();
});

(async () => {
  try { await initTracing(); } catch {}
  const server = await registerRoutes(app);
  setupWs(server);
  setupCollab(server);
  // Start CDC if configured
  try { await startLogicalCdc(); } catch (e) { console.warn('CDC start failed:', (e as any)?.message || e); }
  
  // Seed CCPA, GDPR, UK GDPR, and Health & Safety regulations on startup
  try {
    await seedCCPARegulations();
    await seedGDPRRegulations();
    await seedUKGDPRRegulations();
    await seedHealthAndSafetyRegulations();
    await seedUKPolicyRequirements();
    await seedRegulatorySources();
  } catch (error) {
    console.error("Failed to seed regulations:", error);
  }

  // Schedule periodic materialized view refreshes
  try {
    await scheduleMaterializedViewRefresh('*/10 * * * *'); // every 10 minutes
  } catch (err) {
    console.error('Failed to schedule mview refresh:', err);
  }

  // Schedule outbox dispatch
  try {
    await scheduleOutboxDispatch('*/1 * * * *'); // every 1 minute
  } catch (err) {
    console.error('Failed to schedule outbox dispatch:', err);
  }

  // Schedule anomaly scan
  try {
    await scheduleAnomalyScan('*/15 * * * *'); // every 15 minutes
  } catch (err) {
    console.error('Failed to schedule anomaly scan:', err);
  }

  // Schedule index maintenance
  try {
    await scheduleIndexMaintenance(process.env.DB_MAINT_CRON || '0 2 * * *');
  } catch (err) {
    console.error('Failed to schedule index maintenance:', err);
  }

  // Schedule synthetic checks
  try {
    await scheduleSyntheticChecks(process.env.SYN_CHECKS_CRON || '*/5 * * * *');
  } catch (err) {
    console.error('Failed to schedule synthetic checks:', err);
  }
  // Schedule queue sag scan
  try {
    await scheduleQueueSagScan(process.env.QUEUE_SAG_CRON || '*/2 * * * *');
  } catch (err) {
    console.error('Failed to schedule queue sag scan:', err);
  }
  // Schedule retention scan
  try {
    await scheduleRetentionScan(process.env.RETENTION_CRON || '0 1 * * *');
  } catch (err) {
    console.error('Failed to schedule retention scan:', err);
  }
  // Schedule collectors run
  try {
    await scheduleCollectorsRun(process.env.COLLECTORS_CRON || '*/30 * * * *');
  } catch (err) {
    console.error('Failed to schedule collectors run:', err);
  }
  // Schedule retrieval warm cache
  try {
    await scheduleRetrievalWarmCache(process.env.RETRIEVAL_WARM_CRON || '*/10 * * * *');
  } catch (err) {
    console.error('Failed to schedule retrieval warm cache:', err);
  }
  // Schedule health alerts
  try {
    await scheduleHealthAlerts(process.env.HEALTH_ALERTS_CRON || '*/3 * * * *');
  } catch (err) {
    console.error('Failed to schedule health alerts:', err);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
