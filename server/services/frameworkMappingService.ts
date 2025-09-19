import { sql } from 'drizzle-orm';
import { db } from '../db';
import { EnhancedVectorDatabaseService } from './enhancedVectorDatabase';

export class FrameworkMappingService {
  private vectorDb = new EnhancedVectorDatabaseService();

  async mapControls(params: { organizationId: string; frameworkName: string; controls: Array<{ id: string; text: string }>; topK?: number; persist?: boolean }): Promise<{ runId: string; coveragePercent: number; mapping: any[] }> {
    const { organizationId, frameworkName, controls, topK = 3, persist = true } = params;
    const mapping: any[] = [];
    let covered = 0;
    for (const control of controls) {
      const hits: any[] = await this.vectorDb.performHybridSearch(control.text, topK);
      const mapped = hits.map((h: any) => ({ clauseId: h.id, score: (h as any).score ?? 0.0, preview: (h as any).content?.slice(0, 200) }));
      if (mapped.length) covered++;
      mapping.push({ controlId: control.id, matches: mapped });
    }
    const coveragePercent = controls.length ? Math.round((covered / controls.length) * 100) : 0;

    let runId = '';
    if (persist) {
      const res: any = await db.execute(sql`
        insert into framework_mapping_runs (organization_id, framework_name, input_controls, mapping, coverage_percent)
        values (${organizationId}::uuid, ${frameworkName}, ${JSON.stringify(controls)}::jsonb, ${JSON.stringify(mapping)}::jsonb, ${coveragePercent})
        returning id
      ` as any);
      runId = (res?.rows?.[0]?.id) || (res as any)?.id || '';
    }
    return { runId, coveragePercent, mapping };
  }
}

export const frameworkMappingService = new FrameworkMappingService();
