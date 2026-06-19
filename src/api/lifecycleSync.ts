import type { Lead } from '../types/lead';
import type { Customer } from '../types/customer';
import type { Opportunity } from '../types/opportunity';
import type { Order } from '../types/order';
import type { LifecycleStatusCode } from '../types/settings';
import { getLifecycleConfigByCode, LIFECYCLE_STATUS_CODES, normalizeLifecycleStatusCode, STORAGE_KEYS } from '../shared/utils/constants';
import { getStorageData, setStorageData } from './mock/storage';

type LifecycleContext = {
  opportunityId?: string;
  orderId?: string;
  reason?: string;
  operator?: string;
};

function statusName(code: LifecycleStatusCode): string {
  return getLifecycleConfigByCode(code).name;
}

export function hydrateLeadLifecycle(lead: Lead): Lead {
  const code = normalizeLifecycleStatusCode(lead.lifecycleStatusCode || lead.lifecycleStatus || lead.status);
  return {
    ...lead,
    lifecycleStatusCode: code,
    lifecycleStatus: statusName(code),
    lifecycleStatusUpdatedAt: lead.lifecycleStatusUpdatedAt || lead.updatedAt,
  };
}

export function hydrateCustomerLifecycle(customer: Customer): Customer {
  const code = normalizeLifecycleStatusCode(customer.lifecycleStatusCode || (customer.orderCount > 0 ? LIFECYCLE_STATUS_CODES.ORDERED : LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP));
  return {
    ...customer,
    lifecycleStatusCode: code,
    lifecycleStatusUpdatedAt: customer.lifecycleStatusUpdatedAt || customer.updatedAt,
  };
}

export function setLeadLifecycle(
  leadId: string | undefined,
  lifecycleStatus: string,
  context?: LifecycleContext,
): Lead | null {
  if (!leadId) return null;
  const leads = getStorageData<Lead[]>(STORAGE_KEYS.LEADS) || [];
  const idx = leads.findIndex((lead) => lead.id === leadId);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  const code = normalizeLifecycleStatusCode(lifecycleStatus);
  leads[idx] = {
    ...hydrateLeadLifecycle(leads[idx]),
    lifecycleStatusCode: code,
    lifecycleStatus: statusName(code),
    lifecycleStatusUpdatedAt: now,
    opportunityId: context?.opportunityId ?? leads[idx].opportunityId,
    orderId: context?.orderId ?? leads[idx].orderId,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.LEADS, leads);
  return leads[idx];
}

export function setCustomerLifecycle(
  customerId: string | undefined,
  lifecycleStatus: string,
  context?: LifecycleContext,
): Customer | null {
  if (!customerId) return null;
  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const idx = customers.findIndex((customer) => customer.id === customerId);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  const code = normalizeLifecycleStatusCode(lifecycleStatus);
  customers[idx] = {
    ...hydrateCustomerLifecycle(customers[idx]),
    lifecycleStatusCode: code,
    lifecycleStatusUpdatedAt: now,
    publicPoolAt: code === LIFECYCLE_STATUS_CODES.PUBLIC_POOL ? now : customers[idx].publicPoolAt,
    releasedBy: code === LIFECYCLE_STATUS_CODES.PUBLIC_POOL ? context?.operator : customers[idx].releasedBy,
    releaseReason: code === LIFECYCLE_STATUS_CODES.PUBLIC_POOL ? context?.reason : customers[idx].releaseReason,
    updatedAt: now,
  };
  setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
  return customers[idx];
}

export function syncLeadLifecycleByLeadId(
  leadId: string | undefined,
  lifecycleStatus: string,
  links?: { opportunityId?: string; orderId?: string },
): void {
  setLeadLifecycle(leadId, lifecycleStatus, links);
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
  if (idx !== -1) setLeadLifecycle(leads[idx].id, lifecycleStatus, links);

  const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
  const customer = customers.find((item) => item.name === customerName || item.company === customerName);
  if (customer) setCustomerLifecycle(customer.id, lifecycleStatus, links);
}

export function syncLifecycleByOrder(order: Order, lifecycleStatus: string): void {
  const code = normalizeLifecycleStatusCode(lifecycleStatus);
  if (order.customerId) setCustomerLifecycle(order.customerId, code, { orderId: order.id });
  syncLeadLifecycleByCustomerName(order.customerName, code, { orderId: order.id });
}

export function releaseToPublicPool(target: { customerId?: string }, reason: string, operator?: string): void {
  const now = new Date().toISOString();
  if (target.customerId) {
    const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
    const idx = customers.findIndex((customer) => customer.id === target.customerId);
    if (idx !== -1) {
      customers[idx] = {
        ...hydrateCustomerLifecycle(customers[idx]),
        owner: '公海',
        lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
        lifecycleStatusUpdatedAt: now,
        publicPoolAt: now,
        releasedBy: operator,
        releaseReason: reason,
        updatedAt: now,
      };
      setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
    }
  }
}

export function claimFromPublicPool(target: { customerId?: string }, userName: string): void {
  const now = new Date().toISOString();
  if (target.customerId) {
    const customers = getStorageData<Customer[]>(STORAGE_KEYS.CUSTOMERS) || [];
    const idx = customers.findIndex((customer) => customer.id === target.customerId);
    if (idx !== -1) {
      customers[idx] = {
        ...hydrateCustomerLifecycle(customers[idx]),
        owner: userName,
        lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
        lifecycleStatusUpdatedAt: now,
        publicPoolAt: undefined,
        releasedBy: undefined,
        releaseReason: undefined,
        updatedAt: now,
      };
      setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
    }
  }
}

export function syncOpportunityRefundedByOrderId(orderId: string | undefined): void {
  if (!orderId) return;
  const opportunities = getStorageData<Opportunity[]>(STORAGE_KEYS.OPPORTUNITIES) || [];
  let changed = false;
  const next = opportunities.map((item) => {
    if (item.orderId !== orderId) return item;
    changed = true;
    syncLeadLifecycleByLeadId(item.leadId, LIFECYCLE_STATUS_CODES.REFUNDED, { opportunityId: item.id, orderId });
    return {
      ...item,
      status: '已退款' as const,
      lifecycleStatus: statusName(LIFECYCLE_STATUS_CODES.REFUNDED),
      updatedAt: new Date().toISOString(),
    };
  });
  if (changed) setStorageData(STORAGE_KEYS.OPPORTUNITIES, next);
}
