import { db } from '../db';
import { sql } from 'drizzle-orm';
import { redis } from './queue';

function bucket(window: 'hourly'|'daily'): string {
  const now = new Date();
  if (window === 'hourly') return `${now.getUTCFullYear()}-${now.getUTCMonth()+1}-${now.getUTCDate()}-${now.getUTCHours()}`;
  return `${now.getUTCFullYear()}-${now.getUTCMonth()+1}-${now.getUTCDate()}`;
}

export async function checkAndConsumeQuota(params: { organizationId: string; feature: string }): Promise<boolean> {
  const { organizationId, feature } = params;
  const rows: any = await db.execute(sql`select window, limit_count from feature_quotas where organization_id=${organizationId}::uuid and feature=${feature}` as any);
  const cfgs: Array<{ window: 'hourly'|'daily'; limit_count: number }> = (rows?.rows ?? []).map((r: any) => ({ window: r.window, limit_count: Number(r.limit_count || 0) }));
  if (cfgs.length === 0) return true; // no quota configured
  for (const cfg of cfgs) {
    const key = `quota:${organizationId}:${feature}:${cfg.window}:${bucket(cfg.window)}`;
    const n = await redis.incr(key);
    if (n === 1) {
      const ttl = cfg.window === 'hourly' ? 3600 : 86400;
      await redis.expire(key, ttl);
    }
    if (n > cfg.limit_count) return false;
  }
  return true;
}


