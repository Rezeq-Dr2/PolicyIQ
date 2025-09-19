import { redis } from './queue';

function minuteBucket(d = new Date()): string {
  return `${d.getUTCFullYear()}-${(d.getUTCMonth()+1).toString().padStart(2,'0')}-${d.getUTCDate().toString().padStart(2,'0')}T${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')}`;
}

export class RetrievalMetricsService {
  async record(params: { organizationId?: string; source: 'cache'|'pgvector'|'pinecone'|'fallback'|'sparse'|'colbert'; count?: number }): Promise<void> {
    const org = params.organizationId || 'na';
    const bucket = minuteBucket();
    const key = `retrieval:${org}:${params.source}:${bucket}`;
    const n = Math.max(1, params.count || 1);
    await redis.incrby(key, n);
    await redis.expire(key, 3600 * 24);
  }

  async get(params: { organizationId?: string; minutes?: number }): Promise<Record<string, Array<{ bucket: string; count: number }>>> {
    const org = params.organizationId || 'na';
    const minutes = Math.max(1, Math.min(1440, params.minutes || 60));
    const now = new Date();
    const buckets: string[] = [];
    for (let i = minutes - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60000);
      buckets.push(minuteBucket(d));
    }
    const sources = ['cache','pgvector','pinecone','fallback','sparse','colbert'];
    const out: Record<string, Array<{ bucket: string; count: number }>> = {};
    for (const src of sources) {
      const arr: Array<{ bucket: string; count: number }> = [];
      for (const b of buckets) {
        const key = `retrieval:${org}:${src}:${b}`;
        const v = await redis.get(key);
        arr.push({ bucket: b, count: parseInt(v || '0', 10) });
      }
      out[src] = arr;
    }
    return out;
  }
}

export const retrievalMetrics = new RetrievalMetricsService();


