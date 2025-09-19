import { db } from '../db';
import { sql } from 'drizzle-orm';
import { kmsService } from './kms';

export class DsnService {
  async createSource(params: { organizationId: string; name: string; type: string; config: any }): Promise<{ id: string }> {
    const { organizationId, name, type, config } = params;
    const enc = await kmsService.encryptJsonForOrg(organizationId, config);
    const res: any = await db.execute(sql`insert into data_sources (organization_id, name, type, config, config_enc) values (${organizationId}::uuid, ${name}, ${type}, ${JSON.stringify(config)}::jsonb, ${enc}::bytea) returning id` as any);
    return { id: (res?.rows ?? [])[0].id };
  }

  async listSources(organizationId: string): Promise<any[]> {
    const res: any = await db.execute(sql`select id, name, type, config, config_enc, created_at from data_sources where organization_id=${organizationId}::uuid order by created_at desc` as any);
    const rows = res?.rows ?? [];
    const out = [] as any[];
    for (const r of rows) {
      const dec = await kmsService.decryptJsonForOrg(organizationId, r.config_enc as Buffer | null | undefined);
      out.push({ id: r.id, name: r.name, type: r.type, config: dec || r.config, created_at: r.created_at });
    }
    return out;
  }
}

export const dsnService = new DsnService();


