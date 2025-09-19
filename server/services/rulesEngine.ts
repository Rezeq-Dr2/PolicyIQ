import { db } from '../db';
import { sql } from 'drizzle-orm';
import { AhoCorasick } from './aho';

export type RuleExpression =
  | { all: RuleExpression[] }
  | { any: RuleExpression[] }
  | { not: RuleExpression }
  | { keyword: string }
  | { nodeRef: string };

export interface Rule {
  id: string;
  regulationId: string | null;
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  expression: RuleExpression;
}

export class RulesEngine {
  async loadActiveRules(regulationId?: string): Promise<Rule[]> {
    const res: any = await db.execute(sql`select id, regulation_id, name, severity, expression from compliance_rules where is_active = true ${regulationId ? sql`and regulation_id = ${regulationId}::uuid` : sql``}`);
    const rows = (res?.rows ?? []) as any[];
    return rows.map(r => ({ id: r.id, regulationId: r.regulation_id, name: r.name, severity: r.severity, expression: r.expression }));
  }

  async evaluateRules(params: { reportId: string; organizationId: string; policyText: string; regulationId?: string }): Promise<Array<{ ruleId: string; passed: boolean; details: any }>> {
    const rules = await this.loadActiveRules(params.regulationId);
    const nodeRefs = await this.loadNodeRefs(params.organizationId);
    const keywordSet = this.collectKeywords(rules);
    const keywords = Array.from(keywordSet);

    // Build automaton once and scan text
    const aho = new AhoCorasick();
    for (const kw of keywords) aho.add(kw.toLowerCase());
    aho.build();
    const matched = aho.search(params.policyText.toLowerCase());

    const results: Array<{ ruleId: string; passed: boolean; details: any }> = [];

    for (const rule of rules) {
      const passed = this.evaluateExpression(rule.expression, params.policyText, nodeRefs, matched);
      const details = { matched: passed };
      results.push({ ruleId: rule.id, passed, details });
      await db.execute(sql`insert into rule_evaluations (report_id, rule_id, passed, details) values (${params.reportId}::uuid, ${rule.id}::uuid, ${passed}, ${details})`);
    }
    return results;
  }

  private evaluateExpression(expr: RuleExpression, text: string, nodeRefs: Set<string>, matchedKeywords?: Set<string>): boolean {
    if ((expr as any).all) {
      return (expr as any).all.every((e: RuleExpression) => this.evaluateExpression(e, text, nodeRefs, matchedKeywords));
    }
    if ((expr as any).any) {
      return (expr as any).any.some((e: RuleExpression) => this.evaluateExpression(e, text, nodeRefs, matchedKeywords));
    }
    if ((expr as any).not) {
      return !this.evaluateExpression((expr as any).not, text, nodeRefs, matchedKeywords);
    }
    if ((expr as any).keyword) {
      const kw = (expr as any).keyword as string;
      if (matchedKeywords) return matchedKeywords.has(kw.toLowerCase());
      return new RegExp(`\\b${this.escapeRegex(kw)}\\b`, 'i').test(text);
    }
    if ((expr as any).nodeRef) {
      const ref = (expr as any).nodeRef as string;
      return nodeRefs.has(ref.toLowerCase());
    }
    return false;
  }

  private collectKeywords(rules: Rule[]): Set<string> {
    const set = new Set<string>();
    const walk = (expr: RuleExpression) => {
      if ((expr as any).keyword) { set.add((expr as any).keyword); return; }
      if ((expr as any).all) (expr as any).all.forEach(walk);
      if ((expr as any).any) (expr as any).any.forEach(walk);
      if ((expr as any).not) walk((expr as any).not);
    };
    for (const r of rules) walk(r.expression);
    return set;
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async loadNodeRefs(organizationId: string): Promise<Set<string>> {
    const res: any = await db.execute(sql`
      select distinct n.ref as ref
      from policy_node_mappings m
      join regulation_graph_nodes n on n.id = m.node_id
      where m.organization_id = ${organizationId}::uuid and n.ref is not null
    `);
    const rows = (res?.rows ?? []) as Array<{ ref: string }>;
    return new Set(rows.map(r => r.ref.toLowerCase()));
  }
}

export const rulesEngine = new RulesEngine();
