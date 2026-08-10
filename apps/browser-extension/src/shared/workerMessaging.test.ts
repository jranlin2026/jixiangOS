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
const operatorKey = 'jixiang_browser_employee_operator';
let localValues: Record<string, unknown> = {
  [configKey]: { apiBaseUrl: 'https://os.example.com', shopKey: ' Ｇｏｌｄ 商城 ' },
  [tokenKey]: 'token-1',
  [operatorKey]: { id: 'u1', name: '客服甲', role: 'SERVICE' },
};
let sessionValues: Record<string, unknown> = {};
(globalThis as typeof globalThis & { chrome: typeof chrome }).chrome = {
  sidePanel: { setPanelBehavior: async () => undefined },
  storage: {
    local: {
      setAccessLevel: async () => undefined,
      get: async (key: string) => ({ [key]: localValues[key] }),
      set: async (values: Record<string, unknown>) => { localValues = { ...localValues, ...values }; },
      remove: async (keys: string[]) => { for (const key of keys) delete localValues[key]; },
    },
    session: {
      get: async (key: string) => ({ [key]: sessionValues[key] }),
      set: async (values: Record<string, unknown>) => { sessionValues = { ...sessionValues, ...values }; },
      remove: async (keys: string[]) => {
        for (const key of keys) delete sessionValues[key];
      },
    },
  },
  runtime: {
    onMessage: {
      addListener(listener: typeof workerListener) { workerListener = listener; },
    },
  },
  identity: {
    getRedirectURL: () => 'https://extension-id.chromiumapp.org/browser-agent',
    launchWebAuthFlow: async ({ url }: { url: string }) => {
      const request = new URL(url);
      return `https://extension-id.chromiumapp.org/browser-agent?code=grant-code&state=${request.searchParams.get('state')}`;
    },
  },
} as unknown as typeof chrome;
const originalFetch = globalThis.fetch;
let previewRequestBody: unknown;
let logoutResponse: ApiEnvelope<boolean> = { code: 0, data: true, message: 'success' };
let exchangeReturnsHtml = false;
let runtimeConfig = {
  shops: [
    {
      id: 'shop-gold', platform: 'DOUYIN', shopKey: 'gold-shop', platformShopId: 'DY-GOLD',
      displayName: 'Gold 商城', aliases: ['金牌店'], source: '抖音电商', sourceName: '飞鸽客服', sourceType: '公司资源',
    },
    {
      id: 'shop-silver', platform: 'DOUYIN', shopKey: 'silver-shop', platformShopId: 'DY-SILVER',
      displayName: 'Silver 商城', aliases: [], source: '抖音电商', sourceName: '飞鸽客服', sourceType: '公司资源',
    },
  ],
};
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith('/browser-agent/auth/session')) {
    return new Response(JSON.stringify({ code: 0, data: { user: localValues[operatorKey] }, message: 'success' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }
  if (url.endsWith('/browser-agent/auth/exchange')) {
    if (exchangeReturnsHtml) {
      return new Response('<!DOCTYPE html><title>Server error</title>', {
        status: 500, headers: { 'content-type': 'text/html' },
      });
    }
    return new Response(JSON.stringify({
      code: 0, data: { token: 'browser-token-new', user: { id: 'u1', name: '客服甲', role: 'SERVICE' } }, message: 'success',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url.endsWith('/browser-agent/auth/logout')) {
    return new Response(JSON.stringify(logoutResponse), {
      status: logoutResponse.code === 0 ? 200 : 500,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (url.endsWith('/browser-agent/runtime-config')) {
    return new Response(JSON.stringify({ code: 0, data: runtimeConfig, message: 'success' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (url.endsWith('/browser-agent/product-preview')) {
    previewRequestBody = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({
      code: 0,
      data: {
        shop: runtimeConfig.shops[0],
        productResolution: {
          status: 'MATCHED', method: 'PLATFORM_PRODUCT_ID', osProductId: 'prod-taojin',
          osProductName: '淘金AI', osReferencePrice: 299,
        },
        facts: { platformProductId: 'DY-100', paymentAmount: 399, paymentAt: '2026-08-08T11:34:20.000Z' },
        priceDifference: { paymentAmount: 399, osReferencePrice: 299, amount: 100, differs: true },
      },
      message: 'success',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify(httpConflict), {
    status: 409,
    headers: { 'content-type': 'application/json' },
  });
};
try {
  await import('../background/serviceWorker');
  assert.ok(workerListener);
  const workerResponse = await new Promise<unknown>((resolve) => {
    assert.equal(workerListener?.({ type: 'CREATE_LEAD_INTAKE', input: {} }, {}, resolve), true);
  });
  assert.deepEqual(workerResponse, httpConflict, 'HTTP errorCode 必须穿过 service worker 消息边界');

  const migratedRuntime = await new Promise<any>((resolve) => {
    assert.equal(workerListener?.({ type: 'GET_RUNTIME_CONFIG' }, {}, resolve), true);
  });
  assert.equal(migratedRuntime.code, 0);
  assert.equal(migratedRuntime.data.selectedShopBindingId, 'shop-gold', '旧 shopKey 必须经规范化后唯一精确命中绑定');
  assert.deepEqual(localValues[configKey], {
    apiBaseUrl: 'https://os.example.com',
    shopBindingId: 'shop-gold',
  }, '迁移后只存 shopBindingId，一次性自由文本 shopKey 必须删除');

  localValues[configKey] = {
    apiBaseUrl: 'https://os.example.com',
    shopBindingId: 'shop-disabled',
  };
  const disabledRuntime = await new Promise<any>((resolve) => {
    assert.equal(workerListener?.({ type: 'GET_RUNTIME_CONFIG' }, {}, resolve), true);
  });
  assert.equal(disabledRuntime.data.selectedShopBindingId, undefined, '已选店铺不在启用目录时必须清空且不自动猜测');
  assert.deepEqual(localValues[configKey], { apiBaseUrl: 'https://os.example.com' });

  localValues[configKey] = { apiBaseUrl: 'https://os.example.com' };
  const multipleRuntime = await new Promise<any>((resolve) => {
    assert.equal(workerListener?.({ type: 'GET_RUNTIME_CONFIG' }, {}, resolve), true);
  });
  assert.equal(multipleRuntime.data.selectedShopBindingId, undefined, '多个启用店铺时必须由客服手工选择');

  runtimeConfig = {
    shops: runtimeConfig.shops.map((shop) => ({ ...shop, aliases: ['共用别名'] })),
  };
  localValues[configKey] = { apiBaseUrl: 'https://os.example.com', shopKey: '共用别名' };
  const ambiguousLegacy = await new Promise<any>((resolve) => {
    assert.equal(workerListener?.({ type: 'GET_RUNTIME_CONFIG' }, {}, resolve), true);
  });
  assert.equal(ambiguousLegacy.data.selectedShopBindingId, undefined, '旧文本命中多个绑定时必须清空并阻止');
  assert.deepEqual(localValues[configKey], { apiBaseUrl: 'https://os.example.com' });

  runtimeConfig = { shops: [runtimeConfig.shops[0]] };
  localValues[configKey] = { apiBaseUrl: 'https://os.example.com', shopKey: '完全不匹配' };
  const unmatchedLegacy = await new Promise<any>((resolve) => {
    assert.equal(workerListener?.({ type: 'GET_RUNTIME_CONFIG' }, {}, resolve), true);
  });
  assert.equal(unmatchedLegacy.data.selectedShopBindingId, undefined, '旧文本无唯一精确匹配时即使只剩一店也不得猜测');

  localValues[configKey] = { apiBaseUrl: 'https://os.example.com' };
  const singleRuntime = await new Promise<any>((resolve) => {
    assert.equal(workerListener?.({ type: 'GET_RUNTIME_CONFIG' }, {}, resolve), true);
  });
  assert.equal(singleRuntime.data.selectedShopBindingId, undefined, '即使只有一个启用店铺也必须由客服首次手工绑定');

  runtimeConfig = {
    shops: [
      runtimeConfig.shops[0],
      {
        id: 'shop-silver', platform: 'DOUYIN', shopKey: 'silver-shop', platformShopId: 'DY-SILVER',
        displayName: 'Silver 商城', aliases: [], source: '抖音电商', sourceName: '飞鸽客服', sourceType: '公司资源',
      },
    ],
  };
  const loginWithLegacy = await new Promise<any>((resolve) => {
    assert.equal(workerListener?.({
      type: 'CONNECT_OS',
      config: { apiBaseUrl: 'https://os.example.com', shopKey: 'gold-shop' },
      interactive: true,
    }, {}, resolve), true);
  });
  assert.equal(loginWithLegacy.code, 0);
  assert.deepEqual(localValues[configKey], {
    apiBaseUrl: 'https://os.example.com',
    shopKey: 'gold-shop',
  }, '登录过程必须保留旧店铺文本到首次运行时目录查找完成');
  const migratedAfterLogin = await new Promise<any>((resolve) => {
    assert.equal(workerListener?.({ type: 'GET_RUNTIME_CONFIG' }, {}, resolve), true);
  });
  assert.equal(migratedAfterLogin.data.selectedShopBindingId, 'shop-gold');
  assert.deepEqual(localValues[configKey], {
    apiBaseUrl: 'https://os.example.com',
    shopBindingId: 'shop-gold',
  });

  exchangeReturnsHtml = true;
  const nonJsonExchange = await new Promise<any>((resolve) => {
    assert.equal(workerListener?.({
      type: 'CONNECT_OS',
      config: { apiBaseUrl: 'https://os.example.com' },
      interactive: true,
    }, {}, resolve), true);
  });
  assert.equal(nonJsonExchange.code, 500);
  assert.match(nonJsonExchange.message, /接口返回了非JSON响应/);
  assert.doesNotMatch(nonJsonExchange.message, /Unexpected token/);
  exchangeReturnsHtml = false;

  const previewInput = {
    platform: 'DOUYIN', shopBindingId: 'shop-gold', pageShopDisplayName: 'Gold 商城',
    platformProductId: 'DY-100', platformProductName: '淘金AI 多模态',
    paymentAmount: 399, paymentAt: '2026-08-08T19:34:20+08:00',
  };
  const previewResponse = await new Promise<any>((resolve) => {
    assert.equal(workerListener?.({ type: 'PREVIEW_PRODUCT_MAPPING', input: previewInput }, {}, resolve), true);
  });
  assert.equal(previewResponse.code, 0);
  assert.equal(previewResponse.data.productResolution.osReferencePrice, 299);
  assert.deepEqual(previewRequestBody, previewInput, '商品预览请求必须原样穿过 service worker 边界');

  localValues[tokenKey] = 'browser-token-before-logout';
  localValues[operatorKey] = { id: 'u1', name: '客服甲', role: 'SERVICE' };
  logoutResponse = { code: 500, data: null, message: '服务端撤销失败' };
  const failedLogout = await new Promise<any>((resolve) => {
    assert.equal(workerListener?.({ type: 'LOGOUT' }, {}, resolve), true);
  });
  assert.equal(failedLogout.code, 500);
  assert.equal(localValues[tokenKey], 'browser-token-before-logout', '服务端撤销失败时必须保留凭据以便重试');
  logoutResponse = { code: 0, data: true, message: 'success' };
  const successfulLogout = await new Promise<any>((resolve) => {
    assert.equal(workerListener?.({ type: 'LOGOUT' }, {}, resolve), true);
  });
  assert.equal(successfulLogout.code, 0);
  assert.deepEqual(successfulLogout.data, { sessionExpired: false, localLogoutCompleted: true });
  assert.equal(localValues[tokenKey], undefined, '退出浏览器员工必须清除本地专用 token');
  assert.equal(localValues[operatorKey], undefined, '退出浏览器员工必须清除本地 operator');
  assert.ok(localValues[configKey], '退出成功仍保留本地 API/店铺配置');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('browser worker messaging timeout: ok');
