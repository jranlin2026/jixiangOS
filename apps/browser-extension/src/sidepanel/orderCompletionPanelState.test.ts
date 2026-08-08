import assert from 'node:assert/strict';
import {
  completionAttemptSnapshot,
  completionPanelReducer,
  conversationKey,
  createCompletionPanelState,
  isCompletionFormLocked,
  productPreviewForPanel,
} from './orderCompletionPanelState';
import type { BrowserProductPreviewResponse, BrowserRuntimeConfig } from '../shared/contracts';

const oldContext = {
  supported: true,
  pageUrl: 'https://fxg.jinritemai.com/old',
  customerDisplayName: '旧客户',
  platformOrderNo: 'ORDER-OLD',
  orderStatus: '已付款',
  productName: '旧商品',
  messages: [],
  diagnostics: [],
};
const newContext = {
  ...oldContext,
  pageUrl: 'https://fxg.jinritemai.com/new',
  customerDisplayName: '新客户',
  platformOrderNo: 'ORDER-NEW',
  productName: '新商品',
};
const sync = {
  syncId: 'sync-old',
  outcome: 'CREATED' as const,
  lead: { id: 'lead-old', name: '旧客户' },
  storedContact: { nickname: '旧客户', phone: '13826459812' },
  completedAt: '2026-08-08T13:00:00.000Z',
  remarkLines: [
    '#旧客户/手机号：13826459812（对接：暂未分配）',
    '#入OS（2026-08-08 21:00）',
  ] as [string, string],
  productResolution: { status: 'UNMATCHED' as const, rawProductName: '旧商品' },
  shop: { id: 'shop-old', shopKey: 'shop-old', displayName: '旧店铺' },
  orderRemarkStatus: 'FAILED' as const,
  greenFlagStatus: 'NOT_ATTEMPTED' as const,
};

const runtimeConfig: BrowserRuntimeConfig = {
  shops: [
    {
      id: 'shop-old',
      platform: 'DOUYIN',
      shopKey: 'shop-old',
      platformShopId: 'DY-SHOP-OLD',
      displayName: '旧店铺',
      aliases: ['旧店铺别名'],
      source: '抖音电商',
      sourceName: '飞鸽客服',
      sourceType: '公司资源',
    },
    {
      id: 'shop-new',
      platform: 'DOUYIN',
      shopKey: 'shop-new',
      platformShopId: 'DY-SHOP-NEW',
      displayName: '新店铺',
      aliases: [],
      source: '抖音电商',
      sourceName: '飞鸽客服',
      sourceType: '公司资源',
    },
  ],
};
const matchedPreview: BrowserProductPreviewResponse = {
  shop: runtimeConfig.shops[1],
  productResolution: {
    status: 'MATCHED', method: 'PLATFORM_PRODUCT_ID', osProductId: 'prod-taojin',
    osProductName: '淘金AI', osReferencePrice: 299,
  },
  facts: {
    platformProductId: 'DY-TAOJIN-100', platformProductName: '旧商品',
    paymentAmount: 399, paymentAt: '2026-08-08T11:34:20.000Z',
  },
  priceDifference: { paymentAmount: 399, osReferencePrice: 299, amount: 100, differs: true },
};

let state = createCompletionPanelState();
state = completionPanelReducer(state, {
  type: 'APPLY_RUNTIME_CONFIG', runtimeConfig, selectedShopBindingId: 'shop-old',
});
state = completionPanelReducer(state, {
  type: 'RECOGNIZE_CONTEXT',
  context: oldContext,
  detectedContact: { phone: '13826459812', wechat: 'old_wechat' },
});
state = completionPanelReducer(state, { type: 'SET_CONTACT_CONFIRMED', value: true });
state = completionPanelReducer(state, {
  type: 'START_ATTEMPT', attemptId: 1, conversationKey: conversationKey(oldContext),
});
state = completionPanelReducer(state, {
  type: 'APPLY_COMPLETION',
  attemptId: 1,
  conversationKey: conversationKey(oldContext),
  completion: {
    stage: 'PLATFORM_FAILED',
    osStatus: 'SUCCEEDED',
    orderRemarkStatus: 'FAILED',
    greenFlagStatus: 'NOT_ATTEMPTED',
    intakeResult: sync,
    remarkText: '#旧客户/13826459812\n#入OS',
    message: '平台处理失败',
  },
});

assert.equal(isCompletionFormLocked(state), true);
const lockedState = completionPanelReducer(state, {
  type: 'SET_FORM_FIELD',
  field: 'phone',
  value: '13900000000',
});
assert.equal(lockedState.form.phone, '13826459812', '已有 syncId 时不得修改联系快照');
assert.equal(completionPanelReducer(state, {
  type: 'SET_FORM_FIELD', field: 'source', value: 'OFF_PLATFORM',
}).form.source, 'CHAT', '已有 syncId 时不得修改联系来源');
assert.equal(completionPanelReducer(state, {
  type: 'SET_CONTACT_CONFIRMED', value: false,
}).contactConfirmed, true, '已有 syncId 时确认快照应锁定');

const sameOrderPreflightRefresh = completionPanelReducer(state, {
  type: 'RECOGNIZE_CONTEXT',
  context: { ...oldContext, shopDisplayName: '旧店铺别名', paymentAmount: 399 },
  detectedContact: { phone: '13826459812' },
});
assert.equal(sameOrderPreflightRefresh.sync?.syncId, 'sync-old', '同一订单已入库后的预检刷新不得擦除持久化同步结果');
assert.equal(sameOrderPreflightRefresh.completion?.stage, 'PLATFORM_FAILED');

const lockedOldConversation = state;
state = completionPanelReducer(state, {
  type: 'RECOGNIZE_CONTEXT',
  context: newContext,
  detectedContact: null,
});

assert.equal(state.context?.platformOrderNo, 'ORDER-NEW');
assert.deepEqual(state.form, { name: '新客户', phone: '', wechat: '', source: 'OFF_PLATFORM' });
assert.equal(state.contactConfirmed, false);
assert.equal(state.sync, null);
assert.equal(state.completion, null);
assert.equal(state.remarkText, '');
assert.equal(isCompletionFormLocked(state), false);

state = completionPanelReducer(state, { type: 'SET_FORM_FIELD', field: 'phone', value: '13700000000' });
state = completionPanelReducer(state, { type: 'SET_CONTACT_CONFIRMED', value: true });
assert.deepEqual(completionAttemptSnapshot(state), {
  expectedOrderNo: 'ORDER-NEW',
  expectedCustomerDisplayName: '新客户',
  shopBindingId: 'shop-old',
  phone: '13700000000',
  wechat: undefined,
  source: 'OFF_PLATFORM',
  existingIntake: undefined,
}, '会话切换后的第二次尝试只能使用新会话快照');

let shopState = completionPanelReducer(createCompletionPanelState(), {
  type: 'APPLY_RUNTIME_CONFIG', runtimeConfig, selectedShopBindingId: 'shop-old',
});
shopState = completionPanelReducer(shopState, {
  type: 'RECOGNIZE_CONTEXT',
  context: {
    ...oldContext,
    shopDisplayName: '旧店铺',
    platformProductId: 'DY-TAOJIN-100',
    paymentAmount: 399,
  },
  detectedContact: { phone: '13826459812' },
});
shopState = completionPanelReducer(shopState, {
  type: 'START_ATTEMPT', attemptId: 2, conversationKey: conversationKey(oldContext),
});
shopState = completionPanelReducer(shopState, {
  type: 'APPLY_COMPLETION',
  attemptId: 2,
  conversationKey: conversationKey(oldContext),
  completion: {
    stage: 'PLATFORM_FAILED',
    osStatus: 'SUCCEEDED',
    orderRemarkStatus: 'FAILED',
    greenFlagStatus: 'NOT_ATTEMPTED',
    intakeResult: sync,
    remarkText: sync.remarkLines.join('\n'),
    message: '平台失败',
  },
});
assert.equal(productPreviewForPanel(shopState)?.status, 'UNMATCHED');

shopState = completionPanelReducer(shopState, { type: 'SELECT_SHOP_BINDING', shopBindingId: 'shop-new' });
assert.equal(shopState.shopBindingId, 'shop-new');
assert.equal(shopState.sync, null, '切换绑定店铺必须清空旧入库结果');
assert.equal(shopState.completion, null, '切换绑定店铺必须清空旧完成状态');
assert.equal(shopState.remarkText, '', '切换绑定店铺必须清空旧备注预览');
assert.equal(shopState.activeAttempt, null, '店铺切换必须使旧异步尝试失效');
assert.equal(productPreviewForPanel(shopState), null, '运行时店铺目录不得冒充权威商品预览');
shopState = completionPanelReducer(shopState, {
  type: 'START_PRODUCT_PREVIEW', generation: 10, requestKey: 'shop-new:order-old',
});
assert.equal(shopState.productPreviewStatus, 'LOADING');
shopState = completionPanelReducer(shopState, {
  type: 'APPLY_PRODUCT_PREVIEW', generation: 10, requestKey: 'shop-new:order-old', preview: matchedPreview,
});
assert.equal(shopState.productPreviewStatus, 'READY');
assert.deepEqual(productPreviewForPanel(shopState), matchedPreview.productResolution);

const disabledSelection = completionPanelReducer(shopState, {
  type: 'APPLY_RUNTIME_CONFIG',
  runtimeConfig: { ...runtimeConfig, shops: runtimeConfig.shops.filter((shop) => shop.id !== 'shop-new') },
  selectedShopBindingId: '',
});
assert.equal(disabledSelection.shopBindingId, '', '已选店铺停用或缺失时必须立即清空');
assert.equal(disabledSelection.sync, null);
assert.equal(productPreviewForPanel(disabledSelection), null, '清空店铺后不得保留商品解析');

let previewRaceState = completionPanelReducer(createCompletionPanelState(), {
  type: 'APPLY_RUNTIME_CONFIG', runtimeConfig, selectedShopBindingId: 'shop-old',
});
previewRaceState = completionPanelReducer(previewRaceState, {
  type: 'RECOGNIZE_CONTEXT', context: oldContext, detectedContact: { phone: '13826459812' },
});
previewRaceState = completionPanelReducer(previewRaceState, {
  type: 'START_PRODUCT_PREVIEW', generation: 21, requestKey: 'shop-old:order-old',
});
previewRaceState = completionPanelReducer(previewRaceState, {
  type: 'RECOGNIZE_CONTEXT', context: newContext, detectedContact: { phone: '13826459812' },
});
assert.equal(previewRaceState.productPreviewStatus, 'IDLE', '会话切换必须立即使旧预览失效');
previewRaceState = completionPanelReducer(previewRaceState, {
  type: 'START_PRODUCT_PREVIEW', generation: 22, requestKey: 'shop-old:order-new',
});
const newPreview: BrowserProductPreviewResponse = {
  ...matchedPreview,
  shop: runtimeConfig.shops[0],
  productResolution: { status: 'UNMATCHED', rawProductName: '新商品' },
  facts: { platformProductName: '新商品' },
  priceDifference: null,
};
const beforeLatePreview = structuredClone(previewRaceState);
previewRaceState = completionPanelReducer(previewRaceState, {
  type: 'APPLY_PRODUCT_PREVIEW', generation: 21, requestKey: 'shop-old:order-old', preview: matchedPreview,
});
assert.deepEqual(previewRaceState, beforeLatePreview, '旧会话晚到的预览响应不得覆盖新会话');
previewRaceState = completionPanelReducer(previewRaceState, {
  type: 'APPLY_PRODUCT_PREVIEW', generation: 22, requestKey: 'shop-old:order-new', preview: newPreview,
});
assert.deepEqual(productPreviewForPanel(previewRaceState), newPreview.productResolution);

let sameOrderFactsRace = completionPanelReducer(createCompletionPanelState(), {
  type: 'APPLY_RUNTIME_CONFIG', runtimeConfig, selectedShopBindingId: 'shop-old',
});
sameOrderFactsRace = completionPanelReducer(sameOrderFactsRace, {
  type: 'RECOGNIZE_CONTEXT', context: oldContext, detectedContact: { phone: '13826459812' },
});
sameOrderFactsRace = completionPanelReducer(sameOrderFactsRace, {
  type: 'START_PRODUCT_PREVIEW', generation: 25, requestKey: 'shop-old:old-product',
});
sameOrderFactsRace = completionPanelReducer(sameOrderFactsRace, {
  type: 'RECOGNIZE_CONTEXT',
  context: { ...oldContext, platformProductId: 'PRODUCT-CHANGED', productName: '变更后商品' },
  detectedContact: { phone: '13826459812' },
});
assert.equal(sameOrderFactsRace.productPreviewStatus, 'IDLE', '同订单商品事实变化也必须使旧预览失效');

let shopPreviewRaceState = completionPanelReducer(createCompletionPanelState(), {
  type: 'APPLY_RUNTIME_CONFIG', runtimeConfig, selectedShopBindingId: 'shop-old',
});
shopPreviewRaceState = completionPanelReducer(shopPreviewRaceState, {
  type: 'RECOGNIZE_CONTEXT', context: oldContext, detectedContact: { phone: '13826459812' },
});
shopPreviewRaceState = completionPanelReducer(shopPreviewRaceState, {
  type: 'START_PRODUCT_PREVIEW', generation: 31, requestKey: 'shop-old:order-old',
});
shopPreviewRaceState = completionPanelReducer(shopPreviewRaceState, {
  type: 'SELECT_SHOP_BINDING', shopBindingId: 'shop-new',
});
shopPreviewRaceState = completionPanelReducer(shopPreviewRaceState, {
  type: 'APPLY_PRODUCT_PREVIEW', generation: 31, requestKey: 'shop-old:order-old', preview: matchedPreview,
});
assert.equal(productPreviewForPanel(shopPreviewRaceState), null, '切换店铺后旧店铺的晚到预览必须被忽略');

const detectedReset = completionPanelReducer(lockedOldConversation, {
  type: 'RECOGNIZE_CONTEXT',
  context: { ...newContext, platformOrderNo: 'ORDER-DETECTED' },
  detectedContact: { phone: '13600000000', wechat: 'new_wechat' },
});
assert.deepEqual(detectedReset.form, {
  name: '新客户',
  phone: '13600000000',
  wechat: 'new_wechat',
  source: 'CHAT',
}, '新会话只能采用新识别到的联系方式');
assert.equal(detectedReset.sync, null);

let raceState = createCompletionPanelState();
raceState = completionPanelReducer(raceState, {
  type: 'RECOGNIZE_CONTEXT', context: oldContext, detectedContact: { phone: '13826459812' },
});
raceState = completionPanelReducer(raceState, {
  type: 'START_ATTEMPT',
  attemptId: 41,
  conversationKey: conversationKey(oldContext),
});
const activeAState = structuredClone(raceState);
const lateFailure = {
  stage: 'PLATFORM_FAILED' as const,
  osStatus: 'SUCCEEDED' as const,
  orderRemarkStatus: 'FAILED' as const,
  greenFlagStatus: 'NOT_ATTEMPTED' as const,
  intakeResult: sync,
  message: '尝试 A 失败',
};
assert.deepEqual(completionPanelReducer(raceState, {
  type: 'APPLY_COMPLETION',
  attemptId: 42,
  conversationKey: conversationKey(oldContext),
  completion: lateFailure,
}), activeAState, '同一会话的旧 attempt id 事件必须忽略');
assert.deepEqual(completionPanelReducer(raceState, {
  type: 'APPLY_COMPLETION',
  attemptId: 41,
  conversationKey: conversationKey(newContext),
  completion: lateFailure,
}), activeAState, '尝试会话键不匹配时事件必须忽略');
raceState = completionPanelReducer(raceState, {
  type: 'RECOGNIZE_CONTEXT', context: newContext, detectedContact: null,
});
const conversationBState = structuredClone(raceState);

raceState = completionPanelReducer(raceState, {
  type: 'RECOGNIZE_ATTEMPT_CONTEXT',
  attemptId: 41,
  conversationKey: conversationKey(oldContext),
  context: oldContext,
  detectedContact: { phone: '13826459812' },
});
assert.deepEqual(raceState, conversationBState, '会话 B 已生效后必须忽略尝试 A 晚到的预检识别');

raceState = completionPanelReducer(raceState, {
  type: 'APPLY_COMPLETION',
  attemptId: 41,
  conversationKey: conversationKey(oldContext),
  completion: {
    stage: 'PLATFORM_COMPLETING',
    osStatus: 'SUCCEEDED',
    orderRemarkStatus: 'IN_PROGRESS',
    greenFlagStatus: 'IN_PROGRESS',
    intakeResult: sync,
    remarkText: '#旧客户/13826459812\n#入OS',
  },
});
assert.deepEqual(raceState, conversationBState, '会话 B 已生效后必须忽略尝试 A 的晚到进度');

raceState = completionPanelReducer(raceState, {
  type: 'APPLY_COMPLETION',
  attemptId: 41,
  conversationKey: conversationKey(oldContext),
  completion: {
    stage: 'COMPLETED',
    osStatus: 'SUCCEEDED',
    orderRemarkStatus: 'SUCCEEDED',
    greenFlagStatus: 'SUCCEEDED',
    intakeResult: { ...sync, orderRemarkStatus: 'SUCCEEDED', greenFlagStatus: 'SUCCEEDED' },
    remarkText: '#旧客户/13826459812\n#入OS',
  },
});
assert.deepEqual(raceState, conversationBState, '会话 B 已生效后必须忽略尝试 A 的晚到结果');

console.log('order completion panel state: ok');
