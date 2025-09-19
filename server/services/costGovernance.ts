import { db } from '../db';
import { sql } from 'drizzle-orm';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export class CostGovernanceService {
  private static centsPer1kTokens = {
    gpt5: 500, // example pricing placeholder in cents per 1k tokens
    embedding: 10,
  };

  async ensureOrgPolicy(organizationId: string): Promise<void> {
    await db.execute(sql`
      insert into org_cost_policies (organization_id)
      values (${organizationId}::uuid)
      on conflict (organization_id) do nothing
    `);
    await db.execute(sql`
      insert into org_usage_counters (organization_id)
      values (${organizationId}::uuid)
      on conflict (organization_id) do nothing
    `);
  }

  async recordUsage(organizationId: string, service: 'openai' | 'embedding' | 'reranker', tokens: number, metadata?: any): Promise<void> {
    // Reset windows if crossed
    await db.execute(sql`
      update org_usage_counters
      set 
        daily_tokens_used = case when date_trunc('day', now()) > window_start then 0 else daily_tokens_used end,
        window_start = case when date_trunc('day', now()) > window_start then date_trunc('day', now()) else window_start end,
        monthly_tokens_used = case when date_trunc('month', now())::date > month_start then 0 else monthly_tokens_used end,
        month_start = case when date_trunc('month', now())::date > month_start then date_trunc('month', now())::date else month_start end,
        updated_at = now()
      where organization_id = ${organizationId}::uuid
    `);

    await db.execute(sql`
      update org_usage_counters
      set daily_tokens_used = daily_tokens_used + ${tokens}, monthly_tokens_used = monthly_tokens_used + ${tokens}, updated_at = now()
      where organization_id = ${organizationId}::uuid
    `);

    await db.execute(sql`
      insert into token_usage_events (organization_id, service, tokens, cost_cents, metadata)
      values (${organizationId}::uuid, ${service}, ${tokens}, ${this.estimateCostCents(service, tokens)}, ${metadata || {}})
    `);
  }

  async enforceCaps(organizationId: string, tokensToAdd: number): Promise<void> {
    const pol: any = await db.execute(sql`select daily_token_cap, monthly_token_cap, hard_fail from org_cost_policies where organization_id = ${organizationId}::uuid`);
    const policy = (pol?.rows ?? [])[0] || { daily_token_cap: 500000, monthly_token_cap: 10000000, hard_fail: true };

    const usageRes: any = await db.execute(sql`select daily_tokens_used, monthly_tokens_used from org_usage_counters where organization_id = ${organizationId}::uuid`);
    const usage = (usageRes?.rows ?? [])[0] || { daily_tokens_used: 0, monthly_tokens_used: 0 };

    const wouldDaily = Number(usage.daily_tokens_used) + tokensToAdd;
    const wouldMonthly = Number(usage.monthly_tokens_used) + tokensToAdd;

    if (wouldDaily > Number(policy.daily_token_cap) || wouldMonthly > Number(policy.monthly_token_cap)) {
      if (policy.hard_fail) {
        throw new Error('Organization token cap exceeded');
      }
    }
  }

  estimateCostCents(service: 'openai' | 'embedding' | 'reranker', tokens: number): number {
    const per1k = service === 'embedding' ? CostGovernanceService.centsPer1kTokens.embedding : CostGovernanceService.centsPer1kTokens.gpt5;
    return Math.round((tokens / 1000) * per1k);
  }
}

export const costGovernance = new CostGovernanceService();
