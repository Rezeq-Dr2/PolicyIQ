import OpenAI from 'openai';
import { db } from '../db';
import { organizations, policyDocuments, regulatoryNotifications, regulatoryUpdates } from '@shared/schema';
import { and, eq, sql } from 'drizzle-orm';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY must be set');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface PredictiveImpact {
  summary: string;
  industries: string[];
  policyAreas: string[];
  confidence: number; // 0-1
}

export class PredictiveImpactAnalyzer {
  static async assessAndAlert(updateId: string): Promise<void> {
    const [update] = await db.select().from(regulatoryUpdates).where(eq(regulatoryUpdates.id, updateId));
    if (!update) return;

    const text = `${update.title}\n\n${update.description || ''}\n\n${update.content || ''}`.slice(0, 16000);
    const impact = await this.analyzePredictiveImpact(text);

    const orgs = await db.select().from(organizations);
    for (const org of orgs) {
      const affectedPolicies = await this.findPoliciesBySimilarity(org.id, impact);
      if (affectedPolicies.length === 0) continue;

      await db.insert(regulatoryNotifications).values({
        updateId: update.id,
        organizationId: org.id,
        notificationType: 'predictive_alert',
        subject: `Predictive Impact Alert: ${update.title}`,
        message: this.composeMessage(update, impact, affectedPolicies),
        status: 'pending',
        metadata: {
          type: 'predictive',
          industries: impact.industries,
          policyAreas: impact.policyAreas,
          confidence: impact.confidence,
          affectedPolicyIds: affectedPolicies.map(p => p.id),
        },
      });
    }
  }

  static async analyzePredictiveImpact(text: string): Promise<PredictiveImpact> {
    const prompt = `Analyze the following draft regulation/consultation for potential future impact. Identify impacted industries and policy areas. Return JSON with keys: summary (string), industries (array of strings), policyAreas (array of strings), confidence (0-1).\n\nTEXT:\n${text}`;
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-5',
        messages: [
          { role: 'system', content: 'You are a senior regulatory analyst. Return strictly JSON when asked.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      });
      const parsed = JSON.parse(res.choices[0].message.content || '{}');
      const summary = String(parsed.summary || 'Potential impact detected.');
      const industries = Array.isArray(parsed.industries) ? parsed.industries.map((i: any) => String(i)).slice(0, 10) : [];
      const policyAreas = Array.isArray(parsed.policyAreas) ? parsed.policyAreas.map((p: any) => String(p)).slice(0, 10) : [];
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence || 0.7)));
      return { summary, industries, policyAreas, confidence };
    } catch (e) {
      // Deterministic fallback
      const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
      const industries = ['technology','healthcare','finance','education'].filter(k => words.includes(k));
      const policyAreas = ['privacy','security','training','incident','risk','ppe','transfer','retention'].filter(k => words.some(w => w.startsWith(k)));
      return { summary: text.slice(0, 240), industries, policyAreas, confidence: 0.6 };
    }
  }

  static async findPoliciesBySimilarity(organizationId: string, impact: PredictiveImpact): Promise<Array<{ id: string; title: string }>> {
    // Compute embedding for impact summary
    let embed: number[] | null = null;
    try {
      const emb = await openai.embeddings.create({ model: 'text-embedding-3-large', input: impact.summary.slice(0, 8000) });
      embed = emb.data[0].embedding as number[];
    } catch {
      embed = null;
    }

    if (!embed) {
      // FTS fallback
      const terms = (impact.industries.concat(impact.policyAreas)).join(' | ') || impact.summary.split(/\s+/).slice(0, 8).join(' | ');
      const rows = await db
        .select({ id: policyDocuments.id, title: policyDocuments.title })
        .from(policyDocuments)
        .where(and(
          eq(policyDocuments.organizationId, organizationId),
          sql`(to_tsvector('english', coalesce(${policyDocuments.extractedText}, ${policyDocuments.title})) @@ to_tsquery('english', ${terms}))`
        ))
        .limit(10);
      return rows;
    }

    // Simple cosine similarity against policy text embeddings computed on the fly
    const policies = await db
      .select({ id: policyDocuments.id, title: policyDocuments.title, extractedText: policyDocuments.extractedText })
      .from(policyDocuments)
      .where(eq(policyDocuments.organizationId, organizationId))
      .limit(50);

    const scored: Array<{ id: string; title: string; score: number }> = [];
    for (const p of policies) {
      const content = (p.extractedText || p.title || '').slice(0, 8000);
      if (!content) continue;
      try {
        const emb = await openai.embeddings.create({ model: 'text-embedding-3-large', input: content });
        const v = emb.data[0].embedding as number[];
        const score = cosine(embed, v);
        scored.push({ id: p.id, title: p.title, score });
      } catch {
        continue;
      }
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 10).map(s => ({ id: s.id, title: s.title }));
  }

  private static composeMessage(update: any, impact: PredictiveImpact, policies: Array<{ id: string; title: string }>): string {
    const conf = Math.round((impact.confidence || 0) * 100);
    const list = policies.map(p => `- ${p.title}`).join('\n');
    const inds = impact.industries.join(', ') || 'General';
    const areas = impact.policyAreas.join(', ') || 'General';
    return `Predictive Alert (Confidence: ${conf}%)\n\nTitle: ${update.title}\nStatus: ${update.status || 'pending'}\nURL: ${update.sourceUrl || 'N/A'}\n\nIndustries: ${inds}\nPolicy Areas: ${areas}\n\nSummary:\n${impact.summary}\n\nPotentially Affected Policies:\n${list}`;
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export const predictiveImpactAnalyzer = PredictiveImpactAnalyzer;


