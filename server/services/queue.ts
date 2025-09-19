import { Queue, JobsOptions } from 'bullmq';
// QueueScheduler is optional; if needed for delayed jobs, import based on version compatibility
import IORedis from 'ioredis';

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL must be set');
}

export const redis = new IORedis(process.env.REDIS_URL, {
  lazyConnect: true,
});

export const analysisQueueName = 'compliance-analysis';

export const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');

export const analysisQueue = new Queue(analysisQueueName, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 500,
    removeOnFail: 1000,
  },
});

export interface AnalysisJobData {
  organizationId: string;
  reportId: string;
  policyText: string;
  analyzerType?: 'auto' | 'uk_gdpr' | 'hse_1974';
  traceId?: string;
}

export async function enqueueAnalysisJob(data: AnalysisJobData, opts?: JobsOptions) {
  const jobId = `${data.organizationId}:${data.reportId}:${data.analyzerType || 'auto'}`;
  const headers: Record<string, string> = {};
  if (data.traceId) headers['x-trace-id'] = data.traceId;
  return analysisQueue.add('analyze', { ...data, traceId: data.traceId }, {
    jobId,
    headers: headers as any,
    ...opts,
  } as any);
}

// Maintenance queue for scheduled tasks (e.g., refreshing materialized views)
export const maintenanceQueueName = 'maintenance';
export const maintenanceQueue = new Queue(maintenanceQueueName, { connection });

export interface RefreshMViewsJobData {
  target?: 'all' | 'trends' | 'risk';
}

export async function scheduleMaterializedViewRefresh(every: string = '*/5 * * * *') {
  await maintenanceQueue.add('refresh-mviews', {}, { repeat: { pattern: every }, jobId: 'refresh-mviews' });
}

export async function scheduleOutboxDispatch(every: string = '*/1 * * * *') {
  await maintenanceQueue.add('dispatch-outbox', {}, { repeat: { pattern: every }, jobId: 'dispatch-outbox' });
}

export async function scheduleAnomalyScan(every: string = '*/15 * * * *') {
  await maintenanceQueue.add('anomaly-scan', {}, { repeat: { pattern: every }, jobId: 'anomaly-scan' });
}

export async function scheduleIndexMaintenance(every: string = '0 2 * * *') {
  await maintenanceQueue.add('index-maintenance', {}, { repeat: { pattern: every }, jobId: 'index-maintenance' });
}

export async function scheduleSyntheticChecks(every: string = '*/5 * * * *') {
  await maintenanceQueue.add('synthetic-checks', {}, { repeat: { pattern: every }, jobId: 'synthetic-checks' });
}

export async function scheduleHealthAlerts(every: string = '*/3 * * * *') {
  await maintenanceQueue.add('health-alerts', {}, { repeat: { pattern: every }, jobId: 'health-alerts' });
}

export async function scheduleQueueSagScan(every: string = '*/2 * * * *') {
  await maintenanceQueue.add('queue-sag-scan', {}, { repeat: { pattern: every }, jobId: 'queue-sag-scan' });
}

export async function scheduleRetentionScan(every: string = '0 1 * * *') {
  await maintenanceQueue.add('retention-scan', {}, { repeat: { pattern: every }, jobId: 'retention-scan' });
}

export async function scheduleCollectorsRun(every: string = '*/30 * * * *') {
  await maintenanceQueue.add('collectors-run', {}, { repeat: { pattern: every }, jobId: 'collectors-run' });
}

export async function scheduleRetrievalWarmCache(every: string = '*/10 * * * *') {
  await maintenanceQueue.add('retrieval-warm-cache', {}, { repeat: { pattern: every }, jobId: 'retrieval-warm-cache' });
}

// Dead-letter queue for failed analysis jobs
export const analysisDlqName = 'analysis-dlq';
export const analysisDlq = new Queue(analysisDlqName, { connection });

export async function moveToDlq(job: { id?: string } & AnalysisJobData, error: any) {
  try {
    await analysisDlq.add('failed', { ...job, error: String(error?.message || error) });
  } catch (e) {
    // ignore
  }
}


