import { redis } from './queue';
import crypto from 'crypto';

export interface LlmCacheOptions {
  ttlSeconds?: number;
}

export function makeCacheKey(parts: Record<string, any>): string {
  const json = JSON.stringify(parts);
  const hash = crypto.createHash('sha256').update(json).digest('hex');
  return `llm:${hash.slice(0, 48)}`;
}

export async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function setCached<T>(key: string, value: T, opts: LlmCacheOptions = {}): Promise<void> {
  const ttl = opts.ttlSeconds ?? 3600;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttl);
  } catch {}
}


