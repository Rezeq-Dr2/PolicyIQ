import { analyticsService } from '../analyticsService';
import { db } from '../../db';
import * as schema from '@shared/schema';

jest.mock('../../db', () => ({ db: { select: jest.fn(), delete: jest.fn(), insert: jest.fn() } }));

describe('AnalyticsService', () => {
  it('getComparativeAnalysis returns arrays without throwing', async () => {
    // Mock DRIZZLE chain for select on analyticsMetrics and complianceTrends
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      groupBy: () => [],
      orderBy: () => chain,
      limit: () => [],
    } as any;
    (db.select as any).mockReturnValue(chain);
    const result = await analyticsService.getComparativeAnalysis('org-1');
    expect(result).toHaveProperty('policyTypes');
    expect(result).toHaveProperty('businessUnits');
    expect(result).toHaveProperty('regulations');
  });
});


