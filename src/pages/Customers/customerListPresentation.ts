import type { Customer, CustomerManageableUser } from '../../types/customer';
import { getCustomerLastFollowUpOwner } from '../../shared/utils/customerFollowUp';

export function getLastFollowUpOperator(customer: Pick<Customer, 'activityRecords' | 'previousOwner'>): string {
  return getCustomerLastFollowUpOwner(customer);
}

export function getPreviousOwnerLabel(customer: Pick<Customer, 'previousOwner'>): string {
  return customer.previousOwner?.trim() || '-';
}

export function buildLastFollowUpFilterUsers(
  customers: Array<Pick<Customer, 'activityRecords' | 'previousOwner'>>,
  selectedName = '',
): CustomerManageableUser[] {
  const names = customers
    .map(getCustomerLastFollowUpOwner)
    .filter(Boolean);
  const selected = selectedName.trim();
  if (selected) names.push(selected);
  return Array.from(new Set(names)).map((name) => ({ id: `last-follow-up:${name}`, name }));
}
