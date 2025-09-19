import { storage } from "../storage";
import { AnalysisResult, ComplianceReport, PolicyDocument, Organization } from "@shared/schema";
import { UKRiskAssessmentService } from "./riskAssessment";
import { HistoricalTrackingService } from "./historicalTracking";

export interface ExecutiveSummary {
  organizationName: string;
  reportPeriod: string;
  generatedAt: Date;
  overallComplianceScore: number;
  riskDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  totalPoliciesAnalyzed: number;
  totalGapsIdentified: number;
  priorityActions: string[];
  regulatoryBreakdown: {
    regulation: string;
    score: number;
    status: 'Compliant' | 'Needs Attention' | 'Critical';
    keyIssues: string[];
  }[];
  complianceTrend: 'Improving' | 'Declining' | 'Stable';
  businessImpactAssessment: {
    potentialFineExposure: string;
    reputationalRisk: 'Low' | 'Medium' | 'High' | 'Critical';
    operationalImpact: string;
  };
  keyRecommendations: string[];
  auditTrail: AuditTrailEntry[];
}

export interface AuditTrailEntry {
  timestamp: Date;
  action: string;
  entityType: 'policy' | 'analysis' | 'report' | 'user';
  entityId: string;
  details: string;
  performedBy?: string;
  riskChange?: string;
}

export interface DetailedComplianceReport {
  executiveSummary: ExecutiveSummary;
  policyDetails: {
    document: PolicyDocument;
    complianceScore: number;
    riskLevel: string;
    gapCount: number;
    keyFindings: string[];
    remediationPriority: string;
  }[];
  regulationComparison: {
    regulation: string;
    requirements: number;
    met: number;
    percentage: number;
    criticalGaps: string[];
  }[];
  improvementRoadmap: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
  nextReviewDate: Date;
}

export class ExecutiveReportingService {

  /**
   * Generate comprehensive executive summary for organization
   */
  static async generateExecutiveSummary(
    organizationId: string,
    periodDays: number = 90
  ): Promise<ExecutiveSummary> {
    
    // Get organization details
    const organization = await storage.getOrganization(organizationId);
    if (!organization) {
      throw new Error('Organization not found');
    }

    // Get all compliance reports for the period
    const reports = await storage.getComplianceReports(organizationId);
    const completedReports = reports.filter(r => r.status === 'completed');

    // Get all policies
    const policies = await storage.getPolicyDocuments(organizationId);

    // Calculate overall metrics
    const overallComplianceScore = completedReports.length > 0 
      ? Math.round(completedReports.reduce((sum, r) => sum + (r.overallScore || 0), 0) / completedReports.length)
      : 0;

    const totalGapsIdentified = completedReports.reduce((sum, r) => sum + (r.gapCount || 0), 0);

    // Calculate risk distribution
    const riskDistribution = {
      critical: completedReports.filter(r => r.riskLevel === 'Critical').length,
      high: completedReports.filter(r => r.riskLevel === 'High').length,
      medium: completedReports.filter(r => r.riskLevel === 'Medium').length,
      low: completedReports.filter(r => r.riskLevel === 'Low').length,
    };

    // Get compliance trends
    const complianceHistory = await HistoricalTrackingService.analyzeComplianceHistory(
      organizationId,
      undefined,
      undefined,
      periodDays
    );

    // Generate regulatory breakdown
    const regulatoryBreakdown = await this.generateRegulatoryBreakdown(completedReports);

    // Calculate business impact
    const businessImpactAssessment = this.calculateBusinessImpact(completedReports, riskDistribution);

    // Generate priority actions
    const priorityActions = this.generatePriorityActions(completedReports, complianceHistory);

    // Generate key recommendations
    const keyRecommendations = await this.generateKeyRecommendations(
      organizationId,
      completedReports,
      complianceHistory
    );

    // Generate audit trail
    const auditTrail = await this.generateAuditTrail(organizationId, periodDays);

    return {
      organizationName: organization.name,
      reportPeriod: this.formatReportPeriod(periodDays),
      generatedAt: new Date(),
      overallComplianceScore,
      riskDistribution,
      totalPoliciesAnalyzed: policies.length,
      totalGapsIdentified,
      priorityActions,
      regulatoryBreakdown,
      complianceTrend: complianceHistory.overallTrend,
      businessImpactAssessment,
      keyRecommendations,
      auditTrail
    };
  }

  /**
   * Generate detailed compliance report for executive review
   */
  static async generateDetailedComplianceReport(
    organizationId: string
  ): Promise<DetailedComplianceReport> {
    
    const executiveSummary = await this.generateExecutiveSummary(organizationId);
    
    // Get detailed policy information
    const policies = await storage.getPolicyDocuments(organizationId);
    const reports = await storage.getComplianceReports(organizationId);
    
    const policyDetails = [];
    
    for (const policy of policies) {
      const policyReports = reports.filter(r => r.policyDocumentId === policy.id);
      const latestReport = policyReports.sort((a, b) => 
        new Date(b.createdAt || new Date()).getTime() - new Date(a.createdAt || new Date()).getTime()
      )[0];

      if (latestReport && latestReport.status === 'completed') {
        const analysisResults = await storage.getAnalysisResults(latestReport.id);
        const keyFindings = analysisResults
          .filter(r => (r.complianceScore || 0) < 0.7)
          .map(r => r.summary || '')
          .slice(0, 3);

        policyDetails.push({
          document: policy,
          complianceScore: latestReport.overallScore || 0,
          riskLevel: latestReport.riskLevel || 'Unknown',
          gapCount: latestReport.gapCount || 0,
          keyFindings,
          remediationPriority: latestReport.riskLevel === 'Critical' ? 'Immediate' : 
                                latestReport.riskLevel === 'High' ? 'High' : 'Medium'
        });
      }
    }

    // Generate regulation comparison
    const regulationComparison = await this.generateRegulationComparison(organizationId);

    // Generate improvement roadmap
    const improvementRoadmap = this.generateImprovementRoadmap(
      executiveSummary,
      policyDetails
    );

    // Calculate next review date (quarterly reviews recommended)
    const nextReviewDate = new Date();
    nextReviewDate.setMonth(nextReviewDate.getMonth() + 3);

    return {
      executiveSummary,
      policyDetails,
      regulationComparison,
      improvementRoadmap,
      nextReviewDate
    };
  }

  /**
   * Generate regulatory breakdown analysis
   */
  private static async generateRegulatoryBreakdown(
    reports: ComplianceReport[]
  ): Promise<ExecutiveSummary['regulatoryBreakdown']> {
    
    const breakdown = [];
    const regulations = ['UK GDPR', 'GDPR', 'CCPA'] as const; // Focus on key regulations

    for (const regulation of regulations) {
      const regulationReports = reports.filter(r => 
        // Filter by regulation - this would need to be enhanced with actual regulation tracking
        r.status === 'completed'
      );

      if (regulationReports.length > 0) {
        const avgScore = regulationReports.reduce((sum, r) => sum + (r.overallScore || 0), 0) / regulationReports.length;
        const status: 'Compliant' | 'Needs Attention' | 'Critical' = avgScore >= 85 ? 'Compliant' : avgScore >= 60 ? 'Needs Attention' : 'Critical';
        
        const keyIssues = [];
        if (avgScore < 85) {
          if (regulation === 'UK GDPR') {
            keyIssues.push('Data subject rights implementation', 'Cross-border transfer provisions');
          } else if (regulation === 'GDPR') {
            keyIssues.push('Consent mechanisms', 'Data protection officer requirements');
          } else if (regulation === 'CCPA') {
            keyIssues.push('Consumer opt-out rights', 'Third-party data sharing disclosures');
          }
        }

        breakdown.push({
          regulation,
          score: Math.round(avgScore),
          status,
          keyIssues
        });
      }
    }

    return breakdown;
  }

  /**
   * Calculate business impact assessment
   */
  private static calculateBusinessImpact(
    reports: ComplianceReport[],
    riskDistribution: ExecutiveSummary['riskDistribution']
  ): ExecutiveSummary['businessImpactAssessment'] {
    
    let potentialFineExposure = '£0 - £10,000';
    let reputationalRisk: 'Low' | 'Medium' | 'High' | 'Critical' = 'Low';
    let operationalImpact = 'Minimal impact expected';

    // Calculate potential fine exposure based on UK GDPR (4% of annual turnover or £17.5M)
    if (riskDistribution.critical > 0) {
      potentialFineExposure = '£1M - £17.5M (Up to 4% of annual turnover)';
      reputationalRisk = 'Critical';
      operationalImpact = 'Severe operational disruption possible, potential suspension of data processing';
    } else if (riskDistribution.high > 0) {
      potentialFineExposure = '£100K - £1M (2% of annual turnover)';
      reputationalRisk = 'High';
      operationalImpact = 'Significant compliance burden, potential regulatory investigations';
    } else if (riskDistribution.medium > 2) {
      potentialFineExposure = '£10K - £100K';
      reputationalRisk = 'Medium';
      operationalImpact = 'Increased compliance monitoring and reporting requirements';
    }

    return {
      potentialFineExposure,
      reputationalRisk,
      operationalImpact
    };
  }

  /**
   * Generate priority actions based on analysis
   */
  private static generatePriorityActions(
    reports: ComplianceReport[],
    complianceHistory: any
  ): string[] {
    
    const actions = [];
    const criticalReports = reports.filter(r => r.riskLevel === 'Critical');
    const highRiskReports = reports.filter(r => r.riskLevel === 'High');

    if (criticalReports.length > 0) {
      actions.push('IMMEDIATE: Address critical compliance gaps within 48 hours');
      actions.push('Engage external legal counsel for urgent policy revision');
    }

    if (highRiskReports.length > 0) {
      actions.push('Schedule emergency compliance review within one week');
      actions.push('Implement interim risk mitigation measures');
    }

    if (complianceHistory.overallTrend === 'declining') {
      actions.push('Investigate root causes of declining compliance scores');
      actions.push('Enhance compliance training and awareness programs');
    }

    if (actions.length === 0) {
      actions.push('Continue monitoring compliance metrics');
      actions.push('Schedule routine quarterly compliance review');
    }

    return actions.slice(0, 5); // Limit to top 5 priorities
  }

  /**
   * Generate key recommendations
   */
  private static async generateKeyRecommendations(
    organizationId: string,
    reports: ComplianceReport[],
    complianceHistory: any
  ): Promise<string[]> {
    
    const suggestions = await HistoricalTrackingService.getImprovementSuggestions(organizationId);
    const recommendations = [...suggestions];

    // Add executive-level recommendations
    if (reports.some(r => r.riskLevel === 'Critical' || r.riskLevel === 'High')) {
      recommendations.unshift('Consider appointing a dedicated Data Protection Officer (DPO)');
      recommendations.push('Implement automated compliance monitoring system');
    }

    if (complianceHistory.improvementVelocity < 1) {
      recommendations.push('Increase compliance budget and resources allocation');
    }

    return recommendations.slice(0, 8);
  }

  /**
   * Generate audit trail for compliance activities
   */
  private static async generateAuditTrail(
    organizationId: string,
    periodDays: number
  ): Promise<AuditTrailEntry[]> {
    
    const auditTrail: AuditTrailEntry[] = [];
    const reports = await storage.getComplianceReports(organizationId);
    const policies = await storage.getPolicyDocuments(organizationId);

    // Add policy upload entries
    policies.forEach(policy => {
      auditTrail.push({
        timestamp: policy.uploadedAt || new Date(),
        action: 'Policy Document Uploaded',
        entityType: 'policy',
        entityId: policy.id,
        details: `${policy.title} uploaded for analysis`,
        performedBy: 'System User'
      });
    });

    // Add analysis completion entries
    reports.filter(r => r.status === 'completed').forEach(report => {
      auditTrail.push({
        timestamp: (report.completedAt || report.createdAt || new Date()) as Date,
        action: 'Compliance Analysis Completed',
        entityType: 'analysis',
        entityId: report.id,
        details: `Analysis completed with ${report.riskLevel} risk level`,
        riskChange: report.riskLevel || undefined
      });
    });

    // Sort by timestamp (most recent first) and limit to period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - periodDays);

    return auditTrail
      .filter(entry => entry.timestamp >= cutoffDate)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 50); // Limit to last 50 entries
  }

  /**
   * Generate regulation comparison analysis
   */
  private static async generateRegulationComparison(
    organizationId: string
  ): Promise<DetailedComplianceReport['regulationComparison']> {
    
    // This would need to be enhanced with actual regulation clause tracking
    const regulations = await storage.getActiveRegulations();
    const comparison = [];

    for (const regulation of regulations) {
      const clauses = await storage.getRegulationClauses(regulation.id);
      const requirements = clauses.length;

      // Clause-level computation: count distinct clauses that have any matching analysis result
      const reports = await storage.getComplianceReports(organizationId);
      const reportIds = reports.map(r => r.id);
      const results = await storage.getAnalysisResultsForReports(reportIds);
      const matchedClauseIds = new Set(
        results
          .filter(r => r.matchedRegulationClauseId)
          .map(r => r.matchedRegulationClauseId)
      );
      const met = clauses.filter(c => matchedClauseIds.has(c.id)).length;
      const percentage = requirements > 0 ? Math.round((met / requirements) * 100) : 0;
      
      const criticalGaps = [];
      if (percentage < 80) {
        if (regulation.name.includes('UK GDPR')) {
          criticalGaps.push('Data subject rights response procedures', 'International transfer safeguards');
        } else if (regulation.name.includes('GDPR')) {
          criticalGaps.push('Consent withdrawal mechanisms', 'Data portability implementation');
        } else if (regulation.name.includes('CCPA')) {
          criticalGaps.push('Consumer request verification', 'Third-party data sale disclosures');
        }
      }

      comparison.push({
        regulation: regulation.name,
        requirements,
        met,
        percentage,
        criticalGaps
      });
    }

    return comparison;
  }

  /**
   * Generate improvement roadmap
   */
  private static generateImprovementRoadmap(
    summary: ExecutiveSummary,
    policyDetails: any[]
  ): DetailedComplianceReport['improvementRoadmap'] {
    
    const immediate = [];
    const shortTerm = [];
    const longTerm = [];

    // Immediate actions (0-30 days)
    if (summary.riskDistribution.critical > 0) {
      immediate.push('Address all critical risk findings within 48 hours');
      immediate.push('Implement emergency data protection measures');
    }
    if (summary.overallComplianceScore < 60) {
      immediate.push('Engage external compliance consultant for urgent review');
    }

    // Short-term actions (1-6 months)
    if (summary.riskDistribution.high > 0) {
      shortTerm.push('Revise and update high-risk policy sections');
      shortTerm.push('Implement enhanced staff training programs');
    }
    if (summary.complianceTrend === 'Declining') {
      shortTerm.push('Establish regular compliance monitoring procedures');
    }
    shortTerm.push('Deploy automated compliance tracking system');

    // Long-term actions (6+ months)
    longTerm.push('Achieve and maintain 90%+ compliance score across all regulations');
    longTerm.push('Implement continuous compliance improvement framework');
    longTerm.push('Establish compliance center of excellence');

    return {
      immediate,
      shortTerm,
      longTerm
    };
  }

  /**
   * Format report period for display
   */
  private static formatReportPeriod(periodDays: number): string {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    return `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
  }
}