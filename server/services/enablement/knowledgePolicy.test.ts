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
const publisher = {
  ...employee, id: 'user-publisher',
  permissions: [{ module: PERMISSION_KEYS.ENABLEMENT_PUBLISH, actions: ['read', 'write'] }],
} as any;

assert.equal(canReadKnowledge(employee, { sensitivity: 'INTERNAL', visibility: [{ id: 'v1', subjectType: 'ALL_EMPLOYEES' }] } as any), true);
assert.equal(canReadKnowledge(employee, { sensitivity: 'DEPARTMENT', visibility: [{ id: 'v2', subjectType: 'DEPARTMENT', subjectId: 'dept-sales' }] } as any), true);
assert.equal(canReadKnowledge(employee, { sensitivity: 'DEPARTMENT', visibility: [{ id: 'v3', subjectType: 'DEPARTMENT', subjectId: 'dept-finance' }] } as any), false);
assert.equal(canReadKnowledge(employee, { sensitivity: 'FINANCE', visibility: [{ id: 'v4', subjectType: 'ALL_EMPLOYEES' }] } as any), false);
assert.equal(canReviewKnowledge(reviewer, { id: 'dept-sales', managerId: 'user-manager' } as any), true);
assert.equal(canReviewKnowledge(reviewer, { id: 'dept-finance', managerId: 'user-finance' } as any), false);
assert.equal(canPublishKnowledge(publisher), true);
assert.equal(canPublishKnowledge(employee), false);
