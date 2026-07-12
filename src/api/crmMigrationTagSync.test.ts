import assert from 'node:assert/strict';
import { crmMigrationApi } from './crmMigrationApi';
import { STORAGE_KEYS } from '../shared/utils/constants';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  },
});

const now = '2026-07-12T00:00:00.000Z';
const group = { id: 'legacy-group', name: '历史未归类', color: '#64748b', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 0, createdAt: now, updatedAt: now };
const concurrentTag = { id: 'concurrent-tag', groupId: group.id, name: '并发标签', color: '#64748b', isActive: true, sortOrder: 0, usageCount: 0, createdAt: now, updatedAt: now };
const response = (code: number, data: unknown, message = '') => new Response(JSON.stringify({ code, data, message }), {
  status: code === 0 ? 200 : code,
  headers: { 'content-type': 'application/json' },
});

const originalFetch = globalThis.fetch;
let mode: 'forbidden' | 'concurrent' = 'forbidden';
let catalogReads = 0;
let writes = 0;
let activeWrites = 0;
let maxActiveWrites = 0;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  const method = init?.method || 'GET';
  if (method === 'GET' && url.includes('/customer-tags/catalog')) {
    catalogReads += 1;
    if (mode === 'forbidden') return response(0, { groups: [], tags: [] });
    if (catalogReads === 1) return response(0, { groups: [], tags: [] });
    if (catalogReads === 2) return response(0, { groups: [group], tags: [] });
    return response(0, { groups: [group], tags: [concurrentTag] });
  }
  writes += 1;
  activeWrites += 1;
  maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
  await Promise.resolve();
  activeWrites -= 1;
  if (mode === 'forbidden') return response(403, null, 'Forbidden');
  if (url.endsWith('/customer-tags/groups')) return response(409, null, '组内名称已存在');
  const body = JSON.parse(String(init?.body || '{}'));
  if (body.name === '并发标签') return response(409, null, '组内标签名称已存在');
  return response(0, { id: 'created-tag', groupId: group.id, name: body.name });
};

values.set(STORAGE_KEYS.TAGS, JSON.stringify([{ id: 'local-only', name: '本地假标签' }]));
const forbidden = await crmMigrationApi.syncTags(['新标签']);
assert.equal(forbidden.code, 403);
assert.equal(forbidden.message, 'Forbidden');
assert.equal(writes, 1);
assert.equal(values.get(STORAGE_KEYS.TAGS), JSON.stringify([{ id: 'local-only', name: '本地假标签' }]), '禁止用本地整表写伪造成功');

mode = 'concurrent';
catalogReads = 0;
writes = 0;
const result = await crmMigrationApi.syncTags(['并发标签', '真正新增']);
assert.equal(result.code, 0);
assert.equal(result.data.created, 1);
assert.equal(catalogReads, 3, '409 后必须刷新权威目录再匹配');
assert.equal(maxActiveWrites, 1, '每条记录级命令必须 await 后再发送下一条');
assert.equal(values.get(STORAGE_KEYS.TAGS), JSON.stringify([{ id: 'local-only', name: '本地假标签' }]));

globalThis.fetch = originalFetch;
