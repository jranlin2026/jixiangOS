import assert from 'node:assert/strict';
import type { CommissionPayoutEmployeeRow } from '../../types/commission';
import {
  buildPendingEmployeePresentation,
  filterPendingEmployeeCommissions,
  pendingCommissionStatusLabel,
} from './commissionPayoutPresentation';

const row = {
  ownerId: 'employee-1', owner: '员工A', department: '销售部',
  orderCount: 3, commissionCount: 4, formalOrderCount: 2, recoveryOrderCount: 1,
  formalOrderPaidAmount: 1_800, recoveryBusinessAmount: 699,
  statusCounts: { pendingHandling: 1, pendingConfirm: 1, pendingPay: 2, paid: 0, withdrawn: 0 },
  pendingConfirmAmount: 100, pendingPayAmount: 500, paidAmount: 0, withdrawnAmount: 0, totalAmount: 600,
  commissions: [
    { id: 'handling', status: '待确认', ownerId: 'employee-1', owner: '员工A', payoutPlanId: undefined, payoutPlanName: undefined, calculationNote: '缺少提成方案，暂不计算' },
    { id: 'confirm', status: '待确认', ownerId: 'employee-1', owner: '员工A', payoutPlanId: 'plan-1' },
    { id: 'pay-1', status: '待发放', ownerId: 'employee-1', owner: '员工A', payoutPlanId: 'plan-1' },
    { id: 'pay-2', status: '待发放', ownerId: 'employee-1', owner: '员工A', payoutPlanId: 'plan-1' },
  ],
} as CommissionPayoutEmployeeRow;

const presentation = buildPendingEmployeePresentation(row);
assert.deepEqual(presentation.business, { total: 3, formal: 2, recovery: 1 });
assert.deepEqual(presentation.pendingHandling, { count: 1 });
assert.deepEqual(presentation.pendingConfirm, { count: 1, amount: 100 });
assert.deepEqual(presentation.pendingPay, { count: 2, amount: 500 });
assert.equal(presentation.canIssue, true);

assert.deepEqual(filterPendingEmployeeCommissions(row.commissions, '待处理').map((item) => item.id), ['handling']);
assert.deepEqual(filterPendingEmployeeCommissions(row.commissions, '待确认').map((item) => item.id), ['confirm']);
assert.deepEqual(filterPendingEmployeeCommissions(row.commissions, '待发放').map((item) => item.id), ['pay-1', 'pay-2']);
assert.equal(filterPendingEmployeeCommissions(row.commissions, '全部').length, 4);
assert.equal(pendingCommissionStatusLabel(row.commissions[0]), '待处理');
assert.equal(pendingCommissionStatusLabel(row.commissions[1]), '待确认');

console.log('commission payout presentation tests passed');
