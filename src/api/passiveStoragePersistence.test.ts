import assert from 'node:assert/strict';
import { commissionRuleApi } from './commissionRuleApi';
import { flushBackendStorageWrites } from './backendClient';
import { roleApi } from './roleApi';
import { STORAGE_KEYS } from '../shared/utils/constants';

const storage = (() => {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const originalFetch = globalThis.fetch;
const originalBackendFlag = process.env.VITE_USE_BACKEND_API;
const storageWrites: string[] = [];
process.env.VITE_USE_BACKEND_API = 'true';

storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([{
  id: 'prod-001',
  name: '测试产品',
  level: '899',
  deliveryStages: ['合同签订', '需求确认', '系统部署', '培训交付', '验收完成'],
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}]));
storage.setItem(STORAGE_KEYS.COMMISSION_RULES, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.COMMISSION_ROLE_CONFIGS, JSON.stringify([]));

globalThis.fetch = async (input, init) => {
  if ((init?.method || 'GET') === 'PUT') storageWrites.push(String(input));
  const data = String(input).includes('/settings/roles') ? [] : null;
  return new Response(JSON.stringify({ code: 0, data, message: 'ok' }), {
    headers: { 'content-type': 'application/json' },
  });
};

try {
  const response = await commissionRuleApi.getCommissionPayoutPlans();
  assert.equal(response.code, 0);
  const rolesResponse = await roleApi.getRoles({ isActive: true });
  assert.equal(rolesResponse.code, 0);
  await flushBackendStorageWrites();
  assert.deepEqual(storageWrites, [], '浏览提成与执行兼容迁移时不能触发后台配置保存');
} finally {
  globalThis.fetch = originalFetch;
  if (originalBackendFlag === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalBackendFlag;
}
