import { db } from '../db';
import { sql } from 'drizzle-orm';

export class HealthSafetyService {
  async createRiskAssessment(params: { organizationId: string; activity: string; location?: string; assessorUserId?: string; date?: string }): Promise<{ id: string }> {
    const { organizationId, activity, location, assessorUserId, date } = params;
    const res: any = await db.execute(sql`insert into hs_risk_assessments (organization_id, activity, location, assessor_user_id, date) values (${organizationId}::uuid, ${activity}, ${location || null}, ${assessorUserId || null}::uuid, ${date || null}) returning id` as any);
    return { id: (res?.rows ?? [])[0].id };
  }

  async addRiskFinding(params: { assessmentId: string; hazard: string; likelihood: string; severity: string; controlMeasures?: string }): Promise<void> {
    const { assessmentId, hazard, likelihood, severity, controlMeasures } = params;
    const scoreMap: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    const riskScore = (scoreMap[likelihood.toLowerCase()] || 1) * (scoreMap[severity.toLowerCase()] || 1);
    await db.execute(sql`insert into hs_risk_findings (assessment_id, hazard, likelihood, severity, risk_score, control_measures) values (${assessmentId}::uuid, ${hazard}, ${likelihood}, ${severity}, ${riskScore}, ${controlMeasures || null})` as any);
  }

  async reportIncident(params: { organizationId: string; occurredAt: string; description: string; location?: string; injured?: boolean; severity?: string }): Promise<{ id: string }> {
    const { organizationId, occurredAt, description, location, injured, severity } = params;
    const res: any = await db.execute(sql`insert into hs_incidents (organization_id, occurred_at, location, description, injured, severity, status) values (${organizationId}::uuid, ${occurredAt}, ${location || null}, ${description}, ${!!injured}, ${severity || null}, 'open') returning id` as any);
    return { id: (res?.rows ?? [])[0].id };
  }

  async createTraining(params: { organizationId: string; title: string; type?: string; validityDays?: number }): Promise<{ id: string }> {
    const { organizationId, title, type, validityDays } = params;
    const res: any = await db.execute(sql`insert into trainings (organization_id, title, type, validity_days) values (${organizationId}::uuid, ${title}, ${type || null}, ${validityDays || null}) returning id` as any);
    return { id: (res?.rows ?? [])[0].id };
  }

  async assignTraining(params: { trainingId: string; userId: string; dueAt?: string }): Promise<{ id: string }> {
    const { trainingId, userId, dueAt } = params;
    const res: any = await db.execute(sql`insert into training_assignments (training_id, user_id, due_at) values (${trainingId}::uuid, ${userId}::uuid, ${dueAt || null}) returning id` as any);
    return { id: (res?.rows ?? [])[0].id };
  }

  async completeTraining(params: { assignmentId: string; score?: number }): Promise<void> {
    const { assignmentId, score } = params;
    await db.execute(sql`insert into training_completions (assignment_id, score) values (${assignmentId}::uuid, ${score || null})` as any);
    await db.execute(sql`update training_assignments set status='completed' where id=${assignmentId}::uuid` as any);
  }
}

export const hsService = new HealthSafetyService();


