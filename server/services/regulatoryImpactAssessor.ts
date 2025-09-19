import OpenAI from 'openai';
import { db } from '../db';
import { organizations, policyDocuments, regulatoryNotifications, regulatoryUpdates } from '@shared/schema';
import { and, eq, sql } from 'drizzle-orm';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY must be set');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface ImpactSummary {
  summary: string;
  keywords: string[];
}

export class RegulatoryImpactAssessor {
  static async assessAndNotify(updateId: string): Promise<void> {
    const [update] = await db.select().from(regulatoryUpdates).where(eq(regulatoryUpdates.id, updateId));
    if (!update) return;

    const impact = await this.assessUpdateImpact(update);

    // For each organization, find affected policies and create scoped notifications
    const orgs = await db.select().from(organizations);
    for (const org of orgs) {
      const affectedPolicies = await this.findAffectedPolicies(org.id, impact);
      if (affectedPolicies.length === 0) continue;

      const subject = `Regulatory Update Impact: ${update.title}`;
      const message = this.composeMessage(update, impact, affectedPolicies);

      await db.insert(regulatoryNotifications).values({
        updateId: update.id,
        organizationId: org.id,
        notificationType: 'in_app',
        subject,
        message,
        status: 'pending',
        metadata: {
          affectedPolicyIds: affectedPolicies.map(p => p.id),
          keywords: impact.keywords,
          impactSummary: impact.summary,
        }
      });
    }
  }

  static async assessUpdateImpact(update: any): Promise<ImpactSummary> {
    const text = `${update.title}\n\n${update.description || ''}\n\n${update.content || ''}`.slice(0, 12000);
    const prompt = `Summarize this regulatory update and extract 8-12 high-signal keywords that would be useful to match impacted company policies.\n\nTEXT:\n${text}\n\nReturn JSON with keys: summary, keywords (array).`;
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-5',
        messages: [
          { role: 'system', content: 'You are a regulatory analyst. Return only JSON when asked.' },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      });
      const parsed = JSON.parse(res.choices[0].message.content || '{}');
      const summary = String(parsed.summary || (update.description || update.title));
      const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.map((k: any) => String(k)).slice(0, 12) : [];
      return { summary, keywords };
    } catch (e) {
      const fallback = (update.description || update.title || '').toString();
      const basicKeywords = fallback
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter((w: string) => w.length > 3)
        .slice(0, 10);
      return { summary: fallback, keywords: basicKeywords };
    }
  }

  static async findAffectedPolicies(organizationId: string, impact: ImpactSummary): Promise<Array<{ id: string; title: string }>> {
    const terms = [...impact.keywords];
    if (impact.summary) {
      const extra = impact.summary.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 4).slice(0, 8);
      terms.push(...extra);
    }
    const uniqueTerms = Array.from(new Set(terms)).slice(0, 20);
    if (uniqueTerms.length === 0) return [];

    const tsQuery = uniqueTerms.join(' | ');
    // FTS on extractedText; fallback to title match if extractedText is null
    const rows = await db
      .select({ id: policyDocuments.id, title: policyDocuments.title })
      .from(policyDocuments)
      .where(and(
        eq(policyDocuments.organizationId, organizationId),
        sql`(to_tsvector('english', coalesce(${policyDocuments.extractedText}, ${policyDocuments.title})) @@ to_tsquery('english', ${tsQuery}))`
      ))
      .limit(10);

    return rows;
  }

  private static composeMessage(update: any, impact: ImpactSummary, policies: Array<{ id: string; title: string }>): string {
    const list = policies.map(p => `- ${p.title}`).join('\n');
    return `A new regulatory update may impact your organization.\n\nTitle: ${update.title}\nPublished: ${update.publishedDate ? new Date(update.publishedDate).toDateString() : 'Unknown'}\nSource: ${update.sourceUrl || 'N/A'}\n\nImpact Summary:\n${impact.summary}\n\nPotentially Affected Policies:\n${list}`;
  }
}

export const regulatoryImpactAssessor = RegulatoryImpactAssessor;


