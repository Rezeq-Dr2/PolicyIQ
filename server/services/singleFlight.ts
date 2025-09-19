import { redis } from './queue';

export async function singleFlight<T>(key: string, ttlSec: number, task: () => Promise<T>): Promise<T> {
  const lockKey = `sf:lock:${key}`;
  const resKey = `sf:res:${key}`;
  const acquired = await redis.set(lockKey, '1', { NX: true, EX: ttlSec } as any);
  if (acquired) {
    try {
      const result = await task();
      try { await redis.set(resKey, JSON.stringify({ ok: true, v: result }), { EX: ttlSec } as any); } catch {}
      return result;
    } finally {
      try { await redis.del(lockKey); } catch {}
    }
  }
  // Wait for result
  const start = Date.now();
  while (Date.now() - start < ttlSec * 1000) {
    const raw = await redis.get(resKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.v as T;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  // As a fallback, run the task (rare contention)
  return task();
}
