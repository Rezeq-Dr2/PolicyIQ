import { pool, dbRead } from '../db';
import { redis } from './queue';
import { sql } from 'drizzle-orm';
import { Pinecone } from '@pinecone-database/pinecone';

export interface SyntheticCheckResult {
  timestamp: string;
  ok: boolean;
  dbOk: boolean;
  redisOk: boolean;
  vectorPgOk: boolean;
  pineconeOk: boolean;
  details: Record<string, any>;
}

export async function runSyntheticChecks(): Promise<SyntheticCheckResult> {
  const details: Record<string, any> = {};
  let dbOk = false, redisOk = false, vectorPgOk = false, pineconeOk = false;

  // DB
  try {
    const client = await pool.connect();
    try { await client.query('select 1'); dbOk = true; } finally { client.release(); }
  } catch (e) { details.dbError = (e as any)?.message || String(e); }

  // Redis
  try { const pong = await redis.ping(); redisOk = pong === 'PONG'; } catch (e) { details.redisError = (e as any)?.message || String(e); }

  // pgvector presence
  try {
    const rows: any = await dbRead.execute(sql`select to_regclass('public.regulation_clause_embeddings') as t` as any);
    const exists = Boolean((rows?.rows ?? [])[0]?.t);
    if (exists) {
      const count: any = await dbRead.execute(sql`select count(*)::int as c from regulation_clause_embeddings` as any);
      vectorPgOk = Number(((count?.rows ?? [])[0] || {}).c || 0) >= 0;
      details.pgvectorCount = Number(((count?.rows ?? [])[0] || {}).c || 0);
    } else {
      vectorPgOk = false;
      details.pgvector = 'table missing';
    }
  } catch (e) { details.pgvectorError = (e as any)?.message || String(e); }

  // Pinecone (optional)
  try {
    if (process.env.PINECONE_API_KEY) {
      const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
      const idxName = process.env.PINECONE_INDEX || 'policyiq-regulations';
      const idx = pc.index(idxName);
      const stats = await idx.describeIndexStats();
      details.pineconeStats = stats;
      pineconeOk = true;
    } else {
      details.pinecone = 'disabled';
      pineconeOk = true; // not required
    }
  } catch (e) { details.pineconeError = (e as any)?.message || String(e); pineconeOk = false; }

  const ok = dbOk && redisOk && vectorPgOk && pineconeOk;
  const result: SyntheticCheckResult = { timestamp: new Date().toISOString(), ok, dbOk, redisOk, vectorPgOk, pineconeOk, details };
  try { await redis.set('synthetic:last', JSON.stringify(result), 'EX', 300); } catch {}
  try { await redis.publish('events', JSON.stringify({ topic: 'synthetic.check', payload: result })); } catch {}
  return result;
}


