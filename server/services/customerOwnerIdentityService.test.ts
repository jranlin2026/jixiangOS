import assert from 'node:assert/strict';
import {
  backfillCustomerOwnerIdentities,
  backfillCustomerOwnerIdentitiesResult,
  resolveCustomerOwnerIdentity,
} from './customerOwnerIdentityService';

const users = [
  { id: 'u-1', name: '刘安慧', isActive: true, employmentStatus: 'active' },
  { id: 'u-2', name: '张三', isActive: true, employmentStatus: 'active' },
];

assert.deepEqual(resolveCustomerOwnerIdentity('刘安慧', users), { ownerId: 'u-1', ownerIdentityStatus: 'resolved' });
assert.deepEqual(resolveCustomerOwnerIdentity('未来员工', users), { ownerId: undefined, ownerIdentityStatus: 'unresolved' });
assert.deepEqual(resolveCustomerOwnerIdentity('刘安慧', [...users, { ...users[0], id: 'u-3' }]), {
  ownerId: undefined,
  ownerIdentityStatus: 'ambiguous',
});
assert.deepEqual(resolveCustomerOwnerIdentity('公海', users), { ownerId: undefined, ownerIdentityStatus: 'public_pool' });

const rows = [
  { id: 'row-1', domain: 'aaos_customers', recordId: 'c-1', updatedAt: new Date('2026-07-17T00:00:00Z'), data: { id: 'c-1', owner: '刘安慧' } },
  { id: 'row-2', domain: 'aaos_customers', recordId: 'c-2', updatedAt: new Date('2026-07-17T00:00:00Z'), data: { id: 'c-2', owner: '未来员工' } },
  { id: 'row-3', domain: 'aaos_customers', recordId: 'c-3', updatedAt: new Date('2026-07-17T00:00:00Z'), data: { id: 'c-3', owner: '张三', ownerId: 'u-2', ownerIdentityStatus: 'resolved' } },
];
const directUpdates: any[] = [];
const compareUpdates: any[] = [];
const prisma = {
  user: { findMany: async () => users },
  businessRecord: {
    findMany: async () => rows,
    update: async (input: any) => directUpdates.push(input),
    updateMany: async (input: any) => {
      const row = rows.find((candidate) => candidate.id === input.where.id)!;
      if (row.updatedAt.getTime() !== new Date(input.where.updatedAt).getTime()) return { count: 0 };
      compareUpdates.push(input);
      row.data = input.data.data;
      row.updatedAt = new Date(row.updatedAt.getTime() + 1);
      return { count: 1 };
    },
  },
  $queryRaw: async (query: any) => {
    const recordId = query.values?.at(-1);
    const row = rows.find((candidate) => candidate.recordId === recordId);
    return row ? [{ ...row }] : [];
  },
  $transaction: async (operation: any) => operation(prisma),
};
assert.deepEqual(await backfillCustomerOwnerIdentities(prisma, false), {
  totalLegacy: 2, resolved: 1, unresolved: 1, ambiguous: 0, publicPool: 0, updated: 0,
});
assert.equal(directUpdates.length, 0);
assert.equal((await backfillCustomerOwnerIdentities(prisma, true)).updated, 2);
assert.equal(directUpdates.length, 0, '负责人回填不得直接覆盖客户 JSON');
assert.equal(compareUpdates.length, 2, '负责人回填必须逐客户锁定并 compare-and-save');
assert.equal((rows[0].data as any).ownerId, 'u-1');
assert.equal((rows[1].data as any).ownerIdentityStatus, 'unresolved');

const conflictRow = {
  id: 'row-conflict', domain: 'aaos_customers', recordId: 'c-conflict',
  updatedAt: new Date('2026-07-17T00:00:00Z'), data: { id: 'c-conflict', owner: '刘安慧' },
};
const conflictPrisma: any = {
  user: { findMany: async () => users },
  businessRecord: {
    findMany: async () => [conflictRow],
    updateMany: async () => ({ count: 0 }),
  },
  $queryRaw: async () => [{ ...conflictRow }],
};
conflictPrisma.$transaction = async (operation: any) => operation(conflictPrisma);
const conflictResult = await backfillCustomerOwnerIdentitiesResult(conflictPrisma, true);
assert.equal(conflictResult.code, 409);
assert.match(conflictResult.message, /客户记录已更新/);
