import { db } from '../db';
import { sql } from 'drizzle-orm';

export interface SparseTermWeight { term: string; weight: number }

export class SparseRetrievalService {
  async upsertClauseTerms(params: { regulationClauseId: string; terms: SparseTermWeight[] }): Promise<void> {
    const { regulationClauseId, terms } = params;
    if (!terms.length) return;
    // Simple upsert loop (batched)
    const chunks: SparseTermWeight[][] = [];
    for (let i = 0; i < terms.length; i += 1000) chunks.push(terms.slice(i, i + 1000));
    for (const ch of chunks) {
      const values = ch.map(t => sql`(${regulationClauseId}::uuid, ${t.term}, ${t.weight})`);
      await db.execute(sql`
        insert into regulation_clause_terms (regulation_clause_id, term, weight)
        values ${sql.join(values, sql`,`)}
        on conflict (regulation_clause_id, term) do update set weight = excluded.weight
      ` as any);
    }
  }

  async query(queryText: string, topK: number = 10, regulationId?: string): Promise<Array<{ clauseId: string; score: number }>> {
    const tokens = this.tokenize(queryText);
    if (tokens.length === 0) return [];
    const tokenList = tokens.map(t => sql`${t}`);
    const res: any = await db.execute(sql`
      with q(term) as (
        values ${sql.join(tokenList, sql`,`)}
      )
      select rct.regulation_clause_id as clause_id, sum(rct.weight) as score
      from regulation_clause_terms rct
      join regulation_clauses rc on rc.id = rct.regulation_clause_id
      join q on q.term = rct.term
      ${regulationId ? sql`where rc.regulation_id = ${regulationId}::uuid` : sql``}
      group by rct.regulation_clause_id
      order by score desc
      limit ${topK}
    ` as any);
    return (res?.rows ?? []).map((r: any) => ({ clauseId: r.clause_id, score: Number(r.score) || 0 }));
  }

  tokenize(text: string): string[] {
    return (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 200);
  }
}

export const sparseRetrievalService = new SparseRetrievalService();


