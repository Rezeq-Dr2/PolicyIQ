import { redis } from './queue';

const TTL_SECONDS = 60 * 60 * 24; // 24h for per-minute buckets

function minuteBucket(d = new Date()): string {
  return `${d.getUTCFullYear()}-${(d.getUTCMonth()+1).toString().padStart(2,'0')}-${d.getUTCDate().toString().padStart(2,'0')}T${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')}`;
}

function key(model: string, bucket: string): string {
  return `llm_metric:${model}:${bucket}`;
}

export class LlmMetricsService {
  async record(params: { model: string; latencyMs: number; tokens?: number; success: boolean }): Promise<void> {
    const bucket = minuteBucket();
    const k = key(params.model, bucket);
    const multi = redis.multi();
    multi.hincrby(k, 'count', 1);
    multi.hincrby(k, 'latencySum', Math.max(0, Math.floor(params.latencyMs)));
    if (!params.success) multi.hincrby(k, 'errors', 1);
    if (params.tokens && Number.isFinite(params.tokens)) multi.hincrby(k, 'tokens', Math.max(0, Math.floor(params.tokens)));
    multi.expire(k, TTL_SECONDS);
    await multi.exec();
  }

  async getRecent(model: string, minutes: number): Promise<{ count: number; avgLatencyMs: number; errorRate: number; tokens: number }> {
    const now = new Date();
    const buckets: string[] = [];
    for (let i = 0; i < minutes; i++) {
      const d = new Date(now.getTime() - i * 60000);
      buckets.push(minuteBucket(d));
    }
    const keys = buckets.map((b) => key(model, b));
    let count = 0, latencySum = 0, errors = 0, tokens = 0;
    const vals = await Promise.all(keys.map(async (k) => redis.hgetall(k)));
    for (const v of vals) {
      count += Number(v.count || 0);
      latencySum += Number(v.latencySum || 0);
      errors += Number(v.errors || 0);
      tokens += Number(v.tokens || 0);
    }
    const avgLatencyMs = count > 0 ? Math.round(latencySum / count) : 0;
    const errorRate = count > 0 ? errors / count : 0;
    return { count, avgLatencyMs, errorRate, tokens };
  }
}

export const llmMetricsService = new LlmMetricsService();


