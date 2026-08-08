import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { buildBrowserMappingPage } from './BrowserAgentConfig';
import { browserAgentConfigApi } from '../../api/browserAgentConfigApi';
import type { BrowserProductMapping, BrowserShopBinding } from '../../types/browserAgent';

function test(name: string, run: () => void) {
  run();
  console.log(`✓ ${name}`);
}

async function testAsync(name: string, run: () => Promise<void>) {
  await run();
  console.log(`✓ ${name}`);
}

function renderComponent(componentName: string, propsExpression: string) {
  return execFileSync('npm', ['exec', '--', 'tsx', '-e', `
    import React from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { ${componentName} } from './src/pages/Settings/BrowserAgentConfig';
    console.log(renderToStaticMarkup(React.createElement(${componentName}, ${propsExpression})));
  `], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
}

const shops: BrowserShopBinding[] = [
  {
    id: 'shop-1', platform: 'DOUYIN', shopKey: 'douyin-main', platformShopId: '9988',
    displayName: '极享官方旗舰店', aliases: ['极享官方'], sourceType: '公司资源',
    source: '抖音电商', sourceName: '飞鸽客服', active: true,
    createdById: 'user-1', createdByName: '管理员', updatedAt: '2026-08-08T10:00:00.000Z',
  },
];

const mappings: BrowserProductMapping[] = Array.from({ length: 12 }, (_, index) => ({
  id: `mapping-${index + 1}`,
  shopBindingId: 'shop-1',
  platformIdentityKey: `product:DY-${index + 1}`,
  platformProductId: `DY-${index + 1}`,
  platformSkuId: `SKU-${index + 1}`,
  platformProductName: `淘金AI商品${index + 1}`,
  aliases: [`淘金别名${index + 1}`],
  osProductId: 'product-1',
  osProductName: '淘金AI',
  active: true,
  confirmedById: 'user-1',
  confirmedByName: '管理员',
  confirmedAt: '2026-08-08T10:00:00.000Z',
  updatedAt: `2026-08-08T10:${String(index).padStart(2, '0')}:00.000Z`,
}));

test('映射搜索和状态必须在分页前生效，且过期页码收敛到有效页', () => {
  const page = buildBrowserMappingPage(mappings, { query: 'DY-1', status: 'active' }, 4, 5);

  assert.equal(page.total, 4);
  assert.equal(page.page, 0);
  assert.deepEqual(page.rows.map((item) => item.id), [
    'mapping-1', 'mapping-10', 'mapping-11', 'mapping-12',
  ]);
});

test('桌面表格和手机卡片共用同一页结果与唯一分页器', () => {
  const page = buildBrowserMappingPage(mappings, { query: '', status: 'all' }, 1, 5);
  const html = renderComponent('BrowserMappingResults', `{
    pageResult: ${JSON.stringify(page)},
    productPrices: new Map([['product-1', 299]]),
    onEdit() {}, onDisable() {}, onPageChange() {}, onPageSizeChange() {}
  }`);

  const desktopIds = [...html.matchAll(/data-view="desktop" data-row-id="([^"]+)"/g)].map((match) => match[1]);
  const mobileIds = [...html.matchAll(/data-view="mobile" data-row-id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(desktopIds, ['mapping-6', 'mapping-7', 'mapping-8', 'mapping-9', 'mapping-10']);
  assert.deepEqual(mobileIds, desktopIds);
  assert.equal((html.match(/JxTablePagination/g) || []).length, 1, '两种渲染器不得分裂分页状态');
  for (const label of ['平台商品名称', '平台商品ID', 'SKU', 'OS标准产品', 'OS参考价', '最近更新时间']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /6-10 \/ 共 12 条/);
  assert.match(html, /跳转页码/);
});

test('店铺结果展示稳定标识和只读来源链路', () => {
  const html = renderComponent('BrowserShopBindingList', `{
    rows: ${JSON.stringify(shops)}, selectedShopId: 'shop-1',
    onSelect() {}, onEdit() {}, onToggleActive() {}
  }`);

  for (const label of ['店铺名称', '稳定店铺标识', '平台店铺ID', '店铺别名', '来源', '状态']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /公司资源 \/ 抖音电商 \/ 飞鸽客服/);
});

await testAsync('管理API保留服务端中文错误和结构化errorCode', async () => {
  const previousFetch = globalThis.fetch;
  let requestUrl = '';
  let requestInit: RequestInit | undefined;
  const previousLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) || null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({
      code: 409,
      data: null,
      message: '平台商品别名已指向OS产品“淘金AI”，请先修正冲突映射',
      errorCode: 'PRODUCT_ALIAS_CONFLICT',
    }), { status: 409, headers: { 'content-type': 'application/json' } });
  };

  try {
    const response = await browserAgentConfigApi.createMapping({
      shopBindingId: 'shop-1',
      platformProductName: '冲突商品',
      aliases: ['淘金AI'],
      osProductId: 'product-2',
      active: true,
    });
    assert.equal(requestUrl, '/api/browser-agent/catalog/product-mappings');
    assert.equal(requestInit?.method, 'POST');
    assert.deepEqual(JSON.parse(String(requestInit?.body)), {
      shopBindingId: 'shop-1',
      platformProductName: '冲突商品',
      aliases: ['淘金AI'],
      osProductId: 'product-2',
      active: true,
    });
    assert.equal(response.errorCode, 'PRODUCT_ALIAS_CONFLICT');
    assert.equal(response.message, '平台商品别名已指向OS产品“淘金AI”，请先修正冲突映射');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousLocalStorage) Object.defineProperty(globalThis, 'localStorage', previousLocalStorage);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});

execFileSync('npm', ['exec', '--', 'vitest', 'run', 'src/pages/Settings/BrowserAgentConfig.dom.test.ts'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  maxBuffer: 5 * 1024 * 1024,
});
