import assert from 'node:assert/strict';
import { createCustomerListService } from './customerListService';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { Customer } from '../../src/types/customer';

const NOW = new Date('2026-07-17T03:00:00.000Z');
const actor = {
  id: 'user-a', name: '销售甲', account: 'sales-a', email: '', phone: '', role: '自定义' as any,
  roleId: 'role-sales', departmentId: 'dept-sales', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, actions: ['read', 'write'] }],
};
const users = [
  { ...actor, avatar: null, positionId: null, positionName: null, passwordHash: null, passwordSalt: null, passwordUpdatedAt: null, lastLoginAt: null, employmentStatus: 'active', leftAt: null, leftBy: null, createdAt: NOW, updatedAt: NOW },
  { ...actor, id: 'user-b', name: '销售乙', account: 'sales-b', avatar: null, positionId: null, positionName: null, passwordHash: null, passwordSalt: null, passwordUpdatedAt: null, lastLoginAt: null, employmentStatus: 'active', leftAt: null, leftBy: null, createdAt: NOW, updatedAt: NOW },
];
const role = {
  id: 'role-sales', name: '自定义', code: 'custom', description: null, departmentId: 'dept-sales',
  permissions: [
    { module: PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.LEADS_FOLLOW, actions: ['read', 'write'] },
  ],
  dataScopes: { customers: 'self' }, memberCount: 2, isActive: true, createdAt: NOW, updatedAt: NOW,
};
const department = { id: 'dept-sales', name: '销售部', code: 'SALES', parentId: null, managerId: null, memberCount: 2, sortOrder: 1, isActive: true, createdAt: NOW, updatedAt: NOW };

function value(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-access', name: '客户', company: '公司', phone: '13800000000',
    owner: actor.name, ownerId: actor.id, ownerIdentityStatus: 'resolved', customerLevel: 'L1',
    lifecycleStatusCode: 'pending_followup', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], activityRecords: [],
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...overrides,
  };
}

function fixture(initial: Customer, roleOverride = role, conflict = false, failAuditWrite = false) {
  let customer = structuredClone(initial);
  let version = new Date(NOW);
  let directUpdates = 0;
  let compareSaves = 0;
  const auditEvents: any[] = [];
  const row = () => ({
    id: `${STORAGE_KEYS.CUSTOMERS}:${customer.id}`,
    domain: STORAGE_KEYS.CUSTOMERS,
    recordId: customer.id,
    customerId: customer.id,
    owner: customer.owner,
    data: structuredClone(customer),
    updatedAt: new Date(version),
  });
  const tx: any = {
    user: { findMany: async () => users },
    role: { findMany: async () => [roleOverride] },
    department: { findMany: async () => [department] },
    leadRecord: { findMany: async () => [], update: async () => null },
    customerAuditEvent: {
      create: async ({ data }: any) => {
        if (failAuditWrite) throw new Error('audit write failed');
        const event = { ...data, eventSequence: BigInt(auditEvents.length + 1), createdAt: NOW };
        auditEvents.push(event);
        return event;
      },
    },
    businessRecord: {
      findUnique: async () => row(),
      findMany: async () => [],
      update: async ({ data }: any) => {
        directUpdates += 1;
        customer = structuredClone(data.data);
        return row();
      },
      updateMany: async ({ where, data }: any) => {
        compareSaves += 1;
        if (conflict) return { count: 0 };
        if (new Date(where.updatedAt).getTime() !== version.getTime()) return { count: 0 };
        customer = structuredClone(data.data);
        version = new Date(version.getTime() + 1);
        return { count: 1 };
      },
    },
    $queryRaw: async () => [row()],
  };
  const prisma = {
    ...tx,
    $transaction: async (operation: any) => {
      const beforeCustomer = structuredClone(customer);
      const beforeVersion = new Date(version);
      const beforeAuditCount = auditEvents.length;
      try {
        return await operation(tx);
      } catch (error) {
        customer = beforeCustomer;
        version = beforeVersion;
        auditEvents.splice(beforeAuditCount);
        throw error;
      }
    },
  };
  return {
    service: createCustomerListService(prisma as any),
    customer: () => structuredClone(customer),
    get directUpdates() { return directUpdates; },
    get compareSaves() { return compareSaves; },
    auditEvents: () => structuredClone(auditEvents),
  };
}

const owned = fixture(value());
const followed = await owned.service.addFollowUp('customer-access', { content: '跟进记录' }, actor as any);
assert.equal(followed.code, 0);
assert.equal(followed.data?.lifecycleStatusCode, 'following', '跟进命令可原子推进系统派生状态');
assert.equal(owned.directUpdates, 0, '跟进不得直接覆盖 BusinessRecord JSON');
assert.equal(owned.compareSaves, 1);
assert.equal(owned.auditEvents()[0]?.operation, 'add_follow_up');
assert.match(owned.auditEvents()[0]?.inputHash || '', /^[a-f0-9]{64}$/);

const followAuditRollbackInput = value({ id: 'customer-follow-audit-rollback' });
const followAuditRollback = fixture(followAuditRollbackInput, role, false, true);
await assert.rejects(
  () => followAuditRollback.service.addFollowUp('customer-follow-audit-rollback', { content: '不能部分提交' }, actor as any),
  /audit write failed/,
);
assert.deepEqual(followAuditRollback.customer(), followAuditRollbackInput);
assert.deepEqual(followAuditRollback.auditEvents(), []);

const followConflict = fixture(value({ id: 'customer-follow-conflict' }), role, true);
const followConflictResult = await followConflict.service.addFollowUp(
  'customer-follow-conflict',
  { content: '并发跟进' },
  actor as any,
);
assert.equal(followConflictResult.code, 409);
assert.match(followConflictResult.message, /客户记录已更新/);

const contributed = fixture(value({
  id: 'customer-contributed', owner: '销售乙', ownerId: 'user-b', leadContributorId: actor.id,
}));
const readOnlyWrite = await contributed.service.addFollowUp('customer-contributed', { content: '越权跟进' }, actor as any);
assert.equal(readOnlyWrite.code, 403, '贡献人可读不得跟进他人客户');
assert.equal(contributed.compareSaves, 0);

const noProfileRole = { ...role, permissions: [{ module: PERMISSION_KEYS.LEADS_FOLLOW, actions: ['read'] }] };
const noProfile = fixture(value({ id: 'customer-no-profile' }), noProfileRole);
const noProfileResult = await noProfile.service.addFollowUp('customer-no-profile', { content: '无权跟进' }, { ...actor, permissions: [] } as any);
assert.equal(noProfileResult.code, 403);
assert.equal(noProfile.compareSaves, 0);

const unresolved = fixture(value({ ownerId: undefined, ownerIdentityStatus: 'unresolved' }));
assert.equal((await unresolved.service.getById('customer-access', actor as any)).code, 0, '未解析负责人仅保留旧姓名规则的只读兼容');
assert.equal((await unresolved.service.addFollowUp('customer-access', { content: '不得写' }, actor as any)).code, 403);

console.log('customer list access policy tests passed');
