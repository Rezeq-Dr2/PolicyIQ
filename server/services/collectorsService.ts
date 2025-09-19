import { db } from '../db';
import { sql } from 'drizzle-orm';
import { kmsService } from './kms';

export class CollectorsService {
  async createCollector(params: { organizationId: string; name: string; type: 'http_json'|'sql'|'s3'|'gcs'|'saas_http'; config: any }): Promise<{ id: string }> {
    const { organizationId, name, type, config } = params;
    const enc = await kmsService.encryptJsonForOrg(organizationId, config);
    const res: any = await db.execute(sql`insert into collectors (organization_id, name, type, config, config_enc) values (${organizationId}::uuid, ${name}, ${type}, ${JSON.stringify(config)}::jsonb, ${enc}::bytea) returning id` as any);
    return { id: (res?.rows ?? [])[0].id };
  }

  async runCollector(params: { collectorId: string }): Promise<{ runId: string; items: number }> {
    const { collectorId } = params;
    const col: any = await db.execute(sql`select c.id, c.organization_id, c.type, c.config, c.config_enc from collectors c where c.id=${collectorId}::uuid` as any);
    const c = (col?.rows ?? [])[0];
    if (!c) throw new Error('collector not found');
    const run: any = await db.execute(sql`insert into collector_runs (collector_id, status) values (${collectorId}::uuid, 'running') returning id` as any);
    const runId = (run?.rows ?? [])[0].id as string;
    let items = 0;
    try {
      if (c.type === 'http_json') {
        const cfg = await kmsService.decryptJsonForOrg(c.organization_id, c.config_enc) || c.config;
        const url = cfg?.url as string;
        if (!url) throw new Error('missing url');
        const resp = await fetch(url);
        const data = await resp.json();
        await db.execute(sql`insert into evidence_items (organization_id, task_id, report_id, kind, content, uploaded_by) values (${c.organization_id}::uuid, ${null}, ${null}, ${'collector'}, ${JSON.stringify(data)}::jsonb, ${'system'})` as any);
        items++;
      } else if (c.type === 'sql') {
        const cfg = await kmsService.decryptJsonForOrg(c.organization_id, c.config_enc) || c.config;
        const dsn = cfg?.dsn as string;
        const query = cfg?.query as string;
        if (!dsn || !query) throw new Error('missing dsn/query');
        const { Client } = await import('pg');
        const client: any = new (Client as any)({ connectionString: dsn, ssl: { rejectUnauthorized: false } });
        await client.connect();
        try {
          const res = await client.query(query);
          await db.execute(sql`insert into evidence_items (organization_id, task_id, report_id, kind, content, uploaded_by) values (${c.organization_id}::uuid, ${null}, ${null}, ${'collector'}, ${JSON.stringify(res.rows)}::jsonb, ${'system'})` as any);
          items += res.rowCount || res.rows?.length || 0;
        } finally { await client.end(); }
      } else if (c.type === 's3' || c.type === 'gcs') {
        const cfg = await kmsService.decryptJsonForOrg(c.organization_id, c.config_enc) || c.config;
        const url = cfg?.url as string; // presigned or public
        if (!url) throw new Error('missing url');
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`fetch failed ${resp.status}`);
        const contentType = resp.headers.get('content-type') || '';
        let payload: any;
        if (contentType.includes('application/json')) payload = await resp.json();
        else payload = await resp.text();
        await db.execute(sql`insert into evidence_items (organization_id, task_id, report_id, kind, content, uploaded_by) values (${c.organization_id}::uuid, ${null}, ${null}, ${'collector'}, ${JSON.stringify({ url, contentType, payload })}::jsonb, ${'system'})` as any);
        items++;
      } else if (c.type === 'saas_http') {
        const cfg = await kmsService.decryptJsonForOrg(c.organization_id, c.config_enc) || c.config;
        let url: string | undefined = cfg?.url;
        if (!url) throw new Error('missing url');
        const headers = cfg?.headers || {};
        const method = (cfg?.method || 'GET').toUpperCase();
        const body = cfg?.body ? JSON.stringify(cfg.body) : undefined;
        const jsonPath: string | undefined = cfg?.jsonPath; // e.g., "data.items"
        const nextField: string | undefined = cfg?.nextField; // where to find next URL/token
        const maxPages = Math.min(5, parseInt(String(cfg?.maxPages || '1')));
        let page = 0;
        while (url && page < maxPages) {
          const resp: any = await fetch(url, { method, headers, body } as any);
          if (!resp.ok) throw new Error(`fetch failed ${resp.status}`);
          const payload: any = await (resp.json().catch(async () => ({ raw: await resp.text() })) as any);
          let data = payload;
          if (jsonPath && typeof payload === 'object' && payload) {
            try {
              data = jsonPath.split('.').reduce((acc: any, k: string) => (acc ? acc[k] : undefined), payload);
            } catch {}
          }
          await db.execute(sql`insert into evidence_items (organization_id, task_id, report_id, kind, content, uploaded_by) values (${c.organization_id}::uuid, ${null}, ${null}, ${'collector'}, ${JSON.stringify({ url, data })}::jsonb, ${'system'})` as any);
          items += Array.isArray(data) ? data.length : 1;
          url = (nextField && payload && payload[nextField]) ? String(payload[nextField]) : undefined;
          page++;
        }
      }
      await db.execute(sql`update collector_runs set status='completed', finished_at=now(), result=${JSON.stringify({ items })}::jsonb where id=${runId}::uuid` as any);
    } catch (e) {
      await db.execute(sql`update collector_runs set status='failed', finished_at=now(), result=${JSON.stringify({ error: String((e as any)?.message || e) })}::jsonb where id=${runId}::uuid` as any);
      throw e;
    }
    return { runId, items };
  }
}

export const collectorsService = new CollectorsService();


