import type { Lead } from '../types/lead';
import type { Opportunity } from '../types/opportunity';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { getStorageData, setStorageData } from './mock/storage';

export function syncLeadLifecycleByLeadId(
  leadId: string | undefined,
  lifecycleStatus: string,
  links?: { opportunityId?: string; orderId?: string },
): void {
  if (!leadId) return;
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const idx = leads.findIndex((lead) => lead.id === leadId);
  if (idx === -1) return;
  leads[idx] = {
    ...leads[idx],
    lifecycleStatus,
    lifecycleStatusUpdatedAt: new Date().toISOString(),
    opportunityId: links?.opportunityId ?? leads[idx].opportunityId,
    orderId: links?.orderId ?? leads[idx].orderId,
  };
  setStorageData(STORAGE_KEYS.LEADS, leads);
}

export function syncLeadLifecycleByCustomerName(
  customerName: string | undefined,
  lifecycleStatus: string,
  links?: { opportunityId?: string; orderId?: string },
): void {
  if (!customerName) return;
  const opportunities = getStorageData<Opportunity[]>(STORAGE_KEYS.OPPORTUNITIES) || [];
  const opportunity = opportunities.find((item) => item.customerName === customerName || item.leadName === customerName);
  if (opportunity?.leadId) {
    syncLeadLifecycleByLeadId(opportunity.leadId, lifecycleStatus, { opportunityId: opportunity.id, orderId: links?.orderId || opportunity.orderId });
    return;
  }

  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const idx = leads.findIndex((lead) => lead.name === customerName || lead.company === customerName);
  if (idx === -1) return;
  leads[idx] = {
    ...leads[idx],
    lifecycleStatus,
    lifecycleStatusUpdatedAt: new Date().toISOString(),
    orderId: links?.orderId ?? leads[idx].orderId,
  };
  setStorageData(STORAGE_KEYS.LEADS, leads);
}

export function syncOpportunityRefundedByOrderId(orderId: string | undefined): void {
  if (!orderId) return;
  const opportunities = getStorageData<Opportunity[]>(STORAGE_KEYS.OPPORTUNITIES) || [];
  let changed = false;
  const next = opportunities.map((item) => {
    if (item.orderId !== orderId) return item;
    changed = true;
    syncLeadLifecycleByLeadId(item.leadId, '已退款', { opportunityId: item.id, orderId });
    return {
      ...item,
      status: '已退款' as const,
      lifecycleStatus: '已退款',
      updatedAt: new Date().toISOString(),
    };
  });
  if (changed) setStorageData(STORAGE_KEYS.OPPORTUNITIES, next);
}
