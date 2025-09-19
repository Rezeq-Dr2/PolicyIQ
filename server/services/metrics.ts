import { redis } from './queue';

function bucketTs(ms: number, windowMs = 60000): number {
  return Math.floor(ms / windowMs) * windowMs;
}

export async function recordApiMetrics(params: { organizationId?: string; path: string; status: number; durationMs: number; now?: number }): Promise<void> {
  const { organizationId, path, status, durationMs } = params;
  const org = organizationId || 'na';
  const now = params.now ?? Date.now();
  const bucket = bucketTs(now);
  const base = `m:${org}:${bucket}`;
  const pipeline = redis.multi();
  pipeline.incrby(`${base}:count`, 1);
  pipeline.incrbyfloat(`${base}:latency_sum`, durationMs);
  if (status >= 500) pipeline.incrby(`${base}:errors`, 1);
  // Keep TTL ~3 hours
  pipeline.pexpire(`${base}:count`, 3 * 60 * 60 * 1000);
  pipeline.pexpire(`${base}:latency_sum`, 3 * 60 * 60 * 1000);
  pipeline.pexpire(`${base}:errors`, 3 * 60 * 60 * 1000);
  // Path-specific (top-level)
  const pkey = `${base}:p:${path.split('?')[0].split('#')[0]}`;
  pipeline.incrby(`${pkey}:count`, 1);
  pipeline.incrbyfloat(`${pkey}:latency_sum`, durationMs);
  pipeline.pexpire(`${pkey}:count`, 3 * 60 * 60 * 1000);
  pipeline.pexpire(`${pkey}:latency_sum`, 3 * 60 * 60 * 1000);
  await pipeline.exec();
}

export async function getRecentMetrics(org: string, minutes: number): Promise<Array<{ bucket: number; count: number; latencySum: number; errors: number }>> {
  const now = Date.now();
  const out: Array<{ bucket: number; count: number; latencySum: number; errors: number }> = [];
  for (let i = minutes - 1; i >= 0; i--) {
    const bucket = bucketTs(now - i * 60000);
    const base = `m:${org}:${bucket}`;
    const [c, l, e] = await redis.mget(`${base}:count`, `${base}:latency_sum`, `${base}:errors`);
    out.push({ bucket, count: parseInt(c || '0', 10), latencySum: parseFloat(l || '0'), errors: parseInt(e || '0', 10) });
  }
  return out;
}


