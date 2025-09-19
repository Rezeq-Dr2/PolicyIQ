import OpenAI from 'openai';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { withResilience } from './resilience';
import { sanitizePrompt, validateJsonOutput } from './promptShield';
import { makeCacheKey, getCached, setCached } from './llmCache';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY must be set');
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class DpiaService {
  async generate(params: { organizationId: string; projectName: string; context: any }): Promise<{ id: string }> {
    const { organizationId, projectName, context } = params;
    const prompt = `Generate a DPIA in strict JSON with keys: {
  lawful_basis: string,
  high_risk: boolean,
  description: string,
  findings: [ { category: string, severity: "low|medium|high|critical", summary: string, recommendation: string, references: {} } ]
}
Context:\n${sanitizePrompt(JSON.stringify(context)).slice(0, 5000)}\n`;
    const cacheKey = makeCacheKey({ k: 'dpia', org: organizationId, proj: projectName });
    const cached = await getCached<any>(cacheKey);
    if (cached) {
      return { id: await this.persist(organizationId, projectName, cached) };
    }
    const resp = await withResilience(() => openai.chat.completions.create({
      model: 'gpt-5',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.1
    }), { timeoutMs: 20000, retries: 2, backoffMs: 500, breakerKey: 'openai' });
    const out = validateJsonOutput(resp.choices[0].message.content || '{}');
    await setCached(cacheKey, out, { ttlSeconds: 6 * 3600 });
    const id = await this.persist(organizationId, projectName, out);
    return { id };
  }

  private async persist(organizationId: string, projectName: string, out: any): Promise<string> {
    const ins: any = await db.execute(sql`
      insert into dpia_records (organization_id, project_name, description, lawful_basis, high_risk, status)
      values (${organizationId}::uuid, ${projectName}, ${out.description || ''}, ${out.lawful_basis || ''}, ${!!out.high_risk}, 'draft')
      returning id
    ` as any);
    const id = (ins?.rows?.[0]?.id) || (ins as any)?.id;
    const findings: any[] = Array.isArray(out.findings) ? out.findings : [];
    for (const f of findings) {
      await db.execute(sql`
        insert into dpia_findings (dpia_id, category, severity, summary, recommendation, references)
        values (${id}::uuid, ${f.category || 'General'}, ${f.severity || 'medium'}, ${f.summary || ''}, ${f.recommendation || ''}, ${JSON.stringify(f.references || {})}::jsonb)
      ` as any);
    }
    return id;
  }

  async get(organizationId: string, id: string): Promise<any> {
    const rec: any = await db.execute(sql`select * from dpia_records where id=${id}::uuid and organization_id=${organizationId}::uuid` as any);
    const row = (rec?.rows ?? [])[0];
    if (!row) return null;
    const f: any = await db.execute(sql`select * from dpia_findings where dpia_id=${id}::uuid order by created_at asc` as any);
    const a: any = await db.execute(sql`select * from dpia_approvals where dpia_id=${id}::uuid order by decided_at desc` as any);
    return { ...row, findings: f?.rows ?? [], approvals: a?.rows ?? [] };
  }

  async approve(params: { organizationId: string; id: string; approverUserId: string; decision: 'approved'|'rejected'; comment?: string }): Promise<void> {
    const { organizationId, id, approverUserId, decision, comment } = params;
    await db.execute(sql`insert into dpia_approvals (dpia_id, approver_user_id, decision, comment) values (${id}::uuid, ${approverUserId}::uuid, ${decision}, ${comment || null})` as any);
    await db.execute(sql`update dpia_records set status=${decision === 'approved' ? 'approved' : 'revisions'}, updated_at=now() where id=${id}::uuid and organization_id=${organizationId}::uuid` as any);
  }
}

export const dpiaService = new DpiaService();


