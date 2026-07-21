import assert from 'node:assert/strict';
import { customerApi } from './customerApi';
import { businessRecycleBinApi } from './businessRecycleBinApi';
import { clearBackendToken, writeBackendToken } from './backendClient';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { Customer } from '../types/customer';
import type { Lead } from '../types/lead';

const values = new Map<string, string>();
const storage = {
  get length() { return values.size; },
  key: (index: number) => Array.from(values.keys())[index] ?? null,
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
  clear: () => values.clear(),
};
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const at = '2026-07-21T00:00:00.000Z';
const target = {
  id: 'customer-delete-cache', name: '目标客户', company: '同名公司', phone: '13800000000', wechat: 'same_wechat',
  customerLevel: 'L1', owner: '管理员', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [],
  createdAt: at, updatedAt: at,
} as Customer;
const lead = (id: string, customerId?: string): Lead => ({
  id, customerId, name: id, company: '同名公司', phone: target.phone, wechat: target.wechat,
  source: '测试', status: '新线索', owner: '管理员', followUpRecords: [], createdAt: at, updatedAt: at,
});

const originalFetch = globalThis.fetch;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;
try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([target]));
  storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([
    lead('stable-linked', target.id),
    lead('same-contact-unlinked'),
  ]));
  writeBackendToken('customer-delete-cache-test');
  const requests: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    const data = url.includes('/business-recycle-bin') ? {
      items: [{
        id: target.id, type: 'customer', title: target.name, subtitle: target.company,
        owner: target.owner, deletedAt: at, deletedBy: '管理员', deleteReason: '清理缓存', relationStatus: '无有效订单',
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    } : true;
    return new Response(JSON.stringify({ code: 0, data, message: 'success' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  assert.equal((await customerApi.deleteCustomer(target.id, '清理缓存')).data, true);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]'), []);
  assert.deepEqual(
    (JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]') as Lead[]).map((item) => item.id),
    ['same-contact-unlinked'],
    '联系方式相同不能替代稳定 customerId 清理缓存',
  );
  const recycleBin = await businessRecycleBinApi.fetchRecycleBinItems({ type: 'customer', pageSize: 20 });
  assert.equal(recycleBin.code, 0);
  assert.equal(
    recycleBin.data.items.some((item) => item.id === target.id),
    true,
    '服务器模式删除成功后，回收站必须立即显示该客户',
  );
  assert.equal(requests.some((url) => url.includes('/business-recycle-bin')), true);
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
