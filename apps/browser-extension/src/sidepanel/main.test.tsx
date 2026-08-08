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
  HTMLSelectElement: dom.window.HTMLSelectElement,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
});
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });

const context = {
  supported: true,
  pageUrl: 'https://fxg.jinritemai.com/im',
  customerDisplayName: '海盗船长',
  shopDisplayName: '极享官方店',
  platformOrderNo: 'ORDER-RENDER-1',
  orderStatus: '已付款',
  platformProductId: 'DY-TAOJIN-100',
  productName: '淘金AI 多模态创作智能体 读书卡',
  paymentAmount: 399,
  paymentAt: '2026-08-08T19:34:20+08:00',
  messages: [],
  diagnostics: [],
};
const shops = [
  {
    id: 'shop-1', platform: 'DOUYIN', shopKey: 'jx-main', platformShopId: 'DY-SHOP-1',
    displayName: '极享官方店', aliases: ['极享官方旗舰店'], source: '抖音电商', sourceName: '飞鸽客服', sourceType: '公司资源',
  },
  {
    id: 'shop-2', platform: 'DOUYIN', shopKey: 'jx-second', platformShopId: 'DY-SHOP-2',
    displayName: '极享二店', aliases: [], source: '抖音电商', sourceName: '飞鸽客服', sourceType: '公司资源',
  },
];
const backendRemarkLines: [string, string] = [
  '#海盗船长/手机号：13800138000（对接：销售小王）',
  '#入OS（2026-08-08 21:00）',
];
const intakeResult = {
  syncId: 'sync-render-1',
  outcome: 'CREATED' as const,
  lead: { id: 'lead-render-1', name: '海盗船长', assignedTo: '销售小王' },
  storedContact: { nickname: '海盗船长', phone: '13800138000' },
  completedAt: '2026-08-08T13:00:00.000Z',
  remarkLines: backendRemarkLines,
  productResolution: { status: 'UNMATCHED' as const, rawProductName: context.productName },
  shop: { id: 'shop-1', shopKey: 'jx-main', displayName: '极享官方店' },
  orderRemarkStatus: 'NOT_ATTEMPTED' as const,
  greenFlagStatus: 'NOT_ATTEMPTED' as const,
};

let intakeSucceeds = false;
const intakeInputs: Record<string, unknown>[] = [];
let completeInput: unknown;
const savedConfigs: unknown[] = [];
const scriptView = {
  library: { schemaVersion: 1, revision: 1, groups: [], updatedAt: '', updatedBy: { id: 'u1', name: '客服甲' } },
  canManage: false,
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
            operator: { id: 'u1', name: '客服甲', role: 'SERVICE' },
            config: { apiBaseUrl: 'https://os.example.com/api' },
          },
          message: 'success',
        };
      }
      if (message.type === 'GET_RUNTIME_CONFIG') {
        return {
          code: 0,
          data: {
            shops,
            products: [{ id: 'prod-taojin', name: '淘金AI', referencePrice: 299 }],
            productMappings: [{
              id: 'map-1', shopBindingId: 'shop-1', platformProductId: 'DY-TAOJIN-100',
              platformProductName: context.productName, aliases: [], osProductId: 'prod-taojin',
              osProductName: '淘金AI', active: true,
            }],
          },
          message: 'success',
        };
      }
      if (message.type === 'SAVE_CONFIG') {
        savedConfigs.push(message.config);
        return { code: 0, data: message.config, message: 'success' };
      }
      if (message.type === 'GET_SCRIPT_LIBRARY') return { code: 0, data: scriptView, message: 'success' };
      if (message.type === 'CREATE_LEAD_INTAKE') {
        intakeInputs.push(message.input);
        return intakeSucceeds
          ? { code: 0, data: intakeResult, message: 'success' }
          : { code: 409, data: null, errorCode: 'ORDER_CONTACT_CONFLICT', message: '昵称与首次入库快照不一致，请先在极享OS核对' };
      }
      if (message.type === 'REPORT_PLATFORM_COMPLETION') {
        return {
          code: 0,
          data: { syncId: message.syncId, orderRemarkStatus: 'SUCCEEDED', greenFlagStatus: 'SUCCEEDED' },
          message: 'success',
        };
      }
      throw new Error(`unexpected worker message ${message.type}`);
    },
  },
  tabs: {
    query: async () => [{ id: 1, url: context.pageUrl }],
    sendMessage: async (_tabId: number, message: any) => {
      if (message.type === 'READ_FEIGE_CONTEXT') {
        return { ok: true, context, detectedContact: { phone: '13800138000' } };
      }
      if (message.type === 'COMPLETE_FEIGE_OS_ORDER') {
        completeInput = message.input;
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
  for (let index = 0; index < 80; index += 1) {
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

await import('./main');
await waitFor('.login-card');
assert.equal(document.body.textContent?.includes('店铺标识'), false, '登录只允许输入API地址、账号和密码');
const loginInputs = [...document.querySelectorAll<HTMLInputElement>('.login-card input')];
assert.equal(loginInputs.length, 3);
inputValue(loginInputs[1], 'agent-1');
inputValue(loginInputs[2], 'password');
document.querySelector<HTMLButtonElement>('.login-card .primary')?.click();

const shopSelect = await waitFor<HTMLSelectElement>('select[aria-label="绑定店铺"]');
assert.equal(shopSelect.value, '', '多店铺不得自动猜测');
const completeButton = await waitFor<HTMLButtonElement>('button[data-action="complete-order"]');
assert.equal(completeButton.disabled, true, '多店铺未选择时必须阻止入库');

shopSelect.value = 'shop-1';
shopSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
await waitFor('select[aria-label="绑定店铺"]', (node) => (node as HTMLSelectElement).value === 'shop-1');
assert.deepEqual(savedConfigs.at(-1), { apiBaseUrl: 'https://os.example.com/api', shopBindingId: 'shop-1' });
assert.match(document.body.textContent || '', /绑定店铺极享官方店/);
assert.match(document.body.textContent || '', /页面店铺极享官方店/);
assert.match(document.body.textContent || '', /平台商品淘金AI 多模态创作智能体 读书卡/);
assert.match(document.body.textContent || '', /匹配产品淘金AI/);
assert.match(document.body.textContent || '', /匹配方式店铺商品映射/);
assert.match(document.body.textContent || '', /OS参考价¥299\.00/);
assert.match(document.body.textContent || '', /实付金额¥399\.00/);
assert.match(document.body.textContent || '', /OS参考价 ¥299\.00，仅供参考；本次按飞鸽实付 ¥399\.00 录入/);

document.querySelector<HTMLInputElement>('.confirm-row input')?.click();
await waitFor<HTMLButtonElement>('button[data-action="complete-order"]', (node) => !node.disabled);
completeButton.click();
const errorDialog = await waitFor<HTMLElement>('[role="dialog"]');
assert.match(errorDialog.textContent || '', /操作未完成/);
assert.match(errorDialog.textContent || '', /昵称与首次入库快照不一致，请先在极享OS核对/);
assert.equal(document.querySelector('.result-card .alert.error, .result-card .alert.warning'), null, '操作错误只能通过 FeedbackDialog 呈现');
errorDialog.querySelector<HTMLButtonElement>('.feedback-confirm')?.click();
await new Promise((resolve) => setTimeout(resolve, 10));

intakeSucceeds = true;
completeButton.click();
const successDialog = await waitFor<HTMLElement>('[role="dialog"]', (node) => (node.textContent || '').includes('操作成功'));
assert.match(successDialog.textContent || '', /线索编号：lead-render-1/);
assert.match(successDialog.textContent || '', /分配销售：销售小王/);
assert.match(successDialog.textContent || '', /订单备注、绿色旗帜均已验证/);
assert.match(document.body.textContent || '', /匹配产品待匹配（本次仍可录入，平台原名会写入OS备注）/);
assert.match(document.body.textContent || '', /平台原名“淘金AI 多模态创作智能体 读书卡”将写入OS备注/);
assert.match(document.body.textContent || '', /OS参考价暂未提供/);
assert.equal(intakeInputs.length, 2);
assert.deepEqual(intakeInputs.at(-1), {
  platform: 'DOUYIN',
  shopBindingId: 'shop-1',
  pageShopDisplayName: '极享官方店',
  platformOrderNo: 'ORDER-RENDER-1',
  contactName: '海盗船长',
  contactPhone: '13800138000',
  contactWechat: undefined,
  contactSource: 'CHAT',
  platformProductId: 'DY-TAOJIN-100',
  platformSkuId: undefined,
  platformProductName: '淘金AI 多模态创作智能体 读书卡',
  paymentAmount: 399,
  paymentAt: '2026-08-08T19:34:20+08:00',
}, '入库只提交绑定ID与飞鸽原始事实，不得提交自由 shopKey 或OS产品名');
assert.deepEqual(completeInput, {
  expectedOrderNo: context.platformOrderNo,
  expectedCustomerDisplayName: context.customerDisplayName,
  remarkLines: backendRemarkLines,
});

dom.window.close();
console.log('browser sidepanel rendered shop and product flow: ok');
