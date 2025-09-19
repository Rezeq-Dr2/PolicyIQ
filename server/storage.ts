import {
  users,
  organizations,
  policyDocuments,
  complianceReports,
  analysisResults,
  regulationClauses,
  regulations,
  complianceTrends,
  complianceImprovements,
  executiveReports,
  kpiDashboards,
  reportSchedules,
  biExports,
  regulatorySources,
  regulatoryUpdates,
  crawlerJobs,
  regulatoryNotifications,
  updateImpactAssessments,
  type User,
  type UpsertUser,
  type Organization,
  type InsertOrganization,
  type PolicyDocument,
  type InsertPolicyDocument,
  type ComplianceReport,
  type InsertComplianceReport,
  type AnalysisResult,
  type InsertAnalysisResult,
  type Regulation,
  type RegulationClause,
  type ComplianceTrend,
  type InsertComplianceTrend,
  type ComplianceImprovement,
  type InsertComplianceImprovement,
  type InsertRegulation,
  type InsertRegulationClause,
  type ExecutiveReport,
  type KpiDashboard,
  type ReportSchedule,
  type BiExport,
  type RegulatorySource,
  type RegulatoryUpdate,
  type CrawlerJob,
  type RegulatoryNotification,
  type UpdateImpactAssessment,
  promptFeedback,
  promptVersions,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, inArray } from "drizzle-orm";

export interface IStorage {
  // User operations - mandatory for Replit Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getOrganizationUsers(organizationId: string): Promise<User[]>;
  
  // Organization operations
  createOrganization(organization: InsertOrganization): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | undefined>;
  
  // Policy document operations
  createPolicyDocument(document: InsertPolicyDocument): Promise<PolicyDocument>;
  getPolicyDocuments(organizationId: string): Promise<PolicyDocument[]>;
  getPolicyDocument(id: string): Promise<PolicyDocument | undefined>;
  updatePolicyDocument(id: string, updates: Partial<PolicyDocument>): Promise<PolicyDocument>;
  
  // Compliance report operations
  createComplianceReport(report: InsertComplianceReport): Promise<ComplianceReport>;
  getComplianceReports(organizationId: string): Promise<ComplianceReport[]>;
  getComplianceReport(id: string): Promise<ComplianceReport | undefined>;
  updateComplianceReport(id: string, updates: Partial<ComplianceReport>): Promise<ComplianceReport>;
  
  // Analysis result operations
  createAnalysisResult(result: InsertAnalysisResult): Promise<AnalysisResult>;
  getAnalysisResults(reportId: string): Promise<AnalysisResult[]>;
  getAnalysisResultsForReports(reportIds: string[]): Promise<AnalysisResult[]>;
  
  // Regulation operations
  getActiveRegulations(): Promise<Regulation[]>;
  getAllRegulations(): Promise<Regulation[]>;
  getRegulation(id: string): Promise<Regulation | undefined>;
  createRegulation(regulation: InsertRegulation): Promise<Regulation>;
  updateRegulation(id: string, updates: Partial<Regulation>): Promise<Regulation | undefined>;
  deleteRegulation(id: string): Promise<boolean>;
  getRegulationClauses(regulationId: string): Promise<RegulationClause[]>;
  getAllRegulationClauses(): Promise<RegulationClause[]>;
  createRegulationClause(clause: InsertRegulationClause): Promise<RegulationClause>;
  updateRegulationClause(id: string, updates: Partial<RegulationClause>): Promise<RegulationClause | undefined>;
  deleteRegulationClause(id: string): Promise<boolean>;
  
  // Historical tracking operations
  createComplianceTrend(trend: InsertComplianceTrend): Promise<ComplianceTrend>;
  getComplianceTrends(organizationId: string, policyDocumentId?: string, regulationId?: string, periodDays?: number): Promise<ComplianceTrend[]>;
  createComplianceImprovement(improvement: InsertComplianceImprovement): Promise<ComplianceImprovement>;
  getComplianceImprovements(organizationId: string, policyDocumentId?: string, periodDays?: number): Promise<ComplianceImprovement[]>;
  
  // Executive reporting operations
  getExecutiveReports(organizationId: string): Promise<ExecutiveReport[]>;
  getKPIDashboards(organizationId: string, stakeholderType?: string): Promise<KpiDashboard[]>;
  getReportSchedules(organizationId: string): Promise<ReportSchedule[]>;
  getBIExports(organizationId: string): Promise<BiExport[]>;
  
  // Regulatory crawler operations
  getRegulatorySourcesForOrganization(organizationId: string): Promise<RegulatorySource[]>;
  getRegulatoryUpdates(organizationId: string, status?: string): Promise<RegulatoryUpdate[]>;
  getCrawlerJobs(sourceId?: string): Promise<CrawlerJob[]>;
  getRegulatoryNotifications(organizationId: string): Promise<RegulatoryNotification[]>;
  getUpdateImpactAssessments(organizationId: string): Promise<UpdateImpactAssessment[]>;

  // Prompt refinement storage
  createPromptFeedback(data: any): Promise<void>;
  getRecentPromptFeedback(promptId: string, limit: number): Promise<any[]>;
  getActivePromptVersion(promptType: string): Promise<any | undefined>;
  getPromptVersion(promptId: string): Promise<any | undefined>;
  createPromptVersion(data: any): Promise<void>;
  updatePromptVersion(promptId: string, updates: any): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations - mandatory for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Check if user already exists
    const existingUser = userData.id ? await this.getUser(userData.id) : undefined;
    
    if (existingUser && userData.id) {
      // Update existing user
      const [user] = await db
        .update(users)
        .set({
          ...userData,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userData.id))
        .returning();
      return user;
    }

    // Create organization for new user if none provided
    let organizationId = userData.organizationId;
    if (!organizationId) {
      const org = await this.createOrganization({
        name: `${userData.firstName || userData.email?.split('@')[0] || 'User'}'s Organization`,
      } as any);
      organizationId = org.id;
    }

    // Create new user with organization
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        organizationId,
      })
      .returning();
    return user;
  }

  // Organization operations
  async createOrganization(organization: InsertOrganization): Promise<Organization> {
    const [org] = await db
      .insert(organizations)
      .values(organization)
      .returning();
    return org;
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
    return org;
  }

  async getOrganizationUsers(organizationId: string): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(eq(users.organizationId, organizationId));
  }

  // Policy document operations
  async createPolicyDocument(document: InsertPolicyDocument): Promise<PolicyDocument> {
    const [doc] = await db
      .insert(policyDocuments)
      .values(document)
      .returning();
    return doc;
  }

  async getPolicyDocuments(organizationId: string): Promise<PolicyDocument[]> {
    return await db
      .select()
      .from(policyDocuments)
      .where(eq(policyDocuments.organizationId, organizationId))
      .orderBy(desc(policyDocuments.uploadedAt));
  }

  async getPolicyDocument(id: string): Promise<PolicyDocument | undefined> {
    const [doc] = await db.select().from(policyDocuments).where(eq(policyDocuments.id, id));
    return doc;
  }

  async updatePolicyDocument(id: string, updates: Partial<PolicyDocument>): Promise<PolicyDocument> {
    const [doc] = await db
      .update(policyDocuments)
      .set(updates)
      .where(eq(policyDocuments.id, id))
      .returning();
    return doc;
  }

  // Compliance report operations
  async createComplianceReport(report: InsertComplianceReport): Promise<ComplianceReport> {
    const [rep] = await db
      .insert(complianceReports)
      .values(report)
      .returning();
    return rep;
  }

  async getComplianceReports(organizationId: string): Promise<ComplianceReport[]> {
    return await db
      .select()
      .from(complianceReports)
      .where(eq(complianceReports.organizationId, organizationId))
      .orderBy(desc(complianceReports.createdAt));
  }

  async getComplianceReport(id: string): Promise<ComplianceReport | undefined> {
    const [report] = await db.select().from(complianceReports).where(eq(complianceReports.id, id));
    return report;
  }

  async updateComplianceReport(id: string, updates: Partial<ComplianceReport>): Promise<ComplianceReport> {
    const [report] = await db
      .update(complianceReports)
      .set(updates)
      .where(eq(complianceReports.id, id))
      .returning();
    return report;
  }

  // Analysis result operations
  async createAnalysisResult(result: InsertAnalysisResult): Promise<AnalysisResult> {
    const [res] = await db
      .insert(analysisResults)
      .values(result)
      .returning();
    return res;
  }

  async getAnalysisResults(reportId: string): Promise<AnalysisResult[]> {
    return await db
      .select()
      .from(analysisResults)
      .where(eq(analysisResults.reportId, reportId))
      .orderBy(desc(analysisResults.createdAt));
  }

  async getAnalysisResultsForReports(reportIds: string[]): Promise<AnalysisResult[]> {
    if (reportIds.length === 0) return [];
    return await db
      .select()
      .from(analysisResults)
      .where(inArray(analysisResults.reportId, reportIds))
      .orderBy(desc(analysisResults.createdAt));
  }

  // Regulation operations
  async getActiveRegulations(): Promise<Regulation[]> {
    return await db
      .select()
      .from(regulations)
      .where(eq(regulations.isActive, true));
  }

  async getRegulationClauses(regulationId: string): Promise<RegulationClause[]> {
    return await db
      .select()
      .from(regulationClauses)
      .where(eq(regulationClauses.regulationId, regulationId));
  }

  async getAllRegulationClauses(): Promise<RegulationClause[]> {
    return await db.select().from(regulationClauses);
  }

  async getAllRegulations(): Promise<Regulation[]> {
    return await db
      .select()
      .from(regulations)
      .orderBy(desc(regulations.createdAt));
  }

  async getRegulation(id: string): Promise<Regulation | undefined> {
    const [regulation] = await db
      .select()
      .from(regulations)
      .where(eq(regulations.id, id));
    return regulation;
  }

  async createRegulation(regulationData: InsertRegulation): Promise<Regulation> {
    const [regulation] = await db
      .insert(regulations)
      .values(regulationData)
      .returning();
    return regulation;
  }

  async updateRegulation(id: string, updates: Partial<Regulation>): Promise<Regulation | undefined> {
    const [regulation] = await db
      .update(regulations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(regulations.id, id))
      .returning();
    return regulation;
  }

  async deleteRegulation(id: string): Promise<boolean> {
    try {
      // First delete all related clauses
      await db
        .delete(regulationClauses)
        .where(eq(regulationClauses.regulationId, id));
      
      // Then delete the regulation
      const result = await db
        .delete(regulations)
        .where(eq(regulations.id, id));
      
      return true;
    } catch (error) {
      console.error("Error deleting regulation:", error);
      return false;
    }
  }

  async createRegulationClause(clauseData: InsertRegulationClause): Promise<RegulationClause> {
    const [clause] = await db
      .insert(regulationClauses)
      .values(clauseData)
      .returning();
    return clause;
  }

  async updateRegulationClause(id: string, updates: Partial<RegulationClause>): Promise<RegulationClause | undefined> {
    const [clause] = await db
      .update(regulationClauses)
      .set(updates)
      .where(eq(regulationClauses.id, id))
      .returning();
    return clause;
  }

  async deleteRegulationClause(id: string): Promise<boolean> {
    try {
      await db
        .delete(regulationClauses)
        .where(eq(regulationClauses.id, id));
      return true;
    } catch (error) {
      console.error("Error deleting regulation clause:", error);
      return false;
    }
  }

  // Historical tracking operations
  async createComplianceTrend(trend: InsertComplianceTrend): Promise<ComplianceTrend> {
    const [result] = await db
      .insert(complianceTrends)
      .values(trend)
      .returning();
    return result;
  }

  async getComplianceTrends(
    organizationId: string,
    policyDocumentId?: string,
    regulationId?: string,
    periodDays?: number
  ): Promise<ComplianceTrend[]> {
    const conditions = [eq(complianceTrends.organizationId, organizationId)];
    
    if (policyDocumentId) {
      conditions.push(eq(complianceTrends.policyDocumentId, policyDocumentId));
    }
    
    if (regulationId) {
      conditions.push(eq(complianceTrends.regulationId, regulationId));
    }
    
    let query = db
      .select()
      .from(complianceTrends)
      .where(and(...conditions))
      .orderBy(desc(complianceTrends.measurementDate));

    // If period is specified, add date filter (this would need sql`date >= current_date - interval '${periodDays} days'` in real implementation)
    return await query;
  }

  async createComplianceImprovement(improvement: InsertComplianceImprovement): Promise<ComplianceImprovement> {
    const [result] = await db
      .insert(complianceImprovements)
      .values(improvement)
      .returning();
    return result;
  }

  async getComplianceImprovements(
    organizationId: string,
    policyDocumentId?: string,
    periodDays?: number
  ): Promise<ComplianceImprovement[]> {
    const conditions = [eq(complianceImprovements.organizationId, organizationId)];
    
    if (policyDocumentId) {
      conditions.push(eq(complianceImprovements.policyDocumentId, policyDocumentId));
    }
    
    // If period is specified, add date filter (simplified for now)
    
    return await db
      .select()
      .from(complianceImprovements)
      .where(and(...conditions))
      .orderBy(desc(complianceImprovements.implementedAt));
  }

  // Executive reporting operations
  async getExecutiveReports(organizationId: string): Promise<ExecutiveReport[]> {
    return await db
      .select()
      .from(executiveReports)
      .where(eq(executiveReports.organizationId, organizationId))
      .orderBy(desc(executiveReports.createdAt));
  }

  async getKPIDashboards(organizationId: string, stakeholderType?: string): Promise<KpiDashboard[]> {
    const conditions = [eq(kpiDashboards.organizationId, organizationId)];
    
    if (stakeholderType) {
      conditions.push(eq(kpiDashboards.stakeholderType, stakeholderType));
    }
    
    return await db
      .select()
      .from(kpiDashboards)
      .where(and(...conditions))
      .orderBy(desc(kpiDashboards.createdAt));
  }

  async getReportSchedules(organizationId: string): Promise<ReportSchedule[]> {
    return await db
      .select()
      .from(reportSchedules)
      .where(eq(reportSchedules.organizationId, organizationId))
      .orderBy(desc(reportSchedules.createdAt));
  }

  async getBIExports(organizationId: string): Promise<BiExport[]> {
    return await db
      .select()
      .from(biExports)
      .where(eq(biExports.organizationId, organizationId))
      .orderBy(desc(biExports.createdAt));
  }

  // Regulatory crawler operations
  async getRegulatorySourcesForOrganization(organizationId: string): Promise<RegulatorySource[]> {
    // For now, return all active sources since sources aren't organization-specific
    // In the future, this could be filtered based on organization's regulatory scope
    return await db
      .select()
      .from(regulatorySources)
      .where(eq(regulatorySources.isActive, true))
      .orderBy(desc(regulatorySources.priority));
  }

  async getRegulatoryUpdates(
    organizationId: string,
    status?: string,
    limit?: number
  ): Promise<RegulatoryUpdate[]> {
    const conditions = [eq(regulatoryNotifications.organizationId, organizationId)];
    if (status) {
      conditions.push(eq(regulatoryUpdates.status, status));
    }

    const rows = await db
      .select({ update: regulatoryUpdates })
      .from(regulatoryUpdates)
      .innerJoin(
        regulatoryNotifications,
        eq(regulatoryNotifications.updateId, regulatoryUpdates.id)
      )
      .where(and(...conditions))
      .orderBy(desc(regulatoryUpdates.createdAt))
      .limit(typeof limit === 'number' ? limit : 100);

    return rows.map((r) => r.update);
  }

  async getCrawlerJobs(sourceId?: string): Promise<CrawlerJob[]> {
    const conditions = [];
    
    if (sourceId) {
      conditions.push(eq(crawlerJobs.sourceId, sourceId));
    }
    
    return await db
      .select()
      .from(crawlerJobs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(crawlerJobs.createdAt));
  }

  async getRegulatoryNotifications(organizationId: string): Promise<RegulatoryNotification[]> {
    return await db
      .select()
      .from(regulatoryNotifications)
      .where(eq(regulatoryNotifications.organizationId, organizationId))
      .orderBy(desc(regulatoryNotifications.createdAt));
  }

  async getUpdateImpactAssessments(organizationId: string): Promise<UpdateImpactAssessment[]> {
    return await db
      .select()
      .from(updateImpactAssessments)
      .where(eq(updateImpactAssessments.organizationId, organizationId))
      .orderBy(desc(updateImpactAssessments.createdAt));
  }

  // Prompt refinement storage implementations
  async createPromptFeedback(data: any): Promise<void> {
    await db.insert(promptFeedback).values({
      id: data.id,
      promptId: data.promptId,
      analysisId: data.analysisId,
      userFeedback: data.userFeedback,
      specificIssues: data.specificIssues,
      expectedOutput: data.expectedOutput,
      createdAt: data.createdAt,
    });
  }

  async getRecentPromptFeedback(promptId: string, limit: number): Promise<any[]> {
    return await db.select().from(promptFeedback)
      .where(eq(promptFeedback.promptId, promptId))
      .orderBy(desc(promptFeedback.createdAt))
      .limit(limit);
  }

  async getActivePromptVersion(promptType: string): Promise<any | undefined> {
    const rows = await db.select().from(promptVersions)
      .where(and(eq(promptVersions.promptType, promptType), eq(promptVersions.isActive, true)))
      .orderBy(desc(promptVersions.version))
      .limit(1);
    return rows[0];
  }

  async getPromptVersion(promptId: string): Promise<any | undefined> {
    const rows = await db.select().from(promptVersions)
      .where(eq(promptVersions.id, promptId))
      .limit(1);
    return rows[0];
  }

  async createPromptVersion(data: any): Promise<void> {
    await db.insert(promptVersions).values({
      id: data.id,
      promptType: data.promptType,
      version: data.version,
      promptText: data.promptText,
      performance: data.performance,
      isActive: data.isActive,
      createdAt: data.createdAt,
    });
  }

  async updatePromptVersion(promptId: string, updates: any): Promise<void> {
    await db.update(promptVersions)
      .set(updates)
      .where(eq(promptVersions.id, promptId));
  }
}

export const storage = new DatabaseStorage();
