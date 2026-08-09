import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { createPrismaBrowserLeadSyncRepository } from './prismaBrowserLeadSyncRepository';

let row: any = null;
let leadRow: any = null;
let beforeUpdateMany: ((where: any, data: any) => void | Promise<void>) | null = null;
const updateManyCalls: Array<{ where: any; data: any }> = [];

const browserLeadSyncFields = new Set([
  'id', 'platform', 'shopKey', 'platformOrderNo', 'shopBindingId', 'shopDisplayName',
  'platformProductId', 'platformSkuId', 'sourceProductName', 'matchedProductId',
  'matchedProductName', 'productMatchMethod', 'sourcePaymentAmount', 'sourcePaymentAt',
  'operatorId', 'operatorName', 'contactSource', 'status', 'leadId', 'leadName',
  'contactNickname', 'contactPhone', 'contactWechat', 'assignedTo', 'assignedToId',
  'intakeStatus', 'orderRemarkStatus', 'orderRemarkError',
  'greenFlagStatus', 'greenFlagError', 'remarkOperatorId', 'remarkOperatorName',
  'attemptCount', 'attemptToken', 'lastError', 'completedAt', 'orderRemarkedAt', 'greenFlaggedAt',
  'createdAt', 'updatedAt',
]);

function assertKnownBrowserLeadSyncFields(data: Record<string, unknown>) {
  for (const field of Object.keys(data)) {
    assert.ok(browserLeadSyncFields.has(field), `BrowserLeadSync 不存在字段 ${field}`);
  }
}

function materialize(value: any, field?: string): any {
  if (value instanceof Date) return new Date(value.getTime());
  if (field === 'sourcePaymentAmount' && value !== null && value !== undefined) {
    return new Prisma.Decimal(value);
  }
  return value;
}

function materializeRow(source: Record<string, any>) {
  return Object.fromEntries(Object.entries(source).map(([field, value]) => [field, materialize(value, field)]));
}

function applyData(current: Record<string, any>, data: Record<string, any>) {
  assertKnownBrowserLeadSyncFields(data);
  const { attemptCount, ...patch } = data;
  return materializeRow({
    ...current,
    ...patch,
    ...(attemptCount ? { attemptCount: current.attemptCount + (attemptCount.increment || 0) } : {}),
    updatedAt: new Date(),
  });
}

function matchesWhere(current: any, where: any) {
  return Object.entries(where).every(([field, expected]: [string, any]) => {
    if (expected && typeof expected === 'object' && 'not' in expected) {
      return current[field] !== expected.not;
    }
    if (expected && typeof expected === 'object' && 'lte' in expected) {
      return current[field] <= expected.lte;
    }
    return current[field] === expected;
  });
}

const delegate = {
  async create({ data }: any) {
    if (row) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
    assertKnownBrowserLeadSyncFields(data);
    row = materializeRow({
      ...data,
      updatedAt: new Date(),
      leadId: null,
      leadName: null,
      assignedTo: null,
      assignedToId: null,
      intakeStatus: null,
      lastError: null,
      orderRemarkError: null,
      greenFlagStatus: 'NOT_ATTEMPTED',
      greenFlagError: null,
      orderRemarkedAt: null,
      greenFlaggedAt: null,
      completedAt: null,
    });
    return materializeRow(row);
  },
  async findUnique({ where }: any) {
    if (!row) return null;
    if (where.id) return row.id === where.id ? materializeRow(row) : null;
    const key = where.platform_shopKey_platformOrderNo;
    if (key) {
      return row.platform === key.platform && row.shopKey === key.shopKey && row.platformOrderNo === key.platformOrderNo
        ? materializeRow(row)
        : null;
    }
    return null;
  },
  async update({ data }: any) {
    row = applyData(row, data);
    return materializeRow(row);
  },
  async updateMany({ where, data }: any) {
    updateManyCalls.push({ where, data });
    if (beforeUpdateMany) await beforeUpdateMany(where, data);
    if (!row || !matchesWhere(row, where)) return { count: 0 };
    row = applyData(row, data);
    return { count: 1 };
  },
};

const leadDelegate = {
  async findUnique({ where }: any) {
    if (where.externalIntakeKey) {
      return leadRow?.externalIntakeKey === where.externalIntakeKey ? leadRow : null;
    }
    if (where.id) return leadRow?.id === where.id ? leadRow : null;
    return null;
  },
};

const prisma = {
  browserLeadSync: delegate,
  leadRecord: leadDelegate,
  async $transaction(callback: (transaction: { browserLeadSync: typeof delegate; leadRecord: typeof leadDelegate }) => Promise<any>) {
    return callback({ browserLeadSync: delegate, leadRecord: leadDelegate });
  },
};
const repository = createPrismaBrowserLeadSyncRepository(prisma as any);
const reservationInput = {
  platform: 'DOUYIN', shopKey: 'shop-1', platformOrderNo: 'order-1',
  shopBindingId: 'binding-1', shopDisplayName: '极享抖音旗舰店',
  platformProductId: 'DY-100', platformSkuId: 'SKU-100-A',
  sourceProductName: '淘金AI 多模态创作智能体',
  matchedProductId: 'product-taojin', matchedProductName: '淘金AI',
  productMatchMethod: 'PLATFORM_PRODUCT_ID',
  sourcePaymentAmount: '123456789012.34', sourcePaymentAt: new Date('2026-08-08T09:00:00.000Z'),
  operatorId: 'user-1', operatorName: '客服小李',
  contactSource: 'CHAT' as const,
};

const first = await repository.reserve(reservationInput);
assert.equal(first.acquired, true);
assert.equal(first.record.status, 'PENDING');
assert.equal(first.record.attemptCount, 1);
assert.deepEqual({
  shopBindingId: first.record.shopBindingId,
  shopDisplayName: first.record.shopDisplayName,
  platformProductId: first.record.platformProductId,
  platformSkuId: first.record.platformSkuId,
  sourceProductName: first.record.sourceProductName,
  matchedProductId: first.record.matchedProductId,
  matchedProductName: first.record.matchedProductName,
  productMatchMethod: first.record.productMatchMethod,
  sourcePaymentAmount: first.record.sourcePaymentAmount,
  sourcePaymentAt: first.record.sourcePaymentAt,
}, {
  shopBindingId: 'binding-1',
  shopDisplayName: '极享抖音旗舰店',
  platformProductId: 'DY-100',
  platformSkuId: 'SKU-100-A',
  sourceProductName: '淘金AI 多模态创作智能体',
  matchedProductId: 'product-taojin',
  matchedProductName: '淘金AI',
  productMatchMethod: 'PLATFORM_PRODUCT_ID',
  sourcePaymentAmount: '123456789012.34',
  sourcePaymentAt: new Date('2026-08-08T09:00:00.000Z'),
}, '创建同步记录必须保留店铺、商品匹配和付款审计事实');

const succeededOnce = await repository.markSucceeded(first.record.id, first.record.attemptToken!, {
  leadId: 'lead-1', leadName: '首次入库客户', assignedTo: '首次销售', assignedToId: 'sales-first',
  storedContact: { nickname: '首次入库客户', phone: '13800138000', wechat: 'wx_first' },
});
assert.ok(succeededOnce.completedAt instanceof Date, '首次成功必须记录完成时间');
assert.deepEqual(succeededOnce.storedContact, {
  nickname: '首次入库客户',
  phone: '13800138000',
  wechat: 'wx_first',
}, '首次成功必须持久化联系人快照');
const completedAt = succeededOnce.completedAt;
const succeededAgain = await repository.markSucceeded(first.record.id, first.record.attemptToken!, {
  leadId: 'lead-1', leadName: '后续更名客户', assignedTo: '后续销售', assignedToId: 'sales-later',
  storedContact: { nickname: '后续更名客户', phone: '13900139000', wechat: 'wx_later' },
});
assert.equal(succeededAgain.completedAt?.getTime(), completedAt?.getTime(), '重复标记成功不得重写首次完成时间');
assert.deepEqual(succeededAgain.storedContact, succeededOnce.storedContact, '重复标记成功不得重写首次联系人快照');
assert.equal(succeededAgain.assignedTo, '首次销售', '重复标记成功不得重写首次分配销售');

leadRow = {
  id: 'lead-1',
  externalIntakeKey: first.record.id,
  name: '线索后续改名',
  phone: '13900139000',
  wechat: 'wx_mutated',
  assignedTo: '已改派销售',
  data: { assignedTo: '已改派销售', assignedToId: 'sales-mutated' },
};
const duplicateAfterLeadMutation = await repository.reserve(reservationInput);
assert.deepEqual(duplicateAfterLeadMutation.record.storedContact, succeededOnce.storedContact);
assert.equal(duplicateAfterLeadMutation.record.assignedTo, '首次销售');
assert.equal(duplicateAfterLeadMutation.record.completedAt?.getTime(), completedAt?.getTime());
leadRow = null;

row = {
  ...row,
  status: 'PENDING',
  leadId: 'lead-stale',
  leadName: '过期线索',
  assignedTo: '首次销售',
  assignedToId: 'sales-first',
  intakeStatus: null,
  lastError: '上次回写中断',
};
const recoveredSuccess = await repository.markSucceeded(first.record.id, first.record.attemptToken!, {
  leadId: 'lead-repaired', leadName: '修复后的线索', assignedTo: '销售小王', assignedToId: 'sales-1', intakeStatus: '已入库',
  storedContact: { nickname: '修复后的线索', phone: '13800138000' },
});
assert.equal(recoveredSuccess.status, 'SUCCEEDED', '已有完成时间的记录仍必须恢复成功状态');
assert.equal(recoveredSuccess.leadId, 'lead-repaired', '已有完成时间的记录仍必须修复线索快照');
assert.equal(recoveredSuccess.assignedToId, 'sales-first', '恢复成功状态不得改写首次分配销售');
assert.equal(recoveredSuccess.lastError, null);
assert.equal(recoveredSuccess.completedAt?.getTime(), completedAt?.getTime(), '恢复成功不得覆盖首次完成时间');

leadRow = {
  id: 'lead-repaired',
  externalIntakeKey: first.record.id,
  name: '修复后的线索',
  phone: '13800138000',
  data: {},
};
const duplicate = await repository.reserve(reservationInput);
assert.equal(duplicate.acquired, false);
assert.equal(duplicate.existingLeadState, 'ACTIVE');
assert.equal(duplicate.record.id, first.record.id);
assert.deepEqual({
  shopBindingId: duplicate.record.shopBindingId,
  shopDisplayName: duplicate.record.shopDisplayName,
  platformProductId: duplicate.record.platformProductId,
  platformSkuId: duplicate.record.platformSkuId,
  sourceProductName: duplicate.record.sourceProductName,
  matchedProductId: duplicate.record.matchedProductId,
  matchedProductName: duplicate.record.matchedProductName,
  productMatchMethod: duplicate.record.productMatchMethod,
  sourcePaymentAmount: duplicate.record.sourcePaymentAmount,
  sourcePaymentAt: duplicate.record.sourcePaymentAt,
}, {
  shopBindingId: 'binding-1',
  shopDisplayName: '极享抖音旗舰店',
  platformProductId: 'DY-100',
  platformSkuId: 'SKU-100-A',
  sourceProductName: '淘金AI 多模态创作智能体',
  matchedProductId: 'product-taojin',
  matchedProductName: '淘金AI',
  productMatchMethod: 'PLATFORM_PRODUCT_ID',
  sourcePaymentAmount: '123456789012.34',
  sourcePaymentAt: new Date('2026-08-08T09:00:00.000Z'),
}, '重复入库从Prisma读回时必须保留完整商品解析审计和精确实付快照');
const successfulDuplicateWithChangedFacts = await repository.reserve({
  ...reservationInput,
  matchedProductId: 'product-should-not-overwrite',
  matchedProductName: '不得覆盖首次审计',
  sourcePaymentAmount: '999.99',
  sourcePaymentAt: new Date('2026-08-10T00:00:00.000Z'),
});
assert.equal(successfulDuplicateWithChangedFacts.acquired, false);
assert.equal(successfulDuplicateWithChangedFacts.record.matchedProductId, 'product-taojin');
assert.equal(successfulDuplicateWithChangedFacts.record.matchedProductName, '淘金AI');
assert.equal(successfulDuplicateWithChangedFacts.record.sourcePaymentAmount, '123456789012.34');
assert.equal(
  successfulDuplicateWithChangedFacts.record.sourcePaymentAt?.getTime(),
  new Date('2026-08-08T09:00:00.000Z').getTime(),
  '成功重复记录必须保持首次商品与实付审计不变',
);

leadRow = {
  id: 'lead-repaired',
  externalIntakeKey: first.record.id,
  name: '回收站中的线索',
  data: { deletedAt: new Date('2026-08-09T00:00:00.000Z') },
};
const recycledDuplicate = await repository.reserve({
  ...reservationInput,
  matchedProductId: 'product-should-not-overwrite-recycled',
  sourcePaymentAmount: '888.88',
});
assert.equal(recycledDuplicate.acquired, false);
assert.equal(recycledDuplicate.existingLeadState, 'RECYCLED');
assert.equal(recycledDuplicate.record.status, 'SUCCEEDED');
assert.equal(recycledDuplicate.record.matchedProductId, 'product-taojin');
assert.equal(recycledDuplicate.record.sourcePaymentAmount, '123456789012.34');
assert.equal(recycledDuplicate.record.completedAt?.getTime(), completedAt?.getTime());

leadRow = {
  ...leadRow,
  data: { archivedAt: '2026-08-09T00:00:00.000Z' },
};
const activeWithUnrelatedMarker = await repository.reserve(reservationInput);
assert.equal(activeWithUnrelatedMarker.existingLeadState, 'ACTIVE', '只有 data.deletedAt 才能标记回收站线索');

for (const invalidDeletedAt of [false, true, 1, '', new Date('invalid')]) {
  leadRow = { ...leadRow, data: { deletedAt: invalidDeletedAt } };
  const activeWithInvalidMarker = await repository.reserve(reservationInput);
  assert.equal(
    activeWithInvalidMarker.existingLeadState,
    'ACTIVE',
    'deletedAt 只有有效 Date 或非空字符串才是回收站标记',
  );
}

leadRow = {
  ...leadRow,
  data: { deletedAt: '2026-08-09T00:00:00.000Z' },
};
const recycledWithStringMarker = await repository.reserve(reservationInput);
assert.equal(recycledWithStringMarker.existingLeadState, 'RECYCLED', 'JSON 日期字符串也必须识别为回收站标记');

row = { ...row, status: 'FAILED', lastError: '回收站线索不能自动重建' };
const recycledFailedRetry = await repository.reserve({
  ...reservationInput,
  matchedProductId: 'product-retry-must-not-overwrite-recycled',
});
assert.equal(recycledFailedRetry.acquired, false, '失败同步关联回收站线索时也不得自动重建');
assert.equal(recycledFailedRetry.existingLeadState, 'RECYCLED');
assert.equal(recycledFailedRetry.record.matchedProductId, 'product-taojin');
row = { ...row, status: 'SUCCEEDED', lastError: null };

leadRow = null;
const missingSuccessfulLead = await repository.reserve({
  ...reservationInput,
  sourcePaymentAmount: '777.77',
});
assert.equal(missingSuccessfulLead.acquired, false);
assert.equal(missingSuccessfulLead.existingLeadState, 'MISSING');
assert.equal(missingSuccessfulLead.record.status, 'SUCCEEDED');
assert.equal(missingSuccessfulLead.record.sourcePaymentAmount, '123456789012.34');

const protectedSuccess = await repository.markFailed(
  first.record.id,
  first.record.attemptToken!,
  '极享OS暂时不可用',
);
assert.equal(protectedSuccess.status, 'SUCCEEDED', '迟到失败不得把成功记录降级');
row = { ...row, status: 'FAILED', lastError: '极享OS暂时不可用' };
const correctedReservationInput = {
  ...reservationInput,
  shopBindingId: 'binding-1-corrected',
  shopDisplayName: '极享抖音官方店',
  platformProductId: 'DY-200',
  platformSkuId: 'SKU-200-B',
  sourceProductName: '更正后的平台商品',
  matchedProductId: 'product-corrected',
  matchedProductName: '更正后OS产品',
  productMatchMethod: 'PLATFORM_SKU_ID',
  sourcePaymentAmount: '399.25',
  sourcePaymentAt: new Date('2026-08-09T02:30:00.000Z'),
  operatorId: 'user-2',
  operatorName: '客服小周',
  contactSource: 'OFF_PLATFORM' as const,
};
const retry = await repository.reserve(correctedReservationInput);
assert.equal(retry.acquired, true, '失败记录可以被后续重试重新获取');
assert.equal(retry.record.status, 'PENDING');
assert.equal(retry.record.attemptCount, 2);
assert.deepEqual({
  shopBindingId: retry.record.shopBindingId,
  shopDisplayName: retry.record.shopDisplayName,
  platformProductId: retry.record.platformProductId,
  platformSkuId: retry.record.platformSkuId,
  sourceProductName: retry.record.sourceProductName,
  matchedProductId: retry.record.matchedProductId,
  matchedProductName: retry.record.matchedProductName,
  productMatchMethod: retry.record.productMatchMethod,
  sourcePaymentAmount: retry.record.sourcePaymentAmount,
  sourcePaymentAt: retry.record.sourcePaymentAt,
  operatorId: retry.record.operatorId,
  operatorName: retry.record.operatorName,
  contactSource: retry.record.contactSource,
}, {
  shopBindingId: 'binding-1-corrected',
  shopDisplayName: '极享抖音官方店',
  platformProductId: 'DY-200',
  platformSkuId: 'SKU-200-B',
  sourceProductName: '更正后的平台商品',
  matchedProductId: 'product-corrected',
  matchedProductName: '更正后OS产品',
  productMatchMethod: 'PLATFORM_SKU_ID',
  sourcePaymentAmount: '399.25',
  sourcePaymentAt: new Date('2026-08-09T02:30:00.000Z'),
  operatorId: 'user-2',
  operatorName: '客服小周',
  contactSource: 'OFF_PLATFORM',
}, '原子抢占失败记录时必须同步刷新当前入库的全部审计事实');

row = {
  ...row,
  id: 'browser-sync-recovery',
  status: 'PENDING',
  leadId: null,
  contactNickname: null,
  contactPhone: null,
  contactWechat: null,
  assignedTo: null,
  assignedToId: null,
  completedAt: null,
  updatedAt: new Date(),
};
leadRow = {
  id: 'lead-recovered',
  externalIntakeKey: 'browser-sync-recovery',
  name: ' 恢复客户 ',
  phone: ' 13800138000 ',
  wechat: ' wx_recovered_88 ',
  assignedTo: '销售小王',
  data: { name: '恢复客户', assignedTo: '销售小王', assignedToId: 'sales-1', intakeStatus: '入库成功' },
};
const reconciled = await repository.reserve(reservationInput);
assert.equal(reconciled.acquired, false);
assert.equal(reconciled.record.status, 'SUCCEEDED');
assert.equal(reconciled.record.leadId, 'lead-recovered', '线索已提交但同步状态未更新时必须自动对账恢复');
assert.deepEqual(reconciled.record.storedContact, {
  nickname: '恢复客户',
  phone: '13800138000',
  wechat: 'wx_recovered_88',
});

row = {
  ...row,
  id: 'browser-sync-legacy',
  status: 'SUCCEEDED',
  leadId: 'lead-legacy',
  leadName: '旧同步姓名',
  contactNickname: null,
  contactPhone: null,
  contactWechat: null,
  updatedAt: new Date(),
};
leadRow = {
  id: 'lead-legacy',
  externalIntakeKey: null,
  name: ' 旧线索昵称 ',
  phone: null,
  wechat: null,
  data: { name: ' 旧线索昵称 ', phone: '', wechat: ' wx_legacy_66 ' },
};
const legacyDuplicate = await repository.reserve(reservationInput);
assert.equal(legacyDuplicate.acquired, false);
assert.deepEqual(legacyDuplicate.record.storedContact, {
  nickname: '旧线索昵称',
  phone: undefined,
  wechat: 'wx_legacy_66',
}, '旧同步记录必须通过 leadId 回查线索快照');

let concurrentLegacyRow = materializeRow({
  ...row,
  id: 'browser-sync-legacy-concurrent',
  platformOrderNo: 'order-legacy-concurrent',
  status: 'SUCCEEDED',
  leadId: 'lead-legacy-concurrent',
  contactNickname: null,
  contactPhone: null,
  contactWechat: null,
});
const concurrentLeadViews = [
  {
    id: 'lead-legacy-concurrent', externalIntakeKey: 'browser-sync-legacy-concurrent',
    name: '并发快照甲', phone: '13800138001', wechat: 'wx_concurrent_a', data: {},
  },
  {
    id: 'lead-legacy-concurrent', externalIntakeKey: 'browser-sync-legacy-concurrent',
    name: '并发快照乙', phone: '13800138002', wechat: 'wx_concurrent_b', data: {},
  },
];
let concurrentLeadReads = 0;
let releaseConcurrentLeadReads!: () => void;
const bothConcurrentLeadReads = new Promise<void>((resolve) => { releaseConcurrentLeadReads = resolve; });
const concurrentDelegate = {
  async create() { throw Object.assign(new Error('duplicate'), { code: 'P2002' }); },
  async findUnique({ where }: any) {
    if (where.id) return where.id === concurrentLegacyRow.id ? materializeRow(concurrentLegacyRow) : null;
    const key = where.platform_shopKey_platformOrderNo;
    return key?.platform === concurrentLegacyRow.platform
      && key.shopKey === concurrentLegacyRow.shopKey
      && key.platformOrderNo === concurrentLegacyRow.platformOrderNo
      ? materializeRow(concurrentLegacyRow)
      : null;
  },
  async update({ data }: any) {
    concurrentLegacyRow = applyData(concurrentLegacyRow, data);
    return materializeRow(concurrentLegacyRow);
  },
  async updateMany({ where, data }: any) {
    if (!matchesWhere(concurrentLegacyRow, where)) return { count: 0 };
    concurrentLegacyRow = applyData(concurrentLegacyRow, data);
    return { count: 1 };
  },
};
const concurrentRepository = createPrismaBrowserLeadSyncRepository({
  browserLeadSync: concurrentDelegate,
  leadRecord: {
    async findUnique() {
      const view = concurrentLeadViews[concurrentLeadReads++];
      if (concurrentLeadReads === concurrentLeadViews.length) releaseConcurrentLeadReads();
      await bothConcurrentLeadReads;
      return structuredClone(view);
    },
  },
  async $transaction(callback: (transaction: any) => Promise<any>) {
    return callback({ browserLeadSync: concurrentDelegate });
  },
} as any);
const concurrentReservationInput = {
  ...reservationInput,
  platformOrderNo: 'order-legacy-concurrent',
};
const [concurrentLegacyA, concurrentLegacyB] = await Promise.all([
  concurrentRepository.reserve(concurrentReservationInput),
  concurrentRepository.reserve(concurrentReservationInput),
]);
assert.deepEqual(
  concurrentLegacyA.record.storedContact,
  concurrentLegacyB.record.storedContact,
  '并发 legacy 回填的两个响应必须收敛到同一持久化胜者',
);
assert.deepEqual(concurrentLegacyA.record.storedContact, {
  nickname: concurrentLegacyRow.contactNickname,
  phone: concurrentLegacyRow.contactPhone,
  wechat: concurrentLegacyRow.contactWechat,
}, '响应必须返回数据库中的胜者而不是各自读到的可变线索');
assert.ok(
  concurrentLeadViews.some((view) => view.name === concurrentLegacyRow.contactNickname),
  '持久化快照必须恰好来自一个竞争者',
);

let retryRaceRow = materializeRow({
  ...row,
  id: 'browser-sync-failed-retry-race',
  platformOrderNo: 'order-failed-retry-race',
  status: 'FAILED',
  leadId: null,
  leadName: null,
  contactNickname: null,
  contactPhone: null,
  contactWechat: null,
  assignedTo: null,
  assignedToId: null,
  completedAt: null,
  attemptCount: 1,
  lastError: '首次入库失败',
  updatedAt: new Date(),
});
let retryRaceLead: any = null;
let initialSyncReads = 0;
let releaseInitialSyncReads!: () => void;
const bothInitialSyncReads = new Promise<void>((resolve) => { releaseInitialSyncReads = resolve; });
let initialLeadReads = 0;
let releaseInitialLeadReads!: () => void;
const bothInitialLeadReads = new Promise<void>((resolve) => { releaseInitialLeadReads = resolve; });
let retryClaimCalls = 0;
let releaseWinnerCompletion!: () => void;
const winnerCompletion = new Promise<void>((resolve) => { releaseWinnerCompletion = resolve; });

const retryRaceDelegate = {
  async create() { throw Object.assign(new Error('duplicate'), { code: 'P2002' }); },
  async findUnique({ where }: any) {
    const key = where.platform_shopKey_platformOrderNo;
    if (key && initialSyncReads < 2) {
      const snapshot = materializeRow(retryRaceRow);
      initialSyncReads += 1;
      if (initialSyncReads === 2) releaseInitialSyncReads();
      await bothInitialSyncReads;
      return snapshot;
    }
    if (where.id) return where.id === retryRaceRow.id ? materializeRow(retryRaceRow) : null;
    return key?.platform === retryRaceRow.platform
      && key.shopKey === retryRaceRow.shopKey
      && key.platformOrderNo === retryRaceRow.platformOrderNo
      ? materializeRow(retryRaceRow)
      : null;
  },
  async update({ data }: any) {
    retryRaceRow = applyData(retryRaceRow, data);
    return materializeRow(retryRaceRow);
  },
  async updateMany({ where, data }: any) {
    if (data.attemptCount) {
      retryClaimCalls += 1;
      if (retryClaimCalls > 1) {
        await winnerCompletion;
        return { count: 0 };
      }
    }
    if (!matchesWhere(retryRaceRow, where)) return { count: 0 };
    retryRaceRow = applyData(retryRaceRow, data);
    return { count: 1 };
  },
};
const retryRaceLeadDelegate = {
  async findUnique({ where }: any) {
    if (where.externalIntakeKey && initialLeadReads < 2) {
      const snapshot = retryRaceLead;
      initialLeadReads += 1;
      if (initialLeadReads === 2) releaseInitialLeadReads();
      await bothInitialLeadReads;
      return snapshot;
    }
    if (where.externalIntakeKey) {
      return retryRaceLead?.externalIntakeKey === where.externalIntakeKey ? structuredClone(retryRaceLead) : null;
    }
    if (where.id) return retryRaceLead?.id === where.id ? structuredClone(retryRaceLead) : null;
    return null;
  },
};
const retryRaceRepository = createPrismaBrowserLeadSyncRepository({
  browserLeadSync: retryRaceDelegate,
  leadRecord: retryRaceLeadDelegate,
  async $transaction(callback: (transaction: any) => Promise<any>) {
    return callback({ browserLeadSync: retryRaceDelegate });
  },
} as any);
const retryRaceInput = {
  ...reservationInput,
  platformOrderNo: 'order-failed-retry-race',
};
const retryAttempts = [
  retryRaceRepository.reserve(retryRaceInput),
  retryRaceRepository.reserve(retryRaceInput),
];
const winner = await Promise.race(retryAttempts.map(async (attempt, index) => ({ index, result: await attempt })));
assert.equal(winner.result.acquired, true, '并发失败重试必须只有一个调用抢占成功');
retryRaceLead = {
  id: 'lead-failed-retry-race',
  externalIntakeKey: retryRaceRow.id,
  name: '并发重试客户',
  phone: '13800138008',
  wechat: 'wx_retry_race',
  data: { assignedTo: '销售小王', assignedToId: 'sales-1', intakeStatus: '入库成功' },
};
await retryRaceRepository.markSucceeded(retryRaceRow.id, winner.result.record.attemptToken!, {
  leadId: retryRaceLead.id,
  leadName: retryRaceLead.name,
  assignedTo: '销售小王',
  assignedToId: 'sales-1',
  intakeStatus: '入库成功',
  storedContact: { nickname: retryRaceLead.name, phone: retryRaceLead.phone, wechat: retryRaceLead.wechat },
});
releaseWinnerCompletion();
const loser = await retryAttempts[winner.index === 0 ? 1 : 0];
assert.equal(loser.acquired, false);
assert.equal(loser.existingLeadState, 'ACTIVE', '抢占失败后必须基于赢家刷新后的关联线索重新解析状态');
assert.equal(loser.record.status, 'SUCCEEDED');
assert.equal(loser.record.leadId, retryRaceLead.id);
assert.deepEqual(loser.record.storedContact, {
  nickname: '并发重试客户',
  phone: '13800138008',
  wechat: 'wx_retry_race',
}, '输家必须返回可直接组装 ALREADY_CREATED 的赢家成功快照');

const processingWinnerRow = materializeRow({
  ...retryRaceRow,
  id: 'browser-sync-processing-winner',
  platformOrderNo: 'order-processing-winner',
  status: 'PENDING',
  leadId: null,
  contactNickname: null,
  contactPhone: null,
  contactWechat: null,
  completedAt: null,
  updatedAt: new Date(),
});
let processingInitialRead = true;
const processingRepository = createPrismaBrowserLeadSyncRepository({
  browserLeadSync: {
    async create() { throw Object.assign(new Error('duplicate'), { code: 'P2002' }); },
    async findUnique({ where }: any) {
      if (where.platform_shopKey_platformOrderNo && processingInitialRead) {
        processingInitialRead = false;
        return materializeRow({ ...processingWinnerRow, status: 'FAILED', lastError: '旧失败快照' });
      }
      return materializeRow(processingWinnerRow);
    },
    async updateMany() { return { count: 0 }; },
  },
  leadRecord: { async findUnique() { return null; } },
  async $transaction() { throw new Error('赢家仍处理中时输家不得进入线索对账事务'); },
} as any);
const processingLoser = await processingRepository.reserve({
  ...reservationInput,
  platformOrderNo: 'order-processing-winner',
});
assert.equal(processingLoser.acquired, false);
assert.equal(processingLoser.existingLeadState, 'MISSING');
assert.equal(processingLoser.record.status, 'PENDING', '赢家仍处理中时输家必须返回处理中冲突');

leadRow = null;
row = {
  ...row,
  id: 'browser-sync-stale',
  status: 'PENDING',
  leadId: null,
  updatedAt: new Date(Date.now() - 11 * 60 * 1000),
};
const staleRetry = await repository.reserve(reservationInput);
assert.equal(staleRetry.acquired, true, '没有生成线索的超时任务必须释放重试');
assert.equal(staleRetry.record.attemptCount, 3);

row = {
  ...row,
  id: 'browser-sync-completion',
  status: 'SUCCEEDED',
  orderRemarkStatus: 'NOT_ATTEMPTED',
  greenFlagStatus: 'NOT_ATTEMPTED',
  orderRemarkError: null,
  greenFlagError: null,
  orderRemarkedAt: null,
  greenFlaggedAt: null,
};
const longError = 'x'.repeat(1200);
const failed = await repository.reportPlatformCompletion(
  row.id,
  { id: 'user-1', name: '客服小李' },
  { orderRemarkStatus: 'FAILED', greenFlagStatus: 'FAILED', errorMessage: longError },
);
assert.equal(failed?.orderRemarkStatus, 'FAILED');
assert.equal(failed?.greenFlagStatus, 'FAILED');
assert.equal(row.orderRemarkError.length, 1000);
assert.equal(row.greenFlagError.length, 1000);
assert.equal(row.orderRemarkedAt, null);
assert.equal(row.greenFlaggedAt, null);

const completed = await repository.reportPlatformCompletion(
  row.id,
  { id: 'user-1', name: '客服小李' },
  { orderRemarkStatus: 'SUCCEEDED', greenFlagStatus: 'SUCCEEDED' },
);
assert.equal(completed?.orderRemarkStatus, 'SUCCEEDED');
assert.equal(completed?.greenFlagStatus, 'SUCCEEDED');
assert.ok(row.orderRemarkedAt instanceof Date);
assert.ok(row.greenFlaggedAt instanceof Date);
const firstOrderRemarkedAt = row.orderRemarkedAt;
const firstGreenFlaggedAt = row.greenFlaggedAt;

const retried = await repository.reportPlatformCompletion(
  row.id,
  { id: 'user-2', name: '客服小周' },
  { orderRemarkStatus: 'FAILED', greenFlagStatus: 'FAILED', errorMessage: longError },
);
assert.equal(retried?.orderRemarkStatus, 'SUCCEEDED', '备注成功后不得被失败重试降级');
assert.equal(retried?.greenFlagStatus, 'SUCCEEDED', '红旗成功后不得被失败重试降级');
assert.equal(row.orderRemarkedAt, firstOrderRemarkedAt, '备注重试失败不得清空历史成功时间');
assert.equal(row.greenFlaggedAt, firstGreenFlaggedAt, '红旗重试失败不得清空历史成功时间');
assert.equal(row.orderRemarkError, null, '备注成功后不得被重试错误覆盖');
assert.equal(row.greenFlagError, null, '红旗成功后不得被重试错误覆盖');

const legacyRetried = await repository.reportOrderRemark(
  row.id,
  { id: 'user-3', name: '客服小陈' },
  { status: 'SUBMITTED' },
);
assert.equal(legacyRetried?.orderRemarkStatus, 'SUCCEEDED', '旧备注上报路径也必须保持成功单调');
assert.equal(row.orderRemarkedAt, firstOrderRemarkedAt);
assert.equal(row.orderRemarkError, null);

row = {
  ...row,
  id: 'browser-sync-legacy-race',
  status: 'SUCCEEDED',
  orderRemarkStatus: 'SUBMITTED',
  orderRemarkError: null,
  orderRemarkedAt: null,
};
const concurrentLegacySucceededAt = new Date('2026-08-08T09:29:00.000Z');
beforeUpdateMany = (where) => {
  if (!where.orderRemarkStatus) return;
  row = {
    ...row,
    orderRemarkStatus: 'SUCCEEDED',
    orderRemarkError: null,
    orderRemarkedAt: concurrentLegacySucceededAt,
  };
  beforeUpdateMany = null;
};
const legacyRaced = await repository.reportOrderRemark(
  row.id,
  { id: 'user-legacy-race', name: '客服小孙' },
  { status: 'FAILED', errorMessage: longError },
);
assert.equal(legacyRaced?.orderRemarkStatus, 'SUCCEEDED');
assert.equal(row.orderRemarkedAt, concurrentLegacySucceededAt);
assert.equal(row.orderRemarkError, null);

row = {
  ...row,
  id: 'browser-sync-race',
  status: 'SUCCEEDED',
  orderRemarkStatus: 'SUBMITTED',
  greenFlagStatus: 'SUBMITTED',
  orderRemarkError: null,
  greenFlagError: null,
  orderRemarkedAt: null,
  greenFlaggedAt: null,
};
const concurrentSucceededAt = new Date('2026-08-08T09:30:00.000Z');
beforeUpdateMany = (where) => {
  if (!where.orderRemarkStatus && !where.greenFlagStatus) return;
  row = {
    ...row,
    orderRemarkStatus: 'SUCCEEDED',
    greenFlagStatus: 'SUCCEEDED',
    orderRemarkError: null,
    greenFlagError: null,
    orderRemarkedAt: concurrentSucceededAt,
    greenFlaggedAt: concurrentSucceededAt,
  };
  beforeUpdateMany = null;
};
const raced = await repository.reportPlatformCompletion(
  row.id,
  { id: 'user-4', name: '客服小林' },
  { orderRemarkStatus: 'FAILED', greenFlagStatus: 'FAILED', errorMessage: longError },
);
assert.equal(raced?.orderRemarkStatus, 'SUCCEEDED');
assert.equal(raced?.greenFlagStatus, 'SUCCEEDED');
assert.equal(row.orderRemarkedAt, concurrentSucceededAt);
assert.equal(row.greenFlaggedAt, concurrentSucceededAt);
assert.equal(row.orderRemarkError, null);
assert.equal(row.greenFlagError, null);

assert.ok(
  updateManyCalls.some((call) => call.where.orderRemarkStatus?.not === 'SUCCEEDED'),
  '备注更新必须使用数据库条件守卫',
);
assert.ok(
  updateManyCalls.some((call) => call.where.greenFlagStatus?.not === 'SUCCEEDED'),
  '红旗更新必须使用数据库条件守卫',
);

console.log('browser lead sync repository reservation: ok');
