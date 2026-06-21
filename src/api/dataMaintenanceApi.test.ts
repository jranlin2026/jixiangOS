import assert from 'node:assert/strict';
import { clearBusinessTestData } from './dataMaintenanceApi';
import { STORAGE_KEYS } from '../shared/utils/constants';

const storage = (() => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

storage.clear();
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([{ id: 'lead-1' }]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([{ id: 'customer-1' }]));
storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([{ id: 'order-1' }]));
storage.setItem(STORAGE_KEYS.FINANCE, JSON.stringify({ dailyRecords: [{ id: 'f-1' }], channelROI: [{ id: 'r-1' }] }));
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
  id: 'user-custom',
  name: '自定义员工',
  account: 'custom_user',
  email: '',
  phone: '',
  role: '销售顾问',
  roleId: 'role-sales-consultant',
  departmentId: 'dept-sales',
  positionId: 'pos-sales-consultant',
  positionName: '销售顾问',
  isActive: true,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
}]));

const result = clearBusinessTestData();
assert.equal(result.code, 0);
assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || 'null'), []);
assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || 'null'), []);
assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.ORDERS) || 'null'), []);
assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.FINANCE) || 'null'), { dailyRecords: [], channelROI: [] });
assert.ok(JSON.parse(storage.getItem(STORAGE_KEYS.USERS) || '[]').some((user: { name?: string }) => user.name === '自定义员工'));
assert.ok(JSON.parse(storage.getItem(STORAGE_KEYS.DEPARTMENTS) || '[]').length > 0);
assert.ok(JSON.parse(storage.getItem(STORAGE_KEYS.POSITIONS) || '[]').length > 0);
assert.ok(JSON.parse(storage.getItem(STORAGE_KEYS.ROLES) || '[]').length > 0);
assert.equal(storage.getItem(STORAGE_KEYS.INITIALIZED), 'true');
