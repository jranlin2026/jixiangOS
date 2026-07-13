import type { Customer } from '../../src/types/customer';

export type CustomerOwnerIdentityStatus = NonNullable<Customer['ownerIdentityStatus']>;

export interface OwnerDirectoryUser {
  id: string;
  name: string;
  isActive: boolean;
  employmentStatus?: string | null;
}

export function resolveCustomerOwnerIdentity(ownerInput: unknown, users: OwnerDirectoryUser[]): {
  ownerId: string | undefined;
  ownerIdentityStatus: CustomerOwnerIdentityStatus;
} {
  const owner = String(ownerInput || '').trim();
  if (!owner || owner === '公海') return { ownerId: undefined, ownerIdentityStatus: 'public_pool' };
  const matches = users.filter((user) => (
    user.name.trim() === owner
    && user.isActive
    && (user.employmentStatus || 'active') === 'active'
  ));
  if (matches.length === 1) return { ownerId: matches[0].id, ownerIdentityStatus: 'resolved' };
  if (matches.length > 1) return { ownerId: undefined, ownerIdentityStatus: 'ambiguous' };
  return { ownerId: undefined, ownerIdentityStatus: 'unresolved' };
}

export interface CustomerOwnerBackfillSummary {
  totalLegacy: number;
  resolved: number;
  unresolved: number;
  ambiguous: number;
  publicPool: number;
  updated: number;
}

export async function backfillCustomerOwnerIdentities(prisma: any, apply = false): Promise<CustomerOwnerBackfillSummary> {
  const [rows, users] = await Promise.all([
    prisma.businessRecord.findMany({ where: { domain: 'aaos_customers' } }),
    prisma.user.findMany(),
  ]);
  const summary: CustomerOwnerBackfillSummary = {
    totalLegacy: 0, resolved: 0, unresolved: 0, ambiguous: 0, publicPool: 0, updated: 0,
  };
  for (const row of rows) {
    const customer = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    if (!customer || customer.ownerId || customer.ownerIdentityStatus) continue;
    summary.totalLegacy += 1;
    const identity = resolveCustomerOwnerIdentity(customer.owner, users);
    if (identity.ownerIdentityStatus === 'public_pool') summary.publicPool += 1;
    else summary[identity.ownerIdentityStatus] += 1;
    if (!apply) continue;
    const next = { ...customer, ...identity };
    await prisma.businessRecord.update({
      where: { id: row.id },
      data: { data: next, owner: next.owner || null, updatedAt: new Date() },
    });
    summary.updated += 1;
  }
  return summary;
}
