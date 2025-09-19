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

export class PiaService {
  async generate(params: { organizationId: string; title: string; context: any }): Promise<{ id: string }> {
    const { organizationId, title, context } = params;
    const prompt = `Generate a PIA in strict JSON with keys: { summary: string, findings: [ { category, severity, summary, recommendation } ] }\nContext:\n${sanitizePrompt(JSON.stringify(context)).slice(0,5000)}`;
    const cacheKey = makeCacheKey({ k: 'pia', org: organizationId, title });
    const cached = await getCached<any>(cacheKey);
    const out = cached || (await (async () => {
      const resp = await withResilience(() => openai.chat.completions.create({ model: 'gpt-5', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.1 }), { timeoutMs: 20000, retries: 2, breakerKey: 'openai' });
      const parsed = validateJsonOutput(resp.choices[0].message.content || '{}');
      await setCached(cacheKey, parsed, { ttlSeconds: 6 * 3600 });
      return parsed;
    })());
    const ins: any = await db.execute(sql`insert into pia_records (organization_id, title, context, status) values (${organizationId}::uuid, ${title}, ${JSON.stringify(context)}::jsonb, 'draft') returning id` as any);
    const id = (ins?.rows ?? [])[0].id;
    for (const f of (Array.isArray(out.findings) ? out.findings : [])) {
      await db.execute(sql`insert into pia_findings (pia_id, category, severity, summary, recommendation) values (${id}::uuid, ${f.category || 'General'}, ${f.severity || 'medium'}, ${f.summary || ''}, ${f.recommendation || ''})` as any);
    }
    return { id };
  }
}

export const piaService = new PiaService();


