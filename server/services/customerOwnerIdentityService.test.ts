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
  { id: 'row-4', domain: 'aaos_customers', recordId: 'c-4', updatedAt: new Date('2026-07-17T00:00:00Z'), data: { id: 'c-4', owner: '刘安慧', ownerId: 'u-2' } },
  { id: 'row-5', domain: 'aaos_customers', recordId: 'c-5', updatedAt: new Date('2026-07-17T00:00:00Z'), data: { id: 'c-5', owner: '刘安慧', ownerIdentityStatus: 'resolved' } },
  { id: 'row-6', domain: 'aaos_customers', recordId: 'c-6', updatedAt: new Date('2026-07-17T00:00:00Z'), data: { id: 'c-6', owner: '公海', ownerIdentityStatus: 'public_pool' } },
  { id: 'row-7', domain: 'aaos_customers', recordId: 'c-7', updatedAt: new Date('2026-07-17T00:00:00Z'), data: { id: 'c-7', owner: '刘安慧', ownerIdentityStatus: 'unresolved' } },
  { id: 'row-8', domain: 'aaos_customers', recordId: 'c-8', updatedAt: new Date('2026-07-17T00:00:00Z'), data: { id: 'c-8', owner: '张三', ownerId: 'u-2' } },
  { id: 'row-9', domain: 'aaos_customers', recordId: 'c-9', updatedAt: new Date('2026-07-17T00:00:00Z'), data: { id: 'c-9', owner: '未来员工', ownerId: 'missing-user' } },
  { id: 'row-10', domain: 'aaos_customers', recordId: 'c-a', updatedAt: new Date('2026-07-17T00:00:00Z'), data: { id: 'c-a', owner: '公海', ownerId: 'u-2' } },
];
const directUpdates: any[] = [];
const compareUpdates: any[] = [];
const checkpoints = new Map<string, any>();
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
  appStorage: {
    findUnique: async ({ where }: any) => checkpoints.has(where.key) ? { key: where.key, value: checkpoints.get(where.key) } : null,
    upsert: async ({ where, create, update }: any) => {
      checkpoints.set(where.key, checkpoints.has(where.key) ? update.value : create.value);
      return { key: where.key, value: checkpoints.get(where.key) };
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
  totalLegacy: 8, resolved: 4, unresolved: 2, ambiguous: 2, publicPool: 0, repairRequired: 3, updated: 0,
});
assert.equal(directUpdates.length, 0);
assert.equal((await backfillCustomerOwnerIdentities(prisma, { apply: true, checkpointKey: 'owner-backfill-checkpoint' })).updated, 8);
assert.equal(directUpdates.length, 0, '负责人回填不得直接覆盖客户 JSON');
assert.equal(compareUpdates.length, 8, '负责人回填必须逐客户锁定并 compare-and-save');
assert.equal((rows[0].data as any).ownerId, 'u-1');
assert.equal((rows[1].data as any).ownerIdentityStatus, 'unresolved');
assert.equal((rows[3].data as any).ownerId, 'u-2', '半迁移修复不得覆盖既有稳定 ownerId');
assert.equal((rows[3].data as any).ownerIdentityStatus, 'ambiguous', '稳定 ID 与姓名身份冲突必须 fail closed');
assert.equal((rows[4].data as any).ownerId, 'u-1', 'resolved-status-only 必须补齐唯一稳定 ID');
assert.equal((rows[6].data as any).ownerIdentityStatus, 'resolved', 'unresolved 身份应能安全重试');
assert.equal((rows[7].data as any).ownerIdentityStatus, 'resolved', 'ownerId-only 应补齐 resolved 状态');
assert.equal((rows[8].data as any).ownerId, 'missing-user', '失效稳定 ID 也不得按姓名覆盖');
assert.equal((rows[8].data as any).ownerIdentityStatus, 'unresolved');
assert.equal((rows[9].data as any).ownerId, 'u-2');
assert.equal((rows[9].data as any).ownerIdentityStatus, 'ambiguous', '公海显示与稳定 ownerId 并存必须 fail closed');
assert.equal(checkpoints.get('owner-backfill-checkpoint').lastRecordId, 'c-a');
assert.equal(
  (await backfillCustomerOwnerIdentities(prisma, false)).repairRequired,
  3,
  '已完成状态字段回填的人工修复项仍必须出现在后续报告',
);

rows.push({
  id: 'row-11', domain: 'aaos_customers', recordId: 'z-10', updatedAt: new Date('2026-07-17T00:00:00Z'),
  data: { id: 'z-10', owner: '刘安慧' },
});
assert.equal(
  (await backfillCustomerOwnerIdentities(prisma, { apply: true, checkpointKey: 'owner-backfill-checkpoint' })).updated,
  1,
  'checkpoint 重跑只处理后续记录',
);
assert.equal(checkpoints.get('owner-backfill-checkpoint').lastRecordId, 'z-10');

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
