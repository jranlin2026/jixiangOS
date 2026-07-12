import assert from 'node:assert/strict';
import { setStorageData } from './mock/storage';
import { persistBackendStorageValue } from './backendClient';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { Customer } from '../types/customer';

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

const originalFetch = globalThis.fetch;
const originalBackendFlag = process.env.VITE_USE_BACKEND_API;
let fetchCalls = 0;

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  const existing = [{ id: 'cust-public', owner: '公海' }] as Customer[];
  const stale = [{ id: 'cust-public', owner: '销售甲' }] as Customer[];
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(existing));
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ code: 0, data: true, message: 'success' }), {
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  await assert.rejects(
    setStorageData(STORAGE_KEYS.CUSTOMERS, stale),
    /记录级命令|legacy/i,
  );
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]'), existing);
  assert.equal(fetchCalls, 0, '客户旧快照不得向服务器发起 PUT');

  await assert.rejects(
    persistBackendStorageValue(STORAGE_KEYS.LEADS, []),
    /记录级命令|legacy/i,
  );
  assert.equal(fetchCalls, 0, '绕过 setStorageData 直接调用持久化函数也必须失败关闭');
} finally {
  globalThis.fetch = originalFetch;
  if (originalBackendFlag === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalBackendFlag;
}
