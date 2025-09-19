import { db } from '../db';
import { sql } from 'drizzle-orm';

export class ActiveLearningService {
  async recordFeedback(params: { organizationId: string; reportId?: string; analysisId?: string; label: 'accurate'|'inaccurate'|'incomplete'; rationale?: string }): Promise<void> {
    const { organizationId, reportId, analysisId, label, rationale } = params;
    await db.execute(sql`
      insert into user_feedback_events (organization_id, report_id, analysis_id, label, rationale)
      values (${organizationId}::uuid, ${reportId || null}, ${analysisId || null}, ${label}, ${rationale || null})
    ` as any);
  }

  async sampleHardExamples(organizationId: string, limit: number = 20): Promise<any[]> {
    const res: any = await db.execute(sql`
      select * from user_feedback_events
      where organization_id = ${organizationId}::uuid and label in ('inaccurate','incomplete')
      order by created_at desc limit ${limit}
    ` as any);
    return res?.rows ?? [];
  }
}

export const activeLearningService = new ActiveLearningService();
