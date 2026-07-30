import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { CommissionPayoutRecord } from '../../src/types/commission';
import type { Order } from '../../src/types/order';
import { createFinanceTransactionService } from './financeTransactionService';

const rows = new Map<string, any>();
const key = (domain: string, recordId: string) => `${domain}\0${recordId}`;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const businessRecord = {
  findUnique: async ({ where }: any) => clone(rows.get(key(where.domain_recordId.domain, where.domain_recordId.recordId)) || null),
  findMany: async ({ where }: any) => {
    (where.OR || []).forEach((clause: any) => assert.ok(
      clause.recordId.in.every((value: unknown) => typeof value === 'string' && value.length > 0),
      'Prisma in 查询不得包含 undefined、null 或空字符串',
    ));
    return [...rows.values()].filter((row) => {
    if (where.domain) return row.domain === where.domain;
    return (where.OR || []).some((clause: any) => row.domain === clause.domain && clause.recordId.in.includes(row.recordId));
    }).map(clone);
  },
  create: async ({ data }: any) => {
    const target = key(data.domain, data.recordId);
    if (rows.has(target)) throw new Error('duplicate');
    rows.set(target, clone({ ...data, createdAt: new Date(data.data.createdAt), data: data.data }));
    return clone(rows.get(target));
  },
};
const prisma: any = { businessRecord, $transaction: async (callback: any) => callback({ businessRecord }) };
const service = createFinanceTransactionService(prisma);
const actor = { id: 'finance-1', name: '财务A' } as AuthenticatedUser;
const order = {
  id: 'order-1', orderNo: 'ORD-1', customerId: 'customer-1', customerName: '客户A', productLevel: '代理', productName: '代理产品',
  paymentMethod: '对公转账', payments: [
    { id: 'payment-1', amount: 100, paidAt: '2026-07-01T01:00:00.000Z', paymentMethod: '对公转账', paymentOrderNo: 'BANK-1', attachments: [] },
    { id: 'payment-2', amount: 200, paidAt: '2026-07-02T01:00:00.000Z', paymentMethod: '企业支付宝', attachments: [] },
  ],
} as unknown as Order;

await prisma.$transaction((tx: any) => service.recordOrderPayments(tx, order, actor, '2026-07-03T00:00:00.000Z'));
await prisma.$transaction((tx: any) => service.recordOrderPayments(tx, order, actor, '2026-07-03T00:00:00.000Z'));
assert.equal(rows.size, 2, '同一订单付款重复写入不得生成重复流水');

const payout = {
  id: 'payout-1', payoutNo: 'FF-1', period: '2026-07', status: '已发放', totalCount: 2, totalAmount: 50,
  commissionIds: ['c1', 'c2'], byOwner: [{ owner: '员工A', department: '销售部', count: 2, amount: 50 }],
  createdAt: '2026-07-04T00:00:00.000Z', createdById: actor.id, createdByName: actor.name,
  issuedAt: '2026-07-04T00:00:00.000Z', issuedById: actor.id, issuedByName: actor.name, paymentMethod: '银行转账', paymentReference: 'BANK-PAYOUT',
} as CommissionPayoutRecord;
await prisma.$transaction((tx: any) => service.recordCommissionPayout(tx, payout));
await prisma.$transaction((tx: any) => service.recordCommissionPayout(tx, payout));
assert.equal(rows.size, 3, '同一发放单重复写入不得生成重复流水');

const firstPage = await service.list({ page: 1, pageSize: 1 });
assert.equal(firstPage.data?.items.length, 1);
assert.equal(firstPage.data?.pagination.total, 3);
assert.deepEqual(firstPage.data?.summary, { incomeAmount: 300, expenseAmount: 50, netAmount: 250, transactionCount: 3 }, '汇总必须基于完整筛选结果而不是当前页');

const boundaryTemplate = clone(rows.get(key(STORAGE_KEYS.FINANCE_TRANSACTIONS, 'order_payment:order-1:payment-1')));
const boundaryCases = [
  ['before-shanghai-july', '2026-06-30T15:59:59.999Z'],
  ['start-shanghai-july', '2026-06-30T16:00:00.000Z'],
  ['end-shanghai-july', '2026-07-31T15:59:59.999Z'],
  ['after-shanghai-july', '2026-07-31T16:00:00.000Z'],
] as const;
boundaryCases.forEach(([id, occurredAt]) => {
  rows.set(key(STORAGE_KEYS.FINANCE_TRANSACTIONS, id), {
    ...boundaryTemplate,
    recordId: id,
    data: {
      ...boundaryTemplate.data,
      id,
      transactionNo: `FT-${id}`,
      sourceEventId: `boundary:${id}`,
      occurredAt,
    },
  });
});
const julyFlows = await service.list({ startDate: '2026-07-01', endDate: '2026-07-31', pageSize: 100 });
const julyFlowIds = new Set(julyFlows.data?.items.map((item) => item.id));
assert.equal(julyFlowIds.has('before-shanghai-july'), false);
assert.equal(julyFlowIds.has('start-shanghai-july'), true,
  '上海时区 7 月 1 日零点的流水必须进入 7 月筛选');
assert.equal(julyFlowIds.has('end-shanghai-july'), true,
  '上海时区 7 月 31 日最后一刻的流水必须进入 7 月筛选');
assert.equal(julyFlowIds.has('after-shanghai-july'), false,
  '上海时区 8 月 1 日零点的流水不得误入 7 月筛选');
boundaryCases.forEach(([id]) => rows.delete(key(STORAGE_KEYS.FINANCE_TRANSACTIONS, id)));

rows.set(key(STORAGE_KEYS.ORDERS, order.id), { domain: STORAGE_KEYS.ORDERS, recordId: order.id, data: order });
const orderChain = await service.list({ orderIds: ['order-1'] });
assert.deepEqual(
  orderChain.data?.items.map((item) => item.sourceType).sort(),
  ['order_payment', 'order_payment'],
  '按异常订单下钻时必须仅返回指定订单的完整资金链',
);
assert.equal(orderChain.data?.filterCoverage?.evidenceIssueOrderCount, 0, '两笔付款都有正确流水时付款证据必须完整');

const payment1RecordKey = key(STORAGE_KEYS.FINANCE_TRANSACTIONS, 'order_payment:order-1:payment-1');
const canonicalPayment1Record = clone(rows.get(payment1RecordKey));
rows.set(payment1RecordKey, {
  ...canonicalPayment1Record,
  data: {
    ...canonicalPayment1Record.data,
    sourceId: undefined,
    orderId: 'wrong-order',
  },
});
const misattributedOriginalChain = await service.list({ orderIds: ['order-1'] }, { includeOrderDetails: true });
assert.ok(misattributedOriginalChain.data?.items.some((item) => item.id === canonicalPayment1Record.data.id),
  'metadata 错归属但付款事件正确的原实收必须出现在异常订单完整资金链中');
assert.equal(misattributedOriginalChain.data?.filterCoverage?.evidenceIssueOrders[0]?.differenceAmount, 0,
  '错归属流水不得作为孤儿流水再次累计差额');
assert.ok(misattributedOriginalChain.data?.filterCoverage?.evidenceIssueOrders[0]?.paymentEvidence[0]?.issues.includes('invalid_original'));
const misattributedOriginalCsv = await service.exportCsv({ orderIds: ['order-1'] });
assert.match(misattributedOriginalCsv.data || '', new RegExp(canonicalPayment1Record.data.transactionNo),
  '异常订单导出必须与页面使用同一完整资金链归因口径');
rows.set(payment1RecordKey, canonicalPayment1Record);

const payment2RecordKey = key(STORAGE_KEYS.FINANCE_TRANSACTIONS, 'order_payment:order-1:payment-2');
const payment2Record = rows.get(payment2RecordKey);
assert.ok(payment2Record, '测试前提：第二笔付款流水必须存在');
rows.delete(payment2RecordKey);
const restrictedPartialOrderChain = await service.list({ orderIds: ['order-1'] });
assert.equal(restrictedPartialOrderChain.data?.filterCoverage?.missingOrderCount, 0, '订单有部分流水时不能误报为整单无流水');
assert.equal(restrictedPartialOrderChain.data?.filterCoverage?.evidenceIssueOrderCount, 1);
assert.equal(restrictedPartialOrderChain.data?.filterCoverage?.evidenceIssuePaymentCount, 0, '未授权响应不得泄露付款笔数');
assert.equal(restrictedPartialOrderChain.data?.filterCoverage?.evidenceDetailsRestricted, true);
assert.deepEqual(restrictedPartialOrderChain.data?.filterCoverage?.evidenceIssueOrders, [], '非超级管理员不得拿到付款金额、时间和客户证据');
const partialOrderChain = await service.list({ orderIds: ['order-1'] }, { includeOrderDetails: true });
assert.equal(partialOrderChain.data?.filterCoverage?.matchedOrderIds[0], 'order-1');
assert.deepEqual(partialOrderChain.data?.filterCoverage?.evidenceIssueOrders, [{
  orderId: 'order-1',
  orderNo: 'ORD-1',
  customerName: '客户A',
  paymentCount: 2,
  expectedPaymentAmount: 300,
  ledgerNetAmount: 100,
  differenceAmount: 200,
  issueCount: 1,
  orderIssues: [],
  paymentEvidence: [
    {
      paymentId: 'payment-1',
      paymentReference: 'BANK-1',
      paidAt: '2026-07-01T01:00:00.000Z',
      expectedAmount: 100,
      ledgerAmount: 100,
      differenceAmount: 0,
      issues: [],
    },
    {
      paymentId: 'payment-2',
      paymentReference: undefined,
      paidAt: '2026-07-02T01:00:00.000Z',
      expectedAmount: 200,
      ledgerAmount: 0,
      differenceAmount: 200,
      issues: ['missing_original', 'amount_mismatch'],
    },
  ],
}], '同一订单第二笔付款缺流水时必须返回逐付款差额和定位证据');
rows.set(payment2RecordKey, payment2Record);

const malformedAdjustmentKey = key(STORAGE_KEYS.FINANCE_TRANSACTIONS, 'order_payment_adjustment:malformed-source');
const payment1Record = rows.get(key(STORAGE_KEYS.FINANCE_TRANSACTIONS, 'order_payment:order-1:payment-1'));
assert.ok(payment1Record, '测试前提：第一笔付款流水必须存在');
rows.set(malformedAdjustmentKey, {
  ...clone(payment1Record),
  recordId: 'order_payment_adjustment:malformed-source',
  data: {
    ...clone(payment1Record.data),
    id: 'order_payment_adjustment:malformed-source',
    transactionNo: 'FT-BAD-ADJUSTMENT',
    type: '订单实收冲正',
    direction: 'expense',
    sourceType: 'order_payment_adjustment',
    sourceId: 'wrong-order',
    orderId: 'wrong-order',
    sourceEventId: '',
    reversalOfId: 'order_payment:order-1:payment-1',
    amount: 10,
  },
});
const malformedAdjustmentCoverage = await service.list({ orderIds: ['order-1'] }, { includeOrderDetails: true });
assert.ok(malformedAdjustmentCoverage.data?.items.some((item) => item.id === 'order_payment_adjustment:malformed-source'),
  'metadata 与事件都损坏但 reversal 指向原实收的冲正仍须进入完整资金链');
assert.ok(
  malformedAdjustmentCoverage.data?.filterCoverage?.evidenceIssueOrders[0]?.paymentEvidence[0]?.issues.includes('invalid_adjustment'),
  '冲正流水即使 orderId 正确，sourceId 归属错误也必须作为付款证据异常返回',
);
const malformedAdjustmentDetail = await service.getById('order_payment_adjustment:malformed-source');
assert.equal(malformedAdjustmentDetail.code, 0, '完整资金链中的畸形流水必须仍可打开详情');
assert.equal(malformedAdjustmentDetail.data?.id, 'order_payment_adjustment:malformed-source');
assert.equal(malformedAdjustmentDetail.data?.sourceEventId, '');
rows.delete(malformedAdjustmentKey);

const duplicateTransportRecords = ['duplicate-record-a', 'duplicate-record-b'];
duplicateTransportRecords.forEach((recordId, index) => rows.set(key(STORAGE_KEYS.FINANCE_TRANSACTIONS, recordId), {
  ...clone(payment1Record),
  recordId,
  data: {
    ...clone(payment1Record.data),
    id: 'duplicate-data-id',
    transactionNo: `FT-DUPLICATE-${index + 1}`,
    sourceEventId: `order-1:orphan-duplicate-${index + 1}`,
  },
}));
const duplicateTransportChain = await service.list({ orderIds: ['order-1'], pageSize: 100 }, { includeOrderDetails: true });
assert.ok(duplicateTransportRecords.every((recordId) => (
  duplicateTransportChain.data?.items.some((item) => item.id === recordId)
)), '列表 transport ID 必须使用唯一 businessRecord.recordId，不能沿用损坏的重复 data.id');
assert.equal((await service.getById('duplicate-record-a')).data?.id, 'duplicate-record-a');
duplicateTransportRecords.forEach((recordId) => rows.delete(key(STORAGE_KEYS.FINANCE_TRANSACTIONS, recordId)));

const missingOrderWithFlowKey = key(STORAGE_KEYS.FINANCE_TRANSACTIONS, 'order_payment:missing-with-flow:p1');
rows.set(missingOrderWithFlowKey, {
  ...clone(payment1Record),
  recordId: 'order_payment:missing-with-flow:p1',
  data: {
    ...clone(payment1Record.data),
    id: 'order_payment:missing-with-flow:p1',
    transactionNo: 'FT-MISSING-WITH-FLOW',
    sourceId: 'missing-with-flow',
    orderId: 'missing-with-flow',
    sourceEventId: 'missing-with-flow:p1',
  },
});
const missingOrderWithFlow = await service.list({ orderIds: ['missing-with-flow'] }, { includeOrderDetails: true });
assert.equal(missingOrderWithFlow.data?.pagination.total, 1,
  '订单资料缺失时，明确归属请求订单的现存资金流水仍必须展示');
assert.equal(missingOrderWithFlow.data?.filterCoverage?.evidenceIssueOrders[0]?.ledgerNetAmount, 100);
assert.deepEqual(missingOrderWithFlow.data?.filterCoverage?.evidenceIssueOrders[0]?.orderIssues,
  ['订单资料不存在，无法核对付款证据']);
rows.delete(missingOrderWithFlowKey);

const restrictedMissingOrderChain = await service.list({ orderIds: ['missing-order'] });
assert.deepEqual(restrictedMissingOrderChain.data?.filterCoverage, {
  requestedOrderCount: 1,
  matchedOrderIds: [],
  missingOrderCount: 1,
  orderDetailsRestricted: true,
  missingOrders: [],
  evidenceIssueOrderCount: 1,
  evidenceIssuePaymentCount: 0,
  evidenceDetailsRestricted: true,
  evidenceIssueOrders: [],
}, '未经服务端授权时不得返回客户、付款等订单证据');
const missingOrderChain = await service.list({ orderIds: ['missing-order'] }, { includeOrderDetails: true });
assert.equal(missingOrderChain.data?.pagination.total, 0);
assert.deepEqual(missingOrderChain.data?.filterCoverage, {
  requestedOrderCount: 1,
  matchedOrderIds: [],
  missingOrderCount: 1,
  orderDetailsRestricted: false,
  missingOrders: [{
    orderId: 'missing-order', orderNo: 'missing-order', customerName: '-', paymentCount: 0, paymentAmount: 0,
  }],
  evidenceIssueOrderCount: 1,
  evidenceIssuePaymentCount: 0,
  evidenceDetailsRestricted: false,
  evidenceIssueOrders: [{
    orderId: 'missing-order', orderNo: 'missing-order', customerName: '-', paymentCount: 0,
    expectedPaymentAmount: 0, ledgerNetAmount: 0, differenceAmount: 0, issueCount: 1,
    orderIssues: ['订单资料不存在，无法核对付款证据'], paymentEvidence: [],
  }],
}, '完全缺少资金流水时仍必须返回可定位的异常订单证据');

rows.set(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, payout.id), { domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, recordId: payout.id, data: { ...payout, status: '已撤销' } });
const payoutFlow = (await service.list({ type: '提成发放' })).data?.items[0];
assert.ok(payoutFlow);
assert.equal(payoutFlow?.sourceStatus, '已撤销', '流水列表必须展示来源发放单的当前状态');
const detail = await service.getById(payoutFlow!.id);
assert.equal(detail.data?.sourceStatus, '已撤销');
assert.equal((await service.list({ type: '提成发放' })).data?.summary.expenseAmount, 50, '撤销发放不代表资金追回，原支出流水必须保留');

const dryRun = await service.backfill(false, actor);
assert.equal(dryRun.data?.plannedCount, 3);
assert.equal(dryRun.data?.existingCount, 3);
assert.equal(dryRun.data?.createdCount, 0);
assert.equal(dryRun.data?.missingCount, 0);
assert.equal(dryRun.data?.existingIncomeAmount, 300);
assert.equal(dryRun.data?.existingExpenseAmount, 50);
const applied = await service.backfill(true, actor);
assert.equal(applied.code, 0);
assert.equal(applied.data?.createdCount, 0, '重复回填必须幂等');

const originalPaymentRecordId = 'order_payment:order-1:payment-1';
const originalPaymentRow = rows.get(key(STORAGE_KEYS.FINANCE_TRANSACTIONS, originalPaymentRecordId));
assert.ok(originalPaymentRow, '测试前提：原订单实收流水必须存在');
rows.set(key(STORAGE_KEYS.ORDERS, order.id), {
  domain: STORAGE_KEYS.ORDERS,
  recordId: order.id,
  data: {
    ...order,
    payments: [
      { ...order.payments[0], amount: 50 },
      order.payments[1],
    ],
  },
});
const correctedOrder = rows.get(key(STORAGE_KEYS.ORDERS, order.id)).data as Order;
const adjustment = await prisma.$transaction((tx: any) => service.recordOrderPaymentAdjustment(tx, {
  order: correctedOrder,
  paymentId: 'payment-1',
  actor,
  reason: '订单付款由100元修正为50元',
  occurredAt: '2026-07-05T00:00:00.000Z',
}));
assert.equal(adjustment?.amount, 50);
assert.equal(adjustment?.reversalOfId, originalPaymentRecordId);
const duplicateAdjustment = await prisma.$transaction((tx: any) => service.recordOrderPaymentAdjustment(tx, {
  order: correctedOrder,
  paymentId: 'payment-1',
  actor,
  reason: '重复执行不应再次冲正',
  occurredAt: '2026-07-05T00:00:00.000Z',
}));
assert.equal(duplicateAdjustment, null, '同一目标金额重复执行必须幂等');
const correctedDryRun = await service.backfill(false, actor);
assert.equal(correctedDryRun.code, 0);
assert.deepEqual(correctedDryRun.data?.errors, [], '原收入减去冲正支出等于当前付款时必须通过对账');
assert.equal(correctedDryRun.data?.missingCount, 0);
assert.equal(correctedDryRun.data?.incomeAmount, 250);
assert.equal(correctedDryRun.data?.existingIncomeAmount, 300, '原收入流水必须保持不可变');
assert.equal(correctedDryRun.data?.existingExpenseAmount, 100, '冲正和提成发放都应计入实际支出');

rows.set(key(STORAGE_KEYS.ORDERS, 'bad-order'), { domain: STORAGE_KEYS.ORDERS, recordId: 'bad-order', data: { ...order, id: 'bad-order', orderNo: 'BAD', payments: [{ id: '', amount: 0, paidAt: '' }] } });
const rejected = await service.backfill(true, actor);
assert.equal(rejected.code, 409, '存在异常付款时必须拒绝 apply');

{
  const malformedRecordId = 'malformed-visible-row';
  rows.set(key(STORAGE_KEYS.FINANCE_TRANSACTIONS, malformedRecordId), {
    ...clone(originalPaymentRow),
    recordId: malformedRecordId,
    data: {
      ...clone(originalPaymentRow.data),
      id: undefined,
      sourceEventId: undefined,
      transactionNo: 'FT-MALFORMED-VISIBLE',
      amount: 123,
      type: { damaged: true },
      relatedBusiness: { damaged: true },
      occurredAt: { damaged: true },
    },
  });
  const malformedList = await service.list({ pageSize: 100 });
  const malformedItem = malformedList.data?.items.find((item) => item.id === malformedRecordId);
  assert.ok(malformedItem, '身份损坏的不可变资金流水不得从主审计列表静默消失');
  assert.equal(malformedItem?.status, '异常');
  assert.equal(typeof malformedItem?.type, 'string');
  assert.equal(typeof malformedItem?.relatedBusiness, 'string');
  assert.equal(typeof malformedItem?.occurredAt, 'string');
  assert.equal((await service.getById(malformedRecordId)).data?.status, '异常');
  rows.delete(key(STORAGE_KEYS.FINANCE_TRANSACTIONS, malformedRecordId));
}

{
  const invalidStructureOrder = {
    ...order,
    id: 'invalid-structure-order',
    orderNo: 'ORD-INVALID-STRUCTURE',
    payments: {},
  } as unknown as Order;
  rows.set(key(STORAGE_KEYS.ORDERS, invalidStructureOrder.id), {
    domain: STORAGE_KEYS.ORDERS,
    recordId: invalidStructureOrder.id,
    data: invalidStructureOrder,
  });
  const coverage = await service.list({ orderIds: [invalidStructureOrder.id] }, { includeOrderDetails: true });
  assert.equal(coverage.code, 0, '损坏付款容器不得使资金流水下钻崩溃');
  assert.match(coverage.data?.filterCoverage?.evidenceIssueOrders[0]?.orderIssues.join('；') || '', /付款记录结构无效/);
}

{
  const stableOrderId = 'stable-order-id';
  const stablePaymentId = 'stable-payment-id';
  rows.set(key(STORAGE_KEYS.ORDERS, stableOrderId), {
    domain: STORAGE_KEYS.ORDERS,
    recordId: stableOrderId,
    data: {
      ...order,
      id: 'wrong-data-id',
      orderNo: 'ORD-STABLE-ID',
      payments: [{ id: stablePaymentId, amount: 100, paidAt: '2026-07-01T01:00:00.000Z', paymentMethod: '对公转账' }],
    },
  });
  const stableFlowId = `order_payment:${stableOrderId}:${stablePaymentId}`;
  rows.set(key(STORAGE_KEYS.FINANCE_TRANSACTIONS, stableFlowId), {
    ...clone(originalPaymentRow),
    recordId: stableFlowId,
    data: {
      ...clone(originalPaymentRow.data),
      id: stableFlowId,
      sourceId: stableOrderId,
      orderId: stableOrderId,
      sourceEventId: `${stableOrderId}:${stablePaymentId}`,
      amount: 100,
    },
  });
  const stableCoverage = await service.list({ orderIds: [stableOrderId] }, { includeOrderDetails: true });
  assert.equal(stableCoverage.data?.filterCoverage?.evidenceIssueOrderCount, 1);
  assert.match(stableCoverage.data?.filterCoverage?.evidenceIssueOrders[0]?.orderIssues.join('；') || '', /稳定ID/);
}

{
  const conflictOrder = {
    ...order,
    id: 'conflict-order',
    orderNo: 'ORD-CONFLICT',
    payments: [{ id: 'conflict-payment', amount: 100, paidAt: '2026-07-01T01:00:00.000Z', paymentMethod: '对公转账' }],
  } as Order;
  const conflictRecordId = 'order_payment:conflict-order:conflict-payment';
  rows.set(key(STORAGE_KEYS.FINANCE_TRANSACTIONS, conflictRecordId), {
    ...clone(originalPaymentRow),
    recordId: conflictRecordId,
    data: {
      ...clone(originalPaymentRow.data),
      id: conflictRecordId,
      sourceId: conflictOrder.id,
      orderId: conflictOrder.id,
      sourceEventId: `${conflictOrder.id}:conflict-payment`,
      amount: 1,
      status: '待确认',
    },
  });
  await assert.rejects(
    prisma.$transaction((tx: any) => service.recordOrderPayments(tx, conflictOrder, actor)),
    /已存在冲突记录/,
    '幂等写入命中同事件的损坏流水时必须拒绝业务提交',
  );
  await assert.rejects(
    prisma.$transaction((tx: any) => service.recordOrderPayments(tx, {
      ...conflictOrder,
      id: 'object-payment-order',
      orderNo: 'ORD-OBJECT-PAYMENT',
      payments: [{ ...conflictOrder.payments![0], id: {} }],
    } as unknown as Order, actor)),
    /无效付款记录/,
  );
}

const finalAudit = await service.backfill(false, actor);
assert.ok(finalAudit.data?.errors.some((message) => message.includes('稳定ID与存储记录不一致')),
  '资金回填必须拒绝使用 data.id 与存储 recordId 不一致的订单归属');

console.log('finance transaction service tests passed');
