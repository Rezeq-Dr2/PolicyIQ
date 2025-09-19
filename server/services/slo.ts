import { db } from '../db';
import { sql } from 'drizzle-orm';
import { getRecentMetrics } from './metrics';

export interface BurnRateResult {
  organizationId: string;
  sloName: string;
  windowMinutes: number;
  targetLatencyMs: number | null;
  maxErrorRate: number | null;
  observedAvgLatencyMs: number;
  observedErrorRate: number;
  latencyBurn: number | null; // observed / target
  errorBurn: number | null;   // observed / max
}

export class SloService {
  async computeBurnRate(params: { organizationId: string; windowMinutes?: number; sloName?: string }): Promise<BurnRateResult> {
    const { organizationId } = params;
    const windowMinutes = Math.max(1, Math.min(1440, params.windowMinutes || 60));
    const sloName = params.sloName || 'default';
    const sloRow: any = await db.execute(sql`select name, target_latency_ms, max_error_rate from slo_policies where organization_id=${organizationId}::uuid and name=${sloName} limit 1` as any);
    const slo = (sloRow?.rows ?? [])[0] || {};
    const metrics = await getRecentMetrics(organizationId, windowMinutes);
    let total = 0, latSum = 0, errors = 0;
    for (const m of metrics) { total += m.count; latSum += m.latencySum; errors += m.errors; }
    const observedAvgLatencyMs = total > 0 ? Math.round(latSum / total) : 0;
    const observedErrorRate = total > 0 ? errors / total : 0;
    const latencyBurn = slo?.target_latency_ms ? (observedAvgLatencyMs / Number(slo.target_latency_ms)) : null;
    const errorBurn = slo?.max_error_rate ? (observedErrorRate / Number(slo.max_error_rate)) : null;
    return {
      organizationId,
      sloName,
      windowMinutes,
      targetLatencyMs: slo?.target_latency_ms ?? null,
      maxErrorRate: slo?.max_error_rate ?? null,
      observedAvgLatencyMs,
      observedErrorRate,
      latencyBurn,
      errorBurn,
    };
  }
}

export const sloService = new SloService();


