import assert from 'node:assert/strict';
import { customerApi } from './customerApi';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { STORAGE_KEYS } from '../shared/utils/constants';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    get length() { return values.size; },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  },
  configurable: true,
});

const now = '2026-07-22T12:00:00.000Z';
values.set(STORAGE_KEYS.INITIALIZED, 'true');
values.set(STORAGE_KEYS.USERS, JSON.stringify([{
  id: 'admin', name: '系统管理员', account: 'admin', role: '超级管理员', roleId: 'admin-role', isActive: true,
}]));
values.set(STORAGE_KEYS.ROLES, JSON.stringify([{
  id: 'admin-role', name: '超级管理员', code: 'super_admin', permissions: [{ module: '全部', actions: ['admin'] }], isActive: true,
}]));
values.set(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'admin', token: 'test', remember: true, createdAt: now }));
values.set(STORAGE_KEYS.CUSTOMERS, JSON.stringify([
  {
    id: 'fallback', name: '无跟进客户', company: '', phone: '13900000001', customerLevel: 'L1', owner: '公海', previousOwner: '销售甲',
    lifecycleStatusCode: 'public_pool', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], activityRecords: [], createdAt: now, updatedAt: now,
  },
  {
    id: 'followed', name: '有跟进客户', company: '', phone: '13900000002', customerLevel: 'L1', owner: '公海', previousOwner: '销售甲',
    lifecycleStatusCode: 'public_pool', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], activityRecords: [
      { id: 'follow', type: 'follow', title: '跟进', operator: '销售乙', createdAt: now },
    ], createdAt: now, updatedAt: now,
  },
  {
    id: 'unknown', name: '无历史负责人客户', company: '', phone: '13900000003', customerLevel: 'L1', owner: '公海',
    lifecycleStatusCode: 'public_pool', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], activityRecords: [], createdAt: now, updatedAt: now,
  },
]));
values.set(STORAGE_KEYS.ORDERS, '[]');

const users = await customerApi.fetchPublicPoolFollowUpUsers();
assert.deepEqual(users.data.map((user) => user.name).sort(), ['暂无跟进', '销售乙', '销售甲']);

const fallbackCustomers = await customerApi.fetchCustomers({ lifecycleStatusCode: 'public_pool', owner: '销售甲' });
assert.deepEqual(fallbackCustomers.data.items.map((customer) => customer.id), ['fallback']);

const followedCustomers = await customerApi.fetchCustomers({ lifecycleStatusCode: 'public_pool', owner: '销售乙' });
assert.deepEqual(followedCustomers.data.items.map((customer) => customer.id), ['followed']);

const unknownCustomers = await customerApi.fetchCustomers({ lifecycleStatusCode: 'public_pool', owner: '暂无跟进' });
assert.deepEqual(unknownCustomers.data.items.map((customer) => customer.id), ['unknown']);

console.log('customer public-pool follow-up fallback: ok');
