import { RegulatoryImpactAssessor } from '../regulatoryImpactAssessor';
import { db } from '../../db';

jest.mock('../../db', () => ({ db: { select: jest.fn(), insert: jest.fn() } }));

describe('RegulatoryImpactAssessor', () => {
  it('assesses update and creates scoped notifications for affected policies', async () => {
    // Mock update
    (db.select as any).mockReturnValueOnce({ from: () => ({ where: () => ([{ id: 'u1', title: 'HSE Guidance update', description: 'New guidance', content: 'risk assessment and RIDDOR' }]) }) });
    // Mock orgs
    ;(db.select as any).mockReturnValueOnce({ from: () => ([{ id: 'org1' }]) });
    // Mock policies FTS
    ;(db.select as any).mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => ([{ id: 'p1', title: 'H&S Policy' }]) }) }) });
    (db.insert as any).mockReturnValue({ values: () => ({}) });

    await RegulatoryImpactAssessor.assessAndNotify('u1');
    expect((db.insert as any)).toHaveBeenCalled();
  });
});


