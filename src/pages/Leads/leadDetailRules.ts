import type { Lead } from '../../types/lead';
import { LIFECYCLE_STATUS_CODES, normalizeLifecycleStatusCode } from '../../shared/utils/constants';

export function canEditLeadProfile(lead: Lead): boolean {
  const lifecycleCode = normalizeLifecycleStatusCode(lead.lifecycleStatusCode || lead.lifecycleStatus || lead.status);
  return !lead.customerId && lifecycleCode === LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP;
}
