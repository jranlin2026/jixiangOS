import assert from 'node:assert/strict';
import { backfillCustomerOwnerIdentities, resolveCustomerOwnerIdentity } from './customerOwnerIdentityService';

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
  { id: 'row-1', data: { id: 'c-1', owner: '刘安慧' } },
  { id: 'row-2', data: { id: 'c-2', owner: '未来员工' } },
  { id: 'row-3', data: { id: 'c-3', owner: '张三', ownerId: 'u-2', ownerIdentityStatus: 'resolved' } },
];
const updates: any[] = [];
const prisma = {
  user: { findMany: async () => users },
  businessRecord: {
    findMany: async () => rows,
    update: async (input: any) => updates.push(input),
  },
};
assert.deepEqual(await backfillCustomerOwnerIdentities(prisma, false), {
  totalLegacy: 2, resolved: 1, unresolved: 1, ambiguous: 0, publicPool: 0, updated: 0,
});
assert.equal(updates.length, 0);
assert.equal((await backfillCustomerOwnerIdentities(prisma, true)).updated, 2);
assert.equal(updates[0].data.data.ownerId, 'u-1');
assert.equal(updates[1].data.data.ownerIdentityStatus, 'unresolved');
