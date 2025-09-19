import { ExecutiveReportingService } from '../executiveReporting';
import { storage } from '../../storage';
import { HistoricalTrackingService } from '../historicalTracking';

describe('ExecutiveReportingService', () => {
  it('generates detailed compliance report structure', async () => {
    const orgId = 'org-1';
    const spyOrg = jest.spyOn(storage, 'getOrganization').mockResolvedValue({ id: orgId, name: 'Acme' } as any);
    const spyReports = jest.spyOn(storage, 'getComplianceReports').mockResolvedValue([{ id: 'r1', organizationId: orgId, policyDocumentId: 'p1', status: 'completed', overallScore: 80, gapCount: 2, riskLevel: 'Medium' } ] as any);
    const spyPolicies = jest.spyOn(storage, 'getPolicyDocuments').mockResolvedValue([{ id: 'p1', organizationId: orgId, title: 'Policy', storagePath: '', uploadedAt: new Date() }] as any);
    const spyResults = jest.spyOn(storage, 'getAnalysisResults').mockResolvedValue([] as any);
    const spyRegs = jest.spyOn(storage, 'getActiveRegulations').mockResolvedValue([] as any);
    const spyClauses = jest.spyOn(storage, 'getRegulationClauses').mockResolvedValue([] as any);
    const spyBulk = jest.spyOn(storage, 'getAnalysisResultsForReports').mockResolvedValue([] as any);

    jest.spyOn(HistoricalTrackingService, 'analyzeComplianceHistory').mockResolvedValue({
      history: [],
      overallTrend: 'Stable',
      improvementVelocity: 0,
    } as any);
    jest.spyOn(HistoricalTrackingService, 'getImprovementSuggestions').mockResolvedValue([]);

    const detailed = await ExecutiveReportingService.generateDetailedComplianceReport(orgId);
    expect(detailed.policyDetails.length).toBeGreaterThanOrEqual(0);
    expect(detailed.executiveSummary.organizationName).toBe('Acme');
    spyOrg.mockRestore();
    spyReports.mockRestore();
    spyPolicies.mockRestore();
    spyResults.mockRestore();
    spyRegs.mockRestore();
    spyClauses.mockRestore();
    spyBulk.mockRestore();
  });
});


