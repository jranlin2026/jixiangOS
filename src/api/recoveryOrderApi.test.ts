import assert from 'node:assert/strict';
import { commissionApi } from './commissionApi';
import { recoveryOrderApi } from './recoveryOrderApi';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { PERMISSION_KEYS } from '../shared/utils/permissions';
import type { Customer } from '../types/customer';
import type { RecoveryOrderInput } from '../types/recoveryOrder';
import type { Role } from '../types/role';
import type { User } from '../types/settings';

const storage = (() => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) || null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
    key: (index: number) => Array.from(data.keys())[index] || null,
    get length() {
      return data.size;
    },
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

const now = '2026-06-28T10:00:00.000Z';

const roles: Role[] = [
  {
    id: 'role-service',
    name: '售后服务专员',
    code: 'customer_success',
    departmentId: 'dept-service',
    permissions: [
      { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY, actions: ['read'] },
      { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE, actions: ['read', 'delete'] },
    ],
    dataScopes: {
      leads: 'self',
      customers: 'self',
      orders: 'self',
      orderApplications: 'self',
      recoveryOrders: 'self',
      recoveryOrderApplications: 'self',
    },
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-finance',
    name: '财务专员',
    code: 'finance_specialist',
    permissions: [
      { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, actions: ['read'] },
      { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, actions: ['read', 'write'] },
      { module: PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, actions: ['read', 'write'] },
    ],
    dataScopes: {
      leads: 'self',
      customers: 'self',
      orders: 'all',
      orderApplications: 'all',
      recoveryOrders: 'self',
      recoveryOrderApplications: 'all',
    },
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-recovery-reader',
    name: '售后只读员工',
    code: 'recovery_reader',
    departmentId: 'dept-service',
    permissions: [
      { module: PERMISSION_KEYS.AFTER_SALES, actions: ['read'] },
      { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST, actions: ['read'] },
    ],
    dataScopes: {
      leads: 'self',
      customers: 'self',
      orders: 'self',
      orderApplications: 'self',
      recoveryOrders: 'self',
      recoveryOrderApplications: 'self',
    },
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-recovery-editor',
    name: '售后挽回编辑员',
    code: 'recovery_editor',
    departmentId: 'dept-service',
    permissions: [
      { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY, actions: ['read'] },
      { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT, actions: ['read', 'write'] },
    ],
    dataScopes: {
      leads: 'self',
      customers: 'self',
      orders: 'self',
      orderApplications: 'self',
      recoveryOrders: 'all',
      recoveryOrderApplications: 'all',
    },
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-no-recovery-permission',
    name: '无售后挽回权限',
    code: 'no_recovery_permission',
    departmentId: 'dept-service',
    permissions: [],
    dataScopes: {
      leads: 'self',
      customers: 'self',
      orders: 'self',
      orderApplications: 'self',
      recoveryOrders: 'self',
      recoveryOrderApplications: 'self',
    },
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

const users: User[] = [
  {
    id: 'user-service',
    name: '售后小陈',
    account: 'service',
    email: 'service@test.local',
    phone: '',
    role: '售后服务专员',
    roleId: 'role-service',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-finance',
    name: '财务专员',
    account: 'finance',
    email: 'finance@test.local',
    phone: '',
    role: '财务专员',
    roleId: 'role-finance',
    departmentId: 'dept-finance',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-recovery-reader',
    name: '售后只读员工',
    account: 'recovery-reader',
    email: 'recovery-reader@test.local',
    phone: '',
    role: '售后只读员工',
    roleId: 'role-recovery-reader',
    departmentId: 'dept-service',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-recovery-editor',
    name: '售后挽回编辑员',
    account: 'recovery-editor',
    email: 'recovery-editor@test.local',
    phone: '',
    role: '售后挽回编辑员',
    roleId: 'role-recovery-editor',
    departmentId: 'dept-service',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-no-recovery-permission',
    name: '无售后挽回权限',
    account: 'no-recovery-permission',
    email: 'no-recovery-permission@test.local',
    phone: '',
    role: '无售后挽回权限',
    roleId: 'role-no-recovery-permission',
    departmentId: 'dept-service',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

const existingCustomer = {
  id: 'cust-existing',
  name: '热帖',
  company: '热帖',
  phone: '13800000000',
  wechat: 'retie',
  customerLevel: 'L2',
  owner: '系统管理员',
  totalSpent: 899,
  orderCount: 1,
  growthPath: [],
  growthRecords: [],
  createdAt: now,
  updatedAt: now,
} as Customer;

function setSession(userId: string) {
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    userId,
    token: `test-${userId}`,
    remember: true,
    createdAt: now,
  }));
}

storage.clear();
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.ORGANIZATION_SCHEMA_VERSION, '6');
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(roles));
storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify([
  { id: 'dept-service', name: '售后服务部', code: 'SERVICE', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  { id: 'dept-finance', name: '财务部', code: 'FINANCE', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([existingCustomer]));
storage.setItem(STORAGE_KEYS.RECOVERY_ORDERS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify([]));
setSession('user-service');

const created = await recoveryOrderApi.createRecoveryOrder({
  customerName: '第三方客户',
  customerPhone: '13900000000',
  customerWechat: 'third-party',
  thirdPartyOrderNo: 'TP-001',
  sourcePlatform: '抖音',
  originalProduct: '代理服务',
  originalAmount: 2980,
  recoveryAmount: 1980,
  recoveryAt: '2026-06-15T10:00:00.000Z',
  paymentVoucher: 'pay.png',
  chatEvidence: 'chat.png',
  recoveryUserId: 'user-service',
  recoveryUserName: '售后小陈',
  createdBy: 'user-service',
  createdByName: '售后小陈',
});

assert.equal(created.code, 0);
assert.equal(created.data.customerId, '');
assert.equal(created.data.customerMatchStatus, '手工填写');
assert.equal(created.data.status, '待审核');
assert.equal(created.data.settlementStatus, '未分账');
assert.equal((JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]') as Customer[]).length, 1);

const duplicate = await recoveryOrderApi.createRecoveryOrder({
  ...created.data,
  thirdPartyOrderNo: 'TP-001',
});
assert.notEqual(duplicate.code, 0);

const ownList = await recoveryOrderApi.fetchRecoveryOrders({ ownerId: 'user-service', pageSize: 20 });
assert.equal(ownList.data.pagination.total, 1);
assert.equal(ownList.data.items[0].id, created.data.id);

const readerOwnOrder = {
  ...created.data,
  id: 'recovery-reader-own-order',
  orderNo: 'RCV-READER-OWN',
  thirdPartyOrderNo: 'TP-READER-OWN',
  recoveryUserId: 'user-recovery-reader',
  recoveryUserName: '售后只读员工',
  createdBy: 'user-recovery-reader',
  createdByName: '售后只读员工',
};
const readerAssignedOrder = {
  ...created.data,
  id: 'recovery-reader-assigned-order',
  orderNo: 'RCV-READER-ASSIGNED',
  thirdPartyOrderNo: 'TP-READER-ASSIGNED',
  recoveryUserId: 'user-recovery-reader',
  recoveryUserName: '售后只读员工',
};
const readerAssistedOrder = {
  ...created.data,
  id: 'recovery-reader-assisted-order',
  orderNo: 'RCV-READER-ASSISTED',
  thirdPartyOrderNo: 'TP-READER-ASSISTED',
  assistUserId: 'user-recovery-reader',
  assistUserName: '售后只读员工',
};
storage.setItem(STORAGE_KEYS.RECOVERY_ORDERS, JSON.stringify([
  created.data,
  readerOwnOrder,
  readerAssignedOrder,
  readerAssistedOrder,
]));

setSession('user-recovery-reader');
const readerReviewList = await recoveryOrderApi.fetchRecoveryOrders({
  statuses: [created.data.status],
  scopeDomain: 'recoveryOrderApplications',
  pageSize: 20,
});
assert.deepEqual(
  readerReviewList.data.items.map((item) => item.id),
  [readerOwnOrder.id, readerAssignedOrder.id, readerAssistedOrder.id],
  '挽回人员和协助人员应能看到由其他员工提交但自己参与的售后挽回订单',
);
const readerApproveAttempt = await recoveryOrderApi.approveRecoveryOrder(
  readerOwnOrder.id,
  'user-recovery-reader',
  '售后只读员工',
);
assert.notEqual(readerApproveAttempt.code, 0);
storage.setItem(STORAGE_KEYS.RECOVERY_ORDERS, JSON.stringify([created.data]));

setSession('user-finance');
const reviewList = await recoveryOrderApi.fetchRecoveryOrders({
  statuses: [created.data.status],
  scopeDomain: 'recoveryOrderApplications',
  pageSize: 20,
});
assert.equal(reviewList.data.pagination.total, 1);
assert.equal(reviewList.data.items[0].id, created.data.id);
const rejectWithoutReason = await recoveryOrderApi.rejectRecoveryOrder(created.data.id, 'user-finance', '财务专员', '');
assert.notEqual(rejectWithoutReason.code, 0);

const returned = await recoveryOrderApi.returnRecoveryOrder(created.data.id, 'user-finance', '财务专员', '补充聊天截图');
assert.equal(returned.code, 0);
assert.equal(returned.data?.status, '退回修改');
assert.equal(returned.data?.changeHistory?.length, 1, '首次退回必须追加一条真实审核历史');
assert.deepEqual(
  returned.data?.changeHistory?.[0],
  {
    id: returned.data?.changeHistory?.[0].id,
    action: 'review',
    operatorId: 'user-finance',
    operator: '财务专员',
    changedAt: returned.data?.auditedAt,
    reason: '补充聊天截图',
    summary: '退回售后挽回订单修改',
  },
);
const returnedSnapshot = returned.data;
const returnedIdempotentRetry = await recoveryOrderApi.returnRecoveryOrder(
  created.data.id,
  'user-finance',
  '财务专员',
  '补充聊天截图',
);
assert.deepEqual(returnedIdempotentRetry.data, returnedSnapshot, '相同原因退回重试不得重复追加审核历史');

setSession('user-service');
const returnedResubmitInput: RecoveryOrderInput = {
  customerName: '第三方客户',
  customerPhone: '13900000000',
  customerWechat: 'third-party',
  thirdPartyOrderNo: 'TP-001',
  sourcePlatform: '抖音',
  originalProduct: '代理服务',
  originalAmount: 2980,
  recoveryAmount: 1980,
  paymentVoucher: 'pay.png',
  chatEvidence: 'chat-updated.png',
  recoveryAttachments: [{
    id: 'recovery-proof-1', name: '挽回凭证.png', mimeType: 'image/png', size: 3,
    category: 'recovery-payment-proof', uploadedById: 'user-service', uploadedByName: '售后小陈', uploadedAt: now,
  }],
  recoveryUserId: 'user-service',
  recoveryUserName: '售后小陈',
  createdBy: 'user-service',
  createdByName: '售后小陈',
};
const rolesBeforeCreatePermissionRevocation = storage.getItem(STORAGE_KEYS.ROLES) || '[]';
const currentRoles = JSON.parse(rolesBeforeCreatePermissionRevocation) as Role[];
const currentServiceUser = (JSON.parse(storage.getItem(STORAGE_KEYS.USERS) || '[]') as User[])
  .find((user) => user.id === 'user-service')!;
storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(currentRoles.map((role) => (
  role.id === currentServiceUser.roleId || role.name === currentServiceUser.role
) ? {
  ...role,
  permissions: role.permissions.filter((permission) => permission.module !== PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE),
} : role)));
const resubmitWithoutCreateWrite = await recoveryOrderApi.updateRecoveryOrder(created.data.id, returnedResubmitInput);
assert.equal(resubmitWithoutCreateWrite.code, 403, '原创建人失去新增售后挽回订单写权限后不得重提退回记录');
assert.equal(
  (await recoveryOrderApi.fetchRecoveryOrderById(created.data.id)).data?.status,
  '退回修改',
  '权限拒绝不得改变退回修改状态',
);
storage.setItem(STORAGE_KEYS.ROLES, rolesBeforeCreatePermissionRevocation);

const resubmitted = await recoveryOrderApi.updateRecoveryOrder(created.data.id, returnedResubmitInput);
assert.equal(resubmitted.code, 0);
assert.equal(resubmitted.data?.status, '待审核');
assert.deepEqual(resubmitted.data?.recoveryAttachments?.map((item) => item.id), ['recovery-proof-1']);

const rejectedSource = await recoveryOrderApi.createRecoveryOrder({
  customerName: '终态客户',
  customerPhone: '13700000000',
  customerWechat: 'terminal-customer',
  thirdPartyOrderNo: 'TP-REJECTED-TERMINAL',
  sourcePlatform: '抖音',
  originalProduct: '代理服务',
  originalAmount: 2980,
  recoveryAmount: 1980,
  recoveryUserId: 'user-service',
  recoveryUserName: '售后小陈',
  createdBy: 'user-service',
  createdByName: '售后小陈',
});
assert.equal(rejectedSource.code, 0);

setSession('user-finance');
const rejectedTerminal = await recoveryOrderApi.rejectRecoveryOrder(rejectedSource.data!.id, 'user-finance', '财务专员', '凭证无效');
assert.equal(rejectedTerminal.code, 0);
assert.equal(rejectedTerminal.data?.status, '审核驳回');
assert.equal(rejectedTerminal.data?.changeHistory?.length, 1, '首次驳回必须追加一条真实审核历史');
assert.deepEqual(
  rejectedTerminal.data?.changeHistory?.[0],
  {
    id: rejectedTerminal.data?.changeHistory?.[0].id,
    action: 'review',
    operatorId: 'user-finance',
    operator: '财务专员',
    changedAt: rejectedTerminal.data?.auditedAt,
    reason: '凭证无效',
    summary: '驳回售后挽回订单',
  },
);

const rejectedRowsWithHistory = JSON.parse(storage.getItem(STORAGE_KEYS.RECOVERY_ORDERS) || '[]') as typeof rejectedSource.data[];
const rejectedIndex = rejectedRowsWithHistory.findIndex((item) => item.id === rejectedSource.data!.id);
rejectedRowsWithHistory[rejectedIndex] = {
  ...rejectedRowsWithHistory[rejectedIndex],
  crmIdentityStatus: '已匹配线索',
  linkedLeadId: 'lead-terminal-preserved',
  commissionIds: ['commission-terminal-preserved'],
};
storage.setItem(STORAGE_KEYS.RECOVERY_ORDERS, JSON.stringify(rejectedRowsWithHistory));
const rejectedTerminalSnapshot = rejectedRowsWithHistory[rejectedIndex];

const rejectedThenReturned = await recoveryOrderApi.returnRecoveryOrder(
  rejectedSource.data!.id,
  'user-finance',
  '财务专员',
  '改为退回修改',
);
assert.equal(rejectedThenReturned.code, 409, '审核驳回后不得通过退回操作绕回可重提状态');
assert.deepEqual(
  (await recoveryOrderApi.fetchRecoveryOrderById(rejectedSource.data!.id, 'recoveryOrderApplications')).data,
  rejectedTerminalSnapshot,
  '非法退回不得改写审核终态、原因、CRM/分账字段或历史',
);

const rejectedWithDifferentReason = await recoveryOrderApi.rejectRecoveryOrder(
  rejectedSource.data!.id,
  'user-finance',
  '财务专员',
  '换一个驳回原因',
);
assert.equal(rejectedWithDifferentReason.code, 409, '审核驳回后不得用不同原因覆盖原驳回审计');
assert.deepEqual(
  (await recoveryOrderApi.fetchRecoveryOrderById(rejectedSource.data!.id, 'recoveryOrderApplications')).data,
  rejectedTerminalSnapshot,
  '不同原因重复驳回不得改写原记录',
);

const rejectedIdempotentRetry = await recoveryOrderApi.rejectRecoveryOrder(
  rejectedSource.data!.id,
  'user-finance',
  '财务专员',
  '凭证无效',
);
assert.equal(rejectedIdempotentRetry.code, 0, '相同原因的驳回重试应幂等返回原记录');
assert.deepEqual(rejectedIdempotentRetry.data, rejectedTerminalSnapshot);
assert.deepEqual(
  (await recoveryOrderApi.fetchRecoveryOrderById(rejectedSource.data!.id, 'recoveryOrderApplications')).data,
  rejectedTerminalSnapshot,
  '幂等重试不得改写时间、原因或历史',
);

const rejectedThenApproved = await recoveryOrderApi.approveRecoveryOrder(
  rejectedSource.data!.id,
  'user-finance',
  '财务专员',
);
assert.equal(rejectedThenApproved.code, 409, '审核驳回后不得改为审核通过');
assert.deepEqual(
  (await recoveryOrderApi.fetchRecoveryOrderById(rejectedSource.data!.id, 'recoveryOrderApplications')).data,
  rejectedTerminalSnapshot,
  '非法审核通过不得改写终态记录',
);

setSession('user-service');
const rejectedLocalEdit = await recoveryOrderApi.updateRecoveryOrder(rejectedSource.data!.id, {
  ...rejectedSource.data!,
  remark: '尝试重新提交已驳回记录',
});
assert.equal(rejectedLocalEdit.code, 409, '本地兼容 API 必须阻止创建人重提审核驳回记录');
assert.match(rejectedLocalEdit.message, /审核驳回.*不能修改或重新提交/);
const rejectedLocalPersisted = await recoveryOrderApi.fetchRecoveryOrderById(rejectedSource.data!.id);
assert.equal(rejectedLocalPersisted.data?.status, '审核驳回', '本地兼容 API 失败重提不得改变审核驳回状态');

setSession('user-no-recovery-permission');
const rejectedNoPermissionAttempt = await recoveryOrderApi.updateRecoveryOrder(rejectedSource.data!.id, {
  ...rejectedSource.data!,
  remark: '无编辑或创建权限尝试探测已驳回记录',
});
assert.equal(rejectedNoPermissionAttempt.code, 403, '完全无编辑或创建权限时必须先返回 403，不泄露审核状态');

setSession('user-recovery-editor');
const rejectedLocalEditorAttempt = await recoveryOrderApi.updateRecoveryOrder(rejectedSource.data!.id, {
  ...rejectedSource.data!,
  remark: '编辑权限尝试修改已驳回记录',
});
assert.equal(rejectedLocalEditorAttempt.code, 409, '真正具备编辑写权限的账号也不得绕过审核驳回终态');
storage.setItem(
  STORAGE_KEYS.RECOVERY_ORDERS,
  JSON.stringify((JSON.parse(storage.getItem(STORAGE_KEYS.RECOVERY_ORDERS) || '[]') as typeof rejectedSource.data[])
    .filter((item) => item.id !== rejectedSource.data!.id)),
);

setSession('user-finance');
const approved = await recoveryOrderApi.approveRecoveryOrder(created.data.id, 'user-finance', '财务专员');
assert.equal(approved.code, 0);
assert.equal(approved.data?.status, '审核通过');
assert.equal(approved.data?.settlementStatus, '待处理');
assert.equal(approved.data?.changeHistory?.length, 2, '首次通过必须在已有退回历史前追加一条真实审核历史');
assert.deepEqual(
  approved.data?.changeHistory?.[0],
  {
    id: approved.data?.changeHistory?.[0].id,
    action: 'review',
    operatorId: 'user-finance',
    operator: '财务专员',
    changedAt: approved.data?.auditedAt,
    summary: '审核通过售后挽回订单',
  },
);
const approvedIdempotentRetry = await recoveryOrderApi.approveRecoveryOrder(created.data.id, 'user-finance', '财务专员');
assert.deepEqual(approvedIdempotentRetry.data, approved.data, '审核通过重试不得重复追加审核历史');
assert.deepEqual(approved.data?.commissionIds, []);
assert.equal((JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as unknown[]).length, 0);

const settled = await recoveryOrderApi.settleRecoveryOrder(
  created.data.id,
  [{
    role: '售后',
    ownerId: 'user-service',
    commissionAmount: 120,
    performanceAmount: 1980,
    payoutPlanName: '自定义金额',
    ruleCalculationType: 'fixed',
    calculationNote: '售后挽回分账',
  }],
  '售后挽回分账',
  'user-finance',
  '财务专员',
);
assert.equal(settled.code, 0);
assert.equal(settled.data?.settlementHandledBy, '财务专员');
assert.ok(settled.data?.settlementHandledAt);
const storedCommissions = JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as any[];
assert.equal(storedCommissions.length, 1);
assert.equal(
  storedCommissions[0].paymentDate,
  created.data.recoveryAt,
  '本地兼容链路也必须按挽回成交时间归属员工提成月报',
);
assert.equal(storedCommissions[0].departmentId, 'dept-service');
assert.equal(storedCommissions[0].department, '售后服务部');

storage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify([{
  ...storedCommissions[0],
  paymentDate: '2026-07-01T10:00:00.000Z',
}]));
const period = created.data.recoveryAt!.slice(0, 7);
const payouts = await commissionApi.fetchMonthlyCommissionPayouts(period);
assert.equal(payouts.code, 0);
const servicePayout = payouts.data.find((item) => item.ownerId === 'user-service');
assert.equal(Boolean(servicePayout), true, '历史售后挽回提成也应按关联挽回单的挽回成交月份展示');
assert.equal(servicePayout?.pendingConfirmAmount, 120);
assert.equal(servicePayout?.roleSummaries?.some((item) => (
  item.role === '售后'
  && item.commissions.some((commission) => commission.sourceBusinessType === 'after_sales_recovery')
)), true);

const financeOwnScopeStats = await recoveryOrderApi.fetchRecoveryOrderStats();
assert.equal(financeOwnScopeStats.data.total, 0, '售后挽回订单统计必须服从独立的订单列表数据范围');

setSession('user-service');
const stats = await recoveryOrderApi.fetchRecoveryOrderStats();
assert.equal(stats.data.total, 1);
assert.equal(stats.data.waitingSettlement, 0);
assert.equal(stats.data.generatedCommissionAmount, 120);

const legacyRows = JSON.parse(storage.getItem(STORAGE_KEYS.RECOVERY_ORDERS) || '[]') as any[];
legacyRows[0] = { ...legacyRows[0], settlementStatus: '已分账' };
storage.setItem(STORAGE_KEYS.RECOVERY_ORDERS, JSON.stringify(legacyRows));
const legacySettlementPage = await recoveryOrderApi.fetchRecoveryOrders({
  settlementStatuses: ['待发放'], page: 1, pageSize: 20,
});
assert.equal(legacySettlementPage.data.items.length, 1, '本地模式必须把历史已分账归一化为待发放');
const legacySettlementCounts = await recoveryOrderApi.fetchRecoverySettlementCounts();
assert.equal(legacySettlementCounts.data.statusCounts['待发放'], 1);

const withdrawnRows = JSON.parse(storage.getItem(STORAGE_KEYS.RECOVERY_ORDERS) || '[]') as any[];
withdrawnRows[0] = { ...withdrawnRows[0], status: '已分账', settlementStatus: '已撤回' };
storage.setItem(STORAGE_KEYS.RECOVERY_ORDERS, JSON.stringify(withdrawnRows));
const blockedByActiveCommission = await recoveryOrderApi.deleteRecoveryOrder(created.data.id);
assert.equal(blockedByActiveCommission.code, 409, '本地模式仍有活动提成时必须禁止删除已撤回订单');

const withdrawnCommissions = JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as any[];
withdrawnCommissions[0] = { ...withdrawnCommissions[0], status: '已撤回', auditReason: '测试撤回' };
storage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify(withdrawnCommissions));
const deletedWithdrawnOrder = await recoveryOrderApi.deleteRecoveryOrder(created.data.id);
assert.equal(deletedWithdrawnOrder.code, 0, '本地模式全部提成已撤回后应允许删除订单');
const formalListWithDeletedRequested = await recoveryOrderApi.fetchRecoveryOrders({
  scopeDomain: 'recoveryOrders', includeDeleted: true, page: 1, pageSize: 20,
});
assert.equal(
  formalListWithDeletedRequested.data.items.some((item) => item.id === created.data.id),
  false,
  '正式售后列表必须忽略外部传入的 includeDeleted',
);
setSession('user-finance');
const retainedReviewHistory = await recoveryOrderApi.fetchRecoveryOrders({
  scopeDomain: 'recoveryOrderApplications', includeDeleted: true, page: 1, pageSize: 20,
});
assert.equal(
  retainedReviewHistory.data.items.some((item) => item.id === created.data.id),
  true,
  '审核台全部记录必须保留已删除业务单的留痕',
);
setSession('user-service');
assert.equal(
  (JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as any[])[0]?.status,
  '已撤回',
  '删除订单后必须保留已撤回分账留痕',
);
