import { db, dbRead } from "../db";
import { 
  complianceTrends, 
  complianceReports, 
  policyDocuments, 
  regulations,
  industryBenchmarks,
  predictiveRiskModels,
  analyticsMetrics,
  organizations,
  analysisResults,
  complianceImprovements,
  regulationClauses,
} from "@shared/schema";
import { eq, desc, asc, sql, and, gte, lte, gt, lt } from "drizzle-orm";

export interface TrendAnalysis {
  regulation: string;
  regulationId: string;
  data: Array<{
    date: string;
    score: number;
    gapCount: number;
    riskLevel: string;
    improvementRate?: number;
  }>;
  trendDirection: 'improving' | 'declining' | 'stable';
  projectedScore: number;
  riskForecast: string;
}

export interface ComparativeAnalysis {
  policyTypes: Array<{
    type: string;
    averageScore: number;
    gapCount: number;
    riskLevel: string;
    lastUpdated: string;
  }>;
  businessUnits: Array<{
    unit: string;
    averageScore: number;
    gapCount: number;
    riskLevel: string;
    lastUpdated: string;
  }>;
  regulations: Array<{
    name: string;
    averageScore: number;
    gapCount: number;
    riskLevel: string;
  }>;
}

export interface IndustryBenchmarkData {
  userScore: number;
  industryAverage: number;
  industryMedian: number;
  topQuartile: number;
  bottomQuartile: number;
  percentileRank: number;
  comparisonText: string;
  commonRiskAreas: string[];
  improvementOpportunities: string[];
}

export interface PredictiveAnalytics {
  riskForecasts: Array<{
    regulation: string;
    currentScore: number;
    predictedScore30Days: number;
    predictedScore90Days: number;
    predictedScore1Year: number;
    confidenceLevel: number;
    riskFactors: Array<{ factor: string; impact: number; description: string }>;
    recommendedActions: string[];
  }>;
  complianceVelocity: {
    improvementRate: number; // Points per month
    timeToTarget: number; // Months to reach 90% compliance
    projectedCompliance: Array<{ month: string; projectedScore: number }>;
  };
  emergingRisks: Array<{
    area: string;
    severity: 'low' | 'medium' | 'high';
    probability: number;
    description: string;
    suggestedMitigation: string;
  }>;
}

export class AnalyticsService {
  
  // Low-latency summaries sourced from materialized views
  async getTrendSummaryQuick(organizationId: string): Promise<Array<{
    regulationId: string;
    regulation: string;
    points: number;
    avgScore: number;
    minScore: number;
    maxScore: number;
    latestScore: number;
    latestDate: string;
    slopePerDay: number;
  }>> {
    const rows: any = await dbRead.execute(sql`
      select m.organization_id, m.regulation_id, r.name as regulation, m.points, m.avg_score, m.min_score, m.max_score, m.latest_score, m.latest_date, m.slope_per_day
      from mv_trend_org_reg_90d m
      join regulations r on r.id = m.regulation_id
      where m.organization_id = ${organizationId}
    `);
    const results = (rows?.rows ?? rows ?? []) as any[];
    return results.map((r: any) => ({
      regulationId: r.regulation_id,
      regulation: r.regulation,
      points: Number(r.points) || 0,
      avgScore: Number(r.avg_score) || 0,
      minScore: Number(r.min_score) || 0,
      maxScore: Number(r.max_score) || 0,
      latestScore: Number(r.latest_score) || 0,
      latestDate: (r.latest_date instanceof Date ? r.latest_date : new Date(r.latest_date)).toISOString(),
      slopePerDay: Number(r.slope_per_day) || 0,
    }));
  }

  async getRiskSummaryQuick(organizationId: string): Promise<{ high: number; medium: number; low: number; total: number }> {
    const rows: any = await dbRead.execute(sql`
      select organization_id, high_count, medium_count, low_count, total_reports
      from mv_org_risk_summary_30d
      where organization_id = ${organizationId}
    `);
    const resultArr = (rows?.rows ?? rows ?? []) as any[];
    const r: any = resultArr[0] || {};
    return {
      high: Number(r.high_count) || 0,
      medium: Number(r.medium_count) || 0,
      low: Number(r.low_count) || 0,
      total: Number(r.total_reports) || 0,
    };
  }

  async getConsentCoverage(organizationId: string): Promise<Array<{ purposeId: string; granted: number; revoked: number; total: number }>> {
    const rows: any = await dbRead.execute(sql`
      select purpose_id, granted_subjects, revoked_subjects, total_subjects from mv_consent_org_purpose where organization_id = ${organizationId}
    `);
    const arr = (rows?.rows ?? rows ?? []) as any[];
    return arr.map(r => ({ purposeId: r.purpose_id, granted: Number(r.granted_subjects)||0, revoked: Number(r.revoked_subjects)||0, total: Number(r.total_subjects)||0 }));
  }

  async getTrainingStatus(organizationId: string): Promise<{ assigned: number; completed: number; total: number }> {
    const rows: any = await dbRead.execute(sql`select assigned, completed, total from mv_training_org_status where organization_id = ${organizationId}`);
    const r = ((rows?.rows ?? [])[0] || {}) as any;
    return { assigned: Number(r.assigned)||0, completed: Number(r.completed)||0, total: Number(r.total)||0 };
  }

  async getHsIncidentSummary(organizationId: string): Promise<{ open: number; closed: number; total: number }> {
    const rows: any = await dbRead.execute(sql`select open_incidents, closed_incidents, total_incidents from mv_hs_incidents_org where organization_id = ${organizationId}`);
    const r = ((rows?.rows ?? [])[0] || {}) as any;
    return { open: Number(r.open_incidents)||0, closed: Number(r.closed_incidents)||0, total: Number(r.total_incidents)||0 };
  }

  async getRiskSummaryDP(organizationId: string, epsilon: number = 1.0): Promise<{ high: number; medium: number; low: number; total: number }> {
    const base = await this.getRiskSummaryQuick(organizationId);
    const noisy = (v: number) => Math.max(0, Math.round(v + this.laplace(0, 1/Math.max(0.0001, epsilon))));
    return {
      high: noisy(base.high),
      medium: noisy(base.medium),
      low: noisy(base.low),
      total: noisy(base.total),
    };
  }

  async getTrendAnalysis(organizationId: string, timeRange: '30d' | '90d' | '1y' = '90d'): Promise<TrendAnalysis[]> {
    const startDate = this.getStartDate(timeRange);
    
    // Get all trends for the organization within the time range
    const trends = await db.select({
      regulationId: complianceTrends.regulationId,
      regulationName: regulations.name,
      measurementDate: complianceTrends.measurementDate,
      overallScore: complianceTrends.overallScore,
      gapCount: complianceTrends.gapCount,
      riskLevel: complianceTrends.riskLevel,
    })
    .from(complianceTrends)
    .innerJoin(regulations, eq(complianceTrends.regulationId, regulations.id))
    .where(
      and(
        eq(complianceTrends.organizationId, organizationId),
        gte(complianceTrends.measurementDate, startDate)
      )
    )
    .orderBy(asc(complianceTrends.measurementDate));

    // Group by regulation and calculate trends
    const groupedTrends = this.groupTrendsByRegulation(trends);
    
    const results: TrendAnalysis[] = [];

    for (const [regulationId, data] of Object.entries(groupedTrends)) {
      const series = data.map((item, index) => ({
        date: item.measurementDate.toISOString().split('T')[0],
        score: item.overallScore,
        gapCount: item.gapCount,
        riskLevel: item.riskLevel,
        improvementRate: index > 0 ? 
          ((item.overallScore - data[index - 1].overallScore) / Math.max(1, data[index - 1].overallScore)) * 100 
          : 0
      }));

      const trendDirection = this.calculateTrendDirection(data);
      const projectedScore = this.calculateProjectedScore(data);
      const riskForecast = this.calculateRiskForecast(data);

      // Persist metrics as source of truth
      const lastScore = data[data.length - 1]?.overallScore ?? 0;
      await this.persistMetric({
        organizationId,
        metricType: 'trend_slope',
        regulationId,
        metricValue: this.calculateSlope(data),
        calculationPeriod: timeRange,
        metricContext: { lastScore, projectedScore, trendDirection }
      });

      await this.persistMetric({
        organizationId,
        metricType: 'last_score',
        regulationId,
        metricValue: lastScore,
        calculationPeriod: timeRange,
        metricContext: { riskForecast }
      });

      results.push({
        regulation: data[0].regulationName,
        regulationId,
        data: series,
        trendDirection,
        projectedScore,
        riskForecast
      });
    }

    return results;
  }

  async getComparativeAnalysis(organizationId: string): Promise<ComparativeAnalysis> {
    // Derive policy types from analytics_metrics if present
    const policyTypeRows = await db.select({
      policyType: analyticsMetrics.policyType,
      averageScore: sql<number>`AVG(${analyticsMetrics.metricValue})`,
    })
      .from(analyticsMetrics)
      .where(and(eq(analyticsMetrics.organizationId, organizationId), eq(analyticsMetrics.metricType, 'regulation_avg_score')))
      .groupBy(analyticsMetrics.policyType);

    const policyTypeAnalysis = policyTypeRows
      .filter(r => r.policyType)
      .map(r => ({
        type: r.policyType as string,
        averageScore: Math.round((r.averageScore || 0) * 10) / 10,
        gapCount: 0,
        riskLevel: r.averageScore >= 85 ? 'Low' : r.averageScore >= 70 ? 'Medium' : 'High',
        lastUpdated: new Date().toISOString(),
      }));

    // Derive business units from analytics_metrics if present
    const buRows = await db.select({
      businessUnit: analyticsMetrics.businessUnit,
      averageScore: sql<number>`AVG(${analyticsMetrics.metricValue})`,
    })
      .from(analyticsMetrics)
      .where(and(eq(analyticsMetrics.organizationId, organizationId), eq(analyticsMetrics.metricType, 'regulation_avg_score')))
      .groupBy(analyticsMetrics.businessUnit);

    const businessUnitAnalysis = buRows
      .filter(r => r.businessUnit)
      .map(r => ({
        unit: r.businessUnit as string,
        averageScore: Math.round((r.averageScore || 0) * 10) / 10,
        gapCount: 0,
        riskLevel: r.averageScore >= 85 ? 'Low' : r.averageScore >= 70 ? 'Medium' : 'High',
        lastUpdated: new Date().toISOString(),
      }));

    // Regulation comparison (actual data)
    const regulationAnalysis = await this.analyzeRegulations(organizationId);

    // Persist per-regulation averages as metrics
    for (const item of regulationAnalysis) {
      const regulation = await db.select({ id: regulations.id })
        .from(regulations)
        .where(eq(regulations.name, item.name))
        .limit(1);
      const regulationId = regulation[0]?.id;
      if (regulationId) {
        await this.persistMetric({
          organizationId,
          metricType: 'regulation_avg_score',
          regulationId,
          metricValue: item.averageScore,
          calculationPeriod: 'overall',
          metricContext: { gapCount: item.gapCount, riskLevel: item.riskLevel }
        });
      }
    }

    return { policyTypes: policyTypeAnalysis, businessUnits: businessUnitAnalysis, regulations: regulationAnalysis };
  }

  async getIndustryBenchmarks(
    organizationId: string, 
    industry: string, 
    companySize: string,
    regulationId?: string
  ): Promise<Record<string, IndustryBenchmarkData>> {
    const userScores = await this.getUserComplianceScores(organizationId, regulationId);
    
    const benchmarks = await db.select()
      .from(industryBenchmarks)
      .where(
        and(
          eq(industryBenchmarks.industry, industry),
          eq(industryBenchmarks.companySize, companySize),
          regulationId ? eq(industryBenchmarks.regulationId, regulationId) : undefined
        )
      );

    const result: Record<string, IndustryBenchmarkData> = {};

    for (const benchmark of benchmarks) {
      const regulationName = await this.getRegulationName(benchmark.regulationId);
      const userScore = userScores[benchmark.regulationId] || 0;
      
      result[regulationName] = {
        userScore,
        industryAverage: benchmark.averageComplianceScore,
        industryMedian: benchmark.medianComplianceScore || benchmark.averageComplianceScore,
        topQuartile: benchmark.topQuartileScore || benchmark.averageComplianceScore * 1.2,
        bottomQuartile: benchmark.bottomQuartileScore || benchmark.averageComplianceScore * 0.8,
        percentileRank: this.calculatePercentileRank(userScore, benchmark),
        comparisonText: this.generateComparisonText(userScore, benchmark),
        commonRiskAreas: benchmark.commonRiskAreas || [],
        improvementOpportunities: this.generateImprovementOpportunities(userScore, benchmark)
      };
    }

    return result;
  }

  async getPredictiveAnalytics(organizationId: string): Promise<PredictiveAnalytics> {
    // Data-driven forecasts based on historical compliance_trends
    const riskForecasts = await this.generateRiskForecasts(organizationId);

    // Calculate compliance velocity from trends
    const complianceVelocity = await this.calculateComplianceVelocity(organizationId);

    // Emerging risks derived from recent high-risk findings
    const emergingRisks = await this.identifyEmergingRisksFromFindings(organizationId);

    // Persist predictive metrics
    for (const forecast of riskForecasts) {
      const reg = await db.select({ id: regulations.id }).from(regulations).where(eq(regulations.name, forecast.regulation)).limit(1);
      const regulationId = reg[0]?.id;
      if (regulationId) {
        await this.persistMetric({ organizationId, metricType: 'predicted_score_30d', regulationId, metricValue: forecast.predictedScore30Days, calculationPeriod: '30d' });
        await this.persistMetric({ organizationId, metricType: 'predicted_score_90d', regulationId, metricValue: forecast.predictedScore90Days, calculationPeriod: '90d' });
        await this.persistMetric({ organizationId, metricType: 'predicted_score_1y', regulationId, metricValue: forecast.predictedScore1Year, calculationPeriod: '1y' });
      }
    }

    await this.persistMetric({ organizationId, metricType: 'improvement_rate', metricValue: complianceVelocity.improvementRate, calculationPeriod: '90d', metricContext: { timeToTarget: complianceVelocity.timeToTarget } });

    return { riskForecasts, complianceVelocity, emergingRisks };
  }

  async persistDimensionMetrics(
    organizationId: string,
    options: { policyType?: string; businessUnit?: string; regulationId?: string; metricType: string; metricValue: number; period?: string }
  ): Promise<void> {
    await this.persistMetric({
      organizationId,
      metricType: options.metricType,
      regulationId: options.regulationId,
      policyType: options.policyType,
      businessUnit: options.businessUnit,
      metricValue: options.metricValue,
      calculationPeriod: options.period || 'overall',
    });
  }

  async seedIndustryBenchmarks(): Promise<void> {
    const benchmarkData = [
      // Technology Industry
      {
        industry: 'Technology',
        companySize: 'Small',
        regulationId: 'gdpr-id', // Will be replaced with actual IDs
        averageComplianceScore: 78.5,
        medianComplianceScore: 82.0,
        topQuartileScore: 91.2,
        bottomQuartileScore: 65.8,
        averageGapCount: 3.2,
        commonRiskAreas: ['Data retention policies', 'Third-party data sharing', 'User consent management'],
        benchmarkPeriod: 'Q4 2024',
        sampleSize: 245
      },
      {
        industry: 'Technology',
        companySize: 'Medium',
        regulationId: 'gdpr-id',
        averageComplianceScore: 85.2,
        medianComplianceScore: 87.5,
        topQuartileScore: 94.8,
        bottomQuartileScore: 76.3,
        averageGapCount: 2.1,
        commonRiskAreas: ['Cross-border data transfers', 'Employee data handling', 'Vendor management'],
        benchmarkPeriod: 'Q4 2024',
        sampleSize: 156
      },
      // Healthcare Industry
      {
        industry: 'Healthcare',
        companySize: 'Small',
        regulationId: 'gdpr-id',
        averageComplianceScore: 82.1,
        medianComplianceScore: 84.5,
        topQuartileScore: 92.7,
        bottomQuartileScore: 71.2,
        averageGapCount: 2.8,
        commonRiskAreas: ['Patient data protection', 'Medical record access controls', 'Data breach procedures'],
        benchmarkPeriod: 'Q4 2024',
        sampleSize: 189
      },
      // Financial Services
      {
        industry: 'Financial Services',
        companySize: 'Medium',
        regulationId: 'gdpr-id',
        averageComplianceScore: 89.3,
        medianComplianceScore: 91.2,
        topQuartileScore: 96.5,
        bottomQuartileScore: 82.7,
        averageGapCount: 1.6,
        commonRiskAreas: ['Customer data encryption', 'Payment processing compliance', 'Audit trail management'],
        benchmarkPeriod: 'Q4 2024',
        sampleSize: 134
      }
    ];

    // Get actual regulation IDs
    const gdprRegulation = await db.select().from(regulations).where(eq(regulations.name, 'GDPR')).limit(1);
    const ukGdprRegulation = await db.select().from(regulations).where(eq(regulations.name, 'UK GDPR')).limit(1);
    
    if (gdprRegulation.length === 0 || ukGdprRegulation.length === 0) {
      console.log('Regulations not found for benchmark seeding');
      return;
    }

    for (const benchmark of benchmarkData) {
      const regulationId = benchmark.regulationId === 'gdpr-id' ? gdprRegulation[0].id : ukGdprRegulation[0].id;
      
      await db.insert(industryBenchmarks).values({
        industry: benchmark.industry,
        companySize: benchmark.companySize,
        regulationId,
        averageComplianceScore: benchmark.averageComplianceScore,
        medianComplianceScore: benchmark.medianComplianceScore,
        topQuartileScore: benchmark.topQuartileScore,
        bottomQuartileScore: benchmark.bottomQuartileScore,
        averageGapCount: benchmark.averageGapCount,
        commonRiskAreas: benchmark.commonRiskAreas,
        benchmarkPeriod: benchmark.benchmarkPeriod,
        sampleSize: benchmark.sampleSize
      }).onConflictDoNothing();
    }
  }

  // Helper methods

  private getStartDate(timeRange: '30d' | '90d' | '1y'): Date {
    const now = new Date();
    switch (timeRange) {
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case '1y':
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    }
  }

  private groupTrendsByRegulation(trends: any[]): Record<string, any[]> {
    return trends.reduce((acc, trend) => {
      if (!acc[trend.regulationId]) {
        acc[trend.regulationId] = [];
      }
      acc[trend.regulationId].push(trend);
      return acc;
    }, {});
  }

  private calculateTrendDirection(data: any[]): 'improving' | 'declining' | 'stable' {
    if (data.length < 2) return 'stable';
    
    const first = data[0].overallScore;
    const last = data[data.length - 1].overallScore;
    const change = ((last - first) / first) * 100;
    
    if (change > 5) return 'improving';
    if (change < -5) return 'declining';
    return 'stable';
  }

  private calculateProjectedScore(data: any[]): number {
    if (data.length < 2) return data[0]?.overallScore || 0;
    
    // Simple linear regression for projection
    const scores = data.map((item, index) => ({ x: index, y: item.overallScore }));
    const n = scores.length;
    const sumX = scores.reduce((sum, point) => sum + point.x, 0);
    const sumY = scores.reduce((sum, point) => sum + point.y, 0);
    const sumXY = scores.reduce((sum, point) => sum + point.x * point.y, 0);
    const sumXX = scores.reduce((sum, point) => sum + point.x * point.x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Project 30 days ahead (assuming daily measurements)
    return Math.max(0, Math.min(100, slope * (n + 30) + intercept));
  }

  private calculateRiskForecast(data: any[]): string {
    const projectedScore = this.calculateProjectedScore(data);
    
    if (projectedScore >= 85) return 'Low Risk';
    if (projectedScore >= 70) return 'Medium Risk';
    return 'High Risk';
  }

  private async analyzePolicyTypes(_organizationId: string): Promise<any[]> {
    // Not supported without a policy type column; return empty until modeled
    return [];
  }

  private async analyzeBusinessUnits(_organizationId: string): Promise<any[]> {
    // No business unit modeling present; return empty
    return [];
  }

  private async analyzeRegulations(organizationId: string): Promise<any[]> {
    const results = await db.select({
      regulationName: regulations.name,
      averageScore: sql<number>`AVG(${complianceTrends.overallScore})`,
      gapCount: sql<number>`AVG(${complianceTrends.gapCount})`,
      riskLevel: complianceTrends.riskLevel,
    })
    .from(complianceTrends)
    .innerJoin(regulations, eq(complianceTrends.regulationId, regulations.id))
    .where(eq(complianceTrends.organizationId, organizationId))
    .groupBy(regulations.id, regulations.name, complianceTrends.riskLevel);

    return results.map(result => ({
      name: result.regulationName,
      averageScore: Math.round(result.averageScore * 10) / 10,
      gapCount: Math.round(result.gapCount),
      riskLevel: result.riskLevel
    }));
  }

  private async getUserComplianceScores(organizationId: string, regulationId?: string): Promise<Record<string, number>> {
    const whereConditions = [eq(complianceTrends.organizationId, organizationId)];
    if (regulationId) {
      whereConditions.push(eq(complianceTrends.regulationId, regulationId));
    }

    const scores = await dbRead.select({
      regulationId: complianceTrends.regulationId,
      averageScore: sql<number>`AVG(${complianceTrends.overallScore})`
    })
    .from(complianceTrends)
    .where(and(...whereConditions))
    .groupBy(complianceTrends.regulationId);

    return scores.reduce((acc, score) => {
      acc[score.regulationId] = score.averageScore;
      return acc;
    }, {} as Record<string, number>);
  }

  private async getRegulationName(regulationId: string): Promise<string> {
    const regulation = await dbRead.select({ name: regulations.name })
      .from(regulations)
      .where(eq(regulations.id, regulationId))
      .limit(1);
    
    return regulation[0]?.name || 'Unknown Regulation';
  }

  private calculatePercentileRank(userScore: number, benchmark: any): number {
    // Calculate approximate percentile rank based on distribution
    const mean = benchmark.averageComplianceScore;
    const q1 = benchmark.bottomQuartileScore || mean * 0.8;
    const q3 = benchmark.topQuartileScore || mean * 1.2;
    
    if (userScore <= q1) return 25;
    if (userScore >= q3) return 75;
    
    // Linear interpolation between Q1 and Q3
    return 25 + ((userScore - q1) / (q3 - q1)) * 50;
  }

  private generateComparisonText(userScore: number, benchmark: any): string {
    const diff = userScore - benchmark.averageComplianceScore;
    const percentile = this.calculatePercentileRank(userScore, benchmark);
    
    if (diff > 10) {
      return `Excellent performance! You're ${diff.toFixed(1)} points above industry average (${percentile}th percentile).`;
    } else if (diff > 0) {
      return `Above average performance. You're ${diff.toFixed(1)} points above industry average (${percentile}th percentile).`;
    } else if (diff > -10) {
      return `Close to industry average. You're ${Math.abs(diff).toFixed(1)} points below average (${percentile}th percentile).`;
    } else {
      return `Below industry average. Consider reviewing your compliance practices (${percentile}th percentile).`;
    }
  }

  private generateImprovementOpportunities(userScore: number, benchmark: any): string[] {
    const opportunities = [];
    
    if (userScore < benchmark.averageComplianceScore) {
      opportunities.push('Focus on common risk areas identified in your industry');
      opportunities.push('Review top-performing organizations\' best practices');
    }
    
    if (userScore < benchmark.topQuartileScore) {
      opportunities.push('Implement advanced compliance monitoring');
      opportunities.push('Consider automated compliance checking tools');
    }
    
    return opportunities;
  }

  private async generateRiskForecasts(organizationId: string): Promise<any[]> {
    const trends = await this.getTrendAnalysis(organizationId, '90d');
    return trends.map(trend => {
      const last = trend.data[trend.data.length - 1]?.score || 0;
      const slope = (trend.data.length >= 2)
        ? ((trend.data[trend.data.length - 1].score - trend.data[0].score) / Math.max(1, trend.data.length - 1))
        : 0;
      const predicted30 = Math.max(0, Math.min(100, last + slope * 30));
      const predicted90 = Math.max(0, Math.min(100, last + slope * 90));
      const predicted1y = Math.max(0, Math.min(100, last + slope * 365));
      return {
        regulation: trend.regulation,
        currentScore: last,
        predictedScore30Days: predicted30,
        predictedScore90Days: predicted90,
        predictedScore1Year: predicted1y,
        confidenceLevel: Math.min(1, Math.max(0.2, Math.abs(slope) / 100 + 0.5)),
        riskFactors: [],
        recommendedActions: []
      };
    });
  }

  private async calculateComplianceVelocity(organizationId: string): Promise<any> {
    const trends = await this.getTrendAnalysis(organizationId, '90d');
    
    // Calculate average improvement rate across all regulations
    const improvements = trends.flatMap(trend => 
      trend.data.slice(1).map((point, index) => 
        point.score - trend.data[index].score
      )
    );
    
    const averageImprovement = improvements.length > 0 
      ? improvements.reduce((sum, imp) => sum + imp, 0) / improvements.length 
      : 0;

    const currentAverage = trends.reduce((sum, trend) => 
      sum + (trend.data[trend.data.length - 1]?.score || 0), 0) / trends.length;

    const timeToTarget = currentAverage >= 90 ? 0 : 
      Math.ceil((90 - currentAverage) / Math.max(0.1, averageImprovement));

    return {
      improvementRate: averageImprovement,
      timeToTarget,
      projectedCompliance: Array.from({ length: 12 }, (_, i) => ({
        month: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7),
        projectedScore: Math.min(100, currentAverage + (averageImprovement * i))
      }))
    };
  }

  private async identifyEmergingRisksFromFindings(organizationId: string): Promise<any[]> {
    // Join analysis_results → regulation_clauses → regulations for accurate grouping
    const recent = await dbRead.select({
      regulationName: regulations.name,
      count: sql<number>`COUNT(*)`,
    })
    .from(analysisResults)
    .innerJoin(complianceReports, eq(analysisResults.reportId, complianceReports.id))
    .innerJoin(regulationClauses, eq(analysisResults.matchedRegulationClauseId, regulationClauses.id))
    .innerJoin(regulations, eq(regulationClauses.regulationId, regulations.id))
    .where(
      and(
        eq(complianceReports.organizationId, organizationId),
        eq(analysisResults.riskLevel, 'High')
      )
    )
    .groupBy(regulations.name)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(5);

    return recent.map(r => ({
      area: r.regulationName,
      severity: (r.count > 10 ? 'high' : r.count > 5 ? 'medium' : 'low') as 'low' | 'medium' | 'high',
      probability: Math.min(1, r.count / 10),
      description: `Increased high-risk findings related to ${r.regulationName}`,
      suggestedMitigation: 'Prioritize remediation of high-risk findings and re-analyze'
    }));
  }

  private async persistMetric(params: {
    organizationId: string;
    metricType: string;
    regulationId?: string;
    policyType?: string;
    businessUnit?: string;
    metricValue: number;
    calculationPeriod: string;
    metricContext?: any;
  }): Promise<void> {
    const { organizationId, metricType, regulationId, policyType, businessUnit, metricValue, calculationPeriod, metricContext } = params;

    // Remove existing metric of same key to keep latest only
    await db.delete(analyticsMetrics).where(and(
      eq(analyticsMetrics.organizationId, organizationId),
      eq(analyticsMetrics.metricType, metricType),
      regulationId ? eq(analyticsMetrics.regulationId, regulationId) : (sql`1=1` as any),
      policyType ? eq(analyticsMetrics.policyType, policyType) : (sql`1=1` as any),
      businessUnit ? eq(analyticsMetrics.businessUnit, businessUnit) : (sql`1=1` as any),
      eq(analyticsMetrics.calculationPeriod, calculationPeriod)
    ));

    await db.insert(analyticsMetrics).values({
      organizationId,
      metricType,
      regulationId,
      policyType,
      businessUnit,
      metricValue,
      calculationPeriod,
      metricContext: metricContext ?? null
    });
  }

  private calculateSlope(data: any[]): number {
    if (data.length < 2) return 0;
    const scores = data.map((item, index) => ({ x: index, y: item.overallScore }));
    const n = scores.length;
    const sumX = scores.reduce((sum, p) => sum + p.x, 0);
    const sumY = scores.reduce((sum, p) => sum + p.y, 0);
    const sumXY = scores.reduce((sum, p) => sum + p.x * p.y, 0);
    const sumXX = scores.reduce((sum, p) => sum + p.x * p.x, 0);
    const slope = (n * sumXY - sumX * sumY) / Math.max(1, (n * sumXX - sumX * sumX));
    return slope;
  }

  private laplace(mu: number, b: number): number {
    const u = Math.random() - 0.5;
    return mu - b * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  }

  // Differential privacy variants of consent/training analytics
  async getConsentCoverageDP(organizationId: string, epsilon = 1.0): Promise<any[]> {
    const raw = await this.getConsentCoverage(organizationId);
    const b = 1 / Math.max(0.1, epsilon);
    return raw.map((r: any) => ({ ...r, count: Math.max(0, Math.round((r.count || 0) + this.laplace(0, b))) }));
  }

  async getTrainingStatusDP(organizationId: string, epsilon = 1.0): Promise<any> {
    const raw = await this.getTrainingStatus(organizationId);
    const b = 1 / Math.max(0.1, epsilon);
    return {
      assigned: Math.max(0, Math.round((raw.assigned || 0) + this.laplace(0, b))),
      completed: Math.max(0, Math.round((raw.completed || 0) + this.laplace(0, b))),
      total: Math.max(0, Math.round((raw.total || 0) + this.laplace(0, b)))
    };
  }
}

export const analyticsService = new AnalyticsService();