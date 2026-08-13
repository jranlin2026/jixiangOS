import assert from 'node:assert/strict';
import {
  createCurrentQuarterCycleDraft,
  getAllowedObjectiveScopes,
  getVisibleOkrTabs,
  hasSubmittedObjectiveReview,
  isKeyResultCheckInDue,
  isSystemMetricValueReadOnly,
} from './okrPageModel';

assert.deepEqual(
  getVisibleOkrTabs({ canReadTeam: false, canCheckIn: true, canManageCycles: false }).map((item) => item.label),
  ['OKR总览', '我的OKR', '周检视'],
  '普通员工只能看到本人工作所需页签',
);

assert.deepEqual(
  createCurrentQuarterCycleDraft(new Date('2026-08-13T10:00:00+08:00')),
  { name: '2026年第三季度', year: 2026, quarter: 3, startAt: '2026-07-01', endAt: '2026-09-30', checkInWeekday: 5 },
  '新建周期应默认当前季度及起止日期',
);

assert.equal(isKeyResultCheckInDue({ lastCheckInAt: null }, new Date('2026-08-13T10:00:00+08:00')), true);
assert.equal(isKeyResultCheckInDue({ lastCheckInAt: '2026-08-10T10:00:00+08:00' }, new Date('2026-08-13T10:00:00+08:00'), 5), false, '本检视周期已提交的KR不应继续出现在待检视列表');
assert.equal(isKeyResultCheckInDue({ lastCheckInAt: '2026-08-07T23:59:59+08:00' }, new Date('2026-08-13T10:00:00+08:00'), 5), true, '检视日当天的旧记录属于上一周期');
assert.equal(isKeyResultCheckInDue({ lastCheckInAt: '2026-08-08T00:00:00+08:00' }, new Date('2026-08-13T10:00:00+08:00'), 5), false, '周五检视日后一天开始新的检视周期');

assert.equal(isSystemMetricValueReadOnly({ source: 'SYSTEM_METRIC' }), true, '系统指标的当前值必须只读');
assert.equal(isSystemMetricValueReadOnly({ source: 'MANUAL' }), false, '手工KR检视仍可更新当前值');

const objectiveReviews = {
  reviews: [
    { reviewerId: 'owner-1', reviewerType: 'SELF' },
    { reviewerId: 'manager-1', reviewerType: 'MANAGER' },
  ],
} as const;
assert.equal(hasSubmittedObjectiveReview(objectiveReviews, 'owner-1', 'SELF'), true, '已提交负责人自评后不应再提交');
assert.equal(hasSubmittedObjectiveReview(objectiveReviews, 'manager-1', 'MANAGER'), true, '已提交管理者评分后不应再提交');
assert.equal(hasSubmittedObjectiveReview(objectiveReviews, 'manager-2', 'MANAGER'), false, '未提交的有权管理者仍可评分');

assert.deepEqual(
  getAllowedObjectiveScopes({ canCreate: true, canManageDepartment: false, canManageCompany: false }),
  ['INDIVIDUAL'],
  '普通创建者只能创建个人目标',
);
assert.deepEqual(
  getAllowedObjectiveScopes({ canCreate: true, canManageDepartment: true, canManageCompany: false }),
  ['DEPARTMENT', 'INDIVIDUAL'],
  '部门管理员可管理部门与个人目标，不能创建公司目标',
);
assert.deepEqual(
  getAllowedObjectiveScopes({ canCreate: true, canManageDepartment: true, canManageCompany: true }),
  ['COMPANY', 'DEPARTMENT', 'INDIVIDUAL'],
  '只有公司目标管理员能看到公司层级',
);

assert.deepEqual(
  getVisibleOkrTabs({ canReadTeam: true, canCheckIn: true, canManageCycles: false }).map((item) => item.label),
  ['OKR总览', '我的OKR', '团队OKR', '周检视'],
  '团队负责人应看到团队OKR',
);

assert.deepEqual(
  getVisibleOkrTabs({ canReadTeam: true, canCheckIn: true, canManageCycles: true }).map((item) => item.label),
  ['OKR总览', '我的OKR', '团队OKR', '周检视', '周期设置'],
  '周期管理员应看到周期设置',
);

console.log('okr permission tabs test passed');
