import { db } from '../db';
import { sql } from 'drizzle-orm';
import { queueOutboxEvent } from './outbox';
import { getRecentMetrics } from './metrics';

export class AnomalyService {
  async computeSpendAnomalies(): Promise<number> {
    // Compare last 24h vs avg last 7d per org
    const rows: any = await db.execute(sql`
      with last24 as (
        select organization_id, sum(amount_cents) as c24
        from token_usage_events
        where created_at >= now() - interval '24 hours'
        group by organization_id
      ), last7 as (
        select organization_id, sum(amount_cents) / 7.0 as c7avg
        from token_usage_events
        where created_at >= now() - interval '7 days'
        group by organization_id
      )
      select coalesce(l24.organization_id, l7.organization_id) as org,
             coalesce(c24,0) as c24,
             coalesce(c7avg,0) as c7avg
      from last24 l24
      full outer join last7 l7 on l24.organization_id = l7.organization_id
    ` as any);
    let count = 0;
    for (const r of (rows?.rows ?? [])) {
      const orgId = r.org as string;
      const c24 = Number(r.c24)||0; const c7avg = Number(r.c7avg)||0.01;
      if (c24 > 1000 && c24 / c7avg > 2.0) {
        await db.execute(sql`insert into anomaly_events (organization_id, kind, severity, details) values (${orgId}::uuid, ${'spend'}, ${'medium'}, ${JSON.stringify({ c24, c7avg })}::jsonb)` as any);
        try { await queueOutboxEvent({ organizationId: orgId, topic: 'anomaly.detected', payload: { kind: 'spend', c24, c7avg } }); } catch {}
        count++;
      }
    }
    return count;
  }

  async computeLatencyErrorAnomalies(): Promise<number> {
    // Read last 15 minutes vs prior 60 minutes from Redis metrics
    let count = 0;
    const orgs = ['na']; // Could be extended to enumerate real org ids from DB
    for (const org of orgs) {
      const last15 = await getRecentMetrics(org, 15);
      const prev60 = await getRecentMetrics(org, 75);
      const prev = prev60.slice(0, 60);
      const last = last15.slice(-5); // last 5 min
      const avgLatencyPrev = (prev.reduce((s: number, b: any) => s + (b.latencySum / Math.max(1, b.count)), 0) / Math.max(1, prev.length)) || 0;
      const avgErrRatePrev = (prev.reduce((s: number, b: any) => s + (b.errors / Math.max(1, b.count)), 0) / Math.max(1, prev.length)) || 0;
      const avgLatencyNow = (last.reduce((s: number, b: any) => s + (b.latencySum / Math.max(1, b.count)), 0) / Math.max(1, last.length)) || 0;
      const avgErrRateNow = (last.reduce((s: number, b: any) => s + (b.errors / Math.max(1, b.count)), 0) / Math.max(1, last.length)) || 0;
      if ((avgLatencyPrev > 0 && avgLatencyNow / avgLatencyPrev > 2.5) || (avgErrRateNow > avgErrRatePrev * 3 && avgErrRateNow > 0.05)) {
        await db.execute(sql`insert into anomaly_events (organization_id, kind, severity, details) values (null, ${'latency_error'}, ${'high'}, ${JSON.stringify({ avgLatencyPrev, avgLatencyNow, avgErrRatePrev, avgErrRateNow })}::jsonb)` as any);
        try { await queueOutboxEvent({ organizationId: null as any, topic: 'anomaly.detected', payload: { kind: 'latency_error', avgLatencyPrev, avgLatencyNow, avgErrRatePrev, avgErrRateNow } }); } catch {}
        count++;
      }
    }
    return count;
  }
}

export const anomalyService = new AnomalyService();


