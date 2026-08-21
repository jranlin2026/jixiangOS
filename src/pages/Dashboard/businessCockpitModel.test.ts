import assert from 'node:assert/strict';
import test from 'node:test';
import { alignComparableTrend, buildBossCommandItems, buildCockpitDrilldownPath, rankCockpitRisks, resolveDashboardDateRange } from './businessCockpitModel';

const now = new Date('2026-08-14T04:00:00.000Z');

test('preset date ranges resolve to Shanghai calendar boundaries for every dashboard panel', () => {
  assert.deepEqual(resolveDashboardDateRange('today', now), {
    preset: 'today', startDate: '2026-08-14', endDate: '2026-08-14',
  });
  assert.deepEqual(resolveDashboardDateRange('week', now), {
    preset: 'week', startDate: '2026-08-10', endDate: '2026-08-14',
  });
  assert.deepEqual(resolveDashboardDateRange('month', now), {
    preset: 'month', startDate: '2026-08-01', endDate: '2026-08-14',
  });
});

test('comparison trend aligns by relative day and retains days present only in the prior period', () => {
  const result = alignComparableTrend(
    [{ date: '2026-08-03', label: '08/03', formalReceiptAmount: 300, recoveryAmount: 0 }],
    [
      { date: '2026-07-01', label: '07/01', formalReceiptAmount: 100, recoveryAmount: 0 },
      { date: '2026-07-03', label: '07/03', formalReceiptAmount: 200, recoveryAmount: 0 },
    ],
    '2026-08-01',
    '2026-07-01',
  );
  assert.deepEqual(result.map((point) => [point.date, point.formalReceiptAmount, point.previousFormalReceiptAmount]), [
    ['2026-08-01', 0, 100],
    ['2026-08-03', 300, 200],
  ]);
});

test('dashboard drill-down preserves the applied range and business filter semantics', () => {
  assert.equal(
    buildCockpitDrilldownPath('/orders', { preset: 'month', startDate: '2026-08-01', endDate: '2026-08-14' }, 'payment'),
    '/orders?paymentStartDate=2026-08-01&paymentEndDate=2026-08-14&fromCockpit=1',
  );
  assert.equal(
    buildCockpitDrilldownPath('/leads', { preset: 'today', startDate: '2026-08-14', endDate: '2026-08-14' }, 'created'),
    '/leads?startDate=2026-08-14&endDate=2026-08-14&fromCockpit=1',
  );
});

test('boss priorities are sorted, capped at five, and exclude the featured item', () => {
  const risks = [
    { id: 'a', title: 'A', count: 1, amount: 900, path: '/a', tone: 'warning' as const },
    { id: 'b', title: 'B', count: 5, path: '/b', tone: 'error' as const },
    { id: 'c', title: 'C', count: 8, path: '/c', tone: 'warning' as const },
    { id: 'd', title: 'D', count: 1, path: '/d', tone: 'info' as const },
    { id: 'e', title: 'E', count: 2, path: '/e', tone: 'warning' as const },
    { id: 'f', title: 'F', count: 3, path: '/f', tone: 'primary' as const },
    { id: 'g', title: 'G', count: 1, path: '/g', tone: 'success' as const },
  ];
  const ranked = rankCockpitRisks(risks);
  assert.equal(ranked[0].id, 'a');
  assert.deepEqual(ranked.slice(1, 6).map((item) => item.id), ['b', 'c', 'e', 'd', 'f']);
});

test('boss command items connect customer, owner, action and verification evidence', () => {
  const commands = buildBossCommandItems([], [{
    customerId: 'customer-1', customerName: '张总', company: '测试公司', ownerId: 'sales-1', ownerName: '销售甲',
    stageCode: 'proposal', stageLabel: '方案报价', opportunityAmount: 68000,
    nextActionTitle: '确认决策人', nextActionDueAt: '2026-08-21T09:00:00.000Z',
    contactGapDays: 3, riskLevel: 'high', riskReason: '下一步动作已逾期',
  }], 5);
  assert.deepEqual(commands[0], {
    id: 'customer:customer-1', kind: 'customer', title: '张总 · 方案报价', owner: '销售甲',
    target: '测试公司 · ¥68,000', action: '确认决策人', verification: '截止 08-21 17:00',
    path: '/customers?customerId=customer-1&detailTab=todo', tone: 'error',
  });
});

test('operating errors are not displaced by a full customer command queue', () => {
  const customers = Array.from({ length: 7 }, (_, index) => ({
    customerId: `customer-${index}`, customerName: `客户${index}`, company: '', ownerName: '销售甲',
    stageCode: 'proposal', stageLabel: '方案报价', opportunityAmount: 0,
    riskLevel: 'medium' as const, riskReason: '尚未设置下一步动作',
  }));
  const commands = buildBossCommandItems([
    { id: 'finance', title: '资金流水异常', count: 2, path: '/finance', tone: 'error' },
  ], customers, 7);
  assert.ok(commands.some((item) => item.id === 'risk:finance'));
});
