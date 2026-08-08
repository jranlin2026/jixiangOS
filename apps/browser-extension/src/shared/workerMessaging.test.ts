import assert from 'node:assert/strict';
import { withWorkerTimeout } from './workerMessaging';
import type { ApiEnvelope } from './contracts';

const never = new Promise<never>(() => undefined);
await assert.rejects(
  withWorkerTimeout(never, 15),
  /插件后台响应超时，请在扩展程序页面重新加载插件/,
);

assert.equal(await withWorkerTimeout(Promise.resolve('ok'), 100), 'ok');

const httpConflict: ApiEnvelope<never> = {
  code: 409,
  data: null,
  message: '该订单已录入极享OS，但原线索已在业务回收站',
  errorCode: 'LEAD_IN_RECYCLE_BIN',
};
let workerListener: ((
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean) | undefined;
const configKey = 'jixiang_browser_employee_config';
const tokenKey = 'jixiang_browser_employee_token';
(globalThis as typeof globalThis & { chrome: typeof chrome }).chrome = {
  sidePanel: { setPanelBehavior: async () => undefined },
  storage: {
    local: {
      get: async (key: string) => ({ [key]: key === configKey ? { apiBaseUrl: 'https://os.example.com', shopKey: '' } : undefined }),
      set: async () => undefined,
    },
    session: {
      get: async (key: string) => ({ [key]: key === tokenKey ? 'token-1' : undefined }),
      set: async () => undefined,
      remove: async () => undefined,
    },
  },
  runtime: {
    onMessage: {
      addListener(listener: typeof workerListener) { workerListener = listener; },
    },
  },
} as unknown as typeof chrome;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify(httpConflict), {
  status: 409,
  headers: { 'content-type': 'application/json' },
});
try {
  await import('../background/serviceWorker');
  assert.ok(workerListener);
  const workerResponse = await new Promise<unknown>((resolve) => {
    assert.equal(workerListener?.({ type: 'CREATE_LEAD_INTAKE', input: {} }, {}, resolve), true);
  });
  assert.deepEqual(workerResponse, httpConflict, 'HTTP errorCode 必须穿过 service worker 消息边界');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('browser worker messaging timeout: ok');
