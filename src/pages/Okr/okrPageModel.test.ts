import assert from 'node:assert/strict';
import {
  createCurrentQuarterCycleDraft,
  getAllowedObjectiveScopes,
  getWorkbenchPeople,
  hasSubmittedObjectiveReview,
  isKeyResultCheckInDue,
  isSystemMetricValueReadOnly,
} from './okrPageModel';

assert.deepEqual(
  getWorkbenchPeople(
    { id: 'me', name: '我' },
    [{ id: 'me', name: '我' }, { id: 'staff', name: '员工' }],
    false,
  ).map((item) => item.id),
  ['me'],
  '普通员工的目标工作台只显示本人',
);

assert.deepEqual(
  getWorkbenchPeople(
    { id: 'me', name: '我' },
    [{ id: 'staff', name: '员工' }, { id: 'me', name: '我' }],
    true,
  ).map((item) => item.id),
  ['me', 'staff'],
  '团队负责人先显示本人，再显示授权范围内成员',
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

console.log('okr target workbench model test passed');
