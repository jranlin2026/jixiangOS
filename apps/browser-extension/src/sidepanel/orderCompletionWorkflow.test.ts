import assert from 'node:assert/strict';
import { runOrderCompletion as runOrderCompletionProduction } from './orderCompletionWorkflow';

const currentContext = {
  supported: true,
  readyForIntake: true,
  pageUrl: 'https://im.jinritemai.com/pc_seller_v2/main/workspace',
  customerDisplayName: '悠然一刻',
  platformOrderNo: 'ORDER-20260808-1',
  orderStatus: '已付款',
  shopDisplayName: '',
  platformProductId: 'PRODUCT-OLD',
  platformSkuId: 'SKU-OLD',
  productName: '体验套餐',
  paymentAmount: 299,
  paymentAt: '2026-08-08T19:34:20+08:00',
  messages: [],
  diagnostics: [],
};

const selectedShop = {
  id: 'shop-1',
  platform: 'DOUYIN',
  shopKey: 'jixiang',
  platformShopId: 'DY-SHOP-1',
  displayName: '极享官方店',
  aliases: ['极享官方旗舰店'],
  source: '抖音电商',
  sourceName: '飞鸽客服',
  sourceType: '公司资源',
};

function previewForContext(context: typeof currentContext, shop: any = selectedShop) {
  return {
    shop,
    productResolution: { status: 'UNMATCHED' as const, rawProductName: context.productName },
    facts: {
      platformProductId: context.platformProductId,
      platformSkuId: context.platformSkuId,
      platformProductName: context.productName,
      paymentAmount: context.paymentAmount,
      paymentAt: new Date(context.paymentAt).toISOString(),
    },
    priceDifference: null,
  };
}

type WorkflowInput = Parameters<typeof runOrderCompletionProduction>[0];
type WorkflowDependencies = Parameters<typeof runOrderCompletionProduction>[1];

function runCompletion(
  input: WorkflowInput,
  dependencies: Omit<WorkflowDependencies, 'preview'> & Partial<Pick<WorkflowDependencies, 'preview'>>,
) {
  const displayedPreview = input.shop && !input.existingIntake && !input.displayedPreview
    ? previewForContext(currentContext, input.shop)
    : input.displayedPreview;
  return runOrderCompletionProduction({
    ...input,
    ...(displayedPreview ? { displayedPreview } : {}),
  }, {
    preview: async (previewInput: any) => ({
      code: 0,
      data: {
        shop: input.shop || selectedShop,
        productResolution: { status: 'UNMATCHED', rawProductName: previewInput.platformProductName },
        facts: {
          platformProductId: previewInput.platformProductId,
          platformSkuId: previewInput.platformSkuId,
          platformProductName: previewInput.platformProductName,
          paymentAmount: previewInput.paymentAmount,
          paymentAt: new Date(previewInput.paymentAt).toISOString(),
        },
        priceDifference: null,
      },
      message: 'success',
    }),
    ...dependencies,
  });
}

const backendRemarkLines: [string, string] = [
  '#悠然一刻/手机号：13826459812/微信号：wx_original_88（对接：销售小陈）',
  '#入OS（客服小李：2026-08-08 21:00）',
];
const backendRemarkText = backendRemarkLines.join('\n');

const intakeResult = {
  syncId: 'sync-1',
  outcome: 'CREATED' as const,
  lead: { id: 'lead-1', name: '悠然一刻', assignedTo: '销售小陈' },
  storedContact: { nickname: '悠然一刻', phone: '13826459812', wechat: 'wx_original_88' },
  completedAt: '2026-08-08T13:00:00.000Z',
  remarkLines: backendRemarkLines,
  productResolution: { status: 'UNMATCHED' as const, rawProductName: '体验套餐' },
  shop: { id: 'shop-1', shopKey: 'jixiang', displayName: '极享官方店' },
  orderRemarkStatus: 'NOT_ATTEMPTED' as const,
  greenFlagStatus: 'NOT_ATTEMPTED' as const,
};

const completionResult = {
  syncId: 'sync-1',
  orderRemarkStatus: 'SUCCEEDED' as const,
  greenFlagStatus: 'SUCCEEDED' as const,
};

let firstPageInput: unknown;
let firstIntakeInput: unknown;
const result = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  shop: selectedShop,
  pageShopDisplayName: '极享官方旗舰店',
  intakeInput: { platform: 'DOUYIN' },
}, {
  readContext: async () => currentContext,
  intake: async (input) => {
    firstIntakeInput = input;
    return { code: 0, data: intakeResult, message: 'success' };
  },
  completePage: async (pageInput) => {
    firstPageInput = pageInput;
    return {
      ok: true,
      remarkText: pageInput.remarkLines.join('\n'),
      remarkStatus: 'SUCCEEDED',
      greenFlagStatus: 'SUCCEEDED',
    };
  },
  report: async () => ({ code: 0, data: completionResult, message: 'success' }),
});

assert.equal(result.stage, 'COMPLETED');
assert.equal(result.osStatus, 'SUCCEEDED');
assert.equal(result.orderRemarkStatus, 'SUCCEEDED');
assert.equal(result.greenFlagStatus, 'SUCCEEDED');
assert.equal(result.remarkText, backendRemarkText);
assert.deepEqual(firstIntakeInput, {
  platform: 'DOUYIN',
  shopBindingId: selectedShop.id,
  platformOrderNo: currentContext.platformOrderNo,
  contactName: currentContext.customerDisplayName,
  platformProductId: currentContext.platformProductId,
  platformSkuId: currentContext.platformSkuId,
  platformProductName: currentContext.productName,
  paymentAmount: currentContext.paymentAmount,
  paymentAt: currentContext.paymentAt,
}, '入库必须使用预检重读的完整订单快照，不得沿用缓存事实');
assert.deepEqual(firstPageInput, {
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  remarkLines: backendRemarkLines,
}, '工作流必须把后端备注行原样传给页面，不得自行重建销售或时间');

const initiallyDisplayedPreview = {
  shop: selectedShop,
  productResolution: { status: 'UNMATCHED' as const, rawProductName: currentContext.productName },
  facts: {
    platformProductId: currentContext.platformProductId,
    platformSkuId: currentContext.platformSkuId,
    platformProductName: currentContext.productName,
    paymentAmount: currentContext.paymentAmount,
    paymentAt: '2026-08-08T11:34:20.000Z',
  },
  priceDifference: null,
};
const changedFactsContext = {
  ...currentContext,
  platformProductId: 'PRODUCT-LATEST',
  platformSkuId: 'SKU-LATEST',
  productName: '最新商品',
  paymentAmount: 188.25,
  paymentAt: '2026-08-09T10:30:00+08:00',
};
const changedFactsPreview = {
  ...initiallyDisplayedPreview,
  productResolution: { status: 'UNMATCHED' as const, rawProductName: changedFactsContext.productName },
  facts: {
    platformProductId: changedFactsContext.platformProductId,
    platformSkuId: changedFactsContext.platformSkuId,
    platformProductName: changedFactsContext.productName,
    paymentAmount: changedFactsContext.paymentAmount,
    paymentAt: '2026-08-09T02:30:00.000Z',
  },
};
let changedFactsPreviewCalls = 0;
let changedFactsIntakeCalls = 0;
let changedFactsPageCalls = 0;
let changedFactsReportCalls = 0;
let changedFactsPreviewInput: unknown;
const changedFactsFirstClick = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  shop: selectedShop,
  displayedPreview: initiallyDisplayedPreview,
  intakeInput: {
    platform: 'DOUYIN',
    shopBindingId: selectedShop.id,
    pageShopDisplayName: currentContext.shopDisplayName,
    platformOrderNo: currentContext.platformOrderNo,
    contactName: currentContext.customerDisplayName,
    contactPhone: '13826459812',
    contactSource: 'CHAT',
    platformProductId: currentContext.platformProductId,
    platformSkuId: currentContext.platformSkuId,
    platformProductName: currentContext.productName,
    paymentAmount: currentContext.paymentAmount,
    paymentAt: currentContext.paymentAt,
  },
} as any, {
  readContext: async () => changedFactsContext,
  preview: async (previewInput: unknown) => {
    changedFactsPreviewCalls += 1;
    changedFactsPreviewInput = previewInput;
    return { code: 0, data: changedFactsPreview, message: 'success' };
  },
  intake: async () => {
    changedFactsIntakeCalls += 1;
    return { code: 0, data: intakeResult, message: 'success' };
  },
  completePage: async () => {
    changedFactsPageCalls += 1;
    return { ok: true, remarkText: '', remarkStatus: 'SUCCEEDED', greenFlagStatus: 'SUCCEEDED' };
  },
  report: async () => {
    changedFactsReportCalls += 1;
    return { code: 0, data: completionResult, message: 'success' };
  },
} as any);
assert.equal(changedFactsFirstClick.stage, 'OS_FAILED');
assert.equal(changedFactsFirstClick.errorCode, 'ORDER_FACTS_CHANGED');
assert.equal(changedFactsFirstClick.message, '订单信息已变化，请确认后重试');
assert.deepEqual(changedFactsPreviewInput, {
  platform: 'DOUYIN',
  shopBindingId: selectedShop.id,
  platformProductId: changedFactsContext.platformProductId,
  platformSkuId: changedFactsContext.platformSkuId,
  platformProductName: changedFactsContext.productName,
  paymentAmount: changedFactsContext.paymentAmount,
  paymentAt: changedFactsContext.paymentAt,
});
assert.deepEqual(
  [changedFactsPreviewCalls, changedFactsIntakeCalls, changedFactsPageCalls, changedFactsReportCalls],
  [1, 0, 0, 0],
  '同订单事实变化的首次点击只允许更新权威预览，不得入库或操作页面',
);

let confirmedLatestIntake: unknown;
const changedFactsSecondClick = await runCompletion({
  expectedOrderNo: changedFactsContext.platformOrderNo,
  expectedCustomerDisplayName: changedFactsContext.customerDisplayName,
  phone: '13826459812',
  shop: selectedShop,
  displayedPreview: changedFactsPreview,
  intakeInput: {
    platform: 'DOUYIN',
    shopBindingId: selectedShop.id,
    pageShopDisplayName: changedFactsContext.shopDisplayName,
    platformOrderNo: changedFactsContext.platformOrderNo,
    contactName: changedFactsContext.customerDisplayName,
    contactPhone: '13826459812',
    contactSource: 'CHAT',
    platformProductId: 'CACHED-MUST-NOT-BE-SUBMITTED',
    platformProductName: 'CACHED-MUST-NOT-BE-SUBMITTED',
    paymentAmount: 999,
    paymentAt: currentContext.paymentAt,
  },
} as any, {
  readContext: async () => changedFactsContext,
  preview: async () => ({ code: 0, data: changedFactsPreview, message: 'success' }),
  intake: async (intakeInput: unknown) => {
    confirmedLatestIntake = intakeInput;
    return { code: 0, data: intakeResult, message: 'success' };
  },
  completePage: async () => ({
    ok: true, remarkText: backendRemarkText, remarkStatus: 'SUCCEEDED', greenFlagStatus: 'SUCCEEDED',
  }),
  report: async () => ({ code: 0, data: completionResult, message: 'success' }),
} as any);
assert.equal(changedFactsSecondClick.stage, 'COMPLETED');
assert.deepEqual(confirmedLatestIntake, {
  platform: 'DOUYIN',
  shopBindingId: selectedShop.id,
  platformOrderNo: changedFactsContext.platformOrderNo,
  contactName: changedFactsContext.customerDisplayName,
  contactPhone: '13826459812',
  contactSource: 'CHAT',
  platformProductId: changedFactsContext.platformProductId,
  platformSkuId: changedFactsContext.platformSkuId,
  platformProductName: changedFactsContext.productName,
  paymentAmount: changedFactsContext.paymentAmount,
  paymentAt: changedFactsContext.paymentAt,
}, '第二次确认必须完全使用同一份最新页面快照创建线索');

let mismatchReadCalls = 0;
let mismatchIntakeCalls = 0;
let mismatchPageCalls = 0;
let mismatchReportCalls = 0;
const pageShopMismatch = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  shop: selectedShop,
  pageShopDisplayName: '其他店铺',
  intakeInput: { platform: 'DOUYIN', shopBindingId: selectedShop.id },
}, {
  readContext: async () => { mismatchReadCalls += 1; return currentContext; },
  intake: async () => { mismatchIntakeCalls += 1; return { code: 0, data: intakeResult, message: 'success' }; },
  completePage: async () => {
    mismatchPageCalls += 1;
    return {
      ok: true,
      remarkText: backendRemarkText,
      remarkStatus: 'SUCCEEDED',
      greenFlagStatus: 'SUCCEEDED',
    };
  },
  report: async () => {
    mismatchReportCalls += 1;
    return { code: 0, data: completionResult, message: 'success' };
  },
});
assert.equal(pageShopMismatch.stage, 'COMPLETED');
assert.deepEqual(
  [mismatchReadCalls, mismatchIntakeCalls, mismatchPageCalls, mismatchReportCalls],
  [1, 1, 1, 1],
  '缓存店铺不一致不得跳过权威预检；最新页面已匹配时应继续',
);

let pageCallsAfterOsFailure = 0;
const osFailure = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
}, {
  readContext: async () => currentContext,
  intake: async () => ({ code: 503, data: null, message: '极享OS暂时不可用' }),
  completePage: async () => {
    pageCallsAfterOsFailure += 1;
    throw new Error('入库失败后不应调用页面闭环');
  },
  report: async () => ({ code: 0, data: completionResult, message: 'success' }),
});
assert.equal(osFailure.osStatus, 'FAILED');
assert.equal(pageCallsAfterOsFailure, 0);

for (const terminalErrorCode of [
  'LEAD_IN_RECYCLE_BIN',
  'ORDER_CONTACT_CONFLICT',
  'SHOP_CONTEXT_MISMATCH',
  'PRODUCT_CONFIG_CONFLICT',
  'PRODUCT_MAPPING_CONFIG_CONFLICT',
] as const) {
  let terminalPageCalls = 0;
  let terminalReportCalls = 0;
  const terminalStates: string[] = [];
  const terminalResult = await runCompletion({
    expectedOrderNo: currentContext.platformOrderNo,
    expectedCustomerDisplayName: currentContext.customerDisplayName,
    phone: '13826459812',
    intakeInput: { platform: 'DOUYIN' },
  }, {
    readContext: async () => currentContext,
    intake: async () => ({
      code: 409,
      data: null,
      errorCode: terminalErrorCode,
      message: `终止错误：${terminalErrorCode}`,
    }),
    completePage: async () => {
      terminalPageCalls += 1;
      throw new Error('OS终止失败后不得写备注或设置红旗');
    },
    report: async () => {
      terminalReportCalls += 1;
      throw new Error('OS终止失败后不得上报平台完成结果');
    },
    onState: (state) => { terminalStates.push(state.stage); },
  });
  assert.equal(terminalResult.stage, 'OS_FAILED');
  assert.equal(terminalResult.osStatus, 'FAILED');
  assert.equal(terminalResult.orderRemarkStatus, 'NOT_ATTEMPTED');
  assert.equal(terminalResult.greenFlagStatus, 'NOT_ATTEMPTED');
  assert.equal(terminalResult.errorCode, terminalErrorCode);
  assert.equal(terminalResult.message, `终止错误：${terminalErrorCode}`);
  assert.equal(terminalPageCalls, 0, `${terminalErrorCode} 不得写备注或设置红旗`);
  assert.equal(terminalReportCalls, 0, `${terminalErrorCode} 不得上报平台完成结果`);
  assert.equal(terminalStates.includes('OS_COMPLETED'), false);
  assert.equal(terminalStates.includes('PLATFORM_COMPLETING'), false);
}

const osException = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
}, {
  readContext: async () => currentContext,
  intake: async () => {
    throw new Error('入库网络中断');
  },
  completePage: async () => {
    throw new Error('入库异常后不应调用页面闭环');
  },
  report: async () => ({ code: 0, data: completionResult, message: 'success' }),
});
assert.equal(osException.osStatus, 'FAILED');
assert.equal(osException.message, '入库网络中断');

let reportedFailure: unknown;
const pageFailure = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
}, {
  readContext: async () => currentContext,
  intake: async () => ({ code: 0, data: intakeResult, message: 'success' }),
  completePage: async () => ({
    ok: false,
    code: 'ORDER_REMARK_NOT_FOUND',
    message: '未找到订单备注输入框',
    stage: 'REMARK',
  }),
  report: async (input) => {
    reportedFailure = input;
    return {
      code: 0,
      data: {
        syncId: input.syncId,
        orderRemarkStatus: input.orderRemarkStatus,
        greenFlagStatus: input.greenFlagStatus,
      },
      message: 'success',
    };
  },
});
assert.equal(pageFailure.stage, 'PLATFORM_FAILED');
assert.deepEqual(reportedFailure, {
  syncId: 'sync-1',
  orderRemarkStatus: 'FAILED',
  greenFlagStatus: 'NOT_ATTEMPTED',
  errorMessage: '未找到订单备注输入框',
});

let greenFlagFailureReport: unknown;
const greenFlagFailure = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
}, {
  readContext: async () => currentContext,
  intake: async () => ({ code: 0, data: intakeResult, message: 'success' }),
  completePage: async () => ({
    ok: false,
    code: 'GREEN_FLAG_NOT_FOUND',
    message: '未找到红色旗帜',
    stage: 'GREEN_FLAG',
    remarkText: backendRemarkText,
  }),
  report: async (input) => {
    greenFlagFailureReport = input;
    return {
      code: 0,
      data: {
        syncId: input.syncId,
        orderRemarkStatus: input.orderRemarkStatus,
        greenFlagStatus: input.greenFlagStatus,
      },
      message: 'success',
    };
  },
});
assert.deepEqual(greenFlagFailureReport, {
  syncId: 'sync-1',
  orderRemarkStatus: 'FAILED',
  greenFlagStatus: 'FAILED',
  errorMessage: '未找到红色旗帜',
});
assert.equal(greenFlagFailure.orderRemarkStatus, 'FAILED');
assert.equal(greenFlagFailure.greenFlagStatus, 'FAILED');

let partialPageFailureReport: unknown;
const partialPageFailure = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
}, {
  readContext: async () => currentContext,
  intake: async () => ({ code: 0, data: intakeResult, message: 'success' }),
  completePage: async () => ({
    ok: false,
    code: 'ORDER_COMPLETION_NOT_VERIFIED',
    message: '页面验证结果：订单备注已成功，红色旗帜未确认',
    stage: 'SAVE',
    remarkText: backendRemarkText,
    remarkStatus: 'SUCCEEDED',
    greenFlagStatus: 'FAILED',
  }),
  report: async (input) => {
    partialPageFailureReport = input;
    return {
      code: 0,
      data: {
        syncId: input.syncId,
        orderRemarkStatus: input.orderRemarkStatus,
        greenFlagStatus: input.greenFlagStatus,
      },
      message: 'success',
    };
  },
});
assert.deepEqual(partialPageFailureReport, {
  syncId: 'sync-1',
  orderRemarkStatus: 'SUCCEEDED',
  greenFlagStatus: 'FAILED',
  errorMessage: '页面验证结果：订单备注已成功，红色旗帜未确认',
});
assert.equal(partialPageFailure.orderRemarkStatus, 'SUCCEEDED', '备注已验证时必须如实展示成功');
assert.equal(partialPageFailure.greenFlagStatus, 'FAILED');

let pageContextFailureReport: unknown;
const pageContextFailure = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
}, {
  readContext: async () => currentContext,
  intake: async () => ({ code: 0, data: intakeResult, message: 'success' }),
  completePage: async () => ({
    ok: false,
    code: 'CONTEXT_CHANGED',
    message: '保存前会话已切换',
    stage: 'CONTEXT',
  }),
  report: async (input) => {
    pageContextFailureReport = input;
    return {
      code: 0,
      data: {
        syncId: input.syncId,
        orderRemarkStatus: input.orderRemarkStatus,
        greenFlagStatus: input.greenFlagStatus,
      },
      message: 'success',
    };
  },
});
assert.equal(pageContextFailure.stage, 'PLATFORM_FAILED');
assert.deepEqual(pageContextFailureReport, {
  syncId: 'sync-1',
  orderRemarkStatus: 'FAILED',
  greenFlagStatus: 'NOT_ATTEMPTED',
  errorMessage: '保存前会话已切换',
});

let alreadyCreatedPageCalls = 0;
const alreadyCreated = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
}, {
  readContext: async () => currentContext,
  intake: async () => ({
    code: 0,
    data: { ...intakeResult, outcome: 'ALREADY_CREATED' },
    message: 'success',
  }),
  completePage: async () => {
    alreadyCreatedPageCalls += 1;
    return {
      ok: true,
      remarkText: backendRemarkText,
      remarkStatus: 'SUCCEEDED',
      greenFlagStatus: 'SUCCEEDED',
    };
  },
  report: async () => ({ code: 0, data: completionResult, message: 'success' }),
});
assert.equal(alreadyCreated.stage, 'COMPLETED');
assert.equal(alreadyCreatedPageCalls, 1, '已入库订单仍需继续补齐备注和红旗');

for (const mismatch of [
  {
    label: '手机号',
    input: { phone: '13900139000' },
    storedContact: { nickname: '悠然一刻', phone: '13826459812', wechat: 'wx_original_88' },
  },
  {
    label: '微信号',
    input: { wechat: 'wx_other_99' },
    storedContact: { nickname: '悠然一刻', phone: undefined, wechat: 'wx_original_88' },
  },
  {
    label: '昵称',
    input: { phone: '13826459812' },
    storedContact: { nickname: '另一个昵称', phone: '13826459812', wechat: undefined },
  },
] as const) {
  let mismatchPageCalls = 0;
  const mismatchResult = await runCompletion({
    expectedOrderNo: currentContext.platformOrderNo,
    expectedCustomerDisplayName: currentContext.customerDisplayName,
    ...mismatch.input,
    intakeInput: { platform: 'DOUYIN' },
  }, {
    readContext: async () => currentContext,
    intake: async () => ({
      code: 0,
      data: { ...intakeResult, outcome: 'ALREADY_CREATED', storedContact: mismatch.storedContact },
      message: 'success',
    }),
    completePage: async () => {
      mismatchPageCalls += 1;
      throw new Error('对账不一致时不得操作飞鸽页面');
    },
    report: async (reportInput) => ({
      code: 0,
      data: {
        syncId: reportInput.syncId,
        orderRemarkStatus: reportInput.orderRemarkStatus,
        greenFlagStatus: reportInput.greenFlagStatus,
      },
      message: 'success',
    }),
  });
  assert.equal(mismatchResult.stage, 'PLATFORM_FAILED');
  assert.equal(mismatchPageCalls, 0, `${mismatch.label}不一致时不得操作飞鸽页面`);
  assert.match(mismatchResult.message || '', /极享OS已有资料与本次提交不一致/);
}

for (const matchingContact of [
  { phone: '13826459812' },
  { wechat: 'wx_original_88' },
] as const) {
  let matchingPageCalls = 0;
  const matchingResult = await runCompletion({
    expectedOrderNo: currentContext.platformOrderNo,
    expectedCustomerDisplayName: currentContext.customerDisplayName,
    ...matchingContact,
    intakeInput: { platform: 'DOUYIN' },
  }, {
    readContext: async () => currentContext,
    intake: async () => ({
      code: 0,
      data: {
        ...intakeResult,
        outcome: 'ALREADY_CREATED',
        storedContact: matchingContact.phone
          ? { nickname: '悠然一刻', phone: '13826459812' }
          : { nickname: '悠然一刻', wechat: 'wx_original_88' },
      },
      message: 'success',
    }),
    completePage: async (pageInput) => {
      matchingPageCalls += 1;
      return {
        ok: true,
        remarkText: pageInput.remarkLines.join('\n'),
        remarkStatus: 'SUCCEEDED',
        greenFlagStatus: 'SUCCEEDED',
      };
    },
    report: async () => ({ code: 0, data: completionResult, message: 'success' }),
  });
  assert.equal(matchingResult.stage, 'COMPLETED');
  assert.equal(matchingPageCalls, 1, '已有线索的昵称与备注联系方式一致时才可继续');
}

for (const normalizedContact of [
  {
    label: '手机号按极享OS存储格式归一化',
    input: { phone: '13826459812' },
    storedContact: { nickname: '悠然一刻', phone: '+8613826459812' },
  },
  {
    label: '微信号忽略大小写',
    input: { wechat: 'Wx_User88' },
    storedContact: { nickname: '悠然一刻', wechat: 'wx_user88' },
  },
] as const) {
  let normalizedPageCalls = 0;
  const normalizedResult = await runCompletion({
    expectedOrderNo: currentContext.platformOrderNo,
    expectedCustomerDisplayName: currentContext.customerDisplayName,
    ...normalizedContact.input,
    intakeInput: { platform: 'DOUYIN' },
  }, {
    readContext: async () => currentContext,
    intake: async () => ({
      code: 0,
      data: { ...intakeResult, outcome: 'ALREADY_CREATED', storedContact: normalizedContact.storedContact },
      message: 'success',
    }),
    completePage: async (pageInput) => {
      normalizedPageCalls += 1;
      return {
        ok: true,
        remarkText: pageInput.remarkLines.join('\n'),
        remarkStatus: 'SUCCEEDED',
        greenFlagStatus: 'SUCCEEDED',
      };
    },
    report: async () => ({ code: 0, data: completionResult, message: 'success' }),
  });
  assert.equal(normalizedResult.stage, 'COMPLETED', `${normalizedContact.label}后应继续完成订单`);
  assert.equal(normalizedPageCalls, 1, `${normalizedContact.label}后应操作飞鸽页面`);
}

for (const changedContext of [
  { ...currentContext, platformOrderNo: 'ORDER-CHANGED' },
  { ...currentContext, customerDisplayName: '已切换客户' },
]) {
  let changedIntakeCalls = 0;
  const changed = await runCompletion({
    expectedOrderNo: currentContext.platformOrderNo,
    expectedCustomerDisplayName: currentContext.customerDisplayName,
    phone: '13826459812',
    intakeInput: { platform: 'DOUYIN' },
  }, {
    readContext: async () => changedContext,
    intake: async () => {
      changedIntakeCalls += 1;
      return { code: 0, data: intakeResult, message: 'success' };
    },
    completePage: async () => ({
      ok: true,
      remarkText: '',
      remarkStatus: 'SUCCEEDED',
      greenFlagStatus: 'SUCCEEDED',
    }),
    report: async () => ({ code: 0, data: completionResult, message: 'success' }),
  });
  assert.equal(changed.stage, 'READY');
  assert.equal(changedIntakeCalls, 0, '订单号或昵称变更时必须在入库前停止');
}

let changedRetryReports = 0;
const changedRetry = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
  existingIntake: intakeResult,
}, {
  readContext: async () => ({ ...currentContext, customerDisplayName: '已切换客户' }),
  intake: async () => {
    throw new Error('重试不得重新入库');
  },
  completePage: async () => {
    throw new Error('会话变更后不得调用页面闭环');
  },
  report: async (input) => {
    changedRetryReports += 1;
    return {
      code: 0,
      data: {
        syncId: input.syncId,
        orderRemarkStatus: input.orderRemarkStatus,
        greenFlagStatus: input.greenFlagStatus,
      },
      message: 'success',
    };
  },
});
assert.equal(changedRetry.stage, 'PLATFORM_FAILED');
assert.equal(changedRetry.osStatus, 'SUCCEEDED', '权威重读失败不得回退已完成的 OS 入库状态');
assert.equal(changedRetryReports, 0, '权威重读失败未验证当前页面，已有 syncId 也不得上报平台完成结果');

{
  let closedOrderIntakeCalls = 0;
  let closedOrderPageCalls = 0;
  const closedContext = {
    ...currentContext,
    readyForIntake: true,
    orderStatus: '已关闭（售后完成）',
    shopDisplayName: undefined,
    platformProductId: undefined,
    platformSkuId: undefined,
    productName: '',
    paymentAmount: undefined,
    paymentAt: undefined,
    diagnostics: ['未识别页面店铺', '未识别实付金额'],
  };
  const optionalFactsPreview = {
    shop: selectedShop,
    productResolution: { status: 'UNMATCHED' as const, rawProductName: '' },
    facts: { platformProductName: '' },
    priceDifference: null,
  };
  const closedOrderResult = await runCompletion({
    expectedOrderNo: currentContext.platformOrderNo,
    expectedCustomerDisplayName: currentContext.customerDisplayName,
    phone: '13826459812',
    shop: selectedShop,
    displayedPreview: optionalFactsPreview as any,
    intakeInput: { platform: 'DOUYIN' },
  }, {
    readContext: async () => closedContext as any,
    preview: async () => ({ code: 0, data: optionalFactsPreview as any, message: 'success' }),
    intake: async () => {
      closedOrderIntakeCalls += 1;
      return { code: 0, data: intakeResult, message: 'success' };
    },
    completePage: async () => {
      closedOrderPageCalls += 1;
      return {
        ok: true,
        remarkText: '',
        remarkStatus: 'SUCCEEDED',
        greenFlagStatus: 'SUCCEEDED',
      };
    },
    report: async () => ({ code: 0, data: completionResult, message: 'success' }),
  });
  assert.equal(closedOrderResult.stage, 'COMPLETED', '已关闭订单也应完成OS入库和页面备注');
  assert.equal(closedOrderIntakeCalls, 1, '已关闭订单应调用OS入库');
  assert.equal(closedOrderPageCalls, 1, '已关闭订单应写入备注和红旗');
}

{
  let unpaidIntakeCalls = 0;
  const unpaidResult = await runCompletion({
    expectedOrderNo: currentContext.platformOrderNo,
    expectedCustomerDisplayName: currentContext.customerDisplayName,
    phone: '13826459812',
    intakeInput: { platform: 'DOUYIN' },
  }, {
    readContext: async () => ({ ...currentContext, orderStatus: '待付款' }),
    intake: async () => {
      unpaidIntakeCalls += 1;
      return { code: 0, data: intakeResult, message: 'success' };
    },
    completePage: async () => { throw new Error('待付款订单不得操作页面'); },
    report: async () => { throw new Error('待付款订单不得上报完成'); },
  });
  assert.equal(unpaidResult.stage, 'READY');
  assert.match(unpaidResult.message || '', /订单状态不支持/);
  assert.equal(unpaidIntakeCalls, 0, '待付款订单不得入OS');
}

let retryIntakeCalls = 0;
const retry = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
  existingIntake: { ...intakeResult, orderRemarkStatus: 'FAILED' },
}, {
  readContext: async () => currentContext,
  intake: async () => {
    retryIntakeCalls += 1;
    return { code: 0, data: intakeResult, message: 'success' };
  },
  completePage: async () => ({
    ok: true,
    remarkText: backendRemarkText,
    remarkStatus: 'SUCCEEDED',
    greenFlagStatus: 'SUCCEEDED',
  }),
  report: async () => ({ code: 0, data: completionResult, message: 'success' }),
});
assert.equal(retry.stage, 'COMPLETED');
assert.equal(retryIntakeCalls, 0, '已有 syncId 的重试不得重新入库');

let reportOnlyPageCalls = 0;
let reportOnlyReportCalls = 0;
let reportOnlyReadCalls = 0;
const reportOnlyRetry = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
  existingIntake: {
    ...intakeResult,
    orderRemarkStatus: 'SUCCEEDED',
    greenFlagStatus: 'SUCCEEDED',
  },
}, {
  readContext: async () => {
    reportOnlyReadCalls += 1;
    throw new Error('已创建资料一致的仅上报重试不得读取飞鸽页面');
  },
  intake: async () => {
    throw new Error('只重试上报时不得重新入库');
  },
  completePage: async () => {
    reportOnlyPageCalls += 1;
    throw new Error('页面已完成时不得再次点击备注或红旗');
  },
  report: async () => {
    reportOnlyReportCalls += 1;
    return { code: 0, data: completionResult, message: 'success' };
  },
});
assert.equal(reportOnlyRetry.stage, 'COMPLETED');
assert.equal(reportOnlyReadCalls, 0, '已创建资料一致的仅上报重试不得读取飞鸽页面');
assert.equal(reportOnlyPageCalls, 0, '页面成功、仅上报失败的重试不得重复页面操作');
assert.equal(reportOnlyReportCalls, 1, '只重试一次平台结果上报');

let reportOnlyWithoutPageContextReadCalls = 0;
let reportOnlyWithoutPageContextReportCalls = 0;
const reportOnlyWithoutPageContext = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
  existingIntake: {
    ...intakeResult,
    outcome: 'ALREADY_CREATED',
    orderRemarkStatus: 'SUCCEEDED',
    greenFlagStatus: 'SUCCEEDED',
  },
}, {
  readContext: async () => {
    reportOnlyWithoutPageContextReadCalls += 1;
    throw new Error('只重试上报时不得读取飞鸽页面');
  },
  intake: async () => {
    throw new Error('只重试上报时不得重新入库');
  },
  completePage: async () => {
    throw new Error('只重试上报时不得操作飞鸽页面');
  },
  report: async () => {
    reportOnlyWithoutPageContextReportCalls += 1;
    return { code: 0, data: completionResult, message: 'success' };
  },
});
assert.equal(reportOnlyWithoutPageContextReadCalls, 0, '仅上报重试不得读取飞鸽页面');
assert.equal(reportOnlyWithoutPageContextReportCalls, 1, '仅上报重试只上报一次');
assert.equal(reportOnlyWithoutPageContext.stage, 'COMPLETED');

let reportOnlyMismatchReadCalls = 0;
let reportOnlyMismatchReportCalls = 0;
const reportOnlyMismatch = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13900139000',
  intakeInput: { platform: 'DOUYIN' },
  existingIntake: {
    ...intakeResult,
    outcome: 'ALREADY_CREATED',
    orderRemarkStatus: 'SUCCEEDED',
    greenFlagStatus: 'SUCCEEDED',
  },
}, {
  readContext: async () => {
    reportOnlyMismatchReadCalls += 1;
    throw new Error('资料不一致时不得读取飞鸽页面');
  },
  intake: async () => {
    throw new Error('资料不一致时不得重新入库');
  },
  completePage: async () => {
    throw new Error('资料不一致时不得操作飞鸽页面');
  },
  report: async () => {
    reportOnlyMismatchReportCalls += 1;
    throw new Error('资料不一致时不得上报成功');
  },
});
assert.equal(reportOnlyMismatchReadCalls, 0, '资料不一致时不得读取飞鸽页面');
assert.equal(reportOnlyMismatchReportCalls, 0, '资料不一致时不得上报成功');
assert.equal(reportOnlyMismatch.stage, 'PLATFORM_FAILED');
assert.equal(reportOnlyMismatch.orderRemarkStatus, 'SUCCEEDED', '资料不一致不得回退已成功的备注状态');
assert.equal(reportOnlyMismatch.greenFlagStatus, 'SUCCEEDED', '资料不一致不得回退已成功的红旗状态');
assert.match(reportOnlyMismatch.message || '', /极享OS已有资料与本次提交不一致/);

let createdReportOnlyMismatchReadCalls = 0;
let createdReportOnlyMismatchIntakeCalls = 0;
let createdReportOnlyMismatchPageCalls = 0;
let createdReportOnlyMismatchReportCalls = 0;
const createdReportOnlyMismatch = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13900139000',
  intakeInput: { platform: 'DOUYIN' },
  existingIntake: {
    ...intakeResult,
    orderRemarkStatus: 'SUCCEEDED',
    greenFlagStatus: 'SUCCEEDED',
  },
}, {
  readContext: async () => {
    createdReportOnlyMismatchReadCalls += 1;
    throw new Error('已创建资料不一致时不得读取飞鸽页面');
  },
  intake: async () => {
    createdReportOnlyMismatchIntakeCalls += 1;
    throw new Error('已创建资料不一致时不得重新入库');
  },
  completePage: async () => {
    createdReportOnlyMismatchPageCalls += 1;
    throw new Error('已创建资料不一致时不得操作飞鸽页面');
  },
  report: async () => {
    createdReportOnlyMismatchReportCalls += 1;
    return { code: 0, data: completionResult, message: 'success' };
  },
});
assert.equal(createdReportOnlyMismatchReadCalls, 0, '已创建资料不一致时不得读取飞鸽页面');
assert.equal(createdReportOnlyMismatchIntakeCalls, 0, '已创建资料不一致时不得重新入库');
assert.equal(createdReportOnlyMismatchPageCalls, 0, '已创建资料不一致时不得操作飞鸽页面');
assert.equal(createdReportOnlyMismatchReportCalls, 0, '已创建资料不一致时不得上报成功');
assert.equal(createdReportOnlyMismatch.stage, 'PLATFORM_FAILED');
assert.equal(createdReportOnlyMismatch.orderRemarkStatus, 'SUCCEEDED', '已创建资料不一致不得回退已成功的备注状态');
assert.equal(createdReportOnlyMismatch.greenFlagStatus, 'SUCCEEDED', '已创建资料不一致不得回退已成功的红旗状态');
assert.match(createdReportOnlyMismatch.message || '', /极享OS已有资料与本次提交不一致/);

let exceptionReportCalls = 0;
const pageException = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
  existingIntake: intakeResult,
}, {
  readContext: async () => currentContext,
  intake: async () => {
    throw new Error('重试不得重新入库');
  },
  completePage: async () => {
    throw new Error('页面通信中断');
  },
  report: async (input) => {
    exceptionReportCalls += 1;
    return {
      code: 0,
      data: {
        syncId: input.syncId,
        orderRemarkStatus: input.orderRemarkStatus,
        greenFlagStatus: input.greenFlagStatus,
      },
      message: 'success',
    };
  },
});
assert.equal(pageException.stage, 'PLATFORM_FAILED');
assert.equal(pageException.message, '页面通信中断');
assert.equal(exceptionReportCalls, 1, '页面异常也必须上报最终平台结果');

const reportException = await runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
}, {
  readContext: async () => currentContext,
  intake: async () => ({ code: 0, data: intakeResult, message: 'success' }),
  completePage: async () => ({
    ok: true,
    remarkText: backendRemarkText,
    remarkStatus: 'SUCCEEDED',
    greenFlagStatus: 'SUCCEEDED',
  }),
  report: async () => {
    throw new Error('上报网络中断');
  },
});
assert.equal(reportException.stage, 'PLATFORM_FAILED');
assert.equal(reportException.intakeResult?.syncId, 'sync-1', '上报失败也必须保留 syncId 以便重试');
assert.equal(reportException.message, '上报网络中断');

let readAttemptActive = true;
let releaseCancelledRead!: () => void;
const cancelledReadGate = new Promise<void>((resolve) => { releaseCancelledRead = resolve; });
let cancelledReadIntakeCalls = 0;
let cancelledReadPageCalls = 0;
let cancelledReadReportCalls = 0;
const cancelledDuringReadPromise = runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
}, {
  isAttemptActive: () => readAttemptActive,
  readContext: async () => { await cancelledReadGate; return currentContext; },
  intake: async () => { cancelledReadIntakeCalls += 1; return { code: 0, data: intakeResult, message: 'success' }; },
  completePage: async () => {
    cancelledReadPageCalls += 1;
    throw new Error('读取上下文期间取消后不得操作页面');
  },
  report: async () => {
    cancelledReadReportCalls += 1;
    return { code: 0, data: completionResult, message: 'success' };
  },
});
readAttemptActive = false;
releaseCancelledRead();
const cancelledDuringRead = await cancelledDuringReadPromise;
assert.equal(cancelledDuringRead.stage, 'ABORTED');
assert.deepEqual(
  [cancelledReadIntakeCalls, cancelledReadPageCalls, cancelledReadReportCalls],
  [0, 0, 0],
  '读取上下文等待期间取消后不得进入任何后续阶段',
);

let intakeAttemptActive = true;
let releaseCancelledIntake!: () => void;
const cancelledIntakeGate = new Promise<void>((resolve) => { releaseCancelledIntake = resolve; });
let cancelledIntakePageCalls = 0;
let cancelledIntakeReportCalls = 0;
const cancelledDuringIntakePromise = runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
}, {
  isAttemptActive: () => intakeAttemptActive,
  readContext: async () => currentContext,
  intake: async () => { await cancelledIntakeGate; return { code: 0, data: intakeResult, message: 'success' }; },
  completePage: async () => {
    cancelledIntakePageCalls += 1;
    throw new Error('入库等待期间取消后不得操作页面');
  },
  report: async () => {
    cancelledIntakeReportCalls += 1;
    return { code: 0, data: completionResult, message: 'success' };
  },
});
await new Promise((resolve) => setImmediate(resolve));
intakeAttemptActive = false;
releaseCancelledIntake();
const cancelledDuringIntake = await cancelledDuringIntakePromise;
assert.equal(cancelledDuringIntake.stage, 'ABORTED');
assert.deepEqual([cancelledIntakePageCalls, cancelledIntakeReportCalls], [0, 0]);

let pageAttemptActive = true;
let releaseCancelledPage!: () => void;
const cancelledPageGate = new Promise<void>((resolve) => { releaseCancelledPage = resolve; });
let cancelledPageReportCalls = 0;
const cancelledDuringPagePromise = runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
}, {
  isAttemptActive: () => pageAttemptActive,
  readContext: async () => currentContext,
  intake: async () => ({ code: 0, data: intakeResult, message: 'success' }),
  completePage: async () => {
    await cancelledPageGate;
    return {
      ok: true,
      remarkText: backendRemarkText,
      remarkStatus: 'SUCCEEDED',
      greenFlagStatus: 'SUCCEEDED',
    };
  },
  report: async () => {
    cancelledPageReportCalls += 1;
    return { code: 0, data: completionResult, message: 'success' };
  },
});
await new Promise((resolve) => setImmediate(resolve));
pageAttemptActive = false;
releaseCancelledPage();
const cancelledDuringPage = await cancelledDuringPagePromise;
assert.equal(cancelledDuringPage.stage, 'ABORTED');
assert.equal(cancelledPageReportCalls, 0, '页面操作已开始后取消无法撤回页面动作，但不得再上报成功');

let reportAttemptActive = true;
let releaseCancelledReport!: () => void;
const cancelledReportGate = new Promise<void>((resolve) => { releaseCancelledReport = resolve; });
const cancelledReportStates: string[] = [];
const cancelledDuringReportPromise = runCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
}, {
  isAttemptActive: () => reportAttemptActive,
  readContext: async () => currentContext,
  intake: async () => ({ code: 0, data: intakeResult, message: 'success' }),
  completePage: async () => ({
    ok: true,
    remarkText: backendRemarkText,
    remarkStatus: 'SUCCEEDED',
    greenFlagStatus: 'SUCCEEDED',
  }),
  report: async () => { await cancelledReportGate; return { code: 0, data: completionResult, message: 'success' }; },
  onState: (state) => { cancelledReportStates.push(state.stage); },
});
await new Promise((resolve) => setImmediate(resolve));
reportAttemptActive = false;
releaseCancelledReport();
const cancelledDuringReport = await cancelledDuringReportPromise;
assert.equal(cancelledDuringReport.stage, 'ABORTED');
assert.equal(cancelledReportStates.includes('COMPLETED'), false, '上报等待期间取消后不得再浮现成功状态');

console.log('order completion workflow: ok');
