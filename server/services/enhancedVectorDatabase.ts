import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { db } from '../db';
import { regulationClauses } from '@shared/schema';
import { and, eq, or, sql } from 'drizzle-orm';
import { redis } from './queue';
import { singleFlight } from './singleFlight';
import crypto from 'crypto';
import { sparseRetrievalService } from './sparseRetrievalService';
import { retrievalMetrics } from './retrievalMetrics';
import { withSpan } from './telemetry';

let pinecone: Pinecone | null = null;
if (process.env.PINECONE_API_KEY) {
  pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
} else {
  console.warn('[VectorDB] PINECONE_API_KEY not set. Falling back to PostgreSQL full-text search.');
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY must be set');
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const INDEX_NAME = 'policyiq-regulations';

interface RegulationChunk {
  id: string;
  regulationId: string;
  clauseId: string;
  content: string;
  category: string;
  metadata: any;
}

export class EnhancedVectorDatabaseService {
  private index: any;

  async initialize() {
    if (!pinecone) {
      console.warn('[VectorDB] Pinecone disabled. Using deterministic PostgreSQL fallback.');
      this.index = null;
      return;
    }
    try {
      this.index = pinecone.index(INDEX_NAME);
      await this.index.describeIndexStats();
    } catch (error) {
      console.warn('[VectorDB] Pinecone index unavailable. Using deterministic PostgreSQL fallback.', error);
      this.index = null;
    }
  }

  async embedText(text: string): Promise<number[]> {
    try {
      const key = 'emb:' + crypto.createHash('sha256').update(text).digest('base64').slice(0, 44);
      const cached = await this.cacheGet<number[]>(key);
      if (cached) return cached;
      const result = await singleFlight<number[]>(key, 60, async () => {
        const response = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: text,
        });
        const emb = response.data[0].embedding as unknown as number[];
        await this.cacheSet(key, emb, 3600);
        return emb;
      });
      return result;
    } catch (error) {
      console.error('Error creating embedding:', error);
      throw error;
    }
  }

  // pgvector storage helpers
  private async upsertPgvectorEmbedding(clause: { id: string; regulationId: string; content: string }): Promise<void> {
    const embedding = await this.embedText(clause.content);
    await db.execute(sql`
      insert into regulation_clause_embeddings (clause_id, regulation_id, content, embedding)
      values (${clause.id}::uuid, ${clause.regulationId}::uuid, ${clause.content}, ${embedding}::vector)
      on conflict (clause_id)
      do update set regulation_id = excluded.regulation_id, content = excluded.content, embedding = excluded.embedding, updated_at = now()
    `);
  }

  async indexRegulationClauses(regulationClausesChunks: RegulationChunk[]): Promise<void> {
    // Always store in pgvector for local hybrid search; upsert to Pinecone if available
    try {
      for (const clause of regulationClausesChunks) {
        await this.upsertPgvectorEmbedding({ id: clause.id, regulationId: clause.regulationId, content: clause.content });
      }
      console.log(`[VectorDB] Stored ${regulationClausesChunks.length} embeddings in pgvector`);
    } catch (err) {
      console.error('[VectorDB] pgvector upsert failed:', err);
    }

    if (!this.index) {
      return;
    }

    try {
      const vectors = await Promise.all(
        regulationClausesChunks.map(async (clause) => {
          const embedding = await this.embedText(clause.content);
          return {
            id: clause.id,
            values: embedding,
            metadata: {
              regulationId: clause.regulationId,
              clauseId: clause.clauseId,
              content: clause.content,
              category: clause.category,
              ...clause.metadata
            }
          };
        })
      );

      await this.index.upsert(vectors);
      console.log(`Indexed ${vectors.length} regulation clauses in Pinecone`);
    } catch (error) {
      console.error('Error indexing regulation clauses:', error);
    }
  }

  private calculateDynamicTopK(policyText: string): number {
    const wordCount = policyText.split(/\s+/).length;
    const sentenceCount = policyText.split(/[.!?]+/).length;
    const complexityKeywords = ['shall', 'must', 'require', 'comply', 'ensure', 'implement', 'maintain', 'establish'];
    const keywordMatches = complexityKeywords.filter(keyword => 
      policyText.toLowerCase().includes(keyword)
    ).length;
    let topK = 5; 
    if (wordCount > 200) topK += 2;
    if (sentenceCount > 10) topK += 1;
    if (keywordMatches > 5) topK += 2;
    return Math.min(topK, 12);
  }

  private async cacheGet<T>(key: string): Promise<T | null> {
    try {
      const raw = await redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private async cacheSet<T>(key: string, value: T, ttlSeconds: number = 300): Promise<void> {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* ignore cache errors */
    }
  }

  private async queryPgvector(policyText: string, topK: number, regulationId?: string): Promise<RegulationChunk[]> {
    const embedding = await this.embedText(policyText);
    // Use cosine distance; smaller is better; order ascending
    const rows: any = await db.execute(sql`
      select c.id as clause_id, c.regulation_id, c.clause_text, e.embedding <#> ${embedding}::vector as distance
      from regulation_clause_embeddings e
      join regulation_clauses c on c.id = e.clause_id
      ${regulationId ? sql`where e.regulation_id = ${regulationId}::uuid` : sql``}
      order by distance asc
      limit ${topK}
    `);
    const resultArr = (rows?.rows ?? rows ?? []) as any[];
    return resultArr.map((r: any) => ({
      id: r.clause_id,
      regulationId: r.regulation_id,
      clauseId: r.clause_id,
      content: r.clause_text,
      category: 'pgvector',
      metadata: { distance: r.distance }
    }));
  }

  async findSimilarClauses(
    policyText: string, 
    topK?: number,
    regulationId?: string
  ): Promise<RegulationChunk[]> {
    const dynamicTopK = topK || this.calculateDynamicTopK(policyText);

    const cacheKey = `sv1:clauses:${regulationId || 'any'}:${dynamicTopK}:${Buffer.from(policyText).toString('base64').slice(0, 64)}`;
    const cached = await this.cacheGet<RegulationChunk[]>(cacheKey);
    if (cached) { try { await retrievalMetrics.record({ source: 'cache' }); } catch {} return cached; }

    // Prefer pgvector (local) → Pinecone (if available) → FTS fallback
    try {
      const pgv = await withSpan('vector.query.pgvector', async () => this.queryPgvector(policyText, dynamicTopK, regulationId));
      try { await retrievalMetrics.record({ source: 'pgvector', count: pgv.length }); } catch {}
      if (pgv.length >= dynamicTopK) {
        await this.cacheSet(cacheKey, pgv);
        return pgv;
      }
    } catch (err) {
      console.warn('[VectorDB] pgvector query failed; continuing with other sources:', err);
    }

    if (this.index) {
      try {
        const queryEmbedding = await withSpan('vector.embed.query', async () => this.embedText(policyText));
        const filter: any = {};
        if (regulationId) filter.regulationId = regulationId;
        const queryResponse = await withSpan('vector.query.pinecone', async () => this.index.query({ vector: queryEmbedding, topK: dynamicTopK, filter: Object.keys(filter).length ? filter : undefined, includeMetadata: true }));
        const pine = queryResponse.matches.map((match: any) => ({
          id: match.id,
          regulationId: match.metadata.regulationId,
          clauseId: match.metadata.clauseId,
          content: match.metadata.content,
          category: match.metadata.category,
          metadata: { ...match.metadata, score: match.score }
        }));
        if (pine.length) {
          await this.cacheSet(cacheKey, pine);
          try { await retrievalMetrics.record({ source: 'pinecone', count: pine.length }); } catch {}
          return pine;
        }
      } catch (error) {
        console.warn('[VectorDB] Pinecone query failed; will fallback:', error);
      }
    }

    const fallback = await withSpan('vector.query.fallback', async () => this.fallbackSimilaritySearch(policyText, dynamicTopK, regulationId));
    try { await retrievalMetrics.record({ source: 'fallback', count: fallback.length }); } catch {}
    await this.cacheSet(cacheKey, fallback);
    return fallback;
  }

  async performHybridSearch(
    policyText: string,
    topK: number = 5,
    regulationId?: string
  ): Promise<RegulationChunk[]> {
    const cacheKey = `hybrid:${regulationId || 'any'}:${topK}:${Buffer.from(policyText).toString('base64').slice(0, 64)}`;
    const cached = await this.cacheGet<RegulationChunk[]>(cacheKey);
    if (cached) return cached;
    return singleFlight<RegulationChunk[]>(cacheKey, 30, async () => {
      const [semantic, keyword] = await Promise.all([
        withSpan('vector.hybrid.semantic', async () => this.findSimilarClauses(policyText, topK, regulationId)),
        withSpan('vector.hybrid.keyword', async () => this.fallbackSimilaritySearch(policyText, topK, regulationId)),
      ]);
      let combined: RegulationChunk[] = [];
      const seen = new Set<string>();
      const push = (r: RegulationChunk) => { if (!seen.has(r.id)) { combined.push(r); seen.add(r.id); } };
      semantic.forEach(push);
      keyword.forEach(push);

      // Retrieval v2: integrate sparse signals when enabled
      if (process.env.RETRIEVAL_V2_SPARSE === '1') {
        try {
          const sparse = await withSpan('vector.hybrid.sparse', async () => sparseRetrievalService.query(policyText, topK * 2, regulationId));
          try { await retrievalMetrics.record({ source: 'sparse', count: sparse.length }); } catch {}
          const byId = new Map<string, { idx: number; score: number }>();
          combined.forEach((c: any, idx) => byId.set(c.clauseId || c.id, { idx, score: c.score || 0 }));
          for (const s of sparse) {
            const hit = byId.get(s.clauseId);
            if (hit) {
              (combined[hit.idx] as any).score = (hit.score || 0) + s.score * 0.5;
            }
          }
        } catch {}
      }

      let out = await withSpan('vector.hybrid.rerank.termOverlap', async () => this.rerankByTermOverlap(policyText, combined, topK));
      if (process.env.RETRIEVAL_V2_COLBERT === '1') {
        try {
          out = await withSpan('vector.hybrid.rerank.colbert', async () => this.colbertRerank(policyText, out, topK));
          try { await retrievalMetrics.record({ source: 'colbert', count: out.length }); } catch {}
        } catch (e) {
          console.warn('[VectorDB] ColBERT rerank failed:', (e as any)?.message || e);
        }
      }
      await this.cacheSet(cacheKey, out, 300);
      return out;
    });
  }

  private async fallbackSimilaritySearch(
    policyText: string,
    topK: number,
    regulationId?: string
  ): Promise<RegulationChunk[]> {
    console.warn('[VectorDB] Using PostgreSQL full-text search fallback.');

    const keyTerms = this.extractKeyTerms(policyText);
    const cleanedTerms = keyTerms
      .map(t => t.replace(/[^a-z0-9]/gi, ''))
      .filter(t => t.length > 2);

    let rows: Array<{ id: string; regulationId: string; clauseIdentifier: string | null; clauseText: string; rank: number }>;    
    if (cleanedTerms.length > 0) {
      const tsQuery = cleanedTerms.join(' & ');
      const conditions = [
        regulationId ? eq(regulationClauses.regulationId, regulationId) : undefined,
        sql`to_tsvector('english', ${regulationClauses.clauseText}) @@ to_tsquery('english', ${tsQuery})`
      ].filter(Boolean) as any[];

      rows = await db
        .select({
          id: regulationClauses.id,
          regulationId: regulationClauses.regulationId,
          clauseIdentifier: regulationClauses.clauseIdentifier,
          clauseText: regulationClauses.clauseText,
          rank: sql<number>`ts_rank(to_tsvector('english', ${regulationClauses.clauseText}), to_tsquery('english', ${tsQuery}))`,
        })
        .from(regulationClauses)
        .where(conditions.length > 1 ? and(...conditions) : conditions[0])
        .orderBy(sql`rank DESC`)
        .limit(topK);
    } else {
      const words = policyText
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3);
      const uniq = Array.from(new Set(words)).slice(0, 5);
      const likeConds = uniq.map(w => sql`${regulationClauses.clauseText} ILIKE ${'%' + w + '%'}`);
      const conditions = [
        regulationId ? eq(regulationClauses.regulationId, regulationId) : undefined,
        likeConds.length ? (likeConds.length === 1 ? likeConds[0] : or(...(likeConds as any))) : undefined,
      ].filter(Boolean) as any[];

      rows = await db
        .select({
          id: regulationClauses.id,
          regulationId: regulationClauses.regulationId,
          clauseIdentifier: regulationClauses.clauseIdentifier,
          clauseText: regulationClauses.clauseText,
          rank: sql<number>`0`,
        })
        .from(regulationClauses)
        .where(conditions.length > 1 ? and(...conditions) : conditions[0])
        .limit(topK);
    }

    return rows.map(r => ({
      id: r.id,
      regulationId: r.regulationId,
      clauseId: r.id,
      content: r.clauseText,
      category: 'fallback',
      metadata: { clauseIdentifier: r.clauseIdentifier, rank: r.rank }
    }));
  }

  private extractKeyTerms(text: string): string[] {
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
    const stopwords = new Set(['the','and','for','with','this','that','from','into','shall','must','will','can','are','have','has','had','not','but','your','our','their','its']);
    const freq = new Map<string, number>();
    for (const w of words) {
      if (w.length <= 2 || stopwords.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
    return Array.from(freq.entries())
      .sort((a,b) => b[1]-a[1])
      .slice(0, 8)
      .map(([w]) => w);
  }

  // Retrieval v2: simple query expansion and late interaction reranker (term-level overlap)
  private expandQueryTerms(terms: string[]): string[] {
    const synonyms: Record<string, string[]> = {
      comply: ['conform','adhere'],
      retention: ['storage','preservation'],
      breach: ['incident','violation'],
      consent: ['permission','agreement'],
      training: ['education','awareness'],
    };
    const out = new Set<string>(terms);
    for (const t of terms) {
      for (const s of (synonyms[t] || [])) out.add(s);
    }
    return Array.from(out);
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2)
    );
  }

  private rerankByTermOverlap(query: string, candidates: RegulationChunk[], topK: number): RegulationChunk[] {
    const baseTerms = this.extractKeyTerms(query);
    const qTerms = new Set(this.expandQueryTerms(baseTerms));
    const scored = candidates.map((c) => {
      const docTerms = this.tokenize(c.content);
      let overlap = 0;
      for (const t of qTerms) if (docTerms.has(t)) overlap++;
      const score = overlap / Math.max(1, qTerms.size);
      return { c, score };
    });
    scored.sort((a,b) => (b.score || 0) - (a.score || 0));
    return scored.slice(0, topK).map(s => s.c);
  }

  private tokenizeForColbert(text: string, limit: number): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, limit);
  }

  private async embedTokens(tokens: string[]): Promise<number[][]> {
    if (tokens.length === 0) return [];
    const key = 'embtok:' + crypto.createHash('sha256').update(tokens.join('|')).digest('base64').slice(0, 44);
    const cached = await this.cacheGet<number[][]>(key);
    if (cached) return cached;
    const resp = await openai.embeddings.create({ model: 'text-embedding-3-small', input: tokens });
    const out = resp.data.map((d: any) => d.embedding as unknown as number[]);
    await this.cacheSet(key, out, 3600);
    return out;
  }

  private cosine(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) { const x = a[i]; const y = b[i]; dot += x * y; na += x * x; nb += y * y; }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  private async colbertRerank(query: string, candidates: RegulationChunk[], topK: number): Promise<RegulationChunk[]> {
    if (candidates.length === 0) return [];
    const qToks = this.tokenizeForColbert(query, 32);
    const qEmb = await this.embedTokens(qToks);
    const scored: Array<{ c: RegulationChunk; score: number }> = [];
    for (const c of candidates) {
      const dToks = this.tokenizeForColbert(c.content, 64);
      const dEmb = await this.embedTokens(dToks);
      let score = 0;
      for (const qi of qEmb) {
        let best = 0;
        for (const dj of dEmb) {
          const s = this.cosine(qi, dj);
          if (s > best) best = s;
        }
        score += best;
      }
      scored.push({ c, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(s => ({ ...s.c, metadata: { ...(s.c.metadata || {}), colbertScore: s.score } }));
  }

  // Semantic analysis preserved below...
  async performSemanticAnalysis(
    policyChunk: string,
    relevantClauses: RegulationChunk[]
  ): Promise<{
    compliant: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    gaps: string[];
    recommendations: string[];
    reasoning: string;
  }> {
    const prompt = `
Analyze the following policy text for compliance against the provided regulatory clauses using a step-by-step approach:

POLICY TEXT:
${policyChunk}

RELEVANT REGULATORY CLAUSES:
${relevantClauses.map((clause, index) => `
${index + 1}. Category: ${clause.category}
Content: ${clause.content}
`).join('')}

Please think through this analysis step-by-step:

1. UNDERSTANDING: First, identify the key requirements from each regulatory clause
2. EXTRACTION: Extract the relevant provisions from the policy text
3. COMPARISON: Compare each policy provision against the regulatory requirements
4. GAPS IDENTIFICATION: Identify any missing or insufficient provisions
5. RISK ASSESSMENT: Evaluate the compliance risk level based on gaps found
6. RECOMMENDATIONS: Generate specific, actionable recommendations

Then provide a JSON response with:
{
  "compliant": boolean,
  "riskLevel": "low" | "medium" | "high",
  "gaps": ["specific compliance gaps found"],
  "recommendations": ["specific actionable recommendations"],
  "reasoning": "detailed step-by-step explanation following the 6-step process above"
}

Focus on semantic meaning and legal intent, not just keyword matching.
`;

    try {
      const initialAnalysis = await this.performInitialAnalysis(prompt);
      const finalAnalysis = await this.performSelfCorrectionAnalysis(
        policyChunk, 
        relevantClauses, 
        initialAnalysis
      );
      return finalAnalysis;
    } catch (error) {
      console.error('Error in semantic analysis:', error);
      return {
        compliant: false,
        riskLevel: 'high',
        gaps: ['Unable to complete analysis'],
        recommendations: ['Please try again later'],
        reasoning: 'Analysis failed due to technical error'
      };
    }
  }

  private async performInitialAnalysis(prompt: string): Promise<any> {
    const response = await openai.chat.completions.create({
      model: 'gpt-5',
      messages: [
        { role: 'system', content: 'You are a legal compliance expert specializing in privacy regulations.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    return {
      compliant: result.compliant || false,
      riskLevel: result.riskLevel || 'medium',
      gaps: result.gaps || [],
      recommendations: result.recommendations || [],
      reasoning: result.reasoning || 'No analysis available'
    };
  }

  async performSelfCorrectionAnalysis(
    policyChunk: string,
    relevantClauses: RegulationChunk[],
    initialAnalysis: any
  ): Promise<any> {
    const reviewPrompt = `
Review and critique the following compliance analysis for accuracy and completeness:

ORIGINAL POLICY TEXT:
${policyChunk}

REGULATORY CLAUSES:
${relevantClauses.map((clause, index) => `${index + 1}. ${clause.content}`).join('\n')}

INITIAL ANALYSIS:
${JSON.stringify(initialAnalysis, null, 2)}

Please critique this analysis step-by-step:
1. ACCURACY: Are the findings accurate?
2. COMPLETENESS: Are any important aspects missing?
3. REASONING: Is the reasoning sound?
4. RECOMMENDATIONS: Are recommendations actionable and appropriate?

Provide a JSON response with:
{
  "isAccurate": boolean,
  "critiques": ["specific issues found"],
  "improvedAnalysis": {
    "compliant": boolean,
    "riskLevel": "low" | "medium" | "high",
    "gaps": ["refined gaps"],
    "recommendations": ["improved recommendations"],
    "reasoning": "enhanced reasoning"
  },
  "confidenceScore": number (0-1)
}
`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-5',
        messages: [
          { role: 'system', content: 'You are a senior legal compliance reviewer specializing in quality assurance of compliance analyses.' },
          { role: 'user', content: reviewPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      });

      const review = JSON.parse(response.choices[0].message.content || '{}');
      return review.improvedAnalysis || initialAnalysis;
    } catch (error) {
      console.error('Error in self-correction analysis:', error);
      return initialAnalysis; 
    }
  }
}

export const enhancedVectorDbService = new EnhancedVectorDatabaseService();