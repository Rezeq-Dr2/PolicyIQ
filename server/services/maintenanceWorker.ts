import { Worker } from 'bullmq';
import { connection, maintenanceQueueName } from './queue';
import { pool } from '../db';
import { dispatchPending } from './outbox';
import { cdcKafkaBridge } from './cdcKafkaBridge';
import { anomalyService } from './anomalyService';
import { pool as poolRw } from '../db';
import { runSyntheticChecks } from './syntheticChecks';
import { analysisQueue } from './queue';
import { retentionService } from './retentionService';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { collectorsService } from './collectorsService';
import { enhancedVectorDbService } from './enhancedVectorDatabase';
import { alertsService } from './alerts';

export const maintenanceWorker = new Worker(maintenanceQueueName, async (job) => {
  if (job.name === 'refresh-mviews') {
    const client = await pool.connect();
    try {
      await client.query('refresh materialized view concurrently mv_trend_org_reg_90d');
      await client.query('refresh materialized view concurrently mv_org_risk_summary_30d');
    } finally { client.release(); }
  }
  if (job.name === 'dispatch-outbox') {
    await dispatchPending(100);
    try { await cdcKafkaBridge.init(); await cdcKafkaBridge.publishPending(100); } catch {}
  }
  if (job.name === 'anomaly-scan') {
    try { await anomalyService.computeSpendAnomalies(); } catch {}
    try { await anomalyService.computeLatencyErrorAnomalies(); } catch {}
  }
  if (job.name === 'index-maintenance') {
    // Run lightweight maintenance tasks
    const client = await poolRw.connect();
    try {
      await client.query('analyze');
      await client.query("vacuum analyze compliance_trends");
      await client.query("vacuum analyze regulation_clause_embeddings");
    } finally { client.release(); }
  }
  if (job.name === 'synthetic-checks') {
    try { await runSyntheticChecks(); } catch {}
  }
  if (job.name === 'queue-sag-scan') {
    try {
      const counts = await analysisQueue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed');
      const now = Date.now();
      const stats = { now, ...counts };
      if ((counts.wait || 0) > 50 && (counts.active || 0) < 2) {
        console.warn('Queue sag detected', stats);
      }
    } catch {}
  }
  if (job.name === 'retention-scan') {
    try {
      const rows: any = await db.execute(sql`select id from organizations limit 500` as any);
      for (const r of (rows?.rows ?? [])) {
        try { await retentionService.runConsentExpiry(r.id); } catch {}
      }
    } catch {}
  }
  if (job.name === 'collectors-run') {
    try {
      const rows: any = await db.execute(sql`select id from collectors limit 200` as any);
      for (const r of (rows?.rows ?? [])) {
        try { await collectorsService.runCollector({ collectorId: r.id }); } catch {}
      }
    } catch {}
  }
  if (job.name === 'retrieval-warm-cache') {
    try {
      // Pull recent policy chunk texts from analysis_results and warm vector cache
      const rows: any = await db.execute(sql`select policy_chunk_text from analysis_results order by created_at desc limit 50` as any);
      for (const r of (rows?.rows ?? [])) {
        try { await enhancedVectorDbService.findSimilarClauses(String(r.policy_chunk_text || ''), 5); } catch {}
      }
    } catch {}
  }
  if (job.name === 'health-alerts') {
    try {
      const rows: any = await db.execute(sql`select id from organizations limit 200` as any);
      for (const r of (rows?.rows ?? [])) {
        try {
          const alerts = await alertsService.evaluate(r.id, 15);
          if (alerts.length > 0) {
            try { await alertsService.persist(r.id, alerts); } catch {}
            try { await alertsService.notify(r.id, alerts); } catch {}
            console.warn('Health alerts', r.id, alerts);
          }
        } catch {}
      }
    } catch {}
  }
}, { connection });

maintenanceWorker.on('completed', (job) => {
  console.log(`Maintenance job ${job.id} completed`);
});

maintenanceWorker.on('failed', (job, err) => {
  console.error(`Maintenance job ${job?.id} failed:`, err);
});

console.log('Maintenance worker started.');
