import OpenAI from 'openai';
import { db } from '../db';
import { policyDocuments, policyDocumentVersions } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { withResilience } from './resilience';
import { sanitizePrompt, validateJsonOutput } from './promptShield';
import { makeCacheKey, getCached, setCached } from './llmCache';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY must be set');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class RemediationService {
  static async suggestFix(options: { textSnippet: string; regulationName?: string; contextSummary?: string }): Promise<{ suggestions: string[]; rationale?: string }> {
    const { textSnippet, regulationName, contextSummary } = options;
    const prompt = `You are a legal compliance writing assistant.
Given the following policy clause and (optional) regulation context, propose 1-2 alternative, compliant versions with improved specificity and accuracy.
Keep the language clear, enforceable, and aligned to the cited regulation. Return JSON with keys: suggestions (array of strings), rationale (string).

CLAUSE:
${sanitizePrompt(textSnippet)}

REGULATION: ${regulationName || 'General'}
CONTEXT: ${contextSummary || 'N/A'}
`;

    const cacheKey = makeCacheKey({ k: 'remediate', reg: regulationName || 'General', text: textSnippet.slice(0, 256) });
    const cached = await getCached<{ suggestions: string[]; rationale?: string }>(cacheKey);
    if (cached) return cached;

    const res = await withResilience(() => openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        { role: 'system', content: 'You produce strictly JSON outputs when requested.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2
    }), { timeoutMs: 20000, retries: 2, backoffMs: 500, breakerKey: 'openai' });
    const parsed = validateJsonOutput(res.choices[0].message.content || '{}');
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map((s: any) => String(s)).slice(0, 2) : [];
    const rationale = parsed.rationale ? String(parsed.rationale) : undefined;
    const out = { suggestions, rationale };
    await setCached(cacheKey, out, { ttlSeconds: 3600 });
    return out;
  }

  static async applyPolicyUpdate(options: { policyDocumentId: string; originalText: string; replacementText: string; changeDescription?: string; userId?: string }): Promise<{ updated: boolean }> {
    const { policyDocumentId, originalText, replacementText, changeDescription, userId } = options;
    const rows = await db.select().from(policyDocuments).where(eq(policyDocuments.id, policyDocumentId));
    const doc = rows[0];
    if (!doc) return { updated: false };

    const source = doc.extractedText || '';
    if (!source || !source.includes(originalText)) {
      return { updated: false };
    }
    const updatedText = source.replace(originalText, replacementText);

    // Create a new version entry
    await db.insert(policyDocumentVersions).values({
      policyDocumentId: doc.id,
      organizationId: doc.organizationId,
      versionNumber: new Date().toISOString(),
      title: doc.title,
      originalFilename: doc.originalFilename,
      storagePath: doc.storagePath,
      extractedText: updatedText,
      changeDescription: changeDescription || 'AI remediation applied',
      uploadedBy: userId,
    } as any);

    // Update the current document text
    await db.update(policyDocuments)
      .set({ extractedText: updatedText })
      .where(eq(policyDocuments.id, doc.id));

    return { updated: true };
  }

  static async revertPolicyUpdate(options: { policyDocumentId: string; originalText: string; replacementText: string; userId?: string }): Promise<{ reverted: boolean }> {
    const { policyDocumentId, originalText, replacementText, userId } = options;
    const rows = await db.select().from(policyDocuments).where(eq(policyDocuments.id, policyDocumentId));
    const doc = rows[0];
    if (!doc) return { reverted: false };

    const source = doc.extractedText || '';
    if (!source || !source.includes(replacementText)) {
      return { reverted: false };
    }
    const revertedText = source.replace(replacementText, originalText);

    await db.insert(policyDocumentVersions).values({
      policyDocumentId: doc.id,
      organizationId: doc.organizationId,
      versionNumber: new Date().toISOString(),
      title: doc.title,
      originalFilename: doc.originalFilename,
      storagePath: doc.storagePath,
      extractedText: revertedText,
      changeDescription: 'AI remediation reverted',
      uploadedBy: userId,
    } as any);

    await db.update(policyDocuments)
      .set({ extractedText: revertedText })
      .where(eq(policyDocuments.id, doc.id));

    return { reverted: true };
  }

  static async generatePolicyDraft(options: { prompt: string; title?: string; organizationId: string }): Promise<{ id: string; title: string }> {
    const { prompt, title, organizationId } = options;
    const fullPrompt = `Generate a complete, well-structured policy document based on the user request. Include sections, clear responsibilities, procedures, and compliance references where relevant. Return only the policy text.`;
    const res = await withResilience(() => openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        { role: 'system', content: fullPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 4000
    }), { timeoutMs: 20000, retries: 2, backoffMs: 500, breakerKey: 'openai' });
    const content = res.choices[0].message.content || '';
    const policyTitle = title || 'Draft Policy Document';

    const [doc] = await db.insert(policyDocuments).values({
      organizationId,
      title: policyTitle,
      originalFilename: `${policyTitle.replace(/\s+/g, '_').toLowerCase()}.txt`,
      storagePath: `generated/${Date.now()}.txt`,
      extractedText: content,
    }).returning();
    return { id: doc.id, title: doc.title };
  }
}

export const remediationService = RemediationService;


