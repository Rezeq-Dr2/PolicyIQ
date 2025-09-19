import { db } from '../db';
import { sql } from 'drizzle-orm';

export class RetentionService {
  async startJob(organizationId: string, jobType: 'consent_expiry'|'generic_purge'): Promise<{ jobId: string }> {
    const res: any = await db.execute(sql`insert into retention_jobs (organization_id, job_type) values (${organizationId}::uuid, ${jobType}) returning id` as any);
    return { jobId: (res?.rows ?? [])[0].id };
  }

  async runConsentExpiry(organizationId: string, jobId?: string): Promise<{ purged: number }> {
    // Purge consent_records where expiry_at < now; audit deletions
    const toPurge: any = await db.execute(sql`select id from consent_records where organization_id=${organizationId}::uuid and expiry_at is not null and expiry_at < now()` as any);
    const ids: string[] = (toPurge?.rows ?? []).map((r: any) => r.id);
    let purged = 0;
    for (const id of ids) {
      await db.execute(sql`insert into retention_audits (organization_id, entity, ref_id, action, meta) values (${organizationId}::uuid, ${'consent_records'}, ${id}, ${'delete'}, ${'{}'}::jsonb)` as any);
      await db.execute(sql`delete from consent_records where id=${id}::uuid` as any);
      purged++;
    }
    if (jobId) await db.execute(sql`update retention_jobs set status='completed', finished_at=now(), details=${JSON.stringify({ purged })}::jsonb where id=${jobId}::uuid` as any);
    return { purged };
  }
}

export const retentionService = new RetentionService();


