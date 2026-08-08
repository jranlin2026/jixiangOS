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
let pageContext = context;
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
const previewInputs: Record<string, unknown>[] = [];
const productWorkerCallOrder: string[] = [];
let completeInput: unknown;
const savedConfigs: unknown[] = [];
const scriptView = {
  library: { schemaVersion: 1, revision: 1, groups: [], updatedAt: '', updatedBy: { id: 'u1', name: '客服甲' } },
  canManage: false,
};
let releaseInitialPreview!: () => void;
const initialPreviewGate = new Promise<void>((resolve) => { releaseInitialPreview = resolve; });
let holdInitialPreview = true;
let releaseStaleUnavailablePreview!: () => void;
const staleUnavailablePreviewGate = new Promise<void>((resolve) => { releaseStaleUnavailablePreview = resolve; });
let releaseLoggedOutPreview!: () => void;
const loggedOutPreviewGate = new Promise<void>((resolve) => { releaseLoggedOutPreview = resolve; });
let releaseLogout!: () => void;
const logoutGate = new Promise<void>((resolve) => { releaseLogout = resolve; });

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
          data: { shops },
          message: 'success',
        };
      }
      if (message.type === 'PREVIEW_PRODUCT_MAPPING') {
        productWorkerCallOrder.push('PREVIEW_PRODUCT_MAPPING');
        previewInputs.push(message.input);
        if (holdInitialPreview) await initialPreviewGate;
        holdInitialPreview = false;
        if (message.input.platformProductId === 'DY-STALE-A') {
          await staleUnavailablePreviewGate;
          return {
            code: 409,
            data: null,
            errorCode: 'SHOP_BINDING_UNAVAILABLE',
            message: '旧店铺已停用',
          };
        }
        if (message.input.platformProductId === 'DY-LOGOUT-LATE') {
          await loggedOutPreviewGate;
          return {
            code: 409,
            data: null,
            errorCode: 'SHOP_BINDING_UNAVAILABLE',
            message: '退出前的店铺已停用',
          };
        }
        if (message.input.platformProductId === 'DY-CONFLICT') {
          return {
            code: 409,
            data: null,
            errorCode: 'PRODUCT_CONFIG_CONFLICT',
            message: '当前店铺商品映射存在冲突，请联系管理员修正后重试',
          };
        }
        const unmatched = message.input.platformProductId === 'DY-UNKNOWN';
        const previewShop = shops.find((shop) => shop.id === message.input.shopBindingId) || shops[0];
        return {
          code: 0,
          data: {
            shop: previewShop,
            productResolution: unmatched
              ? { status: 'UNMATCHED', rawProductName: message.input.platformProductName }
              : {
                  status: 'MATCHED', method: 'PLATFORM_PRODUCT_ID', osProductId: 'prod-taojin',
                  osProductName: previewShop.id === 'shop-2' ? '二店标准产品' : '淘金AI', osReferencePrice: 299,
                },
            facts: {
              platformProductId: message.input.platformProductId,
              platformProductName: message.input.platformProductName,
              paymentAmount: message.input.paymentAmount,
              paymentAt: message.input.paymentAt,
            },
            priceDifference: unmatched ? null : {
              paymentAmount: 399, osReferencePrice: 299, amount: 100, differs: true,
            },
          },
          message: 'success',
        };
      }
      if (message.type === 'SAVE_CONFIG') {
        savedConfigs.push(message.config);
        return { code: 0, data: message.config, message: 'success' };
      }
      if (message.type === 'LOGOUT') {
        await logoutGate;
        return { code: 0, data: null, message: 'success' };
      }
      if (message.type === 'GET_SCRIPT_LIBRARY') return { code: 0, data: scriptView, message: 'success' };
      if (message.type === 'CREATE_LEAD_INTAKE') {
        productWorkerCallOrder.push('CREATE_LEAD_INTAKE');
        intakeInputs.push(message.input);
        return intakeSucceeds
          ? {
              code: 0,
              data: {
                ...intakeResult,
                productResolution: {
                  status: 'UNMATCHED', rawProductName: message.input.platformProductName,
                },
              },
              message: 'success',
            }
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
        return { ok: true, context: pageContext, detectedContact: { phone: '13800138000' } };
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
await waitFor('.context-card', (node) => (node.textContent || '').includes('正在匹配…'));
assert.equal(completeButton.disabled, true, '权威预览加载中必须禁用最终操作');
assert.equal(intakeInputs.length, 0);
releaseInitialPreview();
assert.match(document.body.textContent || '', /绑定店铺极享官方店/);
assert.match(document.body.textContent || '', /页面店铺极享官方店/);
assert.match(document.body.textContent || '', /平台商品淘金AI 多模态创作智能体 读书卡/);
await waitFor('.context-card', (node) => (node.textContent || '').includes('匹配产品淘金AI'));
assert.match(document.body.textContent || '', /匹配产品淘金AI/);
assert.match(document.body.textContent || '', /匹配方式店铺商品映射/);
assert.match(document.body.textContent || '', /OS参考价¥299\.00/);
assert.match(document.body.textContent || '', /实付金额¥399\.00/);
assert.match(document.body.textContent || '', /OS参考价 ¥299\.00，仅供参考；本次按飞鸽实付 ¥399\.00 录入/);
assert.equal(intakeInputs.length, 0, '权威匹配预览必须发生在线索创建之前');
assert.equal(previewInputs.length > 0, true);

pageContext = {
  ...context,
  platformOrderNo: 'ORDER-STALE-A',
  platformProductId: 'DY-STALE-A',
};
document.querySelector<HTMLButtonElement>('.context-card .secondary.compact')?.click();
await waitFor('.context-card', (node) => (node.textContent || '').includes('正在匹配…'));
pageContext = {
  ...context,
  shopDisplayName: '极享二店',
  platformOrderNo: 'ORDER-CURRENT-B',
  platformProductId: 'DY-CURRENT-B',
};
document.querySelector<HTMLButtonElement>('.context-card .secondary.compact')?.click();
await waitFor('.context-card', (node) => (node.textContent || '').includes('页面店铺极享二店'));
shopSelect.value = 'shop-2';
shopSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
await waitFor('.context-card', (node) => (node.textContent || '').includes('匹配产品二店标准产品'));
const savedConfigCountBeforeStaleResponse = savedConfigs.length;
releaseStaleUnavailablePreview();
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(shopSelect.value, 'shop-2', '旧店铺的迟到停用响应不得清空当前店铺');
assert.equal(savedConfigs.length, savedConfigCountBeforeStaleResponse, '迟到响应不得覆盖当前持久化配置');
assert.match(document.body.textContent || '', /匹配产品二店标准产品/);

pageContext = context;
document.querySelector<HTMLButtonElement>('.context-card .secondary.compact')?.click();
await waitFor('.context-card', (node) => (node.textContent || '').includes('页面店铺极享官方店'));
shopSelect.value = 'shop-1';
shopSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
await waitFor('.context-card', (node) => (node.textContent || '').includes('匹配产品淘金AI'));

pageContext = {
  ...context,
  shopDisplayName: '其他店铺',
  platformOrderNo: 'ORDER-CACHED-MISMATCH',
  platformProductId: 'DY-CACHED-MISMATCH',
};
document.querySelector<HTMLButtonElement>('.context-card .secondary.compact')?.click();
await waitFor('.context-card', (node) => (node.textContent || '').includes('当前页面店铺与已选店铺绑定不一致'));
document.querySelector<HTMLInputElement>('.confirm-row input')?.click();
pageContext = {
  ...context,
  platformOrderNo: 'ORDER-CACHED-MISMATCH',
  platformProductId: 'DY-CACHED-MISMATCH',
};
await waitFor<HTMLButtonElement>('button[data-action="complete-order"]', (node) => !node.disabled);
const previewCountBeforeCachedMismatchClick = previewInputs.length;
const productCallCountBeforeCachedMismatchClick = productWorkerCallOrder.length;
intakeSucceeds = true;
completeButton.click();
const cachedMismatchSuccess = await waitFor<HTMLElement>('[role="dialog"]', (node) => (
  (node.textContent || '').includes('操作成功')
));
assert.equal(previewInputs.length >= previewCountBeforeCachedMismatchClick + 1, true, '缓存店铺不一致时，最新页面预检后仍必须在创建线索前权威预览');
assert.equal(previewInputs[previewCountBeforeCachedMismatchClick]?.pageShopDisplayName, '极享官方店');
assert.deepEqual(productWorkerCallOrder.slice(productCallCountBeforeCachedMismatchClick, productCallCountBeforeCachedMismatchClick + 2), [
  'PREVIEW_PRODUCT_MAPPING',
  'CREATE_LEAD_INTAKE',
], '缓存不一致的特殊路径也必须先用最新店铺权威预览，再创建线索');
assert.equal(intakeInputs.at(-1)?.pageShopDisplayName, '极享官方店', '点击后必须使用最新预检店铺');
cachedMismatchSuccess.querySelector<HTMLButtonElement>('.feedback-confirm')?.click();
intakeSucceeds = false;
await new Promise((resolve) => setTimeout(resolve, 10));

pageContext = {
  ...context,
  platformOrderNo: 'ORDER-RENDER-2',
  platformProductId: 'DY-CONFLICT',
  productName: '冲突商品',
};
document.querySelector<HTMLButtonElement>('.context-card .secondary.compact')?.click();
const previewErrorDialog = await waitFor<HTMLElement>('[role="dialog"]', (node) => (
  (node.textContent || '').includes('当前店铺商品映射存在冲突')
));
assert.equal(completeButton.disabled, true, '预览错误或配置冲突时必须禁用最终操作');
assert.equal(intakeInputs.length, 1);
previewErrorDialog.querySelector<HTMLButtonElement>('.feedback-confirm')?.click();
await new Promise((resolve) => setTimeout(resolve, 10));

pageContext = {
  ...context,
  platformOrderNo: 'ORDER-RENDER-3',
  platformProductId: 'DY-UNKNOWN',
  productName: '完全未配置的平台商品',
  paymentAmount: 188,
};
document.querySelector<HTMLButtonElement>('.context-card .secondary.compact')?.click();
await waitFor('.context-card', (node) => (node.textContent || '').includes('平台原名“完全未配置的平台商品”将写入OS备注'));
assert.equal(intakeInputs.length, 1, '未匹配警告必须在客服点击入库前出现');

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
assert.match(document.body.textContent || '', /平台原名“完全未配置的平台商品”将写入OS备注/);
assert.match(document.body.textContent || '', /OS参考价暂未提供/);
assert.equal(intakeInputs.length, 3);
assert.deepEqual(intakeInputs.at(-1), {
  platform: 'DOUYIN',
  shopBindingId: 'shop-1',
  pageShopDisplayName: '极享官方店',
  platformOrderNo: 'ORDER-RENDER-3',
  contactName: '海盗船长',
  contactPhone: '13800138000',
  contactWechat: undefined,
  contactSource: 'CHAT',
  platformProductId: 'DY-UNKNOWN',
  platformSkuId: undefined,
  platformProductName: '完全未配置的平台商品',
  paymentAmount: 188,
  paymentAt: '2026-08-08T19:34:20+08:00',
}, '入库只提交绑定ID与飞鸽原始事实，不得提交自由 shopKey 或OS产品名');
assert.deepEqual(completeInput, {
  expectedOrderNo: 'ORDER-RENDER-3',
  expectedCustomerDisplayName: context.customerDisplayName,
  remarkLines: backendRemarkLines,
});

successDialog.querySelector<HTMLButtonElement>('.feedback-confirm')?.click();
pageContext = {
  ...context,
  platformOrderNo: 'ORDER-LOGOUT-LATE',
  platformProductId: 'DY-LOGOUT-LATE',
};
document.querySelector<HTMLButtonElement>('.context-card .secondary.compact')?.click();
await waitFor('.context-card', (node) => (node.textContent || '').includes('正在匹配…'));
const savedConfigCountBeforeLogout = savedConfigs.length;
document.querySelector<HTMLButtonElement>('header .text-button')?.click();
await new Promise((resolve) => setTimeout(resolve, 5));
releaseLoggedOutPreview();
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(savedConfigs.length, savedConfigCountBeforeLogout, '退出后的迟到预览响应不得写入配置');
assert.equal(document.querySelector('[role="dialog"]'), null, '退出后的迟到预览响应不得修改界面反馈');
releaseLogout();
await waitFor('.login-card');

dom.window.close();
console.log('browser sidepanel rendered shop and product flow: ok');
