import { EnhancedDPA2018ComplianceAnalyzer as Analyzer } from '../enhancedDPA2018Analyzer';

describe('EnhancedDPA2018ComplianceAnalyzer', () => {
  it('produces UK requirement checks and recommendations', async () => {
    const sample = `We notify the ICO within 72 hours of a personal data breach. Direct marketing follows PECR.`;
    const result = await Analyzer.analyzeDPA2018Compliance(sample);
    expect(result.ukSpecificRequirements.length).toBeGreaterThan(0);
    expect(Array.isArray(result.actionableRecommendations)).toBe(true);
  });
});


