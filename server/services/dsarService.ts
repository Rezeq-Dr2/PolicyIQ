import { db } from '../db';
import { sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function hashSubject(organizationId: string, subjectId: string): string {
  return crypto.createHash('sha256').update(`${organizationId}:${subjectId}`).digest('hex');
}

export class DsarService {
  private dueAt(now: Date = new Date()): string { return new Date(now.getTime() + 30*24*60*60*1000).toISOString(); }

  async openRequest(params: { organizationId: string; subjectId: string }): Promise<{ id: string }> {
    const { organizationId, subjectId } = params;
    const h = hashSubject(organizationId, subjectId);
    const token = crypto.randomBytes(16).toString('hex');
    const exp = new Date(Date.now() + 24*60*60*1000).toISOString();
    const res: any = await db.execute(sql`insert into dsar_requests (organization_id, subject_hash, status, due_at, verification_status, verification_token, verification_expires_at) values (${organizationId}::uuid, ${h}, 'open', ${this.dueAt()}, 'pending', ${token}, ${exp}) returning id, verification_token` as any);
    return { id: (res?.rows ?? [])[0].id };
  }

  async gatherFromPolicyDocuments(params: { organizationId: string; requestId: string }): Promise<number> {
    const { organizationId, requestId } = params;
    // basic: pull policy_documents summaries
    const docs: any = await db.execute(sql`select id, title, extracted_text from policy_documents where organization_id=${organizationId}::uuid limit 50` as any);
    let count = 0;
    for (const d of (docs?.rows ?? [])) {
      await db.execute(sql`insert into dsar_items (request_id, source, ref_id, content, redacted) values (${requestId}::uuid, ${'policy_document'}, ${d.id}, ${JSON.stringify({ title: d.title, excerpt: String(d.extracted_text||'').slice(0,2000) })}::jsonb, false)` as any);
      count++;
    }
    return count;
  }

  async redactItem(itemId: string): Promise<void> {
    await db.execute(sql`update dsar_items set redacted=true where id=${itemId}::uuid` as any);
  }

  async closeRequest(requestId: string): Promise<void> {
    await db.execute(sql`update dsar_requests set status='closed', updated_at=now() where id=${requestId}::uuid` as any);
  }

  async verifySubject(params: { requestId: string; token: string }): Promise<boolean> {
    const { requestId, token } = params;
    const row: any = await db.execute(sql`select verification_token, verification_expires_at from dsar_requests where id=${requestId}::uuid` as any);
    const r = (row?.rows ?? [])[0];
    if (!r) return false;
    const ok = String(r.verification_token) === token && new Date(r.verification_expires_at).getTime() > Date.now();
    if (ok) {
      await db.execute(sql`update dsar_requests set verification_status='verified' where id=${requestId}::uuid` as any);
    }
    return ok;
  }

  async exportPackage(params: { requestId: string }): Promise<{ exportPath: string }> {
    const { requestId } = params;
    const items: any = await db.execute(sql`select content from dsar_items where request_id=${requestId}::uuid order by created_at asc` as any);
    const payload = JSON.stringify({ items: (items?.rows ?? []).map((r: any) => r.content) }, null, 2);
    const filePath = path.join(process.cwd(), 'exports', `${requestId}.json`);
    try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); } catch {}
    fs.writeFileSync(filePath, payload);
    await db.execute(sql`insert into dsar_exports (request_id, file_path) values (${requestId}::uuid, ${filePath})` as any);
    return { exportPath: filePath };
  }
}

export const dsarService = new DsarService();


