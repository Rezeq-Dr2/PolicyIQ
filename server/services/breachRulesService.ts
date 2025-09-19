import { db } from '../db';
import { sql } from 'drizzle-orm';

export class BreachRulesService {
  async upsertRule(params: { regulator: string; deadlineHours: number; template?: string }): Promise<any> {
    const { regulator, deadlineHours, template } = params;
    const res: any = await db.execute(sql`
      insert into breach_rules (regulator, deadline_hours, template)
      values (${regulator}, ${deadlineHours}, ${template || null})
      on conflict (regulator) do update set deadline_hours=excluded.deadline_hours, template=excluded.template
      returning *
    ` as any);
    return (res?.rows ?? [])[0];
  }

  async getRule(regulator: string): Promise<{ deadline_hours: number; template?: string } | null> {
    const res: any = await db.execute(sql`select deadline_hours, template from breach_rules where regulator=${regulator}` as any);
    const r = (res?.rows ?? [])[0];
    if (!r) return null;
    return { deadline_hours: Number(r.deadline_hours)||72, template: r.template || undefined };
  }
}

export const breachRulesService = new BreachRulesService();


