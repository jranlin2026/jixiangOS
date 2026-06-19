import assert from 'node:assert/strict';
import { settingsApi } from './settingsApi';
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
storage.setItem(STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS, JSON.stringify([
  { id: 'legacy-1', name: '未转商机', description: '', color: '#111111', isActive: true, sortOrder: 99, isSystem: true, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' },
  { id: 'legacy-2', name: '商机跟进中', description: '', color: '#222222', isActive: true, sortOrder: 99, isSystem: true, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' },
  { id: 'legacy-3', name: '已流失', description: '', color: '#333333', isActive: true, sortOrder: 99, isSystem: true, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' },
]));

const res = await settingsApi.fetchLifecycleStatusConfigs();
assert.equal(res.code, 0);
assert.deepEqual(res.data.map((item) => item.code), [
  'pending_followup',
  'following',
  'ordered',
  'refunded',
  'public_pool',
]);
assert.deepEqual(res.data.map((item) => item.name), ['待跟进', '跟进中', '已转订单', '已退款', '流失公海']);
assert.ok(res.data.every((item) => item.isSystem));

