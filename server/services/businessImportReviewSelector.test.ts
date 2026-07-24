import assert from 'node:assert/strict';
import { createBusinessImportReviewSelector } from './businessImportPersistence';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';

const now = new Date('2026-07-25T00:00:00.000Z');

function actor(id: string, roleId: string, departmentId: string): AuthenticatedUser {
  return {
    id,
    name: id,
    account: id,
    email: `${id}@example.com`,
    phone: '',
    role: roleId as AuthenticatedUser['role'],
    roleId,
    departmentId,
    permissions: [],
    isActive: true,
  };
}

function dbUser(user: AuthenticatedUser) {
  return {
    ...user,
    account: user.account,
    avatar: null,
    departmentId: user.departmentId || null,
    positionId: null,
    positionName: null,
    roleId: user.roleId || null,
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
    mustChangePassword: false,
    lastLoginAt: null,
    employmentStatus: 'active',
    leftAt: null,
    leftBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

function role(id: string, scope: 'self' | 'department' | 'all' | 'none') {
  return {
    id,
    name: id,
    code: id,
    description: null,
    departmentId: null,
    permissions: [],
    dataScopes: { orderApplications: scope, recoveryOrderApplications: scope },
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

const selfReviewer = actor('reviewer-self', 'role-self', 'dept-root');
const departmentReviewer = actor('reviewer-department', 'role-department', 'dept-root');
const allReviewer = actor('reviewer-all', 'role-all', 'dept-root');
const noScopeReviewer = actor('reviewer-none', 'role-none', 'dept-root');
const teammate = actor('teammate', 'role-self', 'dept-root');
const descendant = actor('descendant', 'role-self', 'dept-child');
const outsider = actor('outsider', 'role-self', 'dept-outside');

const records = [
  { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: 'pending-imported', data: { importBatchId: 'batch-1', status: '待财务审核' } },
  { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: 'returned-imported', data: { importBatchId: 'batch-1', status: '退回修改' } },
  { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: 'manual-pending', data: { status: '待财务审核' } },
  { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: 'recovery-pending', data: { importBatchId: 'batch-1', status: '待审核' } },
  { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: 'recovery-approved', data: { importBatchId: 'batch-1', status: '待分账' } },
  { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: 'order-self', data: { importBatchId: 'batch-scope', status: '待财务审核', applicantId: selfReviewer.id, applicantName: selfReviewer.name } },
  { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: 'order-teammate', data: { importBatchId: 'batch-scope', status: '待财务审核', applicantId: teammate.id, applicantName: teammate.name } },
  { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: 'order-descendant', data: { importBatchId: 'batch-scope', status: '待财务审核', applicantId: descendant.id, applicantName: descendant.name } },
  { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: 'order-outsider', data: { importBatchId: 'batch-scope', status: '待财务审核', applicantId: outsider.id, applicantName: outsider.name } },
  { domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: 'order-no-scope', data: { importBatchId: 'batch-no-scope', status: '待财务审核', applicantId: noScopeReviewer.id, applicantName: noScopeReviewer.name } },
  { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: 'recovery-self', data: { importBatchId: 'batch-recovery-scope', status: '待审核', createdBy: departmentReviewer.id, createdByName: departmentReviewer.name } },
  { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: 'recovery-teammate', data: { importBatchId: 'batch-recovery-scope', status: '待审核', createdBy: teammate.id, createdByName: teammate.name } },
  { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: 'recovery-descendant', data: { importBatchId: 'batch-recovery-scope', status: '待审核', createdBy: descendant.id, createdByName: descendant.name } },
  { domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: 'recovery-outsider', data: { importBatchId: 'batch-recovery-scope', status: '待审核', createdBy: outsider.id, createdByName: outsider.name } },
];
const prisma = {
  user: { findMany: async () => [selfReviewer, departmentReviewer, allReviewer, noScopeReviewer, teammate, descendant, outsider].map(dbUser) },
  role: { findMany: async () => [role('role-self', 'self'), role('role-department', 'department'), role('role-all', 'all'), role('role-none', 'none')] },
  department: { findMany: async () => [
    { id: 'dept-root', name: '根部门', code: 'ROOT', parentId: null, managerId: null, memberCount: 3, sortOrder: 1, isActive: true, createdAt: now, updatedAt: now },
    { id: 'dept-child', name: '子部门', code: 'CHILD', parentId: 'dept-root', managerId: null, memberCount: 1, sortOrder: 2, isActive: true, createdAt: now, updatedAt: now },
    { id: 'dept-outside', name: '外部门', code: 'OUTSIDE', parentId: null, managerId: null, memberCount: 1, sortOrder: 3, isActive: true, createdAt: now, updatedAt: now },
  ] },
  businessRecord: {
    findMany: async ({ where }: any) => records.filter((record) => (
      record.domain === where.domain
      && (!where.recordId?.in || where.recordId.in.includes(record.recordId))
    )),
  },
} as any;
const select = createBusinessImportReviewSelector(prisma);

assert.deepEqual(
  await select({ module: 'orders', action: 'approve', importBatchId: 'batch-1' }, allReviewer),
  [{ id: 'pending-imported', module: 'orders' }],
  'full-batch selection only expands imported pending applications',
);
assert.deepEqual(
  await select({ module: 'recovery_orders', action: 'approve', importBatchId: 'batch-1' }, allReviewer),
  [{ id: 'recovery-pending', module: 'recovery_orders' }],
  'full-batch selection only expands imported pending recovery records',
);
assert.deepEqual(
  await select({ module: 'orders', action: 'approve', ids: ['returned-imported'] }, allReviewer),
  [],
  'explicit IDs cannot bypass pending-state selection',
);

assert.deepEqual(
  await select({ module: 'orders', action: 'approve', importBatchId: 'batch-scope' }, selfReviewer),
  [{ id: 'order-self', module: 'orders' }],
  'a self-scoped reviewer cannot expand a batch beyond their own applications',
);
assert.deepEqual(
  await select({ module: 'recovery_orders', action: 'approve', importBatchId: 'batch-recovery-scope' }, departmentReviewer),
  [
    { id: 'recovery-self', module: 'recovery_orders' },
    { id: 'recovery-teammate', module: 'recovery_orders' },
    { id: 'recovery-descendant', module: 'recovery_orders' },
  ],
  'a department-scoped reviewer expands only the department and descendants',
);
assert.deepEqual(
  await select({ module: 'orders', action: 'approve', ids: ['order-self', 'order-outsider'] }, selfReviewer),
  [{ id: 'order-self', module: 'orders' }],
  'explicit IDs cannot bypass the reviewer data scope',
);
assert.equal(
  (await select({ module: 'orders', action: 'approve', importBatchId: 'batch-scope' }, allReviewer)).length,
  4,
  'all scope can select every pending imported record in the batch',
);
assert.deepEqual(
  await select({ module: 'orders', action: 'approve', importBatchId: 'batch-no-scope' }, noScopeReviewer),
  [],
  'an invalid/no-access server data scope cannot select even the actor own record',
);
