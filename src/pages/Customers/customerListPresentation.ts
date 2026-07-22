import type { Customer, CustomerManageableUser } from '../../types/customer';
import { getLatestCustomerFollowUp } from '../../shared/utils/customerFollowUp';

export function getLastFollowUpOperator(customer: Pick<Customer, 'activityRecords'>): string {
  const latest = getLatestCustomerFollowUp(customer);
  return latest?.operator?.trim() || '暂无跟进';
}

export function getPreviousOwnerLabel(customer: Pick<Customer, 'previousOwner'>): string {
  return customer.previousOwner?.trim() || '-';
}

export function buildLastFollowUpFilterUsers(
  customers: Array<Pick<Customer, 'activityRecords'>>,
  selectedName = '',
): CustomerManageableUser[] {
  const names = customers
    .map((customer) => getLatestCustomerFollowUp(customer)?.operator?.trim() || '')
    .filter(Boolean);
  const selected = selectedName.trim();
  if (selected) names.push(selected);
  return Array.from(new Set(names)).map((name) => ({ id: `last-follow-up:${name}`, name }));
}
