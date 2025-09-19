import { db } from '../db';
import { sql } from 'drizzle-orm';
import { llmMetricsService } from './llmMetrics';

type ModelChoice = 'gpt-5' | 'gpt-4o-mini' | 'gpt-3.5-turbo' | string;

export class ModelRouter {
  async selectModel(params: { organizationId?: string; defaultModel?: ModelChoice; targetLatencyMs?: number; maxErrorRate?: number }): Promise<ModelChoice> {
    const poolEnv = process.env.MODEL_POOL; // JSON like [{model:"gpt-5",cost:3,quality:5},{model:"gpt-4o-mini",cost:1,quality:3}]
    const pool: Array<{ model: ModelChoice; cost: number; quality: number }> = poolEnv ? JSON.parse(poolEnv) : [
      { model: params.defaultModel || 'gpt-5', cost: 3, quality: 5 },
      { model: 'gpt-4o-mini', cost: 1, quality: 3 },
    ];

    if (!params.organizationId) return (pool[0] || { model: 'gpt-5' }).model;

    // read budget usage from org_cost_policies and token_usage_events
    let dailyCap = 0; let dailyUsed = 0;
    try {
      const pol: any = await db.execute(sql`select daily_cap_cents from org_cost_policies where organization_id=${params.organizationId}::uuid` as any);
      dailyCap = Number(((pol?.rows ?? [])[0] || {}).daily_cap_cents) || 0;
      const used: any = await db.execute(sql`select coalesce(sum(amount_cents),0) as c from token_usage_events where organization_id=${params.organizationId}::uuid and created_at>=now()-interval '24 hours'` as any);
      dailyUsed = Number(((used?.rows ?? [])[0] || {}).c) || 0;
    } catch {}

    const remaining = dailyCap > 0 ? Math.max(0, dailyCap - dailyUsed) : Number.MAX_SAFE_INTEGER;
    const candidates = [...pool];
    // Filter by recent reliability/latency if SLOs provided
    const targetLatency = params.targetLatencyMs ?? Number(process.env.LLM_TARGET_LATENCY_MS || 2000);
    const maxErrorRate = params.maxErrorRate ?? Number(process.env.LLM_MAX_ERROR_RATE || 0.2);
    const withSlo = await Promise.all(candidates.map(async (c) => {
      const m = await llmMetricsService.getRecent(c.model, 30);
      return { ...c, avgLatencyMs: m.avgLatencyMs, errorRate: m.errorRate };
    }));
    const sloOk = withSlo.filter(m => (m.avgLatencyMs === 0 || m.avgLatencyMs <= targetLatency) && m.errorRate <= maxErrorRate);
    const viable = sloOk.length ? sloOk : withSlo;
    // If budget tight, pick lowest cost among viable
    if (remaining < 500) {
      return viable.sort((a,b) => a.cost - b.cost)[0].model;
    }
    // Otherwise pick highest quality that meets SLOs
    return viable.sort((a,b) => b.quality - a.quality)[0].model;
  }
}

export const modelRouter = new ModelRouter();


