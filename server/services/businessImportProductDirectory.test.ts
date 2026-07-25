import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
import { loadBusinessImportDirectory } from './businessImportAdapter';

const NOW = new Date('2026-07-25T00:00:00.000Z');
const actor: AuthenticatedUser = {
  id: 'user-admin', name: '系统管理员', account: 'admin', email: '', phone: '', role: '超级管理员',
  roleId: 'role-super-admin', permissions: [{ module: '全部', actions: ['admin'] }], isActive: true,
};
const users = [{
  id: actor.id, name: actor.name, account: actor.account, email: '', phone: '', role: actor.role, roleId: actor.roleId,
  avatar: null, departmentId: null, positionId: null, positionName: null, passwordHash: null, passwordSalt: null,
  passwordUpdatedAt: null, mustChangePassword: false, lastLoginAt: null, isActive: true, employmentStatus: 'active',
  leftAt: null, leftBy: null, createdAt: NOW, updatedAt: NOW,
}];
const roles = [{
  id: 'role-super-admin', name: '超级管理员', code: 'super_admin', description: null, departmentId: null,
  permissions: [{ module: '全部', actions: ['admin'] }],
  dataScopes: { orders: 'all', recoveryOrderApplications: 'all', customers: 'all' },
  memberCount: 1, isActive: true, createdAt: NOW, updatedAt: NOW,
}];
const legacyProducts = [{ id: 'product-legacy', name: '899智能体', level: '899', isActive: true, sortOrder: 1 }];
const currentProductRecords = [{
  id: 'product-current',
  data: { id: 'product-current', name: 'IP口播智能体', level: '899', isActive: true, sortOrder: 1 },
}];

function createPrisma(productRecords: typeof currentProductRecords) {
  return {
    appStorage: { findMany: async () => [
      // A stale legacy value can still exist in the table even though this query
      // no longer requests it. Keep it in the fake response to prove it is ignored.
      { key: STORAGE_KEYS.PRODUCTS, value: legacyProducts },
      { key: STORAGE_KEYS.ORDER_TYPE_CONFIGS, value: [] },
      { key: STORAGE_KEYS.AFTER_SALES_SOURCE_CONFIGS, value: [] },
    ] },
    user: { findMany: async () => users },
    role: { findMany: async () => roles },
    department: { findMany: async () => [] },
    businessRecord: { findMany: async ({ where }: { where: { domain: string } }) => (
      where.domain === STORAGE_KEYS.PRODUCTS ? productRecords : []
    ) },
    businessImportNumberReservation: { findMany: async () => [] },
  };
}

const currentDirectory = await loadBusinessImportDirectory(createPrisma(currentProductRecords) as any, actor, 'orders');
assert.deepEqual(currentDirectory.products, [{ id: 'product-current', name: 'IP口播智能体', level: '899' }],
  '导入模板必须使用当前产品设置，不能使用旧的整表缓存');

const legacyDirectory = await loadBusinessImportDirectory(createPrisma([]) as any, actor, 'orders');
assert.deepEqual(legacyDirectory.products, [],
  '系统当前没有产品时应保持空列表，不能恢复旧缓存中已删除的产品');

console.log('business import product directory tests passed');
