import assert from 'node:assert/strict';
import { createPrismaBrowserLeadSyncRepository } from './prismaBrowserLeadSyncRepository';

let row: any = null;
let leadRow: any = null;
let beforeUpdateMany: ((where: any, data: any) => void | Promise<void>) | null = null;
const updateManyCalls: Array<{ where: any; data: any }> = [];

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
    row = {
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
    };
    return row;
  },
  async findUnique() {
    return row;
  },
  async update({ data }: any) {
    row = { ...row, ...data };
    return row;
  },
  async updateMany({ where, data }: any) {
    updateManyCalls.push({ where, data });
    if (beforeUpdateMany) await beforeUpdateMany(where, data);
    if (!row || !matchesWhere(row, where)) return { count: 0 };
    row = {
      ...row,
      ...data,
      attemptCount: row.attemptCount + (data.attemptCount?.increment || 0),
    };
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

const repository = createPrismaBrowserLeadSyncRepository({ browserLeadSync: delegate, leadRecord: leadDelegate } as any);
const reservationInput = {
  platform: 'DOUYIN', shopKey: 'shop-1', platformOrderNo: 'order-1',
  operatorId: 'user-1', operatorName: '客服小李',
  contactSource: 'CHAT' as const,
};

const first = await repository.reserve(reservationInput);
assert.equal(first.acquired, true);
assert.equal(first.record.status, 'PENDING');
assert.equal(first.record.attemptCount, 1);

const duplicate = await repository.reserve(reservationInput);
assert.equal(duplicate.acquired, false);
assert.equal(duplicate.record.id, first.record.id);

await repository.markFailed(first.record.id, '极享OS暂时不可用');
const retry = await repository.reserve(reservationInput);
assert.equal(retry.acquired, true, '失败记录可以被后续重试重新获取');
assert.equal(retry.record.status, 'PENDING');
assert.equal(retry.record.attemptCount, 2);

row = {
  ...row,
  id: 'browser-sync-recovery',
  status: 'PENDING',
  leadId: null,
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
assert.equal(retried?.greenFlagStatus, 'SUCCEEDED', '绿旗成功后不得被失败重试降级');
assert.equal(row.orderRemarkedAt, firstOrderRemarkedAt, '备注重试失败不得清空历史成功时间');
assert.equal(row.greenFlaggedAt, firstGreenFlaggedAt, '绿旗重试失败不得清空历史成功时间');
assert.equal(row.orderRemarkError, null, '备注成功后不得被重试错误覆盖');
assert.equal(row.greenFlagError, null, '绿旗成功后不得被重试错误覆盖');

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
  '绿旗更新必须使用数据库条件守卫',
);

console.log('browser lead sync repository reservation: ok');
