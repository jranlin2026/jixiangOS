import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'chrome-extension://test/sidepanel.html',
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
});
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });

type Deferred = { promise: Promise<void>; release(): void };
function deferred(): Deferred {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

const shop = {
  id: 'shop-1', platform: 'DOUYIN', shopKey: 'jx-main', platformShopId: 'DY-SHOP-1',
  displayName: '极享官方店', aliases: ['极享官方旗舰店'], source: '抖音电商', sourceName: '飞鸽客服', sourceType: '公司资源',
};
const baseContext = {
  supported: true,
  pageUrl: 'https://fxg.jinritemai.com/im',
  customerDisplayName: '取消测试客户',
  shopDisplayName: '其他店铺',
  platformOrderNo: 'ORDER-CANCEL-1',
  orderStatus: '已付款',
  platformProductId: 'DY-CANCEL',
  productName: '取消测试商品',
  paymentAmount: 299,
  paymentAt: '2026-08-09T10:00:00+08:00',
  messages: [],
  diagnostics: [],
};
let pageContext = baseContext;
let previewMode: 'IMMEDIATE' | 'PENDING' = 'IMMEDIATE';
let previewGate = deferred();
let intakeMode: 'IMMEDIATE' | 'PENDING' = 'IMMEDIATE';
let intakeGate = deferred();
let previewCalls = 0;
let intakeCalls = 0;
let completePageCalls = 0;
let reportCalls = 0;

const intakeResult = {
  syncId: 'sync-cancel',
  outcome: 'CREATED' as const,
  lead: { id: 'lead-cancel', name: '取消测试客户', assignedTo: '销售小王' },
  storedContact: { nickname: '取消测试客户', phone: '13800138000' },
  completedAt: '2026-08-09T02:00:00.000Z',
  remarkLines: ['#取消测试客户/手机号：13800138000（对接：销售小王）', '#入OS（2026-08-09 10:00）'] as [string, string],
  productResolution: { status: 'UNMATCHED' as const, rawProductName: '取消测试商品' },
  shop: { id: shop.id, shopKey: shop.shopKey, displayName: shop.displayName },
  orderRemarkStatus: 'NOT_ATTEMPTED' as const,
  greenFlagStatus: 'NOT_ATTEMPTED' as const,
};

const chromeMock = {
  permissions: { request: async () => true },
  runtime: {
    sendMessage: async (message: any) => {
      if (message.type === 'AUTH_STATE') {
        return { code: 0, data: { config: { apiBaseUrl: 'https://os.example.com/api' } }, message: 'success' };
      }
      if (message.type === 'LOGIN') {
        return {
          code: 0,
          data: {
            operator: { id: 'operator-cancel', name: '客服取消测试', role: 'SERVICE' },
            config: { apiBaseUrl: 'https://os.example.com/api', shopBindingId: shop.id },
          },
          message: 'success',
        };
      }
      if (message.type === 'LOGOUT') return { code: 0, data: null, message: 'success' };
      if (message.type === 'GET_RUNTIME_CONFIG') {
        return { code: 0, data: { shops: [shop], selectedShopBindingId: shop.id }, message: 'success' };
      }
      if (message.type === 'GET_SCRIPT_LIBRARY') {
        return {
          code: 0,
          data: {
            library: { schemaVersion: 1, revision: 1, groups: [], updatedAt: '', updatedBy: { id: 'u1', name: '客服' } },
            canManage: false,
          },
          message: 'success',
        };
      }
      if (message.type === 'PREVIEW_PRODUCT_MAPPING') {
        previewCalls += 1;
        if (previewMode === 'PENDING') await previewGate.promise;
        return {
          code: 0,
          data: {
            shop,
            productResolution: { status: 'UNMATCHED', rawProductName: message.input.platformProductName },
            facts: message.input,
            priceDifference: null,
          },
          message: 'success',
        };
      }
      if (message.type === 'CREATE_LEAD_INTAKE') {
        intakeCalls += 1;
        if (intakeMode === 'PENDING') await intakeGate.promise;
        return { code: 0, data: intakeResult, message: 'success' };
      }
      if (message.type === 'REPORT_PLATFORM_COMPLETION') {
        reportCalls += 1;
        return {
          code: 0,
          data: { syncId: message.syncId, orderRemarkStatus: 'SUCCEEDED', greenFlagStatus: 'SUCCEEDED' },
          message: 'success',
        };
      }
      if (message.type === 'SAVE_CONFIG') return { code: 0, data: message.config, message: 'success' };
      throw new Error(`unexpected worker message ${message.type}`);
    },
  },
  tabs: {
    query: async () => [{ id: 1, url: baseContext.pageUrl }],
    sendMessage: async (_tabId: number, message: any) => {
      if (message.type === 'READ_FEIGE_CONTEXT') {
        return { ok: true, context: pageContext, detectedContact: { phone: '13800138000' } };
      }
      if (message.type === 'COMPLETE_FEIGE_OS_ORDER') {
        completePageCalls += 1;
        return {
          ok: true,
          remarkText: message.input.remarkLines.join('\n'),
          remarkStatus: 'SUCCEEDED',
          greenFlagStatus: 'SUCCEEDED',
        };
      }
      throw new Error(`unexpected page message ${message.type}`);
    },
  },
  scripting: { executeScript: async () => undefined },
};
(globalThis as typeof globalThis & { chrome: typeof chrome }).chrome = chromeMock as unknown as typeof chrome;

async function waitFor<T extends Element>(selector: string, predicate: (node: T) => boolean = () => true) {
  for (let index = 0; index < 100; index += 1) {
    const node = document.querySelector<T>(selector);
    if (node && predicate(node)) return node;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${selector}: ${document.body.textContent}`);
}

function inputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
}

async function loginAndPrepare(orderNo: string) {
  pageContext = { ...baseContext, platformOrderNo: orderNo, shopDisplayName: '其他店铺' };
  const loginCard = await waitFor('.login-card');
  const inputs = [...loginCard.querySelectorAll<HTMLInputElement>('input')];
  inputValue(inputs[1], 'agent-cancel');
  inputValue(inputs[2], 'password');
  loginCard.querySelector<HTMLButtonElement>('.primary')?.click();
  await waitFor('.context-card', (node) => (node.textContent || '').includes(orderNo));
  document.querySelector<HTMLInputElement>('.confirm-row input')?.click();
  await waitFor<HTMLButtonElement>('button[data-action="complete-order"]', (node) => !node.disabled);
  pageContext = { ...pageContext, shopDisplayName: shop.displayName };
}

const module = await import('./main');
await loginAndPrepare('ORDER-CANCEL-PREVIEW-LOGOUT');
previewMode = 'PENDING';
previewGate = deferred();
document.querySelector<HTMLButtonElement>('button[data-action="complete-order"]')?.click();
await waitFor('button[data-action="complete-order"]', () => previewCalls === 1);
document.querySelector<HTMLButtonElement>('header .text-button')?.click();
await waitFor('.login-card');
previewGate.release();
await new Promise((resolve) => setTimeout(resolve, 15));
assert.deepEqual([intakeCalls, completePageCalls, reportCalls], [0, 0, 0]);
assert.equal(document.querySelector('[role="dialog"]'), null, '退出后不得复活旧尝试反馈');

previewMode = 'IMMEDIATE';
await loginAndPrepare('ORDER-CANCEL-INTAKE-LOGOUT');
intakeMode = 'PENDING';
intakeGate = deferred();
document.querySelector<HTMLButtonElement>('button[data-action="complete-order"]')?.click();
await waitFor('button[data-action="complete-order"]', () => intakeCalls === 1);
document.querySelector<HTMLButtonElement>('header .text-button')?.click();
await waitFor('.login-card');
intakeGate.release();
await new Promise((resolve) => setTimeout(resolve, 15));
assert.deepEqual([completePageCalls, reportCalls], [0, 0], '入库请求已发出时无法撤回，但退出后不得继续页面动作或上报');
assert.equal(document.querySelector('[role="dialog"]'), null);

intakeMode = 'IMMEDIATE';
await loginAndPrepare('ORDER-CANCEL-PREVIEW-UNMOUNT');
previewMode = 'PENDING';
previewGate = deferred();
const previewCallsBeforeUnmount = previewCalls;
document.querySelector<HTMLButtonElement>('button[data-action="complete-order"]')?.click();
await waitFor('button[data-action="complete-order"]', () => previewCalls === previewCallsBeforeUnmount + 1);
const intakeCallsBeforeUnmount = intakeCalls;
module.sidepanelRoot.unmount();
previewGate.release();
await new Promise((resolve) => setTimeout(resolve, 15));
assert.equal(intakeCalls, intakeCallsBeforeUnmount, '卸载时预览在等待则不得继续入库');
assert.deepEqual([completePageCalls, reportCalls], [0, 0]);
assert.equal(document.querySelector('[role="dialog"]'), null);

dom.window.close();
console.log('browser sidepanel stale completion cancellation: ok');
