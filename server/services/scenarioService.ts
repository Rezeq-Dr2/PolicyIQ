import { db } from '../db';
import { sql } from 'drizzle-orm';
import { analyticsService } from './analyticsService';

export class ScenarioService {
  async runScenario(params: { organizationId: string; name: string; hypothesis: any }): Promise<{ id: string }> {
    const { organizationId, name, hypothesis } = params;
    const baseline = await analyticsService.getRiskSummaryQuick(organizationId)
      .catch(() => ({ high: 0, medium: 0, low: 0, total: 0 }));

    const multiplier = this.deriveMultiplier(hypothesis);
    const projected = {
      high: Math.round(baseline.high * multiplier.high),
      medium: Math.round(baseline.medium * multiplier.medium),
      low: Math.round(baseline.low * multiplier.low),
      total: Math.round(baseline.total * ((multiplier.high + multiplier.medium + multiplier.low) / 3)),
    };

    const res: any = await db.execute(sql`
      insert into scenario_simulations (organization_id, name, hypothesis, baseline, projected)
      values (${organizationId}::uuid, ${name}, ${JSON.stringify(hypothesis)}::jsonb, ${JSON.stringify(baseline)}::jsonb, ${JSON.stringify(projected)}::jsonb)
      returning id
    ` as any);
    const id = (res?.rows?.[0]?.id) || (res as any)?.id || '';
    return { id };
  }

  async getScenario(organizationId: string, id: string): Promise<any> {
    const res: any = await db.execute(sql`
      select * from scenario_simulations where organization_id = ${organizationId}::uuid and id = ${id}::uuid
    ` as any);
    return (res?.rows ?? [])[0] || null;
  }

  private deriveMultiplier(hypothesis: any): { high: number; medium: number; low: number } {
    const text = JSON.stringify(hypothesis || '').toLowerCase();
    const inc = /stricter|new|tighten|additional|expanded/.test(text);
    const dec = /relax|sunset|deprecate|reduce/.test(text);
    if (inc && !dec) return { high: 1.2, medium: 1.1, low: 1.05 };
    if (dec && !inc) return { high: 0.85, medium: 0.9, low: 0.95 };
    return { high: 1.0, medium: 1.0, low: 1.0 };
  }
}

export const scenarioService = new ScenarioService();
