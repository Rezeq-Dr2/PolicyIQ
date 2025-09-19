import { consentService } from './consentService';

export async function handlePublicConsentIntake(params: { orgId: string; body: any }) {
  const { orgId, body } = params;
  const { subjectId, purposeName, granted, method, expiryAt } = body || {};
  if (!subjectId || !purposeName || typeof granted !== 'boolean') throw new Error('invalid payload');
  // upsert purpose by name first
  const purpose = await consentService.upsertPurpose({ organizationId: orgId, name: purposeName });
  return consentService.recordConsent({ organizationId: orgId, subjectId, purposeId: purpose.id, granted, method, expiryAt });
}


