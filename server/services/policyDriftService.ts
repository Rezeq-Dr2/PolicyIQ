import { db } from '../db';
import { sql } from 'drizzle-orm';
import { EnhancedVectorDatabaseService } from './enhancedVectorDatabase';

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na)*Math.sqrt(nb));
}

export class PolicyDriftService {
  private vector = new EnhancedVectorDatabaseService();

  async computeForDocument(params: { policyDocumentId: string; baselineTemplateId?: string }): Promise<{ driftScore: number }> {
    const { policyDocumentId, baselineTemplateId } = params;
    const docRows: any = await db.execute(sql`select id, extracted_text from policy_documents where id=${policyDocumentId}::uuid` as any);
    const doc = (docRows?.rows ?? [])[0];
    if (!doc) throw new Error('policy document not found');
    const text = String(doc.extracted_text || '');
    let baselineText = '';
    if (baselineTemplateId) {
      const t: any = await db.execute(sql`select content from policy_templates where id=${baselineTemplateId}::uuid` as any);
      baselineText = String(((t?.rows ?? [])[0] || {}).content || '');
    } else {
      const prev: any = await db.execute(sql`select extracted_text from policy_document_versions where policy_document_id=${policyDocumentId}::uuid order by created_at desc limit 1` as any);
      baselineText = String(((prev?.rows ?? [])[0] || {}).extracted_text || '');
    }
    const embA = await this.vector.embedText(text.slice(0, 5000));
    const embB = await this.vector.embedText(baselineText.slice(0, 5000));
    const sim = cosineSimilarity(embA, embB);
    const drift = Math.max(0, 1 - sim);
    await db.execute(sql`insert into policy_drift (policy_document_id, baseline_template_id, drift_score) values (${policyDocumentId}::uuid, ${baselineTemplateId || null}::uuid, ${drift})` as any);
    return { driftScore: drift };
  }

  async latest(policyDocumentId: string): Promise<{ driftScore: number; computedAt: string } | null> {
    const rows: any = await db.execute(sql`select drift_score, computed_at from policy_drift where policy_document_id=${policyDocumentId}::uuid order by computed_at desc limit 1` as any);
    const r = (rows?.rows ?? [])[0];
    if (!r) return null;
    return { driftScore: Number(r.drift_score) || 0, computedAt: new Date(r.computed_at).toISOString() };
  }
}

export const policyDriftService = new PolicyDriftService();


