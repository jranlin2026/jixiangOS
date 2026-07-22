import type { Customer, CustomerActivityRecord } from '../../types/customer';

export function getLatestCustomerFollowUp(
  customer: Pick<Customer, 'activityRecords'>,
): CustomerActivityRecord | undefined {
  return (customer.activityRecords || []).reduce<CustomerActivityRecord | undefined>((selected, record) => {
    if (record.type !== 'follow') return selected;
    if (!selected) return record;
    const selectedAt = Date.parse(selected.createdAt) || 0;
    const recordAt = Date.parse(record.createdAt) || 0;
    return recordAt > selectedAt ? record : selected;
  }, undefined);
}
