import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import express from 'express';
import { createBrowserAgentRouter } from './browserAgentRoutes';
import type { BrowserCatalogService } from '../services/browserAgent/browserCatalogService';

assert.match(readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8'), /app\.use\('\/api\/browser-agent'/);

const calls: any[] = [];
const service = {
  async intake(input: any, actor: any) {
    if (!String(input.shopBindingId || '').trim()) {
      return { code: 400, data: null, message: '店铺绑定不能为空' };
    }
    calls.push({ method: 'intake', input, actor });
    return {
      code: 0,
      data: {
        syncId: 'sync-1', outcome: 'CREATED', orderRemarkStatus: 'NOT_ATTEMPTED', greenFlagStatus: 'NOT_ATTEMPTED',
        lead: { id: 'lead-1', name: input.contactName, assignedTo: '销售小王' },
      },
      message: 'success',
    };
  },
  async reportOrderRemark(syncId: string, input: any, actor: any) {
    calls.push({ method: 'remark', syncId, input, actor });
    return { code: 0, data: { syncId, orderRemarkStatus: input.status }, message: 'success' };
  },
  async reportPlatformCompletion(syncId: string, input: any, actor: any) {
    calls.push({ method: 'platform-completion', syncId, input, actor });
    return {
      code: 0,
      data: {
        syncId,
        orderRemarkStatus: input.orderRemarkStatus,
        greenFlagStatus: input.greenFlagStatus,
      },
      message: 'success',
    };
  },
} as any;
const scriptLibrary = {
  async get(actor: any) {
    calls.push({ method: 'script-library:get', actor });
    return {
      code: 0,
      data: { library: { schemaVersion: 1, revision: 1, groups: [] }, canManage: false },
      message: 'success',
    };
  },
  async update(input: any, actor: any) {
    calls.push({ method: 'script-library:update', input, actor });
    return {
      code: 0,
      data: { library: { ...input, revision: input.revision + 1 }, canManage: true },
      message: 'success',
    };
  },
} as any;
const previewProductMapping: BrowserCatalogService['previewProductMapping'] = async (input) => {
  calls.push({ method: 'catalog:preview', input });
  if (input.platformProductName === '冲突商品') {
    return {
      code: 409, data: null, message: '当前店铺商品映射存在冲突', errorCode: 'PRODUCT_CONFIG_CONFLICT',
    };
  }
  return {
    code: 0,
    data: {
      shop: {
        id: input.shopBindingId || '', platform: 'DOUYIN', shopKey: 'jx-main', platformShopId: null,
        displayName: '极享智能体', aliases: [], source: '抖音电商', sourceName: '飞鸽客服', sourceType: '公司资源',
      },
      productResolution: {
        status: 'MATCHED', method: 'PLATFORM_PRODUCT_ID', osProductId: 'prod-taojin',
        osProductName: '淘金AI', osReferencePrice: 299,
      },
      facts: {
        platformProductId: input.platformProductId,
        platformSkuId: input.platformSkuId,
        platformProductName: input.platformProductName,
        paymentAmount: input.paymentAmount,
        paymentAt: input.paymentAt,
      },
      priceDifference: input.paymentAmount === undefined ? null : {
        paymentAmount: input.paymentAmount,
        osReferencePrice: 299,
        amount: input.paymentAmount - 299,
        differs: input.paymentAmount !== 299,
      },
    },
    message: 'success',
  };
};

const catalog = {
  async listRuntimeShops() {
    calls.push({ method: 'catalog:runtime' });
    return {
      code: 0,
      data: { shops: [{ id: 'shop-1', displayName: '极享智能体', source: '抖音电商', sourceName: '飞鸽客服' }] },
      message: 'success',
    };
  },
  async listCatalog() {
    calls.push({ method: 'catalog:list' });
    return { code: 0, data: { shops: [], mappings: [], products: [] }, message: 'success' };
  },
  previewProductMapping,
  async syncBusinessShop(id: string, actor: any) {
    calls.push({ method: 'catalog:sync-business-shop', id, actor });
    return { code: 0, data: { id: 'binding-synced', businessShopId: id, active: true }, message: 'success' };
  },
  async createShop(input: any, actor: any) {
    calls.push({ method: 'catalog:create-shop', input, actor });
    return { code: 0, data: { id: 'shop-2', ...input }, message: 'success' };
  },
  async updateShop(id: string, input: any, actor: any) {
    calls.push({ method: 'catalog:update-shop', id, input, actor });
    return { code: 0, data: { id, ...input }, message: 'success' };
  },
  async saveMapping(input: any, actor: any) {
    calls.push({ method: 'catalog:create-mapping', input, actor });
    if (input.aliases?.includes('conflict')) {
      return {
        code: 409, data: null, message: '别名冲突', errorCode: 'PRODUCT_ALIAS_CONFLICT',
      };
    }
    return { code: 0, data: { id: 'map-1', ...input }, message: 'success' };
  },
  async updateMapping(id: string, input: any, actor: any) {
    calls.push({ method: 'catalog:update-mapping', id, input, actor });
    return { code: 0, data: { id, ...input }, message: 'success' };
  },
  async deleteMapping(id: string, actor: any) {
    calls.push({ method: 'catalog:delete-mapping', id, actor });
    return { code: 0, data: { id, active: false }, message: 'success' };
  },
} as unknown as BrowserCatalogService;

const authenticate: express.RequestHandler = (req: any, _res, next) => {
  req.currentUser = { id: 'user-1', name: '客服小李' };
  next();
};
const requireLeadCreate: express.RequestHandler = (req: any, res, next) => {
  authenticate(req, res, () => {
    if (req.headers['x-test-no-lead-create']) {
      res.status(403).json({ code: 403, data: null, message: 'Forbidden' });
      return;
    }
    next();
  });
};
const requireBrowserCatalogRead: express.RequestHandler = (req: any, res, next) => {
  authenticate(req, res, () => {
    if (req.headers['x-test-no-product-read']) {
      res.status(403).json({ code: 403, data: null, message: 'Forbidden' });
      return;
    }
    next();
  });
};
const requireBrowserCatalogWrite: express.RequestHandler = (req: any, res, next) => {
  authenticate(req, res, () => {
    if (req.headers['x-test-no-product-write']) {
      res.status(403).json({ code: 403, data: null, message: 'Forbidden' });
      return;
    }
    next();
  });
};
const routerDeps = {
  service, scriptLibrary, catalog,
  authService: {
    authorizeBrowserAgent: async () => ({ code: 0, data: 'grant', message: 'success' }),
    exchangeBrowserAgentGrant: async () => ({ code: 0, data: { token: 'browser-token', user: { id: 'user-1', name: '客服小李' } }, message: 'success' }),
    logoutBrowserAgent: async () => ({ code: 0, data: true, message: 'success' }),
  } as any,
  requireAuthenticated: authenticate,
  requireLeadCreate,
  requireBrowserEmployeeUse: requireLeadCreate,
  requireScriptLibraryRead: authenticate,
  requireBrowserCatalogRead,
  requireBrowserCatalogWrite,
};
const app = express();
app.use(express.json());
app.use('/api/browser-agent', createBrowserAgentRouter({
  ...routerDeps,
  downloadArchivePath: join(process.cwd(), 'server/assets/browser-agent/jixiang-ai-browser-employee.zip'),
}));
const listener = app.listen(0, '127.0.0.1');
await once(listener, 'listening');
const address = listener.address() as AddressInfo;

try {
  const forbiddenDownload = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/download`, {
    headers: { 'x-test-no-lead-create': '1' },
  });
  assert.equal(forbiddenDownload.status, 403, '无新建线索权限不得绕过界面直接下载安装包');

  const download = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/download`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition') || '', /jixiang-ai-browser-employee\.zip/);
  assert.ok((await download.arrayBuffer()).byteLength > 0, '受保护下载接口必须返回插件安装包');

  const missingArchiveApp = express();
  missingArchiveApp.use('/api/browser-agent', createBrowserAgentRouter({
    ...routerDeps,
    downloadArchivePath: join(process.cwd(), 'server/assets/browser-agent/not-found.zip'),
  }));
  const missingArchiveListener = missingArchiveApp.listen(0, '127.0.0.1');
  await once(missingArchiveListener, 'listening');
  const originalConsoleError = console.error;
  let missingArchiveLog = '';
  console.error = (...args: unknown[]) => { missingArchiveLog = args.map(String).join(' '); };
  try {
    const missingAddress = missingArchiveListener.address() as AddressInfo;
    const missingArchive = await fetch(`http://127.0.0.1:${missingAddress.port}/api/browser-agent/download`);
    assert.equal(missingArchive.status, 503);
    assert.deepEqual(await missingArchive.json(), {
      code: 503,
      data: null,
      errorCode: 'BROWSER_EMPLOYEE_ARCHIVE_UNAVAILABLE',
      message: '插件安装包暂不可用，请联系管理员重新发布',
    });
  } finally {
    console.error = originalConsoleError;
    await new Promise<void>((resolve, reject) => missingArchiveListener.close((error) => error ? reject(error) : resolve()));
  }
  assert.match(missingArchiveLog, /Browser employee archive is unavailable/);

  const intake = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/lead-intakes`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      platform: 'DOUYIN', shopBindingId: 'shop-binding-1', platformOrderNo: 'order-1',
      contactName: '张先生', contactPhone: '13800138000', contactSource: 'CHAT',
    }),
  });
  assert.equal(intake.status, 201);
  assert.equal((await intake.json()).data.lead.id, 'lead-1');

  const legacyShopKeyOnly = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/lead-intakes`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      platform: 'DOUYIN', shopKey: 'shop-1', platformOrderNo: 'legacy-order-1',
      contactName: '张先生', contactPhone: '13800138000', contactSource: 'CHAT',
    }),
  });
  assert.equal(legacyShopKeyOnly.status, 400);
  assert.equal((await legacyShopKeyOnly.json()).message, '店铺绑定不能为空');

  const remark = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/lead-intakes/sync-1/order-remark`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'SUCCEEDED' }),
  });
  assert.equal(remark.status, 200);
  assert.equal((await remark.json()).data.orderRemarkStatus, 'SUCCEEDED');

  const completion = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/lead-intakes/sync-1/platform-completion`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ orderRemarkStatus: 'SUCCEEDED', greenFlagStatus: 'SUCCEEDED' }),
  });
  assert.equal(completion.status, 200);
  assert.deepEqual((await completion.json()).data, {
    syncId: 'sync-1',
    orderRemarkStatus: 'SUCCEEDED',
    greenFlagStatus: 'SUCCEEDED',
  });

  const library = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/script-library`);
  assert.equal(library.status, 200);
  assert.equal((await library.json()).data.library.revision, 1);

  const updateLibrary = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/script-library`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 1, revision: 1, groups: [] }),
  });
  assert.equal(updateLibrary.status, 200);
  assert.equal((await updateLibrary.json()).data.library.revision, 2);

  const customerServiceLibrary = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/script-library`, {
    headers: { 'x-test-no-lead-create': '1' },
  });
  assert.equal(customerServiceLibrary.status, 200, '已登录客服不应因没有线索录入权限而无法读取话术');

  const runtimeConfig = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/runtime-config`, {
    headers: { 'x-test-no-product-read': '1' },
  });
  assert.equal(runtimeConfig.status, 200, '已认证客服应能读取只含启用店铺的运行时配置');
  assert.equal((await runtimeConfig.json()).data.shops[0].source, '抖音电商');

  const preview = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/product-preview`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-test-no-product-read': '1',
    },
    body: JSON.stringify({
      platform: 'DOUYIN', shopBindingId: 'shop-1', pageShopDisplayName: '极享智能体',
      platformProductId: 'DY-100', platformProductName: '淘金AI 多模态',
      paymentAmount: 349, paymentAt: '2026-08-08T19:34:20+08:00',
    }),
  });
  assert.equal(preview.status, 200, '有线索创建权限的浏览器员工无需产品设置权限即可预览商品');
  const previewPayload = await preview.json();
  assert.deepEqual(previewPayload, {
    code: 0,
    data: {
      shop: {
        id: 'shop-1', platform: 'DOUYIN', shopKey: 'jx-main', platformShopId: null,
        displayName: '极享智能体', aliases: [], source: '抖音电商', sourceName: '飞鸽客服', sourceType: '公司资源',
      },
      productResolution: {
        status: 'MATCHED', method: 'PLATFORM_PRODUCT_ID', osProductId: 'prod-taojin',
        osProductName: '淘金AI', osReferencePrice: 299,
      },
      facts: {
        platformProductId: 'DY-100', platformProductName: '淘金AI 多模态',
        paymentAmount: 349, paymentAt: '2026-08-08T19:34:20+08:00',
      },
      priceDifference: { paymentAmount: 349, osReferencePrice: 299, amount: 50, differs: true },
    },
    message: 'success',
  });
  assert.equal(calls.filter((call) => call.method === 'intake').length, 1, '只读预览不得触发线索入库');

  const previewConflict = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/product-preview`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      platform: 'DOUYIN', shopBindingId: 'shop-1', pageShopDisplayName: '极享智能体',
      platformProductName: '冲突商品',
    }),
  });
  assert.equal(previewConflict.status, 409);
  assert.deepEqual(await previewConflict.json(), {
    code: 409,
    data: null,
    message: '当前店铺商品映射存在冲突',
    errorCode: 'PRODUCT_CONFIG_CONFLICT',
  });

  const deniedCatalog = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/catalog`, {
    headers: { 'x-test-no-product-read': '1' },
  });
  assert.equal(deniedCatalog.status, 403, '无产品设置读权限不能读取管理目录');

  const syncedBusinessShop = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/catalog/business-shops/business-shop-1/sync`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
  });
  assert.equal(syncedBusinessShop.status, 200);
  assert.equal((await syncedBusinessShop.json()).data.businessShopId, 'business-shop-1');
  assert.ok(calls.some((call) => call.method === 'catalog:sync-business-shop' && call.id === 'business-shop-1'));

  const createdShop = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/catalog/shops`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ platform: 'DOUYIN', shopKey: 'shop-2', displayName: '新店铺' }),
  });
  assert.equal(createdShop.status, 201);
  assert.equal((await createdShop.json()).data.id, 'shop-2');

  const stoppedShop = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/catalog/shops/shop-2`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ active: false }),
  });
  assert.equal(stoppedShop.status, 200);
  assert.equal((await stoppedShop.json()).data.active, false);

  const deniedMapping = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/catalog/product-mappings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-test-no-product-write': '1' },
    body: JSON.stringify({}),
  });
  assert.equal(deniedMapping.status, 403, '无产品设置写权限不能修改映射');

  const createdMapping = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/catalog/product-mappings`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ shopBindingId: 'shop-1', platformProductName: '长商品名', aliases: [], osProductId: 'p-1', active: true }),
  });
  assert.equal(createdMapping.status, 201);
  assert.equal((await createdMapping.json()).data.id, 'map-1');

  const conflictMapping = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/catalog/product-mappings`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ shopBindingId: 'shop-1', platformProductName: '冲突', aliases: ['conflict'], osProductId: 'p-2', active: true }),
  });
  assert.equal(conflictMapping.status, 409);
  assert.equal((await conflictMapping.json()).errorCode, 'PRODUCT_ALIAS_CONFLICT', '409必须保留结构化错误码');

  const stoppedMapping = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/catalog/product-mappings/map-1`, {
    method: 'DELETE',
  });
  assert.equal(stoppedMapping.status, 200);
  assert.equal((await stoppedMapping.json()).data.active, false);

  const deniedIntake = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/lead-intakes`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-test-no-lead-create': '1' },
    body: JSON.stringify({}),
  });
  assert.equal(deniedIntake.status, 403, '线索入库仍必须校验线索录入权限');
  const deniedCompletion = await fetch(
    `http://127.0.0.1:${address.port}/api/browser-agent/lead-intakes/sync-1/platform-completion`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-no-lead-create': '1' },
      body: JSON.stringify({ orderRemarkStatus: 'SUCCEEDED', greenFlagStatus: 'SUCCEEDED' }),
    },
  );
  assert.equal(deniedCompletion.status, 403, '平台完成上报必须校验线索录入权限');
  assert.deepEqual(calls.map((call) => call.method), [
    'intake', 'remark', 'platform-completion', 'script-library:get', 'script-library:update', 'script-library:get',
    'catalog:runtime', 'catalog:preview', 'catalog:preview', 'catalog:sync-business-shop', 'catalog:create-shop', 'catalog:update-shop',
    'catalog:create-mapping', 'catalog:create-mapping', 'catalog:delete-mapping',
  ]);
} finally {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}

console.log('browser agent routes: ok');
