import type { Customer, CustomerManageableUser } from '../../types/customer';
import { getCustomerLastFollowUpOwner } from '../../shared/utils/customerFollowUp';

export function getLastFollowUpOperator(customer: Pick<Customer, 'activityRecords' | 'previousOwner'>): string {
  return getCustomerLastFollowUpOwner(customer);
}

export function getPreviousOwnerLabel(customer: Pick<Customer, 'previousOwner'>): string {
  return customer.previousOwner?.trim() || '-';
}

export function buildPreviousOwnerFilterUsers(
  customers: Array<Pick<Customer, 'previousOwner'>>,
  selectedName = '',
): CustomerManageableUser[] {
  const names = customers
    .map((customer) => customer.previousOwner?.trim() || '')
    .filter(Boolean);
  const selected = selectedName.trim();
  if (selected) names.push(selected);
  return Array.from(new Set(names)).map((name) => ({ id: `previous-owner:${name}`, name }));
}
