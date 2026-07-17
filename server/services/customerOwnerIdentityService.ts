import type { Customer } from '../../src/types/customer';
import { createCustomerBusinessRecordRepository } from './customerBusinessRecordRepository';
import { success, type ApiResponse } from '../api/response';
import { customerWriteConflictResponse } from './customerWriteConflict';
import {
  backfillContactIdentities,
  type ContactIdentityBackfillOptions,
  type ContactIdentityBackfillSummary,
} from './contactIdentityService';

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
  repairRequired: number;
  updated: number;
}

export interface CustomerOwnerBackfillOptions {
  apply: boolean;
  checkpointKey?: string;
}

type NormalizedBackfillOptions = Required<Pick<CustomerOwnerBackfillOptions, 'apply'>>
  & Pick<CustomerOwnerBackfillOptions, 'checkpointKey'>;

type OwnerIdentityPlan = {
  identity: { ownerId: string | undefined; ownerIdentityStatus: CustomerOwnerIdentityStatus };
  needsReview: boolean;
  isComplete: boolean;
};

function normalizeBackfillOptions(input: boolean | CustomerOwnerBackfillOptions): NormalizedBackfillOptions {
  if (typeof input === 'boolean') return { apply: input };
  const checkpointKey = String(input.checkpointKey || '').trim();
  return { apply: input.apply === true, checkpointKey: checkpointKey || undefined };
}

function activeDirectoryUserById(ownerId: string, users: OwnerDirectoryUser[]) {
  return users.find((user) => (
    user.id === ownerId
    && user.isActive
    && (user.employmentStatus || 'active') === 'active'
  ));
}

function planCustomerOwnerIdentity(customer: Customer, users: OwnerDirectoryUser[]): OwnerIdentityPlan {
  const ownerId = String(customer.ownerId || '').trim();
  const currentStatus = customer.ownerIdentityStatus;
  if (!ownerId && currentStatus === 'public_pool' && String(customer.owner || '').trim() === '公海') {
    return {
      identity: { ownerId: undefined, ownerIdentityStatus: 'public_pool' },
      needsReview: false,
      isComplete: true,
    };
  }

  const nameIdentity = resolveCustomerOwnerIdentity(customer.owner, users);
  if (ownerId) {
    const stableUser = activeDirectoryUserById(ownerId, users);
    const ownerMarker = String(customer.owner || '').trim();
    const publicPoolContradiction = !ownerMarker
      || ownerMarker === '公海'
      || currentStatus === 'public_pool';
    const conflictingNameId = nameIdentity.ownerIdentityStatus === 'resolved'
      && nameIdentity.ownerId !== ownerId;
    const ownerIdentityStatus: CustomerOwnerIdentityStatus = publicPoolContradiction || conflictingNameId
      ? 'ambiguous'
      : stableUser
        ? 'resolved'
        : 'unresolved';
    return {
      identity: { ownerId, ownerIdentityStatus },
      needsReview: publicPoolContradiction || conflictingNameId || !stableUser,
      isComplete: currentStatus === ownerIdentityStatus,
    };
  }

  return {
    identity: nameIdentity,
    needsReview: false,
    isComplete: currentStatus === nameIdentity.ownerIdentityStatus
      && customer.ownerId === nameIdentity.ownerId,
  };
}

function incrementIdentitySummary(summary: CustomerOwnerBackfillSummary, plan: OwnerIdentityPlan) {
  if (plan.identity.ownerIdentityStatus === 'public_pool') summary.publicPool += 1;
  else summary[plan.identity.ownerIdentityStatus] += 1;
}

export async function backfillCustomerOwnerIdentities(
  prisma: any,
  input: boolean | CustomerOwnerBackfillOptions = false,
): Promise<CustomerOwnerBackfillSummary> {
  const options = normalizeBackfillOptions(input);
  const [rows, users] = await Promise.all([
    prisma.businessRecord.findMany({ where: { domain: 'aaos_customers' }, orderBy: { recordId: 'asc' } }),
    prisma.user.findMany(),
  ]);
  const summary: CustomerOwnerBackfillSummary = {
    totalLegacy: 0, resolved: 0, unresolved: 0, ambiguous: 0, publicPool: 0, repairRequired: 0, updated: 0,
  };
  const sortedRows = [...rows].sort((left, right) => (
    String(left.recordId || '').localeCompare(String(right.recordId || ''))
  ));
  for (const row of sortedRows) {
    const customer = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    if (!customer) continue;
    const plan = planCustomerOwnerIdentity(customer, users);
    if (plan.needsReview) summary.repairRequired += 1;
    if (plan.isComplete) continue;
    summary.totalLegacy += 1;
    incrementIdentitySummary(summary, plan);
  }
  if (!options.apply || sortedRows.length === 0) return summary;

  for (const row of sortedRows) {
    const rowUpdated = await prisma.$transaction(async (tx: any) => {
      if (options.checkpointKey) {
        if (!tx.appStorage?.findUnique || !tx.appStorage?.upsert) {
          throw new Error('负责人身份回填 checkpoint 存储不可用');
        }
        const checkpoint = await tx.appStorage.findUnique({ where: { key: options.checkpointKey } });
        const lastRecordId = String(checkpoint?.value?.lastRecordId || '');
        if (lastRecordId && String(row.recordId).localeCompare(lastRecordId) <= 0) return 0;
      }

      const repository = createCustomerBusinessRecordRepository(tx);
      const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      const recordId = String(row.recordId || parsed?.id || '').trim();
      if (!recordId) return 0;
      const snapshot = await repository.lockById(recordId);
      let changed = 0;
      if (snapshot) {
        const currentUsers = tx.user?.findMany ? await tx.user.findMany() : users;
        const plan = planCustomerOwnerIdentity(snapshot.customer, currentUsers);
        if (!plan.isComplete) {
          const at = new Date();
          const next: Customer = {
            ...snapshot.customer,
            ownerId: plan.identity.ownerId,
            ownerIdentityStatus: plan.identity.ownerIdentityStatus,
            updatedAt: at.toISOString(),
          };
          await repository.compareAndSave(snapshot, next, at);
          changed = 1;
        }
      }
      if (options.checkpointKey) {
        const value = { version: 1, lastRecordId: recordId, updatedAt: new Date().toISOString() };
        await tx.appStorage.upsert({
          where: { key: options.checkpointKey },
          update: { value },
          create: { key: options.checkpointKey, value },
        });
      }
      return changed;
    });
    summary.updated += rowUpdated;
  }
  return summary;
}

export async function backfillCustomerOwnerIdentitiesResult(
  prisma: any,
  input: boolean | CustomerOwnerBackfillOptions = false,
): Promise<ApiResponse<CustomerOwnerBackfillSummary | null>> {
  try {
    return success(await backfillCustomerOwnerIdentities(prisma, input));
  } catch (error) {
    const conflict = customerWriteConflictResponse<CustomerOwnerBackfillSummary>(error);
    if (conflict) return conflict;
    throw error;
  }
}

/**
 * Keeps the two pre-release identity reports behind the existing migration
 * module without coupling either backfill's transaction to the other. Contact
 * apply mutates only identity/link/candidate tables; customer JSON is untouched.
 */
export async function backfillCustomerContactIdentitiesResult(
  prisma: any,
  options: ContactIdentityBackfillOptions,
): Promise<ApiResponse<ContactIdentityBackfillSummary | null>> {
  return success(await backfillContactIdentities(prisma, options));
}
