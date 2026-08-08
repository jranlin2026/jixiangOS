import assert from 'node:assert/strict';
import { runOrderCompletion } from './orderCompletionWorkflow';

const currentContext = {
  supported: true,
  customerDisplayName: '悠然一刻',
  platformOrderNo: 'ORDER-20260808-1',
  orderStatus: '已付款',
  productName: '体验套餐',
  messages: [],
  diagnostics: [],
};

const intakeResult = {
  syncId: 'sync-1',
  outcome: 'CREATED' as const,
  lead: { id: 'lead-1', name: '悠然一刻', assignedTo: '销售小陈' },
  storedContact: { nickname: '悠然一刻', phone: '13826459812', wechat: 'wx_original_88' },
  orderRemarkStatus: 'NOT_ATTEMPTED' as const,
  greenFlagStatus: 'NOT_ATTEMPTED' as const,
};

const completionResult = {
  syncId: 'sync-1',
  orderRemarkStatus: 'SUCCEEDED' as const,
  greenFlagStatus: 'SUCCEEDED' as const,
};

const result = await runOrderCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
}, {
  readContext: async () => currentContext,
  intake: async () => ({ code: 0, data: intakeResult, message: 'success' }),
  completePage: async () => ({
    ok: true,
    remarkText: '#悠然一刻/13826459812\n#入OS',
    remarkStatus: 'SUCCEEDED',
    greenFlagStatus: 'SUCCEEDED',
  }),
  report: async () => ({ code: 0, data: completionResult, message: 'success' }),
});

assert.equal(result.stage, 'COMPLETED');
assert.equal(result.osStatus, 'SUCCEEDED');
assert.equal(result.orderRemarkStatus, 'SUCCEEDED');
assert.equal(result.greenFlagStatus, 'SUCCEEDED');
assert.equal(result.remarkText, '#悠然一刻/13826459812\n#入OS');

let pageCallsAfterOsFailure = 0;
const osFailure = await runOrderCompletion({
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

const osException = await runOrderCompletion({
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
const pageFailure = await runOrderCompletion({
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
const greenFlagFailure = await runOrderCompletion({
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
    message: '未找到绿色旗帜',
    stage: 'GREEN_FLAG',
    remarkText: '#悠然一刻/13826459812\n#入OS',
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
  errorMessage: '未找到绿色旗帜',
});
assert.equal(greenFlagFailure.orderRemarkStatus, 'FAILED');
assert.equal(greenFlagFailure.greenFlagStatus, 'FAILED');

let pageContextFailureReport: unknown;
const pageContextFailure = await runOrderCompletion({
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
const alreadyCreated = await runOrderCompletion({
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
      remarkText: '#悠然一刻/13826459812\n#入OS',
      remarkStatus: 'SUCCEEDED',
      greenFlagStatus: 'SUCCEEDED',
    };
  },
  report: async () => ({ code: 0, data: completionResult, message: 'success' }),
});
assert.equal(alreadyCreated.stage, 'COMPLETED');
assert.equal(alreadyCreatedPageCalls, 1, '已入库订单仍需继续补齐备注和绿旗');

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
  const mismatchResult = await runOrderCompletion({
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
  const matchingResult = await runOrderCompletion({
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
        remarkText: `#悠然一刻/${pageInput.phone || pageInput.wechat}\n#入OS`,
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
  const normalizedResult = await runOrderCompletion({
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
        remarkText: `#悠然一刻/${pageInput.phone || pageInput.wechat}\n#入OS`,
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
  const changed = await runOrderCompletion({
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
const changedRetry = await runOrderCompletion({
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
assert.equal(changedRetryReports, 1, '已有 syncId 时会话变更也必须上报最终结果');

for (const invalidPaidStatus of ['待付款', '退款中', '已关闭']) {
  let invalidStatusIntakeCalls = 0;
  let invalidStatusPageCalls = 0;
  const invalidStatusResult = await runOrderCompletion({
    expectedOrderNo: currentContext.platformOrderNo,
    expectedCustomerDisplayName: currentContext.customerDisplayName,
    phone: '13826459812',
    intakeInput: { platform: 'DOUYIN' },
  }, {
    readContext: async () => ({ ...currentContext, orderStatus: invalidPaidStatus }),
    intake: async () => {
      invalidStatusIntakeCalls += 1;
      return { code: 0, data: intakeResult, message: 'success' };
    },
    completePage: async () => {
      invalidStatusPageCalls += 1;
      return {
        ok: true,
        remarkText: '',
        remarkStatus: 'SUCCEEDED',
        greenFlagStatus: 'SUCCEEDED',
      };
    },
    report: async () => ({ code: 0, data: completionResult, message: 'success' }),
  });
  assert.equal(invalidStatusResult.message, '请先确认当前订单为已付款有效订单');
  assert.equal(invalidStatusIntakeCalls, 0, `${invalidPaidStatus} 不得入库`);
  assert.equal(invalidStatusPageCalls, 0, `${invalidPaidStatus} 不得修改页面`);
}

let retryIntakeCalls = 0;
const retry = await runOrderCompletion({
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
    remarkText: '#悠然一刻/13826459812\n#入OS',
    remarkStatus: 'SUCCEEDED',
    greenFlagStatus: 'SUCCEEDED',
  }),
  report: async () => ({ code: 0, data: completionResult, message: 'success' }),
});
assert.equal(retry.stage, 'COMPLETED');
assert.equal(retryIntakeCalls, 0, '已有 syncId 的重试不得重新入库');

let reportOnlyPageCalls = 0;
let reportOnlyReportCalls = 0;
const reportOnlyRetry = await runOrderCompletion({
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
  readContext: async () => currentContext,
  intake: async () => {
    throw new Error('只重试上报时不得重新入库');
  },
  completePage: async () => {
    reportOnlyPageCalls += 1;
    throw new Error('页面已完成时不得再次点击备注或绿旗');
  },
  report: async () => {
    reportOnlyReportCalls += 1;
    return { code: 0, data: completionResult, message: 'success' };
  },
});
assert.equal(reportOnlyRetry.stage, 'COMPLETED');
assert.equal(reportOnlyPageCalls, 0, '页面成功、仅上报失败的重试不得重复页面操作');
assert.equal(reportOnlyReportCalls, 1, '只重试一次平台结果上报');

let exceptionReportCalls = 0;
const pageException = await runOrderCompletion({
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

const reportException = await runOrderCompletion({
  expectedOrderNo: currentContext.platformOrderNo,
  expectedCustomerDisplayName: currentContext.customerDisplayName,
  phone: '13826459812',
  intakeInput: { platform: 'DOUYIN' },
}, {
  readContext: async () => currentContext,
  intake: async () => ({ code: 0, data: intakeResult, message: 'success' }),
  completePage: async () => ({
    ok: true,
    remarkText: '#悠然一刻/13826459812\n#入OS',
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

console.log('order completion workflow: ok');
