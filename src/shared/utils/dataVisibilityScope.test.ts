import assert from 'node:assert/strict';
import type { DataScopeDomain, Role } from '../../types/role';
import { buildDataVisibilityScopeForUser } from './dataVisibility';

const NOW = '2026-07-17T00:00:00.000Z';
const users = [
  { id: 'actor', name: '主管', role: '自定义', roleId: 'role', departmentId: 'root', isActive: true },
  { id: 'peer', name: '同部门', role: '自定义', roleId: 'role', departmentId: 'root', isActive: true },
  { id: 'child', name: '子部门', role: '自定义', roleId: 'role', departmentId: 'child-dept', isActive: true },
  { id: 'other', name: '其他部门', role: '自定义', roleId: 'role', departmentId: 'other-dept', isActive: true },
];
const departments = [
  { id: 'root', name: '根', code: 'ROOT', memberCount: 2, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'child-dept', name: '子', code: 'CHILD', parentId: 'root', memberCount: 1, isActive: true, createdAt: NOW, updatedAt: NOW },
  { id: 'other-dept', name: '其他', code: 'OTHER', memberCount: 1, isActive: true, createdAt: NOW, updatedAt: NOW },
];

function role(dataScopes: Record<string, unknown>): Role {
  return {
    id: 'role', name: '自定义', code: 'custom', permissions: [], dataScopes: dataScopes as any,
    memberCount: 4, isActive: true, createdAt: NOW, updatedAt: NOW,
  };
}
function scope(domain: DataScopeDomain, value: unknown) {
  return buildDataVisibilityScopeForUser(
    users[0] as any,
    users as any,
    [role({ [domain]: value })],
    departments as any,
    domain,
  );
}

assert.deepEqual(scope('customers', 'self').visibleUserIds, ['actor']);
assert.deepEqual(new Set(scope('customers', 'department_only').visibleUserIds), new Set(['actor', 'peer']));
assert.deepEqual(new Set(scope('customers', 'department_and_descendants').visibleUserIds), new Set(['actor', 'peer', 'child']));
assert.deepEqual(new Set(scope('customers', 'all').visibleUserIds), new Set(['actor', 'peer', 'child', 'other']));

for (const domain of ['orders', 'deliveries', 'recoveryOrders', 'assets'] as const) {
  const legacyDepartment = scope(domain, 'department');
  assert.deepEqual(
    new Set(legacyDepartment.visibleUserIds),
    new Set(['actor', 'peer', 'child']),
    `${domain} 的旧 department 语义必须继续包含子部门`,
  );
}

const invalid = scope('customers', 'unknown_customer_scope');
assert.equal(invalid.visibleUserIds.length, 0, '未知客户 scope 不得默认回落 self');
assert.equal(invalid.canViewPublicPool, false);

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: () => JSON.stringify([{ ...users[0], departmentId: 'other-dept' }]),
  },
  configurable: true,
});
assert.deepEqual(
  new Set(scope('customers', 'department_only').visibleUserIds),
  new Set(['actor', 'peer']),
  '传入的目录数据必须是唯一 scope 来源，不得再水合 localStorage',
);

console.log('data visibility scope tests passed');
