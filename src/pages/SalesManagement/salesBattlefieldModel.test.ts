import assert from 'node:assert/strict';
import type { CockpitSalesBattleProfile } from '../../types/dashboard';
import {
  getSalespersonBattleStatus,
  isSalesDepartmentProfile,
  paginateSalesProfiles,
} from './salesBattlefieldModel';

const profile = (overrides: Partial<CockpitSalesBattleProfile> = {}): CockpitSalesBattleProfile => ({
  userId: 'sales-1',
  name: '销售甲',
  department: '销售一部',
  identityStatus: 'resolved',
  revenueAmount: 0,
  orderCount: 0,
  customerCount: 10,
  activeOpportunityCount: 0,
  opportunityAmount: 0,
  todayDueTodoCount: 0,
  todayCompletedTodoCount: 0,
  todayFollowUpCount: 1,
  overdueCustomerCount: 0,
  riskCustomerCount: 0,
  missingNextActionCount: 0,
  wonCount: 0,
  lostCount: 0,
  conversionRate: 0,
  monthlyTargetAmount: null,
  targetGapAmount: null,
  targetCompletionRate: null,
  priorityCustomers: [],
  ...overrides,
});

assert.equal(isSalesDepartmentProfile(profile()), true);
assert.equal(isSalesDepartmentProfile(profile({ department: '销售二部' })), true);
assert.equal(isSalesDepartmentProfile(profile({ department: '市场获客部' })), false);
assert.equal(isSalesDepartmentProfile(profile({ department: undefined })), false);

assert.deepEqual(getSalespersonBattleStatus(profile()), {
  code: 'normal', label: '正常', reason: '当前无逾期或风险客户',
});
assert.deepEqual(getSalespersonBattleStatus(profile({ riskCustomerCount: 3 })), {
  code: 'attention', label: '需关注', reason: '3 个风险客户待推进',
});
assert.deepEqual(getSalespersonBattleStatus(profile({ missingNextActionCount: 2 })), {
  code: 'attention', label: '需关注', reason: '2 个客户缺少下一步动作',
});
assert.deepEqual(getSalespersonBattleStatus(profile({ todayFollowUpCount: 0 })), {
  code: 'attention', label: '需关注', reason: '今日尚无客户跟进记录',
});
assert.deepEqual(getSalespersonBattleStatus(profile({ overdueCustomerCount: 1 })), {
  code: 'intervene', label: '需要介入', reason: '1 个客户下一步动作已逾期',
});

const rows = Array.from({ length: 12 }, (_, index) => profile({ userId: `sales-${index}`, name: `销售${index}` }));
assert.deepEqual(paginateSalesProfiles(rows, 0, 10).map((item) => item.userId), rows.slice(0, 10).map((item) => item.userId));
assert.deepEqual(paginateSalesProfiles(rows, 1, 10).map((item) => item.userId), rows.slice(10).map((item) => item.userId));

console.log('sales battlefield model tests passed');
