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
