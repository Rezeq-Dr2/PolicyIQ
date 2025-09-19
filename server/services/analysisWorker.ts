import { Worker } from 'bullmq';
import { connection, analysisQueueName, AnalysisJobData, moveToDlq, analysisQueue } from './queue';
import { enhancedAnalyzeCompliance } from './enhancedComplianceAnalyzer';
import { redis } from './queue';
import { withSpan } from './telemetry';

// Worker to process compliance analysis jobs with limited concurrency
export const analysisWorker = new Worker<AnalysisJobData>(
  analysisQueueName,
  async (job) => {
    const { organizationId, reportId, policyText, analyzerType } = job.data as AnalysisJobData;
    try {
      const traceId = (job.data as AnalysisJobData).traceId || job.id || `${Date.now()}`;
      try { await redis.setex(`trace:${traceId}:start`, 300, JSON.stringify({ t: Date.now(), reportId })); } catch {}
      const t0 = Date.now();
      await withSpan('worker.enhancedAnalyzeCompliance', async () => enhancedAnalyzeCompliance(reportId, policyText, analyzerType || 'auto'));
      const ms = Date.now() - t0;
      console.log(`analysisWorker: report=${reportId} org=${organizationId} done in ${ms}ms`);
    } catch (err) {
      await moveToDlq({ organizationId, reportId, policyText, analyzerType }, err);
      throw err;
    }
  },
  { connection, concurrency: parseInt(process.env.ANALYSIS_WORKER_CONCURRENCY || '2', 10) }
);

analysisWorker.on('failed', (job, err) => {
  console.error(`Analysis job ${job?.id} failed:`, err);
});

// Simple autoscaler: adjust concurrency every 30s based on queue depth and target latency
const TARGET_TTR_MS = parseInt(process.env.ANALYSIS_TARGET_TTR_MS || '60000', 10);
const MAX_CONCURRENCY = parseInt(process.env.ANALYSIS_MAX_CONCURRENCY || '8', 10);
const MIN_CONCURRENCY = parseInt(process.env.ANALYSIS_MIN_CONCURRENCY || '1', 10);

async function autoscale() {
  try {
    const counts = await analysisQueue.getJobCounts('wait', 'active', 'delayed');
    const waiting = counts.wait || 0;
    const active = counts.active || 0;
    // naive desired concurrency: waiting size scaled to target TTR bucket
    const desired = Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, Math.ceil(waiting / Math.max(1, TARGET_TTR_MS / 30000))));
    const current = (analysisWorker as any).opts.concurrency as number;
    if (desired !== current) {
      try {
        (analysisWorker as any).concurrency = desired;
        console.log(`autoscaler: adjusted concurrency ${current} -> ${desired} (waiting=${waiting}, active=${active})`);
      } catch {}
    }
  } catch {}
}

setInterval(autoscale, 30000);

// Heartbeat
setInterval(async () => {
  try { await redis.setex('hb:analysisWorker', 60, String(Date.now())); } catch {}
}, 15000);


