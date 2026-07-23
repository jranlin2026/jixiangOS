import type { Customer } from '../../types/customer';
import { LIFECYCLE_STATUS_CODES } from './constants';

function cleanOwner(value: unknown): string {
  const owner = String(value || '').trim();
  return owner && owner !== '公海' ? owner : '';
}

function earliestRecordedOwner(customer: Pick<Customer, 'activityRecords'>): string {
  const activities = [...(customer.activityRecords || [])].sort((left, right) => (
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  ));
  for (const activity of activities) {
    const ownerChange = activity.changes?.find((change) => change.field === 'owner');
    if (!ownerChange) continue;
    const previous = cleanOwner(ownerChange.oldValue);
    if (previous) return previous;
    const next = cleanOwner(ownerChange.newValue);
    if (next) return next;
  }
  return '';
}

/**
 * Keeps the first known sales owner durable across create/claim/transfer flows.
 * Legacy records are recovered from their oldest owner change, previous owner,
 * or current resolved owner in that order.
 */
export function resolveFirstSalesOwner(
  customer: Partial<Pick<Customer,
    'originalSalesTransferBy' | 'previousOwner' | 'owner' | 'ownerIdentityStatus' | 'lifecycleStatusCode' | 'activityRecords'
  >>,
  nextOwner?: string,
): string | undefined {
  const explicit = cleanOwner(customer.originalSalesTransferBy);
  if (explicit) return explicit;

  const recorded = earliestRecordedOwner(customer);
  if (recorded) return recorded;

  const previous = cleanOwner(customer.previousOwner);
  if (previous) return previous;

  const isPublicPool = customer.ownerIdentityStatus === 'public_pool'
    || customer.lifecycleStatusCode === LIFECYCLE_STATUS_CODES.PUBLIC_POOL
    || customer.owner === '公海';
  const current = isPublicPool ? '' : cleanOwner(customer.owner);
  return current || cleanOwner(nextOwner) || undefined;
}

export function hydrateCustomerFirstSalesOwner(customer: Customer): Customer {
  const firstOwner = resolveFirstSalesOwner(customer);
  return firstOwner && firstOwner !== customer.originalSalesTransferBy
    ? { ...customer, originalSalesTransferBy: firstOwner }
    : customer;
}
