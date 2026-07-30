import assert from 'node:assert/strict';
import type { Commission, CommissionCorrectionRecord, CommissionPayoutRecord } from '../../src/types/commission';
import { buildCommissionCorrectionImpact, findOverlappingFinancialCorrection } from './commissionCorrectionImpactService';

const commission = (overrides: Partial<Commission> = {}): Commission => ({
  id: 'commission-order-1-sales', orderId: 'order-1', orderNo: 'ORD-1', customerName: '客户', productLevel: 'AI产品',
  orderAmount: 1000, performanceAmount: 1000, commissionRate: 0.1, commissionAmount: 100,
  role: '销售', ownerId: 'user-a', owner: 'A', departmentId: 'sales', department: '销售部',
  paymentDate: '2026-06-15T00:00:00.000Z', status: '已发放', sourceBusinessType: 'formal_order',
  createdAt: '2026-06-15T00:00:00.000Z', updatedAt: '2026-06-30T00:00:00.000Z',
  ...overrides,
});

const payout = (snapshots: Commission[]): CommissionPayoutRecord => ({
  id: 'payout-1', payoutNo: 'FF-1', period: '2026-06', status: '已发放', totalCount: snapshots.length,
  totalAmount: snapshots.reduce((sum, item) => sum + item.commissionAmount, 0), commissionIds: snapshots.map((item) => item.id),
  commissionSnapshots: snapshots, byOwner: [], createdAt: '2026-07-01T00:00:00.000Z', createdById: 'admin',
  createdByName: '管理员', issuedAt: '2026-07-01T00:00:00.000Z', issuedById: 'admin', issuedByName: '管理员',
});

{
  const before = commission();
  const after = commission({ commissionAmount: 120, orderAmount: 1200, performanceAmount: 1200 });
  const preview = buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order', sourceBusinessId: 'order-1', sourceBusinessNo: 'ORD-1', sourceRevision: before.updatedAt,
    beforeBusinessSnapshot: { actualAmount: 1000 }, afterBusinessSnapshot: { actualAmount: 1200 },
    beforeCommissions: [before], afterCommissions: [after], payoutRecords: [payout([before])],
  });
  assert.equal(preview.supplementAmount, 20);
  assert.equal(preview.recoverAmount, 0);
  assert.equal(preview.legs[0].kind, '补发');
  assert.equal(preview.legs[0].status, '待发放');
}

{
  const before = commission();
  const after = commission({ commissionAmount: 80, orderAmount: 800, performanceAmount: 800 });
  const preview = buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order', sourceBusinessId: 'order-1', sourceBusinessNo: 'ORD-1', sourceRevision: before.updatedAt,
    beforeBusinessSnapshot: { actualAmount: 1000 }, afterBusinessSnapshot: { actualAmount: 800 },
    beforeCommissions: [before], afterCommissions: [after], payoutRecords: [payout([before])],
  });
  assert.equal(preview.supplementAmount, 0);
  assert.equal(preview.recoverAmount, 20);
  assert.equal(preview.legs[0].kind, '追回');
}

{
  const before = commission();
  const after = commission({ ownerId: 'user-b', owner: 'B' });
  const preview = buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order', sourceBusinessId: 'order-1', sourceBusinessNo: 'ORD-1', sourceRevision: before.updatedAt,
    beforeBusinessSnapshot: { salesId: 'user-a' }, afterBusinessSnapshot: { salesId: 'user-b' },
    beforeCommissions: [before], afterCommissions: [after], payoutRecords: [payout([before])],
  });
  assert.equal(preview.impacts[0].action, '人员调整');
  assert.deepEqual(preview.legs.map((item) => [item.kind, item.owner, item.amount]), [['追回', 'A', 100], ['补发', 'B', 100]]);
}

{
  const before = commission();
  const after = commission({ paymentDate: '2026-07-02T00:00:00.000Z' });
  const preview = buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order', sourceBusinessId: 'order-1', sourceBusinessNo: 'ORD-1', sourceRevision: before.updatedAt,
    beforeBusinessSnapshot: { paidAt: before.paymentDate }, afterBusinessSnapshot: { paidAt: after.paymentDate },
    beforeCommissions: [before], afterCommissions: [after], payoutRecords: [payout([before])],
  });
  assert.equal(preview.supplementAmount, 0);
  assert.equal(preview.recoverAmount, 0);
  assert.deepEqual(preview.affectedPeriods, ['2026-06', '2026-07']);
  assert.equal(preview.impacts[0].action, '无需差额');
}

{
  const paidWithoutSnapshot = commission();
  assert.throws(() => buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order', sourceBusinessId: 'order-1', sourceBusinessNo: 'ORD-1', sourceRevision: paidWithoutSnapshot.updatedAt,
    beforeBusinessSnapshot: {}, afterBusinessSnapshot: { notes: '更正' }, beforeCommissions: [paidWithoutSnapshot],
    afterCommissions: [paidWithoutSnapshot], payoutRecords: [],
  }), /缺少逐笔发放快照/);
}

{
  const paid = commission();
  const pending = commission({
    id: 'commission-order-1-lead',
    role: '线索',
    ownerId: 'user-lead',
    owner: '线索人员',
    status: '待发放',
    commissionAmount: 50,
  });
  const preview = buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order', sourceBusinessId: 'order-1', sourceBusinessNo: 'ORD-1', sourceRevision: paid.updatedAt,
    beforeBusinessSnapshot: {}, afterBusinessSnapshot: { notes: '仅更正备注' },
    beforeCommissions: [paid, pending], afterCommissions: [paid, { ...pending, commissionAmount: 80 }],
    payoutRecords: [payout([paid])],
  });
  assert.equal(preview.supplementAmount, 0, '未发放提成可直接重算，不能重复生成补发差额');
  assert.equal(preview.impacts.some((item) => item.sourceCommissionId === pending.id), false);
}

{
  const before = commission({ id: 'commission-old-rule', commissionRuleId: 'rule-old' });
  const after = commission({ id: 'commission-new-rule', commissionRuleId: 'rule-new', commissionAmount: 120, performanceAmount: 1200 });
  const preview = buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order', sourceBusinessId: 'order-1', sourceBusinessNo: 'ORD-1', sourceRevision: before.updatedAt,
    beforeBusinessSnapshot: { productId: 'old' }, afterBusinessSnapshot: { productId: 'new' },
    beforeCommissions: [before], afterCommissions: [after], payoutRecords: [payout([before])],
  });
  assert.equal(preview.supplementAmount, 20, '规则或产品更换导致提成ID变化时，仍应按同角色对比差额');
  assert.equal(preview.recoverAmount, 0);
}

{
  const before = commission();
  const after = commission({ commissionAmount: 120, orderAmount: 1200, performanceAmount: 1200 });
  const preview = buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order', sourceBusinessId: 'order-1', sourceBusinessNo: 'ORD-1', sourceRevision: before.updatedAt,
    beforeBusinessSnapshot: {}, afterBusinessSnapshot: { actualAmount: 1200 },
    beforeCommissions: [before], afterCommissions: [after], payoutRecords: [payout([before])],
  });
  const prior: CommissionCorrectionRecord = {
    ...preview,
    id: 'prior-correction',
    correctionNo: 'COR-PRIOR',
    sourceBusinessId: 'another-order',
    sourceBusinessNo: 'ORD-ANOTHER',
    reason: '其他订单触发的阶梯联动',
    status: '待处理',
    createdById: 'admin',
    createdByName: '管理员',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
  assert.equal(
    findOverlappingFinancialCorrection(preview, [prior])?.correctionNo,
    'COR-PRIOR',
    '不同源单影响同一已发阶梯提成时，必须识别已有差额以防重复补发',
  );
  assert.equal(findOverlappingFinancialCorrection({ ...preview, legs: [] }, [prior]), undefined);
}

console.log('commission correction impact service tests passed');
