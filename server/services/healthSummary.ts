import { analysisQueue, analysisDlq, maintenanceQueue, redis } from './queue';
import { db } from '../db';
import { sql } from 'drizzle-orm';

export class HealthSummaryService {
  async getQueueStats() {
    const [an, dlq, mt] = await Promise.all([
      analysisQueue.getJobCounts(),
      analysisDlq.getJobCounts(),
      maintenanceQueue.getJobCounts(),
    ]);
    return { analysis: an, dlq, maintenance: mt } as any;
  }

  async getDbStatus() {
    try { await db.execute(sql`select 1` as any); return { ok: true }; } catch (e) { return { ok: false, error: String((e as any)?.message || e) }; }
  }

  async getRedisStatus() {
    try { const pong = await redis.ping(); return { ok: pong === 'PONG' }; } catch (e) { return { ok: false, error: String((e as any)?.message || e) }; }
  }

  async getRecentErrors(minutes = 60) {
    const since = new Date(Date.now() - minutes * 60000).toISOString();
    try {
      const rows: any = await db.execute(sql`select id, organization_id, topic, created_at from anomaly_events where created_at >= ${since}::timestamptz order by created_at desc limit 100` as any);
      return rows?.rows ?? [];
    } catch { return []; }
  }

  async summarize(): Promise<any> {
    const [queues, dbs, reds, recent] = await Promise.all([
      this.getQueueStats(), this.getDbStatus(), this.getRedisStatus(), this.getRecentErrors(120)
    ]);
    return { queues, database: dbs, redis: reds, recentAnomalies: recent };
  }
}

export const healthSummaryService = new HealthSummaryService();


