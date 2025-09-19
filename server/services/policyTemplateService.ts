import { db } from '../db';
import { sql } from 'drizzle-orm';

export class PolicyTemplateService {
  async createTemplate(params: { organizationId?: string; title: string; content: string; framework?: string; version?: string; isGlobal?: boolean }): Promise<{ id: string }> {
    const { organizationId, title, content, framework, version, isGlobal } = params;
    const res: any = await db.execute(sql`insert into policy_templates (organization_id, title, content, framework, version, is_global) values (${organizationId || null}::uuid, ${title}, ${content}, ${framework || null}, ${version || null}, ${!!isGlobal}) returning id` as any);
    return { id: (res?.rows ?? [])[0].id };
  }

  async listTemplates(orgId?: string): Promise<any[]> {
    const res: any = await db.execute(sql`select * from policy_templates where ${orgId ? sql`organization_id = ${orgId}::uuid or is_global=true` : sql`is_global=true`} order by created_at desc` as any);
    return res?.rows ?? [];
  }
}

export const policyTemplateService = new PolicyTemplateService();


