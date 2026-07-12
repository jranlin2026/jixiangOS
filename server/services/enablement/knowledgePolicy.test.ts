import assert from 'node:assert/strict';
import { PERMISSION_KEYS } from '../../../src/shared/utils/permissions';
import { canPublishKnowledge, canReadKnowledge, canReviewKnowledge } from './knowledgePolicy';

const employee = {
  id: 'user-sales', name: 'Sales', account: 'sales', email: '', phone: '', role: 'Employee',
  departmentId: 'dept-sales', roleId: 'role-sales', positionId: 'pos-sales', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE, actions: ['read'] }],
} as any;
const reviewer = {
  ...employee, id: 'user-manager',
  permissions: [{ module: PERMISSION_KEYS.ENABLEMENT_REVIEW, actions: ['read', 'write'] }],
} as any;
const inheritedReviewer = {
  ...employee, id: 'user-enablement-manager',
  permissions: [{ module: PERMISSION_KEYS.ENABLEMENT, actions: ['read', 'write'] }],
} as any;
const publisher = {
  ...employee, id: 'user-publisher',
  permissions: [{ module: PERMISSION_KEYS.ENABLEMENT_PUBLISH, actions: ['read', 'write'] }],
} as any;
const activeSuperAdmin = {
  ...employee, id: 'user-super-admin', role: 'Super Admin', roleId: 'role-super-admin',
  permissions: [{ module: '全部', actions: ['admin'] }],
} as any;
const inactiveSuperAdmin = { ...activeSuperAdmin, id: 'user-inactive-super-admin', isActive: false } as any;
const roleDerivedSuperAdmin = {
  ...employee, id: 'user-role-derived-super-admin', roleId: 'role-super-admin',
} as any;
const readOnlyAllPermissions = {
  ...employee, id: 'user-read-all',
  permissions: [{ module: '全部', actions: ['read'] }],
} as any;

assert.equal(canReadKnowledge(employee, { sensitivity: 'INTERNAL', visibility: [{ id: 'v1', subjectType: 'ALL_EMPLOYEES' }] } as any), true);
assert.equal(canReadKnowledge(employee, { ownerDepartmentId: 'dept-sales', sensitivity: 'DEPARTMENT', visibility: [{ id: 'v2', subjectType: 'DEPARTMENT', subjectId: 'dept-sales' }] } as any), true);
assert.equal(canReadKnowledge(employee, { ownerDepartmentId: 'dept-finance', sensitivity: 'DEPARTMENT', visibility: [{ id: 'v3', subjectType: 'DEPARTMENT', subjectId: 'dept-finance' }] } as any), false);
assert.equal(canReadKnowledge(employee, { ownerDepartmentId: 'dept-sales', sensitivity: 'DEPARTMENT', visibility: [{ id: 'v-dept-all', subjectType: 'ALL_EMPLOYEES' }] } as any), false);
assert.equal(canReadKnowledge(employee, { ownerDepartmentId: 'dept-sales', sensitivity: 'DEPARTMENT', visibility: [{ id: 'v-dept-role', subjectType: 'ROLE', subjectId: 'role-sales' }] } as any), false);
assert.equal(canReadKnowledge(employee, { ownerDepartmentId: 'dept-finance', sensitivity: 'DEPARTMENT', visibility: [{ id: 'v-dept-sales', subjectType: 'DEPARTMENT', subjectId: 'dept-sales' }] } as any), false);
assert.equal(canReadKnowledge({
  ...employee,
  id: 'user-sensitive-reader',
  departmentId: 'dept-other',
  permissions: [
    { module: PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE, actions: ['read'] },
    { module: PERMISSION_KEYS.ENABLEMENT_SENSITIVE, actions: ['read'] },
  ],
} as any, { ownerDepartmentId: 'dept-sales', sensitivity: 'DEPARTMENT', visibility: [{ id: 'v-sensitive-role', subjectType: 'ROLE', subjectId: 'role-sales' }] } as any), true);
assert.equal(canReadKnowledge(employee, { sensitivity: 'FINANCE', visibility: [{ id: 'v4', subjectType: 'ALL_EMPLOYEES' }] } as any), false);
assert.equal(canReviewKnowledge(reviewer, { id: 'dept-sales', managerId: 'user-manager' } as any), true);
assert.equal(canReviewKnowledge(reviewer, { id: 'dept-finance', managerId: 'user-finance' } as any), false);
assert.equal(canReviewKnowledge(inheritedReviewer, { id: 'dept-sales', managerId: 'user-enablement-manager' } as any), true);
assert.equal(canReviewKnowledge(activeSuperAdmin, { id: 'dept-finance', managerId: 'user-finance' } as any), true);
assert.equal(canReviewKnowledge(inactiveSuperAdmin, { id: 'dept-finance', managerId: 'user-finance' } as any), false);
assert.equal(canReviewKnowledge(roleDerivedSuperAdmin, { id: 'dept-finance', managerId: 'user-finance' } as any), false);
assert.equal(canReviewKnowledge(readOnlyAllPermissions, { id: 'dept-finance', managerId: 'user-read-all' } as any), false);
assert.equal(canPublishKnowledge(publisher), true);
assert.equal(canPublishKnowledge(employee), false);
