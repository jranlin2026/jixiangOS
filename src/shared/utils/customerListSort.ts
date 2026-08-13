import type { Customer, CustomerListSort } from '../../types/customer';

const timestamp = (value?: string | null): number => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const byIdDesc = (left: Customer, right: Customer): number => right.id.localeCompare(left.id);

export function sortCustomersForList(customers: Customer[], sortBy: CustomerListSort = 'created_at'): Customer[] {
  return [...customers].sort((left, right) => {
    if (sortBy === 'platform_payment') {
      const leftPaymentAt = timestamp(left.sourcePaymentAt);
      const rightPaymentAt = timestamp(right.sourcePaymentAt);
      if (leftPaymentAt === 0 && rightPaymentAt !== 0) return 1;
      if (leftPaymentAt !== 0 && rightPaymentAt === 0) return -1;
      return rightPaymentAt - leftPaymentAt || byIdDesc(left, right);
    }
    if (sortBy === 'recent_activity') {
      return timestamp(right.updatedAt) - timestamp(left.updatedAt)
        || timestamp(right.createdAt) - timestamp(left.createdAt)
        || byIdDesc(left, right);
    }
    return timestamp(right.createdAt) - timestamp(left.createdAt) || byIdDesc(left, right);
  });
}
