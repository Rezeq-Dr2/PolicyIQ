import { db } from '../db';
import { sql } from 'drizzle-orm';
import crypto from 'crypto';
import { withSpan } from './telemetry';

function extractTableAndColumns(query: string): { table?: string; columns: string[] } {
  const q = query.replace(/\s+/g, ' ').trim();
  const m = /from\s+([a-zA-Z0-9_\.]+)/i.exec(q);
  const table = m ? m[1] : undefined;
  const where = /where\s+(.+?)(order by|group by|limit|$)/i.exec(q)?.[1] || '';
  const cols = Array.from(where.matchAll(/([a-zA-Z_][a-zA-Z0-9_\.]*)\s*(=|>|<|>=|<=|like|ilike|in)\s*/gi)).map((m) => m[1]).filter(Boolean);
  const normalized = cols.map(c => c.includes('.') ? c.split('.').pop()! : c);
  return { table, columns: Array.from(new Set(normalized)) };
}

export class IndexAdvisorService {
  async explain(query: string): Promise<string> {
    // Run EXPLAIN (FORMAT TEXT)
    const rows: any = await db.execute(sql`EXPLAIN ${sql.raw(query)}` as any);
    const arr = (rows?.rows ?? []) as any[];
    // Neon returns as text lines; map rows accordingly
    return arr.map((r: any) => Object.values(r)[0]).join('\n');
  }

  async explainJson(query: string): Promise<any> {
    const rows: any = await db.execute(sql`EXPLAIN (FORMAT JSON) ${sql.raw(query)}` as any);
    const arr = (rows?.rows ?? []) as any[];
    const first = arr[0] && Object.values(arr[0])[0];
    if (typeof first === 'string') {
      try { return JSON.parse(first); } catch { return []; }
    }
    return first || [];
  }

  async suggest(query: string): Promise<{ table?: string; columns: string[]; suggestion?: string }> {
    const { table, columns } = extractTableAndColumns(query);
    if (!table || columns.length === 0) return { table, columns };
    const idxCols = columns.slice(0, 3).join(', ');
    const idxName = `idx_${table.replace(/\./g, '_')}_${columns.slice(0,3).join('_')}`.toLowerCase();
    const suggestion = `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${idxName} ON ${table} (${idxCols});`;
    return { table, columns, suggestion };
  }

  async saveBaseline(params: { name: string; query: string; planText?: string }): Promise<void> {
    const { name, query } = params;
    const planText = params.planText || await this.explain(query);
    await db.execute(sql`insert into index_baselines (name, query, plan_text) values (${name}, ${query}, ${planText}) on conflict (name) do update set query=excluded.query, plan_text=excluded.plan_text, updated_at=now()` as any);
  }

  async checkRegression(params: { name: string; query: string }): Promise<{ regressed: boolean; planText: string }> {
    const { name, query } = params;
    const current = await this.explain(query);
    const row: any = await db.execute(sql`select plan_text from index_baselines where name=${name}` as any);
    const baseline = (row?.rows ?? [])[0]?.plan_text as string | undefined;
    if (!baseline) return { regressed: false, planText: current };
    // naive heuristic: if current plan text is longer by 30% or loses an index scan mention present in baseline, flag regression
    const losesIndexScan = /Index Scan|Bitmap Index Scan/.test(baseline) && !/Index Scan|Bitmap Index Scan/.test(current);
    const longer = current.length > baseline.length * 1.3;
    return { regressed: (losesIndexScan || longer), planText: current };
  }

  async planHintsForJoins(query: string): Promise<{ hints: string[] }> {
    const json = await this.explainJson(query);
    // EXPLAIN JSON is array with one object containing Plan
    const plan = Array.isArray(json) ? json[0]?.Plan : json?.Plan;
    const hints: string[] = [];
    function walk(node: any) {
      if (!node) return;
      const nodeType = node['Node Type'] || '';
      const relationName = node['Relation Name'] || '';
      const joinType = node['Join Type'] || '';
      const hashCond = node['Hash Cond'] || '';
      const mergeCond = node['Merge Cond'] || '';
      if (nodeType.includes('Join')) {
        // Suggest indexes on join keys
        const cond = (hashCond || mergeCond) as string;
        const m = /\(([^)]+)\) = \(([^)]+)\)/.exec(cond);
        if (m) {
          const [left, right] = [m[1], m[2]];
          const lParts = left.split('.');
          const rParts = right.split('.');
          if (lParts.length === 2) hints.push(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_${lParts[0]}_${lParts[1]} ON ${lParts[0]} (${lParts[1]});`);
          if (rParts.length === 2) hints.push(`CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_${rParts[0]}_${rParts[1]} ON ${rParts[0]} (${rParts[1]});`);
        }
        // If Hash Join without Hash Cond, recommend review
        if (nodeType === 'Hash Join' && !hashCond) hints.push('Consider adding a hashable join condition for Hash Join.');
      }
      const children = (node['Plans'] || []) as any[];
      for (const c of children) walk(c);
    }
    walk(plan);
    // Deduplicate
    return { hints: Array.from(new Set(hints)) };
  }
}

export const indexAdvisorService = new IndexAdvisorService();


