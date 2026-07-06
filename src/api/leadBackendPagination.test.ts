import assert from 'node:assert/strict';
import { leadApi } from './leadApi';
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

const previousUseBackend = process.env.VITE_USE_BACKEND_API;
process.env.VITE_USE_BACKEND_API = 'true';
storage.clear();
storage.setItem('aaos_backend_auth_token', 'token-test');
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([{ id: 'stale-local-lead' }]));

const requestedUrls: string[] = [];
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  requestedUrls.push(url);
  assert.ok(url.includes('/leads?'), 'Lead listing should use the paginated backend lead endpoint.');
  assert.equal(url.includes('/storage'), false, 'Lead listing must not trigger the full storage snapshot endpoint.');
  return new Response(JSON.stringify({
    code: 0,
    data: {
      items: [{ id: 'lead-page-1', name: 'Page Lead' }],
      pagination: { page: 3, pageSize: 20, total: 1800, totalPages: 90 },
    },
    message: 'success',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}) as typeof fetch;

const response = await leadApi.fetchLeads({
  search: 'Page Lead',
  page: 3,
  pageSize: 20,
});

assert.equal(response.code, 0);
assert.deepEqual(response.data.items.map((item) => item.id), ['lead-page-1']);
assert.equal(response.data.pagination.total, 1800);
assert.equal(requestedUrls.length, 1);
assert.match(requestedUrls[0], /\/leads\?/);
assert.match(requestedUrls[0], /page=3/);
assert.match(requestedUrls[0], /pageSize=20/);

if (previousUseBackend === undefined) {
  delete process.env.VITE_USE_BACKEND_API;
} else {
  process.env.VITE_USE_BACKEND_API = previousUseBackend;
}
