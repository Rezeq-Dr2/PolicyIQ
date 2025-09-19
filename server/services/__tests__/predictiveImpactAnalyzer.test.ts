import { PredictiveImpactAnalyzer } from '../predictiveImpactAnalyzer';
import { db } from '../../db';

jest.mock('../../db', () => ({ db: { select: jest.fn(), insert: jest.fn() } }));

describe('PredictiveImpactAnalyzer', () => {
  it('creates predictive alerts for pending updates', async () => {
    // mock update select
    (db.select as any).mockReturnValueOnce({ from: () => ({ where: () => ([{ id: 'u1', title: 'Draft Bill', description: 'Proposed guidance', content: 'consultation', status: 'pending' }]) }) });
    // mock orgs
    ;(db.select as any).mockReturnValueOnce({ from: () => ([{ id: 'org1' }]) });
    // mock policies
    ;(db.select as any).mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => ([{ id: 'p1', title: 'Privacy Policy' }]) }) }) });
    (db.insert as any).mockReturnValue({ values: () => ({}) });

    await PredictiveImpactAnalyzer.assessAndAlert('u1');
    expect((db.insert as any)).toHaveBeenCalled();
  });
});


