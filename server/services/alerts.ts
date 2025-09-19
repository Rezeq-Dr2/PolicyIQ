import { redis } from './queue';
import { healthSummaryService } from './healthSummary';
import { getRecentMetrics } from './metrics';
import { llmMetricsService } from './llmMetrics';
import { db } from '../db';
import { sql } from 'drizzle-orm';

export interface AlertThresholds {
  maxQueueWait?: number; // analysis queue wait jobs
  maxDlq?: number;       // dlq size
  maxApiErrorRate?: number; // 0..1
  maxAvgLatencyMs?: number;
  maxLlmErrorRate?: number; // 0..1 per model
}

function key(org: string) { return `alerts:thresholds:${org}`; }
function destKey(org: string) { return `alerts:dest:${org}`; }
function suppressKey(org: string, kind: string) { return `alerts:suppress:${org}:${kind}`; }

export class AlertsService {
  async setThresholds(org: string, t: AlertThresholds): Promise<void> {
    await redis.set(key(org), JSON.stringify(t));
  }

  async getThresholds(org: string): Promise<AlertThresholds | null> {
    const v = await redis.get(key(org));
    return v ? JSON.parse(v) as AlertThresholds : null;
  }

  async setDestinations(org: string, dest: { slackWebhookUrl?: string }): Promise<void> {
    await redis.set(destKey(org), JSON.stringify(dest));
  }

  async getDestinations(org: string): Promise<{ slackWebhookUrl?: string } | null> {
    const v = await redis.get(destKey(org));
    return v ? JSON.parse(v) : null;
  }

  async acknowledge(org: string, kind: string, ttlSeconds: number = 900): Promise<void> {
    await redis.set(suppressKey(org, kind), '1', 'EX', Math.max(60, ttlSeconds));
  }

  async evaluate(org: string, minutes: number = 15): Promise<Array<{ kind: string; message: string }>> {
    const out: Array<{ kind: string; message: string }> = [];
    const t = await this.getThresholds(org) || {};
    const [summary, api] = await Promise.all([
      healthSummaryService.summarize(),
      getRecentMetrics(org, minutes),
    ]);

    // Queue checks
    const wait = Number(summary.queues?.analysis?.wait || 0);
    if (t.maxQueueWait && wait > t.maxQueueWait) out.push({ kind: 'queue_wait', message: `Analysis queue wait ${wait} > ${t.maxQueueWait}` });
    const dlq = Number(summary.queues?.dlq?.failed || 0);
    if (t.maxDlq && dlq > t.maxDlq) out.push({ kind: 'dlq', message: `DLQ size ${dlq} > ${t.maxDlq}` });

    // API error/latency
    let total = 0, errors = 0, latency = 0;
    for (const m of api) { total += m.count; errors += m.errors; latency += m.latencySum; }
    const errRate = total > 0 ? errors / total : 0;
    const avgLat = total > 0 ? Math.round(latency / total) : 0;
    if (t.maxApiErrorRate && errRate > t.maxApiErrorRate) out.push({ kind: 'api_error', message: `API error rate ${(errRate*100).toFixed(2)}% > ${(t.maxApiErrorRate*100).toFixed(2)}%` });
    if (t.maxAvgLatencyMs && avgLat > t.maxAvgLatencyMs) out.push({ kind: 'api_latency', message: `API avg latency ${avgLat}ms > ${t.maxAvgLatencyMs}ms` });

    // LLM error rates across models (if configured list)
    const models = process.env.LLM_MODELS?.split(',').filter(Boolean) || [];
    for (const m of models) {
      try {
        const snap = await llmMetricsService.getRecent(m, minutes);
        const r = snap.count > 0 ? (snap.errorRate) : 0;
        if (t.maxLlmErrorRate && r > t.maxLlmErrorRate) out.push({ kind: 'llm_error', message: `LLM ${m} error rate ${(r*100).toFixed(2)}% > ${(t.maxLlmErrorRate*100).toFixed(2)}%` });
      } catch {}
    }

    return out;
  }

  private async isSuppressed(org: string, kind: string): Promise<boolean> {
    const v = await redis.get(suppressKey(org, kind));
    return v === '1';
  }

  async persist(org: string, alerts: Array<{ kind: string; message: string }>): Promise<void> {
    for (const a of alerts) {
      try {
        await db.execute(sql`insert into anomaly_events (organization_id, topic, details) values (${org}::uuid, ${a.kind}, ${JSON.stringify({ message: a.message })}::jsonb)` as any);
      } catch {}
    }
  }

  async notify(org: string, alerts: Array<{ kind: string; message: string }>): Promise<void> {
    const dest = await this.getDestinations(org);
    if (!dest?.slackWebhookUrl) return;
    for (const a of alerts) {
      if (await this.isSuppressed(org, a.kind)) continue;
      try {
        await fetch(dest.slackWebhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `PolicyIQ Alert (${org}) - ${a.kind}: ${a.message}` }) });
      } catch {}
    }
  }
}

export const alertsService = new AlertsService();


