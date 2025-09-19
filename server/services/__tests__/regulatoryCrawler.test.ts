import { regulatoryCrawlerService } from '../regulatoryCrawler';
import { db } from '../../db';

jest.mock('../../db', () => ({ db: { select: jest.fn(), insert: jest.fn(), update: jest.fn() } }));

describe('RegulatoryCrawlerService', () => {
  it('handles missing source gracefully', async () => {
    (db.insert as any).mockReturnValue({ values: () => ({ returning: () => ([{ id: 'job1' }]) }) });
    (db.select as any).mockReturnValue({ from: () => ({ where: () => ([] as any) }) });
    (db.update as any).mockReturnValue({ set: () => ({ where: () => ({}) }) });
    const res = await regulatoryCrawlerService.crawlSource('missing', 'manual');
    expect(res.success).toBe(false);
  });
});


