import assert from 'node:assert/strict';
import { createPrismaBrowserLeadSyncRepository } from './prismaBrowserLeadSyncRepository';

const PENDING_LEASE_MS = 10 * 60 * 1000;

function matchesWhere(current: any, where: any) {
  return Object.entries(where).every(([field, expected]: [string, any]) => {
    if (expected && typeof expected === 'object' && 'lte' in expected) {
      return current[field] <= expected.lte;
    }
    return current[field] === expected;
  });
}

function applyData(current: any, data: any) {
  const { attemptCount, ...patch } = data;
  return {
    ...current,
    ...patch,
    ...(attemptCount ? { attemptCount: current.attemptCount + attemptCount.increment } : {}),
    updatedAt: new Date(),
  };
}

function createHarness(orderNo: string) {
  let row: any = null;
  const browserLeadSync = {
    async create({ data }: any) {
      if (row) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
      row = {
        ...data,
        leadId: null,
        leadName: null,
        assignedTo: null,
        assignedToId: null,
        intakeStatus: null,
        contactNickname: null,
        contactPhone: null,
        contactWechat: null,
        completedAt: null,
        lastError: null,
        updatedAt: new Date(),
      };
      return structuredClone(row);
    },
    async findUnique({ where }: any) {
      if (!row) return null;
      if (where.id) return row.id === where.id ? structuredClone(row) : null;
      const key = where.platform_shopKey_platformOrderNo;
      return key?.platform === row.platform
        && key.shopKey === row.shopKey
        && key.platformOrderNo === row.platformOrderNo
        ? structuredClone(row)
        : null;
    },
    async updateMany({ where, data }: any) {
      if (!row || !matchesWhere(row, where)) return { count: 0 };
      row = applyData(row, data);
      return { count: 1 };
    },
    async update({ data }: any) {
      row = applyData(row, data);
      return structuredClone(row);
    },
  };
  const repository = createPrismaBrowserLeadSyncRepository({
    browserLeadSync,
    leadRecord: { async findUnique() { return null; } },
    async $transaction(callback: (transaction: any) => Promise<any>) {
      return callback({ browserLeadSync });
    },
  } as any);
  const input = {
    platform: 'DOUYIN',
    shopKey: 'shop-lease',
    platformOrderNo: orderNo,
    operatorId: 'operator-1',
    operatorName: '客服小李',
    contactSource: 'CHAT' as const,
  };
  return {
    repository,
    input,
    row: () => structuredClone(row),
    makeStale() {
      row.updatedAt = new Date(Date.now() - PENDING_LEASE_MS - 1);
    },
  };
}

const completion = {
  leadId: 'lead-new',
  leadName: '新租约线索',
  assignedTo: '销售小王',
  assignedToId: 'sales-1',
  intakeStatus: '入库成功',
  storedContact: { nickname: '新租约线索', phone: '13800138000' },
};

{
  const harness = createHarness('order-old-fails-after-new-success');
  const oldLease = await harness.repository.reserve(harness.input);
  assert.ok(oldLease.record.attemptToken, '新 PENDING 保留必须返回租约 token');
  harness.makeStale();
  const newLease = await harness.repository.reserve(harness.input);
  assert.equal(newLease.acquired, true);
  assert.ok(newLease.record.attemptToken);
  assert.notEqual(newLease.record.attemptToken, oldLease.record.attemptToken, '超时抢占必须更换 token');

  const succeeded = await harness.repository.markSucceeded(
    newLease.record.id,
    newLease.record.attemptToken!,
    completion,
  );
  assert.equal(succeeded.status, 'SUCCEEDED', '当前 token 应正常完成');

  const staleFailure = await harness.repository.markFailed(
    oldLease.record.id,
    oldLease.record.attemptToken!,
    '旧执行者迟到失败',
  );
  assert.equal(staleFailure.status, 'SUCCEEDED', '旧 token 失败不得降级新执行者的成功结果');
  assert.equal(staleFailure.leadId, completion.leadId);
  assert.equal(staleFailure.lastError, null);
  assert.equal(harness.row().status, 'SUCCEEDED');
}

{
  const harness = createHarness('order-old-succeeds-after-reclaim');
  const oldLease = await harness.repository.reserve(harness.input);
  harness.makeStale();
  const newLease = await harness.repository.reserve(harness.input);

  const staleSuccess = await harness.repository.markSucceeded(
    oldLease.record.id,
    oldLease.record.attemptToken!,
    { ...completion, leadId: 'lead-stale', leadName: '旧执行者线索' },
  );
  assert.equal(staleSuccess.status, 'PENDING', '旧 token 成功不得覆盖新租约的 PENDING');
  assert.equal(staleSuccess.attemptToken, newLease.record.attemptToken);
  assert.equal(staleSuccess.leadId, null);
  assert.equal(harness.row().leadId, null);

  const failed = await harness.repository.markFailed(
    newLease.record.id,
    newLease.record.attemptToken!,
    '当前执行者失败',
  );
  assert.equal(failed.status, 'FAILED', '当前 token 应正常标记失败');
  assert.equal(failed.lastError, '当前执行者失败');

  const retried = await harness.repository.reserve({
    ...harness.input,
    operatorId: 'operator-2',
    operatorName: '客服小周',
  });
  assert.equal(retried.acquired, true);
  assert.notEqual(retried.record.attemptToken, newLease.record.attemptToken, '失败重试必须更换 token');
  assert.equal(retried.record.operatorId, 'operator-2', '抢占必须同步刷新本次审计事实');
}

console.log('browser lead sync repository lease ownership: ok');
