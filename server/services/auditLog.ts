import { db } from '../db';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

function signingKey(): Buffer {
  const key = process.env.AUDIT_SIGNING_KEY || process.env.ENCRYPTION_MASTER_KEY || 'dev-audit-key';
  return crypto.createHash('sha256').update(key).digest();
}

async function ensureTable(): Promise<void> {
  try {
    await db.execute(sql`create table if not exists audit_logs (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid,
      actor_user_id text,
      action text not null,
      subject_type text,
      subject_id text,
      data jsonb,
      prev_hash text,
      hash text not null,
      signature text not null,
      created_at timestamptz default now()
    )` as any);
  } catch {}
}

async function getLastHash(orgId?: string): Promise<string | null> {
  const rows: any = await db.execute(sql`select hash from audit_logs ${orgId ? sql`where organization_id=${orgId}::uuid` : sql``} order by created_at desc limit 1` as any);
  return (rows?.rows ?? [])[0]?.hash || null;
}

function computeHash(prevHash: string | null, payload: any, ts: string): string {
  const h = crypto.createHash('sha256');
  h.update(prevHash || '');
  h.update(JSON.stringify(payload));
  h.update(ts);
  return h.digest('hex');
}

function signHash(hashHex: string): string {
  const mac = crypto.createHmac('sha256', signingKey());
  mac.update(hashHex);
  return mac.digest('hex');
}

export class AuditLogService {
  ready: Promise<void>;
  constructor() { this.ready = ensureTable(); }

  async record(entry: { organizationId?: string | null; actorUserId?: string | null; action: string; subjectType?: string; subjectId?: string; data?: any }): Promise<void> {
    await this.ready;
    const ts = new Date().toISOString();
    const prev = await getLastHash(entry.organizationId || undefined);
    const payload = { action: entry.action, subjectType: entry.subjectType, subjectId: entry.subjectId, data: entry.data };
    const hash = computeHash(prev, payload, ts);
    const signature = signHash(hash);
    await db.execute(sql`
      insert into audit_logs (organization_id, actor_user_id, action, subject_type, subject_id, data, prev_hash, hash, signature, created_at)
      values (${entry.organizationId || null}::uuid, ${entry.actorUserId || null}, ${entry.action}, ${entry.subjectType || null}, ${entry.subjectId || null}, ${JSON.stringify(entry.data || {})}::jsonb, ${prev}, ${hash}, ${signature}, ${ts}::timestamptz)
    ` as any);
  }

  async verify(orgId?: string): Promise<{ ok: boolean; checked: number; brokenAt?: string }> {
    await this.ready;
    const rows: any = await db.execute(sql`select id, data, action, subject_type, subject_id, prev_hash, hash, signature, created_at from audit_logs ${orgId ? sql`where organization_id=${orgId}::uuid` : sql``} order by created_at asc limit 5000` as any);
    const list = rows?.rows ?? [];
    let prev: string | null = null; let checked = 0;
    for (const r of list) {
      const recompute = computeHash(prev, { action: r.action, subjectType: r.subject_type, subjectId: r.subject_id, data: r.data }, new Date(r.created_at).toISOString());
      const sig = signHash(recompute);
      if (recompute !== r.hash || sig !== r.signature) {
        return { ok: false, checked, brokenAt: r.id };
      }
      prev = r.hash; checked++;
    }
    return { ok: true, checked };
  }
}

export const auditLogService = new AuditLogService();


