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

{
  const targetPaid = commission({
    id: 'commission-target-paid-history',
    orderId: 'order-target',
    orderNo: 'ORD-TARGET',
    payoutPlanId: 'plan-shared',
  });
  const peerPaid = commission({
    id: 'commission-peer-paid-history',
    orderId: 'order-peer',
    orderNo: 'ORD-PEER',
    payoutPlanId: 'plan-shared',
  });
  const targetCurrent = {
    ...targetPaid,
    id: 'commission-target-current',
    status: '待确认' as const,
    paidAt: undefined,
    payoutRecordId: undefined,
  };
  const peerCurrent = {
    ...peerPaid,
    id: 'commission-peer-current',
    status: '待确认' as const,
    paidAt: undefined,
    payoutRecordId: undefined,
  };
  const preview = buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order',
    sourceBusinessId: targetCurrent.orderId,
    sourceBusinessNo: targetCurrent.orderNo,
    sourceRevision: targetCurrent.updatedAt,
    beforeBusinessSnapshot: { actualAmount: 1000 },
    afterBusinessSnapshot: { actualAmount: 1200 },
    beforeCommissions: [targetCurrent, peerCurrent],
    afterCommissions: [{
      ...targetCurrent,
      commissionAmount: 120,
      orderAmount: 1200,
      performanceAmount: 1200,
    }, peerCurrent],
    payoutRecords: [payout([targetPaid, peerPaid])],
  });
  assert.equal(preview.supplementAmount, 20, '历史已发快照应与同源单当前应得配对');
  assert.equal(preview.recoverAmount, 0, '同月其他订单的旧快照不得因缺少同 ID 新轮次被整笔追回');
  assert.equal(
    preview.impacts.some((impact) => impact.sourceCommissionId === peerPaid.id && impact.action === '追回'),
    false,
  );
}

{
  const firstPaid = commission({ id: 'commission-paid-first', commissionAmount: 100 });
  const secondPaid = commission({ id: 'commission-paid-second', commissionAmount: 20 });
  const after = { ...secondPaid, commissionAmount: 120, status: '待确认' as const };
  assert.throws(() => buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order',
    sourceBusinessId: firstPaid.orderId,
    sourceBusinessNo: firstPaid.orderNo,
    sourceRevision: firstPaid.updatedAt,
    beforeBusinessSnapshot: { actualAmount: 1000 },
    afterBusinessSnapshot: { actualAmount: 1200 },
    beforeCommissions: [secondPaid],
    afterCommissions: [after],
    payoutRecords: [
      { ...payout([firstPaid]), id: 'payout-first' },
      { ...payout([secondPaid]), id: 'payout-second' },
    ],
  }), /多笔.*已发|无法安全匹配/, '多笔历史实付不能各自与同一笔当前应得重复比较');
}

{
  const pending = commission({ id: 'commission-pending', status: '待确认' });
  const after = { ...pending, commissionAmount: 120 };
  const ghostPayout = {
    ...payout([{ ...pending, id: 'commission-ghost', status: '已发放' }]),
    commissionIds: [],
  };
  const preview = buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order', sourceBusinessId: pending.orderId, sourceBusinessNo: pending.orderNo,
    sourceRevision: pending.updatedAt, beforeBusinessSnapshot: {}, afterBusinessSnapshot: {},
    beforeCommissions: [pending], afterCommissions: [after], payoutRecords: [ghostPayout],
  });
  assert.equal(preview.supplementAmount, 0, '未列入 commissionIds 的快照不得作为已发事实');
  assert.equal(preview.impacts.length, 0);
}

{
  const pending = commission({ id: 'commission-paid-without-snapshot', status: '待确认' });
  const missingSnapshotPayout = {
    ...payout([]),
    commissionIds: [pending.id],
    totalCount: 1,
    totalAmount: pending.commissionAmount,
  };
  assert.throws(() => buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order', sourceBusinessId: pending.orderId, sourceBusinessNo: pending.orderNo,
    sourceRevision: pending.updatedAt, beforeBusinessSnapshot: {}, afterBusinessSnapshot: {},
    beforeCommissions: [pending], afterCommissions: [{ ...pending, commissionAmount: 120 }],
    payoutRecords: [missingSnapshotPayout],
  }), /缺少逐笔发放快照/, '发放单命中源提成但缺少快照时必须停止更正');
}

{
  const oldPaid = commission({
    id: 'commission-old-round-without-snapshot',
    status: '已发放',
    settlementVersion: 1,
    settlementRoundId: 'round-1',
  });
  const current = commission({
    id: 'commission-current-round',
    status: '待确认',
    settlementVersion: 2,
    settlementRoundId: 'round-2',
  });
  const missingOldSnapshotPayout = {
    ...payout([]),
    commissionIds: [oldPaid.id],
    totalCount: 1,
    totalAmount: oldPaid.commissionAmount,
  };
  assert.throws(() => buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order', sourceBusinessId: current.orderId, sourceBusinessNo: current.orderNo,
    sourceRevision: current.updatedAt, beforeBusinessSnapshot: {}, afterBusinessSnapshot: {},
    beforeCommissions: [oldPaid, current], afterCommissions: [{ ...current, commissionAmount: 120 }],
    payoutRecords: [missingOldSnapshotPayout],
  }), /缺少逐笔发放快照/, '旧轮次发放单缺快照时不得因当前轮次筛选而漏检');
}

{
  const oldPaid = commission({
    id: 'commission-old-round-without-payout', status: '已发放', settlementVersion: 1, settlementRoundId: 'round-1',
  });
  const current = commission({
    id: 'commission-current-after-old-paid', status: '待确认', settlementVersion: 2, settlementRoundId: 'round-2',
  });
  assert.throws(() => buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order', sourceBusinessId: current.orderId, sourceBusinessNo: current.orderNo,
    sourceRevision: current.updatedAt, beforeBusinessSnapshot: {}, afterBusinessSnapshot: {},
    beforeCommissions: [oldPaid, current], afterCommissions: [{ ...current, commissionAmount: 120 }], payoutRecords: [],
  }), /缺少逐笔发放快照/, '旧轮次标记已发但无发放单时必须停止更正');
}

{
  const firstPaid = commission({ id: 'commission-ambiguous-old-a', commissionAmount: 100 });
  const secondPaid = commission({ id: 'commission-ambiguous-old-b', commissionAmount: 20 });
  const firstAfter = commission({ id: 'commission-ambiguous-new-a', commissionAmount: 20, status: '待确认', commissionRuleId: 'rule-old' });
  const secondAfter = commission({ id: 'commission-ambiguous-new-b', commissionAmount: 100, status: '待确认', commissionRuleId: 'rule-new' });
  assert.throws(() => buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order', sourceBusinessId: firstPaid.orderId, sourceBusinessNo: firstPaid.orderNo,
    sourceRevision: firstPaid.updatedAt, beforeBusinessSnapshot: {}, afterBusinessSnapshot: {},
    beforeCommissions: [], afterCommissions: [firstAfter, secondAfter],
    payoutRecords: [
      { ...payout([firstPaid]), id: 'payout-ambiguous-a' },
      { ...payout([secondPaid]), id: 'payout-ambiguous-b' },
    ],
  }), /无法安全匹配|匹配不唯一/, '没有稳定拆分键时不得按 ID 猜测多笔历史发放与当前应得的对应关系');
}

{
  const paid = commission({ id: 'commission-split-old', commissionAmount: 100, commissionRuleId: 'rule-old' });
  const firstAfter = commission({ id: 'commission-split-new-a', commissionAmount: 20, status: '待确认', commissionRuleId: 'rule-old' });
  const secondAfter = commission({ id: 'commission-split-new-b', commissionAmount: 100, status: '待确认', commissionRuleId: 'rule-new' });
  assert.throws(() => buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order', sourceBusinessId: paid.orderId, sourceBusinessNo: paid.orderNo,
    sourceRevision: paid.updatedAt, beforeBusinessSnapshot: {}, afterBusinessSnapshot: {},
    beforeCommissions: [], afterCommissions: [firstAfter, secondAfter], payoutRecords: [payout([paid])],
  }), /无法安全匹配|稳定拆分键/, '一笔历史发放拆成多笔当前应得时不得局部配对后遗漏剩余应得');
}

{
  const target = commission({ id: 'commission-chargeback-target', orderId: 'order-target', orderNo: 'ORD-TARGET', payoutPlanId: 'tier-plan' });
  const peer = commission({
    id: 'commission-chargeback-peer', orderId: 'order-peer', orderNo: 'ORD-PEER', payoutPlanId: 'tier-plan', status: '已冲销',
  });
  assert.throws(() => buildCommissionCorrectionImpact({
    sourceBusinessType: 'formal_order', sourceBusinessId: target.orderId, sourceBusinessNo: target.orderNo,
    sourceRevision: target.updatedAt, beforeBusinessSnapshot: {}, afterBusinessSnapshot: { notes: '仅改备注' },
    beforeCommissions: [target, peer], afterCommissions: [target, peer],
    payoutRecords: [payout([target, { ...peer, status: '已发放' }])],
  }), /冲销/, '同一影响桶存在冲销中或已冲销提成时不得再次生成追回差额');
}

console.log('commission correction impact service tests passed');
