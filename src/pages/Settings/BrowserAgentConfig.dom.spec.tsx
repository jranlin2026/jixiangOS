// @vitest-environment jsdom
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, test } from 'vitest';
import BrowserAgentConfigPage from './BrowserAgentConfig';
import type { BrowserAgentCatalog, BrowserProductMapping, BrowserShopBinding } from '../../types/browserAgent';
import type { Product } from '../../types/product';

type MutationMode = 'success' | 'server-error' | 'network-error';

const shops: BrowserShopBinding[] = [
  {
    id: 'shop-1', businessPlatformId: 'platform-douyin', businessShopId: 'business-shop-1', platform: 'DOUYIN', shopKey: 'shop-one', platformShopId: 'DY-SHOP-1',
    displayName: '一号店铺', aliases: ['店铺一'], sourceType: '公司资源', source: '抖音电商',
    sourceName: '飞鸽客服', active: true, createdById: 'admin-1', createdByName: '管理员',
    createdAt: '2026-08-08T08:00:00.000Z', updatedAt: '2026-08-08T08:00:00.000Z',
  },
  {
    id: 'shop-2', businessPlatformId: 'platform-douyin', businessShopId: 'business-shop-2', platform: 'DOUYIN', shopKey: 'shop-two', platformShopId: 'DY-SHOP-2',
    displayName: '二号店铺', aliases: ['店铺二'], sourceType: '公司资源', source: '抖音电商',
    sourceName: '飞鸽客服', active: true, createdById: 'admin-1', createdByName: '管理员',
    createdAt: '2026-08-08T08:00:00.000Z', updatedAt: '2026-08-08T08:00:00.000Z',
  },
];

const mappings: BrowserProductMapping[] = shops.map((shop, index) => ({
  id: `mapping-${index + 1}`,
  shopBindingId: shop.id,
  platformIdentityKey: `product:DY-PRODUCT-${index + 1}`,
  platformProductId: `DY-PRODUCT-${index + 1}`,
  platformSkuId: `SKU-${index + 1}`,
  platformProductName: `${shop.displayName}商品`,
  aliases: [`${shop.displayName}别名`],
  osProductId: 'product-active',
  osProductName: '淘金AI',
  active: true,
  confirmedById: 'admin-1',
  confirmedByName: '管理员',
  confirmedAt: '2026-08-08T08:00:00.000Z',
  createdAt: '2026-08-08T08:00:00.000Z',
  updatedAt: '2026-08-08T08:00:00.000Z',
}));

const products: Product[] = [
  {
    id: 'product-active', name: '淘金AI', level: '899', price: 299, description: '启用产品',
    features: [], deliveryStages: [], isActive: true, sortOrder: 1,
    createdAt: '2026-08-08T08:00:00.000Z', updatedAt: '2026-08-08T08:00:00.000Z',
  },
  {
    id: 'product-inactive', name: '已停用OS产品', level: '899', price: 199, description: '停用产品',
    features: [], deliveryStages: [], isActive: false, sortOrder: 2,
    createdAt: '2026-08-08T08:00:00.000Z', updatedAt: '2026-08-08T08:00:00.000Z',
  },
];

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}

function setupDom() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }),
  });
  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', { configurable: true, value() {} });
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, String(value)); },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: storage });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, writable: true, value: true });
  document.body.innerHTML = '<div id="root"></div>';
}

function installProducts() {
  localStorage.setItem('aaos_initialized', 'true');
  localStorage.setItem('aaos_products', JSON.stringify(products));
  localStorage.setItem('aaos_product_levels', JSON.stringify([]));
}

function backendFixture() {
  const catalog: BrowserAgentCatalog = {
    shops: structuredClone(shops),
    mappings: structuredClone(mappings),
    products: products.map(({ id, name, price, isActive }) => ({ id, name, price, isActive })),
    businessShops: [
      { id: 'business-shop-1', platformId: 'platform-douyin', platformCode: 'DOUYIN', platformName: '抖音小店', name: '一号店铺', active: true },
      { id: 'business-shop-2', platformId: 'platform-douyin', platformCode: 'DOUYIN', platformName: '抖音小店', name: '二号店铺', active: true },
    ],
  };
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  let nextMappingMutation: MutationMode = 'success';

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ url, method, body });
    if (method === 'GET' && url === '/api/browser-agent/catalog') {
      return jsonResponse({ code: 0, data: structuredClone(catalog), message: '成功' });
    }
    if (method === 'PUT' && url === '/api/browser-agent/catalog/shops/shop-2') {
      const shop = catalog.shops.find((item) => item.id === 'shop-2')!;
      Object.assign(shop, body, { updatedAt: '2026-08-08T09:00:00.000Z' });
      return jsonResponse({ code: 0, data: structuredClone(shop), message: '成功' });
    }
    if (method === 'POST' && url === '/api/browser-agent/catalog/product-mappings') {
      const mode = nextMappingMutation;
      nextMappingMutation = 'success';
      if (mode === 'network-error') throw new Error('网络连接中断，请稍后重试');
      if (mode === 'server-error') {
        return jsonResponse({
          code: 409,
          data: null,
          message: '平台商品别名已指向OS产品“淘金AI”，请先修正冲突映射',
          errorCode: 'PRODUCT_ALIAS_CONFLICT',
        }, 409);
      }
      const created: BrowserProductMapping = {
        id: `mapping-${catalog.mappings.length + 1}`,
        platformIdentityKey: `name:${body.platformProductName}`,
        ...body,
        osProductName: '淘金AI',
        confirmedById: 'admin-1',
        confirmedByName: '管理员',
        confirmedAt: '2026-08-08T09:00:00.000Z',
        createdAt: '2026-08-08T09:00:00.000Z',
        updatedAt: '2026-08-08T09:00:00.000Z',
      };
      catalog.mappings.push(created);
      return jsonResponse({ code: 0, data: structuredClone(created), message: '成功' }, 201);
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  return {
    catalog,
    requests,
    fetch,
    setNextMappingMutation(mode: MutationMode) { nextMappingMutation = mode; },
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(description: string, predicate: () => boolean, timeoutMs = 2500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await act(async () => { await delay(25); });
    if (predicate()) return;
  }
  throw new Error(`Timed out waiting for ${description}\n${document.body.textContent}`);
}

function findButton(label: string, root: ParentNode = document) {
  const button = [...root.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
  assert.ok(button, `button not found: ${label}`);
  return button as HTMLButtonElement;
}

function findInput(label: string, root: ParentNode = document) {
  const fieldLabel = [...root.querySelectorAll('label')].find((item) => item.textContent?.replace(' *', '').trim() === label);
  assert.ok(fieldLabel?.htmlFor, `field label not found: ${label}`);
  const input = document.getElementById(fieldLabel.htmlFor);
  assert.ok(input, `field input not found: ${label}`);
  return input as HTMLInputElement | HTMLTextAreaElement;
}

function dispatchClick(element: Element) {
  act(() => { element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}

function dispatchKey(element: Element, key: string) {
  act(() => { element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
}

function changeValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function mountPage(fixture: ReturnType<typeof backendFixture>) {
  globalThis.fetch = fixture.fetch;
  const container = document.getElementById('root')!;
  const root = createRoot(container);
  mountedRoot = root;
  act(() => { root.render(React.createElement(BrowserAgentConfigPage)); });
  assert.ok(document.querySelector('[role="progressbar"]'), '初始HTTP/产品请求未完成时应显示加载态');
  await waitFor('店铺目录初始加载', () => document.body.textContent?.includes('当前店铺：一号店铺') === true);
  return root;
}

async function dismissFeedback() {
  const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) => (
    [...item.querySelectorAll('button')].some((button) => button.textContent?.trim() === '知道了')
  ));
  assert.ok(dialog);
  dispatchClick(findButton('知道了', dialog));
  await waitFor('反馈弹窗关闭', () => ![...document.querySelectorAll('[role="dialog"]')].some((item) => (
    [...item.querySelectorAll('button')].some((button) => button.textContent?.trim() === '知道了')
  )));
}

async function closeEditDialog() {
  const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) => item.textContent?.includes('编辑店铺接入'));
  assert.ok(dialog, '键盘激活编辑按钮应打开真实店铺表单');
  dispatchClick(findButton('取消', dialog));
  await waitFor('店铺编辑弹窗关闭', () => ![...document.querySelectorAll('[role="dialog"]')].some((item) => item.textContent?.includes('编辑店铺接入')));
}

async function exerciseRealPageWorkflow() {
  const fixture = backendFixture();
  await mountPage(fixture);

  const shopTwoRow = document.querySelector('[data-view="desktop"][data-row-id="shop-2"]') as HTMLElement | null;
  assert.ok(shopTwoRow);
  assert.equal(shopTwoRow.tabIndex, 0, '店铺行必须可聚焦');
  assert.equal(shopTwoRow.getAttribute('aria-selected'), 'false');
  dispatchKey(shopTwoRow, ' ');
  await waitFor('空格键选择二号店铺', () => document.body.textContent?.includes('当前店铺：二号店铺') === true);
  assert.equal(shopTwoRow.getAttribute('aria-selected'), 'true');
  assert.ok(document.body.textContent?.includes('二号店铺商品'), '键盘选店后应切换下方映射结果');

  const shopOneRow = document.querySelector('[data-view="desktop"][data-row-id="shop-1"]') as HTMLElement;
  dispatchKey(shopOneRow, 'Enter');
  await waitFor('回车键选择一号店铺', () => document.body.textContent?.includes('当前店铺：一号店铺') === true);

  const shopTwoCard = document.querySelector('[data-view="mobile"][data-row-id="shop-2"]') as HTMLElement | null;
  assert.ok(shopTwoCard);
  assert.equal(shopTwoCard.tabIndex, 0, '手机卡片必须可聚焦');
  assert.equal(shopTwoCard.getAttribute('aria-selected'), 'false');
  dispatchKey(shopTwoCard, ' ');
  await waitFor('手机卡片空格键选择二号店铺', () => document.body.textContent?.includes('当前店铺：二号店铺') === true);
  assert.equal(shopTwoCard.getAttribute('aria-selected'), 'true');
  assert.ok(document.body.textContent?.includes('二号店铺商品'), '手机卡片键盘选店后应切换下方映射结果');

  const desktopEdit = findButton('编辑', shopOneRow);
  dispatchKey(desktopEdit, 'Enter');
  dispatchClick(desktopEdit);
  await waitFor('桌面行编辑按钮键盘激活', () => document.body.textContent?.includes('编辑店铺接入') === true);
  assert.ok(document.body.textContent?.includes('当前店铺：二号店铺'), '嵌套按钮的Enter不得冒泡选中所在行');
  await closeEditDialog();

  const shopOneCard = document.querySelector('[data-view="mobile"][data-row-id="shop-1"]') as HTMLElement;
  const mobileEdit = findButton('编辑', shopOneCard);
  dispatchKey(mobileEdit, ' ');
  dispatchClick(mobileEdit);
  await waitFor('手机卡片编辑按钮键盘激活', () => document.body.textContent?.includes('编辑店铺接入') === true);
  assert.ok(document.body.textContent?.includes('当前店铺：二号店铺'), '嵌套按钮的Space不得冒泡选中所在卡片');
  await closeEditDialog();

  dispatchClick(findButton('停用', shopTwoRow));
  await waitFor('店铺停用确认', () => document.body.textContent?.includes('停用后插件不能以该店铺创建新线索，历史记录保留') === true);
  dispatchClick(findButton('确认停用', document.querySelector('[role="dialog"]')!));
  await waitFor('店铺停用成功反馈', () => document.body.textContent?.includes('店铺已停用') === true);
  assert.deepEqual(fixture.requests.find((request) => request.url.endsWith('/shops/shop-2') && request.method === 'PUT')?.body, { active: false });
  await dismissFeedback();

  const refreshedShopOneRow = document.querySelector('[data-view="desktop"][data-row-id="shop-1"]') as HTMLElement;
  dispatchKey(refreshedShopOneRow, 'Enter');
  await waitFor('回车键选择一号店铺', () => document.body.textContent?.includes('当前店铺：一号店铺') === true);

  dispatchClick(findButton('新增商品映射'));
  const mappingDialog = document.querySelector('[role="dialog"]')!;
  changeValue(findInput('平台商品名称', mappingDialog), '新平台商品');
  changeValue(findInput('平台商品别名', mappingDialog), '别名甲\n别名乙');
  const productSelect = mappingDialog.querySelector('[role="combobox"]');
  assert.ok(productSelect);
  act(() => { productSelect.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
  let productListbox: Element | undefined;
  await waitFor('OS产品下拉展开', () => {
    productListbox = [...document.querySelectorAll('[role="listbox"]')].find((item) => item.textContent?.includes('淘金AI / 参考价'));
    return Boolean(productListbox);
  });
  const options = [...productListbox!.querySelectorAll('[role="option"]')].map((option) => option.textContent?.trim());
  assert.deepEqual(options, ['淘金AI / 参考价 ¥299.00'], '停用OS产品不得进入映射下拉');
  dispatchClick(productListbox!.querySelector('[role="option"]')!);
  dispatchClick(findButton('保存', mappingDialog));
  await waitFor('商品映射保存成功反馈', () => document.body.textContent?.includes('商品映射已保存') === true);
  const successfulMappingRequest = fixture.requests.find((request) => request.url.endsWith('/product-mappings') && request.method === 'POST');
  assert.deepEqual(successfulMappingRequest?.body, {
    shopBindingId: 'shop-1',
    platformProductName: '新平台商品',
    aliases: ['别名甲', '别名乙'],
    osProductId: 'product-active',
    active: true,
  });
  await dismissFeedback();

  dispatchClick(findButton('新增商品映射'));
  const errorDialog = document.querySelector('[role="dialog"]')!;
  changeValue(findInput('平台商品名称', errorDialog), '冲突商品');
  changeValue(findInput('平台商品别名', errorDialog), '淘金AI');
  fixture.setNextMappingMutation('server-error');
  dispatchClick(findButton('保存', errorDialog));
  await waitFor('服务端中文错误反馈', () => document.body.textContent?.includes('平台商品别名已指向OS产品“淘金AI”，请先修正冲突映射') === true);
  await dismissFeedback();

  fixture.setNextMappingMutation('network-error');
  dispatchClick(findButton('保存', document.querySelector('[role="dialog"]')!));
  await waitFor('网络失败可读反馈', () => document.body.textContent?.includes('网络连接中断，请稍后重试') === true);
  assert.ok(document.body.textContent?.includes('保存失败'));

}

let mountedRoot: Root | null = null;

afterEach(() => {
  if (mountedRoot) act(() => { mountedRoot?.unmount(); });
  mountedRoot = null;
  localStorage.clear();
  document.body.innerHTML = '';
});

test('真实页面工作流覆盖加载、键盘选店、停用确认、启用产品、别名提交和反馈', async () => {
  setupDom();
  installProducts();
  await exerciseRealPageWorkflow();
});
