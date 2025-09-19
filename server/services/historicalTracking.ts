import { db } from "../db";
import {
  complianceTrends,
  complianceReports,
  analysisResults,
  regulations,
  policyDocuments,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { regulationClauses } from "@shared/schema";

export class HistoricalTrackingService {
  static async trackAnalysis(reportId: string, analysisData: any): Promise<void> {
    // Persist to compliance_trends based on the final report state
    const reportRows = await db
      .select()
      .from(complianceReports)
      .where(eq(complianceReports.id, reportId));

    const report = reportRows[0];
    if (!report) return;

    const policy = await db
      .select({ id: policyDocuments.id })
      .from(policyDocuments)
      .where(eq(policyDocuments.id, report.policyDocumentId))
      .then(r => r[0]);

    // Determine regulation context:
    // If analysis results had matched clauses, we can infer a regulation; otherwise, leave null
    const matched = await db
      .select({ clauseId: analysisResults.matchedRegulationClauseId })
      .from(analysisResults)
      .where(eq(analysisResults.reportId, reportId));

    let regulationId: string | undefined = undefined;
    if (matched.length > 0 && matched[0].clauseId) {
      const clause = await db
        .select({ regulationId: regulationClauses.regulationId })
        .from(regulationClauses)
        .where(eq(regulationClauses.id, matched[0].clauseId))
        .then(r => r[0]);
      regulationId = clause?.regulationId;
    }

    await db.insert(complianceTrends).values({
      organizationId: report.organizationId,
      policyDocumentId: policy?.id || report.policyDocumentId,
      regulationId: regulationId as any,
      complianceReportId: report.id,
      overallScore: report.overallScore || 0,
      gapCount: report.gapCount || 0,
      riskLevel: (report.riskLevel as string) || 'Unknown',
      businessImpactScore: null,
      regulatoryRiskScore: null,
      priorityRanking: null,
      remediationUrgency: null,
    });
  }

  static async analyzeComplianceHistory(
    organizationId: string,
    policyDocumentId?: string,
    regulationId?: string,
    periodDays: number = 90
  ): Promise<any> {
    // Minimal implementation: return recent trends
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
    const rows = await db.select()
      .from(complianceTrends)
      .where(eq(complianceTrends.organizationId, organizationId))
      .then(r => r.filter(x => x.measurementDate! >= since && (!policyDocumentId || x.policyDocumentId === policyDocumentId) && (!regulationId || x.regulationId === regulationId)));
    return rows;
  }

  static async compareCompliancePeriods(
    organizationId: string,
    policyDocumentId?: string
  ): Promise<any> {
    const now = new Date();
    const last30 = await this.analyzeComplianceHistory(organizationId, policyDocumentId, undefined, 30);
    const last90 = await this.analyzeComplianceHistory(organizationId, policyDocumentId, undefined, 90);
    return { last30Days: last30, last90Days: last90, generatedAt: now };
  }

  static async getImprovementSuggestions(
    organizationId: string,
    policyDocumentId?: string
  ): Promise<string[]> {
    // Minimal heuristic suggestions based on gaps
    const rows = await db.select()
      .from(complianceTrends)
      .where(eq(complianceTrends.organizationId, organizationId));
    const relevant = policyDocumentId ? rows.filter(r => r.policyDocumentId === policyDocumentId) : rows;
    const gaps = relevant.reduce((sum, r) => sum + (r.gapCount || 0), 0);
    if (gaps > 5) return ["Prioritize high-gap sections for remediation", "Schedule a focused policy review"];
    if (gaps > 0) return ["Address remaining minor gaps", "Verify recent updates improved compliance"];
    return ["Maintain current policy standards", "Monitor regulatory updates"];
  }
}