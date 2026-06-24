import assert from 'node:assert/strict';
import test from 'node:test';
import { aiApi } from './aiApi';
import { STORAGE_KEYS } from '../shared/utils/constants';

const storage = (() => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) || null,
    setItem: (key: string, value: string) => map.set(key, value),
    removeItem: (key: string) => map.delete(key),
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] || null,
    get length() {
      return map.size;
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

test('AI assistant sends user queries to backend DeepSeek proxy when backend API is enabled', async () => {
  storage.clear();
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';

  const requestedPaths: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    requestedPaths.push(String(url));
    if (String(url).endsWith('/storage')) {
      return new Response(JSON.stringify({ code: 0, data: {}, message: 'success' }), { status: 200 });
    }
    if (String(url).endsWith('/ai/query')) {
      const body = JSON.parse(String(init?.body || '{}'));
      assert.equal(body.query, '你现在是谁');
      assert.equal(body.context.provider, 'jixiang-os');
      assert.ok(Array.isArray(body.context.metrics));
      assert.ok(Array.isArray(body.context.referenceResults));
      return new Response(JSON.stringify({
        code: 0,
        data: {
          content: '我是DeepSeek驱动的极享OS AI助手。',
          results: [{ type: 'TEXT', title: 'AI回复', content: '来自DeepSeek代理' }],
        },
        message: 'success',
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ code: -1, data: null, message: 'unexpected request' }), { status: 404 });
  }) as typeof fetch;

  try {
    const result = await aiApi.sendQuery(null, '你现在是谁');

    assert.equal(result.code, 0);
    assert.equal(result.data.content, '我是DeepSeek驱动的极享OS AI助手。');
    assert.ok(requestedPaths.some((url) => url.endsWith('/ai/query')));

    const sessions = JSON.parse(storage.getItem(STORAGE_KEYS.AI_SESSIONS) || '[]');
    assert.equal(sessions[0].messages[1].content, '我是DeepSeek驱动的极享OS AI助手。');
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.VITE_USE_BACKEND_API;
    delete process.env.VITE_AI_API_BASE;
  }
});
