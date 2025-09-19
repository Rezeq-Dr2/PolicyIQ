import OpenAI from 'openai';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { promptRefinementService } from './promptRefinementService';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY must be set');
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface GoldenExample {
  id: string;
  prompt_type: string;
  input_text: string;
  regulation_name?: string;
  expected: any; // { summary, riskLevel, hasRecommendations, minScore }
}

export class AIQualityService {
  // JSON schema guardrails: enforce analyzer output schema
  getComplianceSchema() {
    return {
      type: 'object',
      properties: {
        chainOfThoughtReasoning: { type: 'string' },
        complianceScore: { type: 'number' },
        summary: { type: 'string' },
        suggestedWording: { type: 'string' },
        riskLevel: { enum: ['Low','Medium','High','Critical'] },
        matchedClauseId: { type: ['string','null'] },
        regulationName: { type: 'string' },
        confidenceScore: { type: 'number' },
        keyFindings: { type: 'array', items: { type: 'string' } },
        actionableRecommendations: { type: 'array', items: { type: 'string' } },
      },
      required: ['complianceScore','summary','riskLevel'],
      additionalProperties: true,
    } as const;
  }

  // Canary/capability flags
  shouldUseCoT(): boolean {
    return process.env.COT_ENABLED === '1';
  }
  shouldUseSelfCorrection(): boolean {
    return process.env.SELF_CORRECTION_ENABLED !== '0';
  }
  rerankerEnabled(): boolean {
    return process.env.RERANKER_ENABLED !== '0';
  }

  // Prompt A/B routing
  async routePrompt(promptType: 'compliance-analysis' | 'dpa2018-analysis' | 'health-safety-analysis'): Promise<string> {
    // If canary prompt set via env, prefer it
    const canary = process.env.CANARY_PROMPT_ID;
    if (canary) {
      const pv = await (await import('../storage')).storage.getPromptVersion(canary);
      if (pv?.isActive && pv.promptType === promptType) return pv.promptText;
    }
    // Prefer Thompson sampling where possible
    try {
      const selected = await promptRefinementService.selectPromptVersionThompson(promptType);
      if (selected?.promptText) return selected.promptText;
    } catch {}
    return promptRefinementService.getOptimalPrompt(promptType);
  }

  // Offline evaluation against golden examples
  async runOfflineEval(promptType: string, promptVersionId?: string): Promise<{ runId: string; count: number; averageScore: number }> {
    const runRes: any = await db.execute(sql`insert into eval_runs (prompt_type, prompt_version_id) values (${promptType}, ${promptVersionId || null}) returning id`);
    const runId = (runRes?.rows?.[0]?.id || (runRes as any)?.id) as string;

    const examples: any = await db.execute(sql`select id, prompt_type, input_text, regulation_name, expected from golden_examples where prompt_type = ${promptType}`);
    const rows: GoldenExample[] = (examples?.rows ?? examples ?? []) as any;
    let total = 0;
    let sum = 0;

    for (const ex of rows) {
      total++;
      const prompt = await this.routePrompt(promptType as any);
      const req = `${prompt}\n\nPOLICY TEXT:\n${ex.input_text}\nREGULATION: ${ex.regulation_name || 'General'}`;
      try {
        const resp = await openai.chat.completions.create({
          model: 'gpt-5',
          messages: [{ role: 'user', content: req }],
          response_format: { type: 'json_object' },
          temperature: 0.1
        });
        const out = JSON.parse(resp.choices[0].message.content || '{}');
        const score = this.scoreOutput(ex.expected || {}, out);
        sum += score;
        await db.execute(sql`insert into eval_results (run_id, example_id, score, details) values (${runId}::uuid, ${ex.id}::uuid, ${score}, ${out}::jsonb)`);
      } catch (err) {
        await db.execute(sql`insert into eval_results (run_id, example_id, score, details) values (${runId}::uuid, ${ex.id}::uuid, 0, ${JSON.stringify({ error: String(err) })}::jsonb)`);
      }
    }

    const avg = total ? sum / total : 0;
    await db.execute(sql`update eval_runs set completed_at = now(), notes = ${`avg=${avg.toFixed(3)} n=${total}` } where id = ${runId}::uuid`);
    return { runId, count: total, averageScore: avg };
  }

  private scoreOutput(expected: any, out: any): number {
    let score = 0;
    // Basic rubric: summary presence, risk level match, recommendations, min score threshold
    if (out.summary && typeof out.summary === 'string') score += 0.25;
    if (expected.riskLevel && out.riskLevel && String(out.riskLevel).toLowerCase().startsWith(String(expected.riskLevel).toLowerCase()[0])) score += 0.25;
    if (expected.hasRecommendations && Array.isArray(out.actionableRecommendations) && out.actionableRecommendations.length > 0) score += 0.25;
    if (typeof expected.minScore === 'number' && typeof out.complianceScore === 'number' && out.complianceScore >= expected.minScore) score += 0.25;
    return score; // 0..1
  }
}

export const aiQualityService = new AIQualityService();
