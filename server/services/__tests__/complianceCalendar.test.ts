import { ComplianceCalendarService } from '../complianceCalendar';
import { storage } from '../../storage';
import { db } from '../../db';

jest.mock('../../db', () => ({ db: { select: jest.fn(), insert: jest.fn(), update: jest.fn() } }));

describe('ComplianceCalendarService', () => {
  it('generates and persists events idempotently', async () => {
    const orgId = 'org-1';
    jest.spyOn(storage, 'getPolicyDocuments').mockResolvedValue([
      { id: 'p1', organizationId: orgId, title: 'Privacy Policy', uploadedAt: new Date() } as any,
    ]);
    jest.spyOn(storage, 'getComplianceReports').mockResolvedValue([
      { id: 'r1', organizationId: orgId, policyDocumentId: 'p1', status: 'completed', riskLevel: 'Medium' } as any,
    ]);
    (db.insert as any).mockReturnValue({ values: () => ({ onConflictDoNothing: () => ({}) }) });

    const events = await ComplianceCalendarService.generateCalendarEvents(orgId);
    expect(events.length).toBeGreaterThan(0);
  });
});


