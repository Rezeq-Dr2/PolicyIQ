import { db } from '../db';
import { sql } from 'drizzle-orm';
import { breachRulesService } from './breachRulesService';

export class BreachService {
  private computeDeadline(discoveredAtIso?: string): string {
    const d = discoveredAtIso ? new Date(discoveredAtIso) : new Date();
    return new Date(d.getTime() + 72 * 60 * 60 * 1000).toISOString();
  }

  async createIncident(params: { organizationId: string; description?: string; dataSubjectsEstimate?: number; regulators?: any; severity?: string; cause?: string; discoveredAt?: string }): Promise<{ id: string }> {
    const { organizationId, description, dataSubjectsEstimate, regulators, severity, cause, discoveredAt } = params;
    const ins: any = await db.execute(sql`
      insert into incidents (organization_id, discovered_at, description, data_subjects_estimate, regulators, severity, cause, status)
      values (${organizationId}::uuid, ${discoveredAt || null}, ${description || ''}, ${dataSubjectsEstimate || null}, ${JSON.stringify(regulators || {})}::jsonb, ${severity || null}, ${cause || null}, 'open')
      returning id, discovered_at
    ` as any);
    const row = (ins?.rows ?? [])[0];
    const regulatorsList: string[] = Array.isArray(regulators) ? regulators : (regulators?.list || ['ICO']);
    for (const reg of regulatorsList) {
      const rule = await breachRulesService.getRule(String(reg));
      const deadline = rule ? new Date((row?.discovered_at || new Date()).getTime() + (rule.deadline_hours||72)*60*60*1000).toISOString() : this.computeDeadline(row?.discovered_at);
      await db.execute(sql`insert into breach_notifications (incident_id, regulator, deadline_at, status) values (${row.id}::uuid, ${String(reg)}, ${deadline}, 'pending')` as any);
    }
    return { id: row.id };
  }

  async submitNotification(params: { organizationId: string; id: string; content: string }): Promise<void> {
    const { id, content } = params;
    await db.execute(sql`update breach_notifications set submitted_at = now(), content = ${content}, status = 'submitted' where id=${id}::uuid` as any);
  }
}

export const breachService = new BreachService();


