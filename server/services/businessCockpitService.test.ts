import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { Commission } from '../../src/types/commission';
import type { FinanceTransaction } from '../../src/types/finance';
import type { Customer } from '../../src/types/customer';
import type { CustomerTodo } from '../../src/types/customerTodo';
import type { Lead } from '../../src/types/lead';
import type { OrderApplication } from '../../src/types/order';
import type { Order } from '../../src/types/order';
import type { RecoveryOrder } from '../../src/types/recoveryOrder';
import type { Refund } from '../../src/types/refund';
import type { AuthenticatedUser } from '../../src/types/auth';
import {
  createBusinessCockpitService,
  resolveBusinessCockpitScopeLabel,
} from './businessCockpitService';

const START_AT = '2026-07-01T00:00:00.000Z';
const END_AT = '2026-07-31T23:59:59.999Z';

const order = (
  id: string,
  salesId: string | undefined,
  salesName: string,
  payments: Order['payments'],
  overrides: Partial<Order> = {},
): Order => ({
  id,
  orderNo: `ORD-${id}`,
  customerId: `customer-${id}`,
  customerName: `客户-${id}`,
  productLevel: '899',
  orderType: '899成交',
  amount: payments.reduce((sum, payment) => sum + payment.amount, 0),
  actualAmount: payments.reduce((sum, payment) => sum + payment.amount, 0),
  paymentMethod: '对公转账',
  status: '已确认',
  refundStatus: '无',
  owner: salesName,
  salesId,
  salesName,
  payments,
  createdAt: '2026-07-01T01:00:00.000Z',
  updatedAt: '2026-07-01T01:00:00.000Z',
  ...overrides,
});

const payment = (id: string, amount: number, paidAt: string): Order['payments'][number] => ({
  id,
  amount,
  paidAt,
  paymentMethod: '对公转账',
});

const recovery = (
  id: string,
  recoveryUserId: string,
  recoveryUserName: string,
  recoveryAmount: number,
  overrides: Partial<RecoveryOrder> = {},
): RecoveryOrder => ({
  id,
  recoveryNo: `RCV-${id}`,
  thirdPartyOrderNo: `THIRD-${id}`,
  customerId: `customer-${id}`,
  customerName: `客户-${id}`,
  customerMatchStatus: '已绑定客户',
  originalProduct: 'IP口播智能体',
  originalAmount: 899,
  recoveryAmount,
  recoveryAt: '2026-07-15T08:00:00.000Z',
  recoveryUserId,
  recoveryUserName,
  status: '审核通过',
  createdBy: recoveryUserId,
  createdByName: recoveryUserName,
  createdAt: '2026-07-20T08:00:00.000Z',
  updatedAt: '2026-07-20T08:00:00.000Z',
  ...overrides,
});

const refund = (
  id: string,
  orderId: string,
  status: Refund['status'],
  refundAmount: number,
  overrides: Partial<Refund> = {},
): Refund => ({
  id,
  refundNo: `REF-${id}`,
  orderId,
  orderNo: `ORD-${orderId}`,
  customerId: `customer-${orderId}`,
  customerName: `客户-${orderId}`,
  productLevel: '899',
  orderAmount: 899,
  refundAmount,
  refundReason: '测试退款',
  refundCategory: '其他',
  status,
  applicantId: 'sales-1',
  applicantName: '销售甲',
  createdAt: '2026-06-01T08:00:00.000Z',
  updatedAt: '2026-07-15T08:00:00.000Z',
  ...overrides,
});

const row = (domain: string, data: { id: string }) => ({
  domain,
  recordId: data.id,
  data,
});

function fakePrisma(
  records: Array<{ domain: string; recordId: string; data: unknown }>,
  customerTodos: CustomerTodo[] = [],
  canonicalLeads?: Lead[],
) {
  const now = new Date('2026-07-01T00:00:00.000Z');
  return {
    businessRecord: {
      findMany: async ({ where }: any = {}) => records.filter((item) => (
        !where?.domain
        || item.domain === where.domain
        || Array.isArray(where.domain?.in) && where.domain.in.includes(item.domain)
      )),
    },
    customerTodo: { findMany: async () => customerTodos },
    leadRecord: {
      findMany: async () => (canonicalLeads || records
        .filter((item) => item.domain === STORAGE_KEYS.LEADS)
        .map((item) => item.data as Lead))
        .map((item) => ({ id: item.id, data: item })),
    },
    user: { findMany: async () => [{
      id: 'admin-1', name: '系统管理员', account: 'admin', email: '', phone: '', role: '超级管理员',
      avatar: null, departmentId: 'department-1', positionId: null, positionName: null, roleId: 'role-admin',
      passwordHash: null, passwordSalt: null, passwordUpdatedAt: null, mustChangePassword: false, lastLoginAt: null,
      isActive: true, employmentStatus: 'active', leftAt: null, leftBy: null, createdAt: now, updatedAt: now,
    }] },
    role: { findMany: async () => [{
      id: 'role-admin', name: '超级管理员', code: 'super_admin', description: null, departmentId: null,
      permissions: [{ module: '全部', actions: ['admin'] }], dataScopes: {}, memberCount: 1, isActive: true,
      createdAt: now, updatedAt: now,
    }] },
    department: { findMany: async () => [{
      id: 'department-1', name: '管理部', code: 'management', description: null, parentId: null, managerId: 'admin-1',
      memberCount: 1, sortOrder: 1, isActive: true, createdAt: now, updatedAt: now,
    }] },
  };
}

const admin: AuthenticatedUser = {
  id: 'admin-1',
  name: '系统管理员',
  account: 'admin',
  email: '',
  phone: '',
  role: '超级管理员',
  roleId: 'role-admin',
  departmentId: 'department-1',
  permissions: [{ module: '全部', actions: ['admin'] }],
  isActive: true,
};

const lead = (id: string, ownerId: string, overrides: Partial<Lead> = {}): Lead => ({
  id,
  name: `线索-${id}`,
  phone: `1380000${id}`,
  source: '官网',
  status: '新线索',
  lifecycleStatusCode: 'pending_followup',
  owner: ownerId === 'sales-1' ? '销售甲' : '销售丙',
  ownerId,
  createdAt: '2026-07-05T08:00:00.000Z',
  updatedAt: '2026-07-05T08:00:00.000Z',
  followUpRecords: [],
  ...overrides,
});

{
  const canonical = lead('canonical-only', 'sales-1', { createdAt: '2026-07-06T08:00:00.000Z' });
  const service = createBusinessCockpitService(fakePrisma([], [], [canonical]) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: true, visibleUserIds: [], visibleUserNames: [] },
  });
  assert.equal(result.data?.followUpHealth.newLeadCount, 1,
    '经营驾驶舱必须从结构化 LeadRecord 读取线索，不能继续依赖旧 BusinessRecord 快照');
}

const customer = (id: string, ownerId: string, overrides: Partial<Customer> = {}): Customer => ({
  id,
  name: `客户-${id}`,
  company: '',
  phone: `1390000${id}`,
  customerLevel: 'L1',
  lifecycleStatusCode: 'pending_followup',
  owner: ownerId === 'sales-1' ? '销售甲' : '销售丙',
  ownerId,
  totalSpent: 0,
  orderCount: 0,
  growthPath: [],
  growthRecords: [],
  activityRecords: [],
  createdAt: '2026-07-05T08:00:00.000Z',
  updatedAt: '2026-07-05T08:00:00.000Z',
  ...overrides,
});

// 历史订单中的失效员工 ID 不能被误判为可下钻的当前销售身份。
{
  const result = await createBusinessCockpitService(fakePrisma([
    row(STORAGE_KEYS.ORDERS, order('stale-sales', 'departed-user', '离职销售', [
      payment('stale-sales-payment', 899, '2026-07-10T08:00:00.000Z'),
    ])),
  ]) as any).get({ preset: 'custom', startDate: '2026-07-01', endDate: '2026-07-31' }, admin);
  assert.deepEqual(result.data?.salesRanking[0], {
    userId: 'unresolved:departed-user', name: '离职销售', amount: 899, count: 1, averageAmount: 899,
    identityStatus: 'unresolved',
  });
}

// 穿透式驾驶舱必须复用已发布 OKR 目标，并按真实组织范围返回部门人数。
{
  const targetPrisma = fakePrisma([
    row(STORAGE_KEYS.ORDERS, order('target-sales', 'sales-1', '销售甲', [
      payment('target-sales-payment', 32980, '2026-07-10T08:00:00.000Z'),
    ])),
  ]) as any;
  const now = new Date('2026-07-01T00:00:00.000Z');
  targetPrisma.user.findMany = async () => [
    {
      id: 'admin-1', name: '系统管理员', account: 'admin', email: '', phone: '', role: '超级管理员',
      avatar: null, departmentId: 'department-1', positionId: null, positionName: null, roleId: 'role-admin',
      passwordHash: null, passwordSalt: null, passwordUpdatedAt: null, mustChangePassword: false, lastLoginAt: null,
      isActive: true, employmentStatus: 'active', leftAt: null, leftBy: null, createdAt: now, updatedAt: now,
    },
    {
      id: 'sales-1', name: '销售甲', account: 'sales-1', email: '', phone: '', role: '销售顾问',
      avatar: null, departmentId: 'department-sales', positionId: null, positionName: '销售顾问', roleId: 'role-sales',
      passwordHash: null, passwordSalt: null, passwordUpdatedAt: null, mustChangePassword: false, lastLoginAt: null,
      isActive: true, employmentStatus: 'active', leftAt: null, leftBy: null, createdAt: now, updatedAt: now,
    },
  ];
  targetPrisma.role.findMany = async () => [
    {
      id: 'role-admin', name: '超级管理员', code: 'super_admin', description: null, departmentId: null,
      permissions: [{ module: '全部', actions: ['admin'] }], dataScopes: {}, memberCount: 1, isActive: true,
      createdAt: now, updatedAt: now,
    },
    {
      id: 'role-sales', name: '销售顾问', code: 'sales', description: null, departmentId: 'department-sales',
      permissions: [{ module: '客户', actions: ['read'] }], dataScopes: { customers: 'self' }, memberCount: 1, isActive: true,
      createdAt: now, updatedAt: now,
    },
  ];
  targetPrisma.department.findMany = async () => [
    {
      id: 'department-1', name: '管理部', code: 'management', description: null, parentId: null,
      managerId: 'admin-1', memberCount: 1, sortOrder: 1, isActive: true, createdAt: now, updatedAt: now,
    },
    {
      id: 'department-sales', name: '销售一部', code: 'sales-1', description: null, parentId: null,
      managerId: 'sales-1', memberCount: 1, sortOrder: 2, isActive: true, createdAt: now, updatedAt: now,
    },
  ];
  let targetQuery: any;
  targetPrisma.keyResult = {
    findMany: async (query: any) => {
      targetQuery = query;
      return [
      { targetValue: 3000000, updatedAt: now, metricBinding: { scopeType: 'COMPANY', scopeId: null } },
      { targetValue: 400000, updatedAt: now, metricBinding: { scopeType: 'USER', scopeId: 'sales-1' } },
      ];
    },
  };
  const result = await createBusinessCockpitService(targetPrisma).get(
    { preset: 'custom', startDate: '2026-07-01', endDate: '2026-07-31' },
    admin,
  );
  assert.equal(result.data?.managementPerformance.targetAmount, 3000000);
  assert.equal(result.data?.managementPerformance.completedAmount, 32980);
  assert.equal(result.data?.managementPerformance.targetSource, 'okr');
  assert.equal(targetQuery?.where?.objective?.cycle?.cycleType, 'MONTH');
  assert.equal(result.data?.salesBattleProfiles.find((item) => item.userId === 'sales-1')?.monthlyTargetAmount, 400000);
  assert.equal(result.data?.departmentStatuses.find((item) => item.id === 'sales')?.memberCount, 1);
  assert.equal(result.data?.departmentStatuses.find((item) => item.id === 'sales')?.available, true);
}

// 驾驶舱权限不能成为绕过客户列表权限的数据旁路。
{
  const restrictedPrisma = fakePrisma([row(STORAGE_KEYS.CUSTOMERS, customer('restricted', 'admin-1', {
    company: '不可见公司', opportunityStageCode: 'proposal', opportunityAmount: 68000,
  }))]) as any;
  const now = new Date('2026-07-01T00:00:00.000Z');
  restrictedPrisma.role.findMany = async () => [{
    id: 'role-cockpit', name: '驾驶舱观察员', code: 'cockpit_viewer', description: null, departmentId: null,
    permissions: [{ module: '驾驶舱', actions: ['read'] }], dataScopes: { customers: 'all' },
    memberCount: 1, isActive: true, createdAt: now, updatedAt: now,
  }];
  const restrictedActor: AuthenticatedUser = {
    ...admin, role: '驾驶舱观察员', roleId: 'role-cockpit',
    permissions: [{ module: '驾驶舱', actions: ['read'] }],
  };
  const result = await createBusinessCockpitService(restrictedPrisma, {
    now: () => new Date('2026-07-22T08:00:00.000Z'),
  }).get({ preset: 'custom', startDate: '2026-07-01', endDate: '2026-07-31' }, restrictedActor);
  assert.deepEqual(result.data?.customerBattles, []);
  assert.deepEqual(result.data?.customerBattleStages, []);
  assert.deepEqual(result.data?.salesBattleProfiles, []);
}

// 老板驾驶舱必须直接给出“客户—责任人—下一步动作”，不能只返回聚合数字。
{
  const battleCustomer = customer('battle', 'sales-1', {
    company: '作战客户公司',
    opportunityStageCode: 'proposal',
    opportunityAmount: 68000,
    activityRecords: [{
      id: 'follow-battle', type: 'follow', title: '确认方案', operator: '销售甲',
      createdAt: '2026-07-20T08:00:00.000Z',
    }],
  });
  const battleTodo = {
    id: 'todo-battle', customerId: battleCustomer.id, customerName: battleCustomer.name,
    title: '确认决策人', status: 'pending', dueAt: '2026-07-21T08:00:00.000Z',
    executionMethod: 'phone', assigneeId: 'sales-1', assigneeName: '销售甲',
    createdById: 'sales-1', createdByName: '销售甲', createdAt: '2026-07-20T08:00:00.000Z',
    updatedAt: '2026-07-20T08:00:00.000Z',
  } as CustomerTodo;
  const result = await createBusinessCockpitService(
    fakePrisma([row(STORAGE_KEYS.CUSTOMERS, battleCustomer)], [battleTodo]) as any,
    { now: () => new Date('2026-07-22T08:00:00.000Z') },
  ).getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: true, visibleUserIds: [], visibleUserNames: [] },
  });

  assert.deepEqual(result.data?.customerBattles[0], {
    customerId: 'battle', customerName: '客户-battle', company: '作战客户公司',
    ownerId: 'sales-1', ownerName: '销售甲', stageCode: 'proposal', stageLabel: '方案报价',
    opportunityAmount: 68000, nextActionTitle: '确认决策人', nextActionDueAt: '2026-07-21T08:00:00.000Z',
    contactGapDays: 2, riskLevel: 'high', riskReason: '下一步动作已逾期',
  });
  assert.deepEqual(result.data?.customerBattleStages, [{
    stageCode: 'proposal', stageLabel: '方案报价', customerCount: 1, opportunityAmount: 68000,
  }]);
}

// 员工作战档案必须同时回答客户盘、今日动作、逾期风险和成交转化。
{
  const activeCustomer = customer('profile-active', 'sales-1', {
    opportunityStageCode: 'proposal', opportunityAmount: 50000,
    activityRecords: [{
      id: 'profile-follow', type: 'follow', title: '跟进客户', operator: '销售甲',
      createdAt: '2026-07-22T01:30:00.000Z',
    }],
  });
  const wonCustomer = customer('profile-won', 'sales-1', {
    opportunityStageCode: 'won', opportunityAmount: 30000,
  });
  const lostCustomer = customer('profile-lost', 'sales-1', {
    opportunityStageCode: 'lost', opportunityAmount: 20000,
  });
  const result = await createBusinessCockpitService(fakePrisma([
    row(STORAGE_KEYS.CUSTOMERS, activeCustomer),
    row(STORAGE_KEYS.CUSTOMERS, wonCustomer),
    row(STORAGE_KEYS.CUSTOMERS, lostCustomer),
  ], [{
    id: 'profile-overdue', customerId: activeCustomer.id, customerName: activeCustomer.name,
    title: '确认预算', status: 'pending', dueAt: '2026-07-22T02:00:00.000Z',
    executionMethod: 'phone', assigneeId: 'sales-1', assigneeName: '销售甲',
    createdById: 'sales-1', createdByName: '销售甲', createdAt: '2026-07-20T08:00:00.000Z',
    updatedAt: '2026-07-20T08:00:00.000Z',
  } as CustomerTodo, {
    id: 'profile-completed', customerId: activeCustomer.id, customerName: activeCustomer.name,
    title: '确认需求', status: 'completed', dueAt: '2026-07-22T01:00:00.000Z',
    executionMethod: 'wechat', assigneeId: 'sales-1', assigneeName: '销售甲',
    createdById: 'sales-1', createdByName: '销售甲', completedAt: '2026-07-22T03:00:00.000Z',
    createdAt: '2026-07-20T08:00:00.000Z', updatedAt: '2026-07-22T03:00:00.000Z',
  } as CustomerTodo, {
    id: 'profile-completed-late', customerId: activeCustomer.id, customerName: activeCustomer.name,
    title: '补做昨日动作', status: 'completed', dueAt: '2026-07-21T01:00:00.000Z',
    executionMethod: 'phone', assigneeId: 'sales-1', assigneeName: '销售甲',
    createdById: 'sales-1', createdByName: '销售甲', completedAt: '2026-07-22T04:00:00.000Z',
    createdAt: '2026-07-20T08:00:00.000Z', updatedAt: '2026-07-22T04:00:00.000Z',
  } as CustomerTodo]) as any, {
    now: () => new Date('2026-07-22T08:00:00.000Z'),
  }).getSnapshot({
    startAt: START_AT, endAt: END_AT,
    visibility: { unrestricted: true, visibleUserIds: [], visibleUserNames: [] },
    rankingUserIdByName: { 销售甲: 'sales-1' },
  });

  const profile = (result.data as any)?.salesBattleProfiles[0];
  assert.deepEqual({ ...profile, priorityCustomers: undefined }, {
    ownerId: 'sales-1', ownerName: '销售甲', customerCount: 3,
    activeOpportunityCount: 1, opportunityAmount: 50000,
    todayDueTodoCount: 2, todayCompletedTodoCount: 2, todayFollowUpCount: 1, overdueCustomerCount: 1,
    wonCount: 1, lostCount: 1, conversionRate: 50,
    riskCustomerCount: 1, missingNextActionCount: 0,
    priorityCustomers: undefined,
  });
  assert.equal(profile.priorityCustomers[0].customerId, 'profile-active');
}

// 零客户、零订单的在职销售也必须进入老板的员工盘点范围。
{
  const directoryPrisma = fakePrisma([]) as any;
  const [baseUsers, baseRoles] = await Promise.all([
    directoryPrisma.user.findMany(), directoryPrisma.role.findMany(),
  ]);
  const now = new Date('2026-07-01T00:00:00.000Z');
  directoryPrisma.user.findMany = async () => [...baseUsers, {
    ...baseUsers[0], id: 'sales-zero', name: '零动作销售', account: 'sales-zero', role: '销售',
    roleId: 'role-sales', departmentId: 'department-1',
  }];
  directoryPrisma.role.findMany = async () => [...baseRoles, {
    id: 'role-sales', name: '销售', code: 'sales', description: null, departmentId: null,
    permissions: [{ module: '线索/线索列表/开始跟进并加入客户', actions: ['read'] }],
    dataScopes: { customers: 'self' }, memberCount: 1, isActive: true, createdAt: now, updatedAt: now,
  }];
  const result = await createBusinessCockpitService(directoryPrisma, {
    now: () => new Date('2026-07-22T08:00:00.000Z'),
  }).get({ preset: 'custom', startDate: '2026-07-01', endDate: '2026-07-31' }, admin);
  const zeroProfile = result.data?.salesBattleProfiles.find((item) => item.userId === 'sales-zero');
  assert.deepEqual(zeroProfile, {
    userId: 'sales-zero', name: '零动作销售', department: '管理部', identityStatus: 'resolved',
    revenueAmount: 0, orderCount: 0, customerCount: 0, activeOpportunityCount: 0,
    opportunityAmount: 0, todayDueTodoCount: 0, todayCompletedTodoCount: 0, todayFollowUpCount: 0,
    overdueCustomerCount: 0, riskCustomerCount: 0, missingNextActionCount: 0,
    wonCount: 0, lostCount: 0, conversionRate: 0,
    monthlyTargetAmount: null, targetGapAmount: null, targetCompletionRate: null,
    priorityCustomers: [],
  });
}

// 有失效结构化 ID 的历史客户不能因姓名相同而归到新的在职员工名下。
{
  const staleOwnerPrisma = fakePrisma([
    row(STORAGE_KEYS.CUSTOMERS, customer('stale-owner', 'departed-sales', {
      owner: '同名销售', opportunityStageCode: 'proposal', opportunityAmount: 10000,
    })),
  ]) as any;
  const [baseUsers, baseRoles] = await Promise.all([
    staleOwnerPrisma.user.findMany(), staleOwnerPrisma.role.findMany(),
  ]);
  const now = new Date('2026-07-01T00:00:00.000Z');
  staleOwnerPrisma.user.findMany = async () => [...baseUsers, {
    ...baseUsers[0], id: 'current-same-name', name: '同名销售', account: 'current-same-name', role: '销售',
    roleId: 'role-sales', departmentId: 'department-1',
  }];
  staleOwnerPrisma.role.findMany = async () => [...baseRoles, {
    id: 'role-sales', name: '销售', code: 'sales', description: null, departmentId: null,
    permissions: [{ module: '线索/线索列表/开始跟进并加入客户', actions: ['read'] }],
    dataScopes: { customers: 'self' }, memberCount: 1, isActive: true, createdAt: now, updatedAt: now,
  }];
  const result = await createBusinessCockpitService(staleOwnerPrisma, {
    now: () => new Date('2026-07-22T08:00:00.000Z'),
  }).get({ preset: 'custom', startDate: '2026-07-01', endDate: '2026-07-31' }, admin);
  assert.equal(result.data?.salesBattleProfiles.find((item) => item.userId === 'unresolved:departed-sales')?.customerCount, 1);
  assert.equal(result.data?.salesBattleProfiles.find((item) => item.userId === 'unresolved:departed-sales')?.identityStatus, 'unresolved');
  assert.equal(result.data?.salesBattleProfiles.find((item) => item.userId === 'current-same-name')?.customerCount, 0);
}

// 同一在职销售的旧姓名客户与新 ID 客户必须合并为一份档案。
{
  const mergeIdentityPrisma = fakePrisma([
    row(STORAGE_KEYS.CUSTOMERS, customer('merge-id', 'sales-merge', {
      owner: '合并销售', opportunityStageCode: 'proposal', opportunityAmount: 10000,
    })),
    row(STORAGE_KEYS.CUSTOMERS, customer('merge-name', 'legacy-placeholder', {
      owner: '合并销售', ownerId: undefined, ownerIdentityStatus: 'unresolved',
      opportunityStageCode: 'needs_discovery', opportunityAmount: 20000,
    })),
  ]) as any;
  const baseUsers = await mergeIdentityPrisma.user.findMany();
  mergeIdentityPrisma.user.findMany = async () => [...baseUsers, {
    ...baseUsers[0], id: 'sales-merge', name: '合并销售', account: 'sales-merge',
  }];
  const result = await createBusinessCockpitService(mergeIdentityPrisma, {
    now: () => new Date('2026-07-22T08:00:00.000Z'),
  }).get({ preset: 'custom', startDate: '2026-07-01', endDate: '2026-07-31' }, admin);
  const profiles = result.data?.salesBattleProfiles.filter((item) => item.userId === 'sales-merge') || [];
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].customerCount, 2);
  assert.equal(profiles[0].activeOpportunityCount, 2);
  assert.equal(profiles[0].opportunityAmount, 30000);
}

const application = (
  id: string,
  status: OrderApplication['status'],
  applicantId = 'sales-1',
  overrides: Partial<OrderApplication> = {},
): OrderApplication => ({
  id,
  applicationNo: `OAPP-${id}`,
  status,
  orderData: order(`draft-${id}`, applicantId, applicantId === 'sales-1' ? '销售甲' : '销售丙', []),
  applicantId,
  applicantName: applicantId === 'sales-1' ? '销售甲' : '销售丙',
  submittedAt: '2026-06-20T08:00:00.000Z',
  reviewLogs: [],
  createdAt: '2026-06-20T08:00:00.000Z',
  updatedAt: '2026-06-20T08:00:00.000Z',
  ...overrides,
});

const todo = (
  id: string,
  customerId: string,
  status: CustomerTodo['status'],
  dueAt: string,
  assigneeId = 'sales-1',
  overrides: Partial<CustomerTodo> = {},
): CustomerTodo => ({
  id,
  customerId,
  customerName: `客户-${customerId}`,
  title: `待办-${id}`,
  status,
  dueAt,
  executionMethod: 'phone',
  assigneeId,
  assigneeName: assigneeId === 'sales-1' ? '销售甲' : '销售丙',
  createdById: 'manager-1',
  createdByName: '销售经理',
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-01T08:00:00.000Z',
  ...overrides,
});

const commission = (id: string, status: Commission['status'], overrides: Partial<Commission> = {}): Commission => ({
  id,
  orderId: 'finance-order',
  orderNo: 'ORD-finance-order',
  customerName: '财务客户',
  productLevel: '899',
  orderAmount: 300,
  commissionRate: 0.1,
  commissionAmount: 30,
  payoutPlanId: 'plan-sales',
  payoutPlanName: '销售方案',
  role: '销售',
  owner: '销售甲',
  ownerId: 'sales-1',
  department: '销售部',
  paymentDate: '2026-07-10T08:00:00.000Z',
  status,
  createdAt: '2026-07-10T08:00:00.000Z',
  updatedAt: '2026-07-10T08:00:00.000Z',
  ...overrides,
});

const financeTransaction = (
  id: string,
  direction: FinanceTransaction['direction'],
  sourceType: FinanceTransaction['sourceType'],
  amount: number,
  sourceId = 'finance-order',
  overrides: Partial<FinanceTransaction> = {},
): FinanceTransaction => {
  const sourceEventId = String(overrides.sourceEventId || id);
  const recordId = `${sourceType}:${sourceEventId}`;
  return {
    transactionNo: `FT-${id}`,
    type: sourceType === 'order_payment' ? '订单实收' : '订单实收冲正',
    direction,
    sourceType,
    sourceDomain: STORAGE_KEYS.ORDERS,
    sourceId,
    sourceModule: '订单',
    amount,
    status: '已确认',
    relatedBusiness: `ORD-${sourceId}`,
    orderId: sourceId,
    orderNo: `ORD-${sourceId}`,
    occurredAt: '2026-07-20T08:00:00.000Z',
    createdAt: '2026-07-20T08:00:00.000Z',
    ...overrides,
    id: recordId,
    sourceEventId,
  };
};

{
  const allScope = {
    unrestricted: true,
    dataScopeLevel: 'all' as const,
    visibleUserIds: [],
    visibleUserNames: [],
    canViewPublicPool: true,
  };
  const selfScope = {
    unrestricted: false,
    dataScopeLevel: 'self' as const,
    visibleUserIds: ['sales-1'],
    visibleUserNames: ['销售甲'],
    canViewPublicPool: false,
  };
  assert.equal(resolveBusinessCockpitScopeLabel({
    orders: allScope,
    recoveryOrders: allScope,
    leads: allScope,
    customers: allScope,
    orderApplications: allScope,
  }), '全公司');
  assert.equal(resolveBusinessCockpitScopeLabel({
    orders: allScope,
    recoveryOrders: selfScope,
    leads: selfScope,
    customers: selfScope,
    orderApplications: selfScope,
  }), '按业务权限范围', '各业务域范围不一致时不得只按订单权限误标为全公司');
  assert.equal(resolveBusinessCockpitScopeLabel({
    orders: selfScope,
    recoveryOrders: selfScope,
    leads: selfScope,
    customers: { ...selfScope, canViewPublicPool: true },
    orderApplications: selfScope,
  }), '按业务权限范围', '客户范围额外包含公司公海时不得误标为我的数据');
}

{
  const records = [
    row(STORAGE_KEYS.ORDERS, order('split-payment', 'sales-1', '销售甲', [
      payment('outside', 100, '2026-06-30T23:59:59.999Z'),
      payment('july-a', 300, '2026-07-10T08:00:00.000Z'),
      payment('july-b', 200, '2026-07-20T08:00:00.000Z'),
    ])),
    row(STORAGE_KEYS.ORDERS, order('renamed-sales', 'sales-1', '销售甲（新名）', [
      payment('july-c', 400, '2026-07-12T08:00:00.000Z'),
    ])),
    row(STORAGE_KEYS.ORDERS, order('same-name-other-id', 'sales-2', '销售甲', [
      payment('july-d', 250, '2026-07-18T08:00:00.000Z'),
    ])),
    row(STORAGE_KEYS.ORDERS, order('legacy-owner', undefined, '销售乙', [
      payment('july-e', 100, '2026-07-19T08:00:00.000Z'),
    ])),
    row(STORAGE_KEYS.ORDERS, order('deleted', 'sales-1', '销售甲', [
      payment('deleted-payment', 999, '2026-07-15T08:00:00.000Z'),
    ], { deletedAt: '2026-07-20T08:00:00.000Z' })),
    row(STORAGE_KEYS.RECOVERY_ORDERS, recovery('valid-a', 'recovery-1', '售后组', 599)),
    row(STORAGE_KEYS.RECOVERY_ORDERS, recovery('valid-b', 'recovery-2', '售后组', 450)),
    row(STORAGE_KEYS.RECOVERY_ORDERS, recovery('pending', 'recovery-1', '售后组', 999, { status: '待审核' })),
    row(STORAGE_KEYS.RECOVERY_ORDERS, recovery('deleted-recovery', 'recovery-1', '售后组', 999, { deletedAt: '2026-07-21T08:00:00.000Z' })),
    row(STORAGE_KEYS.RECOVERY_ORDERS, recovery('outside-recovery', 'recovery-1', '售后组', 999, { recoveryAt: '2026-06-30T23:59:59.999Z' })),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: true, visibleUserIds: [], visibleUserNames: [] },
  });

  assert.equal(result.code, 0);
  assert.deepEqual(result.data?.business, {
    formalOrderPaidAmount: 1250,
    formalOrderCount: 4,
    formalPaymentCount: 5,
    recoveryBusinessAmount: 1049,
    recoveryOrderCount: 2,
  });
  assert.deepEqual(result.data?.salesRanking.map((item) => ({
    key: item.userId || item.name,
    amount: item.amount,
    orderCount: item.orderCount,
    paymentCount: item.paymentCount,
  })), [
    { key: 'sales-1', amount: 900, orderCount: 2, paymentCount: 3 },
    { key: 'sales-2', amount: 250, orderCount: 1, paymentCount: 1 },
    { key: '销售乙', amount: 100, orderCount: 1, paymentCount: 1 },
  ], '销售排行必须按稳定人员 ID 聚合，分期付款只计入区间内的款项');
  assert.deepEqual(result.data?.recoveryRanking.map((item) => ({
    key: item.userId,
    amount: item.amount,
    orderCount: item.orderCount,
  })), [
    { key: 'recovery-1', amount: 599, orderCount: 1 },
    { key: 'recovery-2', amount: 450, orderCount: 1 },
  ], '售后同名人员不得合并，非审核通过或已删除记录不得计入');
  assert.equal(result.data?.dataQuality.missingSalesIdentityPaymentCount, 1);
}

{
  const currentOrder = order('finance-order', 'sales-1', '销售甲', [
    payment('finance-payment', 300, '2026-07-10T08:00:00.000Z'),
  ]);
  const hiddenOrder = order('hidden-order', 'sales-2', '销售丙', [
    payment('hidden-payment', 800, '2026-07-10T08:00:00.000Z'),
  ]);
  const records = [
    row(STORAGE_KEYS.ORDERS, currentOrder),
    row(STORAGE_KEYS.ORDERS, hiddenOrder),
    row(STORAGE_KEYS.COMMISSIONS, commission('round-1-paid', '已发放', {
      settlementVersion: 1,
      commissionAmount: 100,
    })),
    row(STORAGE_KEYS.COMMISSIONS, commission('round-2-pending', '待发放', {
      settlementVersion: 2,
      commissionAmount: 120,
    })),
    row(STORAGE_KEYS.COMMISSIONS, commission('pending-confirm', '待确认', {
      orderId: 'another-order',
      orderNo: 'ORD-another-order',
      commissionAmount: 50,
    })),
    row(STORAGE_KEYS.COMMISSIONS, commission('hidden-commission', '待发放', {
      orderId: 'hidden-order',
      orderNo: 'ORD-hidden-order',
      ownerId: 'sales-2',
      owner: '销售丙',
      commissionAmount: 999,
    })),
    row(STORAGE_KEYS.COMMISSIONS, commission('visible-source-other-payee', '待发放', {
      orderId: 'finance-order',
      orderNo: 'ORD-finance-order',
      settlementVersion: 2,
      ownerId: 'sales-2',
      owner: '销售丙',
      role: '协助人',
      commissionAmount: 40,
    })),
    row(STORAGE_KEYS.COMMISSIONS, commission('hidden-source-visible-payee', '待发放', {
      orderId: 'hidden-order',
      orderNo: 'ORD-hidden-order',
      ownerId: 'sales-1',
      owner: '销售甲',
      role: '协助人',
      commissionAmount: 888,
    })),
    row(STORAGE_KEYS.RECOVERY_ORDERS, recovery('june-recovery-source', 'sales-1', '销售甲', 599, {
      recoveryAt: '2026-06-20T08:00:00.000Z',
    })),
    row(STORAGE_KEYS.COMMISSIONS, commission('misdated-recovery-commission', '待发放', {
      orderId: 'june-recovery-source',
      orderNo: 'RCV-june-recovery-source',
      sourceRecoveryOrderId: 'june-recovery-source',
      sourceBusinessType: 'after_sales_recovery',
      paymentDate: '2026-07-10T08:00:00.000Z',
      commissionAmount: 333,
    })),
    row(STORAGE_KEYS.FINANCE_TRANSACTIONS, financeTransaction('income-visible', 'income', 'order_payment', 300, 'finance-order', {
      sourceEventId: 'finance-order:finance-payment',
      occurredAt: '2026-07-10T08:00:00.000Z',
    })),
    row(STORAGE_KEYS.FINANCE_TRANSACTIONS, financeTransaction('adjust-visible', 'expense', 'order_payment_adjustment', 50, 'finance-order', {
      reversalOfId: 'order_payment:finance-order:finance-payment',
      sourceEventId: 'finance-order:finance-payment:250',
    })),
    row(STORAGE_KEYS.FINANCE_TRANSACTIONS, financeTransaction('income-hidden', 'income', 'order_payment', 800, 'hidden-order')),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: false, visibleUserIds: ['sales-1'], visibleUserNames: ['销售甲'] },
  });

  assert.equal(result.code, 0);
  assert.deepEqual(result.data?.commissionHealth, {
    currentCommissionCount: 3,
    pendingHandlingCount: 0,
    pendingConfirmAmount: 50,
    pendingPayAmount: 160,
    paidAmount: 0,
  }, '提成健康按源订单范围统计；可见业务的协助提成应计入，不可见业务即使领取人可见也不得计入');
  assert.deepEqual(result.data?.financeHealth, {
    formalOrderIncomeAmount: 300,
    formalOrderAdjustmentAmount: 50,
    formalOrderNetReceiptAmount: 250,
    transactionCount: 2,
    reconciliationIssueCount: 1,
    reconciliationAmountIssueCount: 1,
    reconciliationBusinessTimeIssueCount: 0,
    reconciliationDifferenceAmount: 50,
    reconciliationOrderIds: ['finance-order'],
  }, '财务净实收只按可见订单的真实资金流水计算');
}

{
  const crossPeriodOrder = order('cross-period-correction', 'sales-1', '销售甲', [
    payment('cross-period-payment', 250, '2026-06-10T08:00:00.000Z'),
  ]);
  const records = [
    row(STORAGE_KEYS.ORDERS, crossPeriodOrder),
    row(STORAGE_KEYS.FINANCE_TRANSACTIONS, financeTransaction(
      'cross-period-income', 'income', 'order_payment', 300, crossPeriodOrder.id,
      {
        sourceEventId: `${crossPeriodOrder.id}:cross-period-payment`,
        occurredAt: '2026-06-10T08:00:00.000Z',
      },
    )),
    row(STORAGE_KEYS.FINANCE_TRANSACTIONS, financeTransaction(
      'cross-period-adjustment', 'expense', 'order_payment_adjustment', 50, crossPeriodOrder.id,
      {
        reversalOfId: 'order_payment:cross-period-correction:cross-period-payment',
        sourceEventId: `${crossPeriodOrder.id}:cross-period-payment:250`,
        occurredAt: '2026-07-15T08:00:00.000Z',
      },
    )),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: true, visibleUserIds: [], visibleUserNames: [] },
  });

  assert.equal(result.data?.financeHealth.formalOrderNetReceiptAmount, -50);
  assert.equal(result.data?.financeHealth.reconciliationIssueCount, 0,
    '跨月冲正后的全链路净额与当前付款一致时，不得在冲正月份误报对账差异');
}

{
  const wrongTimeOrder = order('wrong-ledger-time', 'sales-1', '销售甲', [
    payment('wrong-time-payment', 2220, '2026-06-30T15:00:27.000Z'),
  ]);
  const records = [
    row(STORAGE_KEYS.ORDERS, wrongTimeOrder),
    row(STORAGE_KEYS.FINANCE_TRANSACTIONS, financeTransaction(
      'wrong-time-income', 'income', 'order_payment', 2220, wrongTimeOrder.id,
      {
        sourceEventId: `${wrongTimeOrder.id}:wrong-time-payment`,
        occurredAt: '2026-07-30T15:00:27.000Z',
      },
    )),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: true, visibleUserIds: [], visibleUserNames: [] },
  });

  assert.deepEqual({
    issues: result.data?.financeHealth.reconciliationIssueCount,
    amountIssues: result.data?.financeHealth.reconciliationAmountIssueCount,
    timeIssues: result.data?.financeHealth.reconciliationBusinessTimeIssueCount,
    difference: result.data?.financeHealth.reconciliationDifferenceAmount,
  }, { issues: 1, amountIssues: 0, timeIssues: 1, difference: 0 },
  '付款金额一致但资金流水业务时间跨月时仍必须暴露');
}

{
  const mislinkedOrder = order('mislinked-payments', 'sales-1', '销售甲', [
    payment('payment-a', 100, '2026-07-10T08:00:00.000Z'),
    payment('payment-b', 100, '2026-07-11T08:00:00.000Z'),
  ]);
  const records = [
    row(STORAGE_KEYS.ORDERS, mislinkedOrder),
    row(STORAGE_KEYS.FINANCE_TRANSACTIONS, financeTransaction(
      'mislinked-income', 'income', 'order_payment', 200, mislinkedOrder.id,
      {
        sourceEventId: `${mislinkedOrder.id}:payment-a`,
        occurredAt: '2026-07-10T08:00:00.000Z',
      },
    )),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: true, visibleUserIds: [], visibleUserNames: [] },
  });

  assert.deepEqual({
    issues: result.data?.financeHealth.reconciliationIssueCount,
    amountIssues: result.data?.financeHealth.reconciliationAmountIssueCount,
    difference: result.data?.financeHealth.reconciliationDifferenceAmount,
    orderIds: result.data?.financeHealth.reconciliationOrderIds,
  }, { issues: 1, amountIssues: 1, difference: 200, orderIds: [mislinkedOrder.id] },
  '同一订单内一笔流水多记、另一笔缺失时不得用整单总额抵消异常');
}

{
  const duplicatePaymentIdOrder = order('duplicate-payment-id', 'sales-1', '销售甲', [
    payment('same-payment', 100, '2026-07-10T08:00:00.000Z'),
    payment('same-payment', 100, '2026-07-11T08:00:00.000Z'),
  ]);
  const records = [
    row(STORAGE_KEYS.ORDERS, duplicatePaymentIdOrder),
    row(STORAGE_KEYS.FINANCE_TRANSACTIONS, financeTransaction(
      'single-shared-income', 'income', 'order_payment', 100, duplicatePaymentIdOrder.id,
      {
        sourceEventId: `${duplicatePaymentIdOrder.id}:same-payment`,
        occurredAt: '2026-07-10T08:00:00.000Z',
      },
    )),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: true, visibleUserIds: [], visibleUserNames: [] },
  });

  assert.deepEqual({
    issues: result.data?.financeHealth.reconciliationIssueCount,
    amountIssues: result.data?.financeHealth.reconciliationAmountIssueCount,
    difference: result.data?.financeHealth.reconciliationDifferenceAmount,
  }, { issues: 1, amountIssues: 1, difference: 100 },
  '同一条原实收流水只能匹配一笔付款，重复付款 ID 不得复用证据');
}

{
  const records = [
    row(STORAGE_KEYS.LEADS, lead('new-followed', 'sales-1', {
      followUpRecords: [{
        id: 'follow-new', leadId: 'new-followed', type: '电话', content: '已联系', createdBy: '销售甲',
        createdAt: '2026-07-06T08:00:00.000Z',
      }],
    })),
    row(STORAGE_KEYS.LEADS, lead('old-followed', 'sales-1', {
      lifecycleStatusCode: 'following',
      createdAt: '2026-06-01T08:00:00.000Z',
      followUpRecords: [{
        id: 'follow-old', leadId: 'old-followed', type: '微信', content: '已发方案', createdBy: '销售甲',
        createdAt: '2026-07-08T08:00:00.000Z',
      }],
    })),
    row(STORAGE_KEYS.LEADS, lead('hidden', 'sales-2', {
      followUpRecords: [{
        id: 'follow-hidden', leadId: 'hidden', type: '电话', content: '不可见', createdBy: '销售丙',
        createdAt: '2026-07-08T08:00:00.000Z',
      }],
    })),
    row(STORAGE_KEYS.CUSTOMERS, customer('visible-followed', 'sales-1', {
      leadSource: '官网',
      lifecycleStatusCode: 'following',
      activityRecords: [
        {
          id: 'activity-convert', type: 'create', title: '线索转为客户', operator: '销售甲',
          relatedType: 'lead', relatedId: 'new-followed', createdAt: '2026-07-05T08:00:00.000Z',
        },
        {
          id: 'activity-follow', type: 'follow', title: '跟进客户', operator: '销售甲', createdAt: '2026-07-09T08:00:00.000Z',
        },
      ],
    })),
    row(STORAGE_KEYS.CUSTOMERS, customer('visible-pending', 'sales-1', {
      activityRecords: [
        {
          id: 'activity-import', type: 'create', title: '导入至公海池', operator: '系统管理员',
          createdAt: '2026-07-06T08:00:00.000Z',
        },
        {
          id: 'activity-history-follow', type: 'follow', title: '历史最后跟进记录', operator: '系统管理员',
          createdAt: '2026-07-06T08:00:00.000Z',
        },
      ],
    })),
    row(STORAGE_KEYS.CUSTOMERS, customer('hidden-customer', 'sales-2', {
      activityRecords: [{
        id: 'hidden-activity', type: 'follow', title: '不可见', operator: '销售丙', createdAt: '2026-07-09T08:00:00.000Z',
      }],
    })),
    row(STORAGE_KEYS.CUSTOMERS, customer('merged-customer', 'sales-1', {
      mergedIntoId: 'visible-followed',
      activityRecords: [
        {
          id: 'merged-convert', type: 'create', title: '线索转为客户', operator: '销售甲',
          relatedType: 'lead', relatedId: 'merged-lead', createdAt: '2026-07-05T08:00:00.000Z',
        },
        {
          id: 'merged-follow', type: 'follow', title: '跟进客户', operator: '销售甲',
          createdAt: '2026-07-09T08:00:00.000Z',
        },
      ],
    })),
    row(STORAGE_KEYS.ORDER_APPLICATIONS, application('pending', '待财务审核')),
    row(STORAGE_KEYS.ORDER_APPLICATIONS, application('returned', '退回修改')),
    row(STORAGE_KEYS.ORDER_APPLICATIONS, application('approved', '已入库', 'sales-1', {
      reviewedAt: '2026-07-10T08:00:00.000Z',
    })),
    row(STORAGE_KEYS.ORDER_APPLICATIONS, application('hidden-application', '待财务审核', 'sales-2')),
    row(STORAGE_KEYS.ORDER_APPLICATIONS, application('cleaned', '待财务审核', 'sales-1', {
      reviewCleanedAt: '2026-07-11T08:00:00.000Z',
    })),
    row(STORAGE_KEYS.ORDERS, order('pending-settlement', 'sales-1', '销售甲', [], {
      settlementStatus: '待处理',
    })),
  ];
  const todos = [
    todo('overdue', 'visible-followed', 'pending', '2026-07-15T08:00:00.000Z'),
    todo('future', 'visible-pending', 'pending', '2026-08-05T08:00:00.000Z'),
    todo('completed', 'visible-followed', 'completed', '2026-07-10T08:00:00.000Z', 'sales-1', {
      completedAt: '2026-07-12T08:00:00.000Z',
    }),
    todo('hidden', 'hidden-customer', 'pending', '2026-07-15T08:00:00.000Z', 'sales-2'),
  ];
  const service = createBusinessCockpitService(fakePrisma(records, todos) as any, {
    now: () => new Date('2026-07-31T12:00:00.000Z'),
  });
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: false, visibleUserIds: ['sales-1'], visibleUserNames: ['销售甲'] },
  });

  assert.deepEqual(result.data?.followUpHealth, {
    newLeadCount: 1,
    followedLeadCount: 2,
    pendingLeadCount: 1,
    followingLeadCount: 1,
    newCustomerCount: 1,
    followedCustomerCount: 1,
    pendingFollowUpCustomerCount: 1,
    followingCustomerCount: 1,
    pendingCustomerTodoCount: 2,
    overdueCustomerTodoCount: 1,
    completedCustomerTodoCount: 1,
  });
  assert.deepEqual(result.data?.leadSources, [{ source: '官网', leadCount: 1, followedCount: 1, followRate: 100, convertedCustomerCount: 1, receiptAmount: 0 }],
    '来源效果必须按当前期间新增线索统计，并沿用同一数据权限');
  assert.deepEqual(result.data?.orderHealth, {
    pendingReviewApplicationCount: 1,
    returnedApplicationCount: 1,
    approvedApplicationCount: 1,
    pendingSettlementOrderCount: 1,
    paymentlessConfirmedOrderCount: 1,
  });
}

{
  const records = [
    row(STORAGE_KEYS.ORDERS, order('pending-settlement-risk', 'sales-1', '销售甲', [], {
      settlementStatus: '待处理',
    })),
    row(STORAGE_KEYS.COMMISSIONS, commission('period-pending-pay', '待发放', {
      commissionAmount: 120,
    })),
    row(STORAGE_KEYS.ORDERS, order('pending-handling-order', 'sales-1', '销售甲', [])),
    row(STORAGE_KEYS.COMMISSIONS, commission('period-pending-handling', '待确认', {
      orderId: 'pending-handling-order',
      orderNo: 'ORD-pending-handling-order',
      owner: '待分配',
      ownerId: undefined,
      commissionAmount: 0,
    })),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any, {
    now: () => new Date('2026-07-31T12:00:00.000Z'),
  });
  const result = await service.get({
    preset: 'custom',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
  }, admin);

  assert.ok(result.data?.riskTasks.some((item) => item.title === '待处理订单分账'));
  assert.ok(!result.data?.riskTasks.some((item) => item.title.includes('待分账')));
  assert.ok(!result.data?.riskTasks.some((item) => item.id === 'commission-pending-handling'),
    '按月统计的提成健康不能伪装成跨月发放待办');
  assert.equal(result.data?.financeHealth.pendingHandlingCommissionCount, 1,
    '规则未解决的本期待处理提成仍须进入财务健康展示');
}

{
  const records = [
    row(STORAGE_KEYS.ORDERS, order('period-comparison', 'sales-1', '销售甲', [
      payment('previous-payment', 500, '2026-07-20T08:00:00.000Z'),
      payment('current-payment', 900, '2026-08-10T08:00:00.000Z'),
    ])),
  ];
  const prisma = fakePrisma(records) as any;
  let businessRecordReads = 0;
  const findMany = prisma.businessRecord.findMany;
  prisma.businessRecord.findMany = async (...args: any[]) => { businessRecordReads += 1; return findMany(...args); };
  const service = createBusinessCockpitService(prisma, {
    now: () => new Date('2026-08-14T12:00:00.000Z'),
  });
  const result = await service.get({
    preset: 'custom', startDate: '2026-08-01', endDate: '2026-08-14',
  }, admin);

  assert.equal(result.data?.comparison.label, '上期同期');
  assert.equal(result.data?.comparison.summary.formalReceiptAmount, 500,
    '老板驾驶舱必须用等长上一周期对比，不能拿半个月和完整月份比较');
  assert.equal(result.data?.summary.formalReceiptAmount, 900);
  assert.equal(businessRecordReads, 1, '本期与上期同期必须复用一次源数据读取，不能双倍扫描业务表');
}

{
  const records = [
    row(STORAGE_KEYS.ORDERS, order('refund-order', 'sales-1', '销售甲', [
      payment('old-payment', 899, '2026-06-01T08:00:00.000Z'),
    ])),
    row(STORAGE_KEYS.REFUNDS, refund('completed-in-range', 'refund-order', '退款已完成', 300, {
      refundedAt: '2026-07-12T08:00:00.000Z',
    })),
    row(STORAGE_KEYS.REFUNDS, refund('completed-outside', 'refund-order', '退款已完成', 200, {
      refundedAt: '2026-06-12T08:00:00.000Z',
    })),
    row(STORAGE_KEYS.REFUNDS, refund('active', 'refund-order', '挽回中', 399)),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: true, visibleUserIds: [], visibleUserNames: [] },
  });

  assert.deepEqual(result.data?.refundHealth, {
    refundingOrderCount: 1,
    refundedOrderCount: 1,
    refundAmount: 300,
  }, '退款处理中展示当前存量，已退款笔数和金额必须按真实退款时间归属统计周期');
}

{
  const records = [
    row(STORAGE_KEYS.CUSTOMERS, customer('public-pool', 'sales-2', {
      owner: '公海',
      ownerId: undefined,
      ownerIdentityStatus: 'public_pool',
      lifecycleStatusCode: 'public_pool',
      activityRecords: [{
        id: 'public-follow', type: 'follow', title: '跟进客户', operator: '销售丙',
        createdAt: '2026-07-08T08:00:00.000Z',
      }],
    })),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: false, visibleUserIds: [], visibleUserNames: [], canViewPublicPool: true },
  });

  assert.equal(result.data?.followUpHealth.followedCustomerCount, 1, '拥有公海查看范围时驾驶舱必须计入公海客户的真实跟进');
  assert.equal(result.data?.followUpHealth.newCustomerCount, 0, '公海客户导入或创建时间不得伪装成线索转客时间');
}

{
  const records = [
    row(STORAGE_KEYS.ORDERS, order('public-contract', 'sales-1', '销售甲', [
      payment('public-payment', 899, '2026-07-15T08:00:00.000Z'),
    ])),
    row(STORAGE_KEYS.RECOVERY_ORDERS, recovery('public-recovery', 'recovery-1', '售后甲', 599)),
    row(STORAGE_KEYS.FINANCE_TRANSACTIONS, financeTransaction('public-income', 'income', 'order_payment', 899, 'public-contract', {
      sourceEventId: 'public-contract:public-payment',
      occurredAt: '2026-07-15T08:00:00.000Z',
    })),
    row(STORAGE_KEYS.FINANCE_TRANSACTIONS, financeTransaction('public-adjustment', 'expense', 'order_payment_adjustment', 99, 'public-contract', {
      reversalOfId: 'order_payment:public-contract:public-payment',
      sourceEventId: 'public-contract:public-payment:800',
    })),
  ];
  const cockpitPrisma = fakePrisma(records) as any;
  const baseUsers = await cockpitPrisma.user.findMany();
  cockpitPrisma.user.findMany = async () => [...baseUsers, {
    ...baseUsers[0], id: 'sales-1', name: '销售甲', account: 'sales-1', role: '销售', departmentId: null,
  }];
  const service = createBusinessCockpitService(cockpitPrisma, {
    now: () => new Date('2026-07-31T12:00:00.000Z'),
  });
  const result = await service.get({
    preset: 'custom',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
  }, admin);

  assert.equal(result.code, 0);
  assert.equal(result.data?.rangeLabel, '2026-07-01 至 2026-07-31');
  assert.equal(result.data?.scopeLabel, '全公司');
  assert.deepEqual(result.data?.summary, {
    formalReceiptAmount: 899,
    recoveryAmount: 599,
    operatingAmount: 1498,
    formalOrderCount: 1,
    recoveryOrderCount: 1,
    newLeadCount: 0,
    newCustomerCount: 0,
  });
  assert.deepEqual(result.data?.salesRanking[0], {
    userId: 'sales-1',
    name: '销售甲',
    amount: 899,
    count: 1,
    averageAmount: 899,
    identityStatus: 'resolved',
  });
  assert.equal(result.data?.trend.reduce((sum, point) => sum + point.formalReceiptAmount, 0), 899);
  assert.equal(result.data?.trend.reduce((sum, point) => sum + point.recoveryAmount, 0), 599);
  assert.deepEqual(result.data?.financeHealth, {
    formalGrossReceiptAmount: 899,
    formalAdjustmentAmount: -99,
    formalNetReceiptAmount: 800,
    reconciliationIssueCount: 1,
    reconciliationAmountIssueCount: 1,
    reconciliationBusinessTimeIssueCount: 0,
    reconciliationDifferenceAmount: 99,
    reconciliationOrderIds: ['public-contract'],
    reconciliationDetailsRestricted: false,
    pendingHandlingCommissionCount: 0,
    pendingConfirmCommissionAmount: 0,
    pendingPayCommissionAmount: 0,
    paidCommissionAmount: 0,
  });
  assert.ok(result.data?.riskTasks.some((item) => (
    item.id === 'finance-reconciliation'
    && item.count === 1
    && item.amount === 99
    && item.path.includes('tab=flow')
    && item.path.includes('orderIds=public-contract')
    && item.path.includes('reconciliationTotal=1')
    && !item.path.includes('type=')
    && !item.path.includes('startDate=')
  )), '订单实付与资金流水不一致时必须进入驾驶舱风险工作台');
}

{
  const restrictedActor: AuthenticatedUser = {
    ...admin,
    role: '财务专员',
    roleId: undefined,
    permissions: [],
  };
  const records = [
    row(STORAGE_KEYS.ORDERS, order('restricted-evidence', 'admin-1', '系统管理员', [
      payment('restricted-payment', 899, '2026-07-15T08:00:00.000Z'),
    ])),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any, {
    now: () => new Date('2026-07-31T12:00:00.000Z'),
  });
  const result = await service.get({
    preset: 'custom', startDate: '2026-07-01', endDate: '2026-07-31',
  }, restrictedActor);
  const financeHealth = result.data?.financeHealth;
  const risk = result.data?.riskTasks.find((item) => item.id === 'finance-reconciliation');

  assert.equal(financeHealth?.reconciliationIssueCount, 1);
  assert.equal(financeHealth?.reconciliationDetailsRestricted, true);
  assert.equal(financeHealth?.reconciliationAmountIssueCount, 0);
  assert.equal(financeHealth?.reconciliationBusinessTimeIssueCount, 0);
  assert.equal(financeHealth?.reconciliationDifferenceAmount, 0);
  assert.deepEqual(financeHealth?.reconciliationOrderIds, []);
  assert.equal(risk?.amount, undefined);
  assert.ok(!risk?.path.includes('orderIds=') && !risk?.path.includes('reconciliation='),
    '非超级管理员下钻不得携带异常订单 ID 或证据视图参数');
  assert.match(risk?.description || '', /仅超级管理员可查看/);
}

{
  const visible = order('visible-kpi', 'sales-1', '销售甲', [
    payment('visible-payment', 100, '2026-07-15T08:00:00.000Z'),
  ]);
  const records = [
    row(STORAGE_KEYS.ORDERS, visible),
    row(STORAGE_KEYS.ORDERS, order('hidden-kpi', 'sales-2', '销售丙', [])),
    row(STORAGE_KEYS.FINANCE_TRANSACTIONS, financeTransaction(
      'hidden-mislinked-income', 'income', 'order_payment', 999, 'hidden-kpi', {
        sourceEventId: `${visible.id}:visible-payment`,
      },
    )),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: false, visibleUserIds: ['sales-1'], visibleUserNames: ['销售甲'] },
  });

  assert.equal(result.data?.financeHealth.formalOrderIncomeAmount, 0,
    '隐藏订单的损坏流水即使伪造可见付款事件，也不得污染受限用户的经营 KPI');
  assert.equal(result.data?.financeHealth.formalOrderNetReceiptAmount, 0);
  assert.equal(result.data?.financeHealth.reconciliationIssueCount, 1,
    '可疑事件关联仍须进入异常检测，但不得泄露隐藏金额');
}

{
  const invalidPaymentOrder = order('invalid-payment-candidate', 'sales-1', '销售甲', [
    payment('invalid-payment', 0, '2026-07-15T08:00:00.000Z'),
  ]);
  const records = [row(STORAGE_KEYS.ORDERS, invalidPaymentOrder)];
  const service = createBusinessCockpitService(fakePrisma(records) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: true, visibleUserIds: [], visibleUserNames: [] },
  });

  assert.equal(result.data?.business.formalOrderPaidAmount, 0);
  assert.equal(result.data?.business.formalOrderCount, 0);
  assert.equal(result.data?.financeHealth.reconciliationIssueCount, 1,
    '本期零额、负数或非数值付款不得静默跳过对账');
}

{
  const malformedAmountOrder = order('malformed-finance-amount', 'sales-1', '销售甲', [
    payment('malformed-payment', 100, '2026-07-15T08:00:00.000Z'),
  ]);
  const records = [
    row(STORAGE_KEYS.ORDERS, malformedAmountOrder),
    row(STORAGE_KEYS.FINANCE_TRANSACTIONS, financeTransaction(
      'malformed-income', 'income', 'order_payment', Number.POSITIVE_INFINITY, malformedAmountOrder.id, {
        sourceEventId: `${malformedAmountOrder.id}:malformed-payment`,
        occurredAt: '2026-07-15T08:00:00.000Z',
      },
    )),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: true, visibleUserIds: [], visibleUserNames: [] },
  });

  assert.equal(result.data?.financeHealth.formalOrderIncomeAmount, 0);
  assert.equal(result.data?.financeHealth.formalOrderNetReceiptAmount, 0);
  assert.ok(Object.values(result.data?.financeHealth || {}).every((value) => (
    typeof value !== 'number' || Number.isFinite(value)
  )), '驾驶舱财务 KPI 不得返回 NaN 或 Infinity');
}

{
  const unconfirmedOrder = order('unconfirmed-finance-row', 'sales-1', '销售甲', [
    payment('unconfirmed-payment', 100, '2026-07-15T08:00:00.000Z'),
  ]);
  const records = [
    row(STORAGE_KEYS.ORDERS, unconfirmedOrder),
    row(STORAGE_KEYS.FINANCE_TRANSACTIONS, financeTransaction(
      'unconfirmed-income', 'income', 'order_payment', 100, unconfirmedOrder.id, {
        sourceEventId: `${unconfirmedOrder.id}:unconfirmed-payment`,
        status: '待确认',
        occurredAt: '2026-07-15T08:00:00.000Z',
      },
    )),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: true, visibleUserIds: [], visibleUserNames: [] },
  });

  assert.equal(result.data?.financeHealth.formalOrderIncomeAmount, 0,
    '未确认资金流水不得计入正式经营 KPI');
  assert.equal(result.data?.financeHealth.reconciliationIssueCount, 1,
    '未确认资金流水必须进入对账异常而不是整单假绿');
}

{
  const records = [
    row(STORAGE_KEYS.ORDERS, order('legacy-resolvable-owner', undefined, '系统管理员', [
      payment('legacy-resolvable-payment', 300, '2026-07-15T08:00:00.000Z'),
    ])),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any, {
    now: () => new Date('2026-07-31T12:00:00.000Z'),
  });
  const result = await service.get({
    preset: 'custom',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
  }, admin);

  assert.equal(result.data?.salesRanking[0]?.userId, 'admin-1');
  assert.equal(result.data?.salesRanking[0]?.identityStatus, 'resolved',
    '历史记录缺人员 ID 时，若姓名唯一匹配当前员工，应补齐稳定人员 ID');
}

{
  const records = Array.from({ length: 101 }, (_, index) => row(
    STORAGE_KEYS.ORDERS,
    order(`bulk-reconciliation-${index + 1}`, 'sales-1', '销售甲', [
      payment(`bulk-payment-${index + 1}`, 1, '2026-07-15T08:00:00.000Z'),
    ]),
  ));
  const service = createBusinessCockpitService(fakePrisma(records) as any);
  const result = await service.get({
    preset: 'custom', startDate: '2026-07-01', endDate: '2026-07-31',
  }, admin);
  const risk = result.data?.riskTasks.find((item) => item.id === 'finance-reconciliation');
  const params = new URLSearchParams(risk?.path.split('?')[1] || '');

  assert.equal(risk?.count, 101);
  assert.equal(result.data?.financeHealth.reconciliationOrderIds.length, 101,
    '公开驾驶舱数据必须保留可见异常订单全集，支持下一批下钻');
  assert.equal(params.get('reconciliationTotal'), '101');
  assert.equal(params.get('reconciliationStartDate'), '2026-07-01');
  assert.equal(params.get('reconciliationEndDate'), '2026-07-31');
  assert.equal(params.get('orderIds')?.split(',').length, 100,
    '大批异常下钻必须与服务端上限一致，不得页面声称展示全部却静默丢失');
  assert.match(risk?.description || '', /每批展示 100 个订单，可继续查看下一批/);
}

{
  const records = [
    row(STORAGE_KEYS.ORDERS, order('current-id-owner', 'admin-1', '系统管理员', [
      payment('current-id-payment', 200, '2026-07-12T08:00:00.000Z'),
    ])),
    row(STORAGE_KEYS.ORDERS, order('legacy-name-owner', undefined, '系统管理员', [
      payment('legacy-name-payment', 300, '2026-07-15T08:00:00.000Z'),
    ])),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any, {
    now: () => new Date('2026-07-31T12:00:00.000Z'),
  });
  const result = await service.get({
    preset: 'custom', startDate: '2026-07-01', endDate: '2026-07-31',
  }, admin);

  assert.deepEqual(result.data?.salesRanking.map((item) => ({
    userId: item.userId, amount: item.amount, count: item.count,
  })), [{ userId: 'admin-1', amount: 500, count: 2 }],
  '同一人员的历史姓名订单与新 ID 订单必须在排名前合并');
}

{
  const visibleOrder = order('visible-privacy-order', 'sales-1', '销售甲', [
    payment('visible-payment', 100, '2026-07-15T08:00:00.000Z'),
  ]);
  const hiddenOrder = order('hidden-privacy-order', 'sales-2', '销售丙', [
    payment('hidden-payment', 999, '2026-07-15T08:00:00.000Z'),
  ]);
  const disguisedHiddenFlow = financeTransaction(
    'disguised-hidden-flow', 'income', 'order_payment', 999, visibleOrder.id,
    { sourceEventId: `${hiddenOrder.id}:fake-payment`, occurredAt: '2026-07-15T08:00:00.000Z' },
  );
  const records = [
    row(STORAGE_KEYS.ORDERS, visibleOrder),
    row(STORAGE_KEYS.ORDERS, hiddenOrder),
    row(STORAGE_KEYS.FINANCE_TRANSACTIONS, disguisedHiddenFlow),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: false, visibleUserIds: ['sales-1'], visibleUserNames: ['销售甲'] },
  });

  assert.equal(result.data?.financeHealth.formalOrderIncomeAmount, 0,
    '伪装成可见订单元数据的隐藏或孤儿事件不得泄露到经营金额');
  assert.equal(result.data?.financeHealth.reconciliationIssueCount, 1);
}

{
  const invalidPaymentsOrder = {
    ...order('invalid-payment-structure', 'sales-1', '销售甲', []),
    payments: [null],
  } as unknown as Order;
  const service = createBusinessCockpitService(fakePrisma([
    row(STORAGE_KEYS.ORDERS, invalidPaymentsOrder),
  ]) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: true, visibleUserIds: [], visibleUserNames: [] },
  });
  assert.equal(result.code, 0, '损坏付款元素不得使驾驶舱接口崩溃');
  assert.equal(result.data?.financeHealth.reconciliationIssueCount, 1);
}

{
  const correctedOrder = order('cross-period-unresolved', 'sales-1', '销售甲', [
    payment('june-payment', 250, '2026-06-10T08:00:00.000Z'),
  ], {
    changeHistory: [{
      id: 'history-july-correction',
      action: 'correct',
      operator: '系统管理员',
      changedAt: '2026-07-10T08:00:00.000Z',
      summary: '付款金额更正',
      changes: [{ field: 'actualAmount', label: '实付金额', oldValue: 300, newValue: 250 }],
    }],
  });
  const records = [
    row(STORAGE_KEYS.ORDERS, correctedOrder),
    row(STORAGE_KEYS.FINANCE_TRANSACTIONS, financeTransaction(
      'cross-period-unresolved-income', 'income', 'order_payment', 300, correctedOrder.id,
      {
        sourceEventId: `${correctedOrder.id}:june-payment`,
        occurredAt: '2026-06-10T08:00:00.000Z',
      },
    )),
  ];
  const service = createBusinessCockpitService(fakePrisma(records) as any);
  const result = await service.getSnapshot({
    startAt: START_AT,
    endAt: END_AT,
    visibility: { unrestricted: true, visibleUserIds: [], visibleUserNames: [] },
  });

  assert.equal(result.data?.financeHealth.reconciliationIssueCount, 1,
    '本期更正的旧期付款在冲正未完成时必须进入本期风险台');
  assert.equal(result.data?.financeHealth.reconciliationDifferenceAmount, 50);
}
