import { db } from '../db';
import { sql } from 'drizzle-orm';

export class DsnDiscoveryService {
  async runHttpJsonDiscovery(params: { organizationId: string; sourceId: string; url: string; headers?: Record<string, string> }): Promise<{ runId: string; itemsFound: number }> {
    const { organizationId, sourceId, url, headers } = params;
    const run: any = await db.execute(sql`insert into discovery_runs (organization_id, source_id) values (${organizationId}::uuid, ${sourceId}::uuid) returning id` as any);
    const runId = (run?.rows ?? [])[0].id as string;
    let itemsFound = 0;
    try {
      const resp = await fetch(url, { headers: headers as any });
      const data = await resp.json();
      const pushMeta = async (key: string, value: any) => {
        await db.execute(sql`insert into data_source_metadata (source_id, key, value) values (${sourceId}::uuid, ${key}, ${JSON.stringify(value)}::jsonb)` as any);
      };
      if (Array.isArray(data)) {
        for (const item of data.slice(0, 1000)) { await pushMeta('item', item); itemsFound++; }
      } else if (data && typeof data === 'object') {
        await pushMeta('root', data); itemsFound = 1;
      }
      await db.execute(sql`update discovery_runs set status='completed', finished_at=now(), items_found=${itemsFound} where id=${runId}::uuid` as any);
    } catch (e) {
      await db.execute(sql`update discovery_runs set status='failed', finished_at=now(), details=${JSON.stringify({ error: String((e as any)?.message || e) })}::jsonb where id=${runId}::uuid` as any);
      throw e;
    }
    return { runId, itemsFound };
  }
}

export const dsnDiscoveryService = new DsnDiscoveryService();


