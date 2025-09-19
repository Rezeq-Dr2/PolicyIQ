import { db } from '../db';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';

export class ConsentService {
  private hashSubject(subjectId: string, organizationId: string): string {
    return crypto.createHash('sha256').update(`${organizationId}:${subjectId}`).digest('hex');
  }

  async upsertPurpose(params: { organizationId: string; name: string; description?: string; retentionDays?: number; legalBasis?: string }): Promise<any> {
    const { organizationId, name, description, retentionDays, legalBasis } = params;
    const res: any = await db.execute(sql`
      insert into consent_purposes (organization_id, name, description, retention_days, legal_basis)
      values (${organizationId}::uuid, ${name}, ${description || null}, ${retentionDays || null}, ${legalBasis || null})
      on conflict (organization_id, name) do update set description = excluded.description, retention_days = excluded.retention_days, legal_basis = excluded.legal_basis, updated_at = now()
      returning *
    ` as any);
    return (res?.rows ?? [])[0];
  }

  async recordConsent(params: { organizationId: string; subjectId: string; purposeId: string; granted: boolean; method?: string; expiryAt?: string; actorUserId?: string }): Promise<any> {
    const { organizationId, subjectId, purposeId, granted, method, expiryAt, actorUserId } = params;
    const hash = this.hashSubject(subjectId, organizationId);
    const res: any = await db.execute(sql`
      insert into consent_records (organization_id, subject_hash, purpose_id, granted, method, expiry_at)
      values (${organizationId}::uuid, ${hash}, ${purposeId}::uuid, ${granted}, ${method || null}, ${expiryAt || null})
      returning *
    ` as any);
    const row = (res?.rows ?? [])[0];
    await db.execute(sql`
      insert into consent_audits (organization_id, consent_id, action, actor_user_id, meta)
      values (${organizationId}::uuid, ${row?.id || null}::uuid, ${granted ? 'granted' : 'revoked'}, ${actorUserId || null}::uuid, ${JSON.stringify({ method })}::jsonb)
    ` as any);
    return row;
  }

  async getSubjectConsents(organizationId: string, subjectId: string): Promise<any[]> {
    const hash = this.hashSubject(subjectId, organizationId);
    const rows: any = await db.execute(sql`
      select r.*, p.name as purpose_name from consent_records r
      join consent_purposes p on p.id = r.purpose_id
      where r.organization_id = ${organizationId}::uuid and r.subject_hash = ${hash}
      order by r.timestamp desc
    ` as any);
    return rows?.rows ?? [];
  }
}

export const consentService = new ConsentService();


