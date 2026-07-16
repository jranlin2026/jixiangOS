import assert from 'node:assert/strict';
import { commissionApi } from './commissionApi';
import { recoveryOrderApi } from './recoveryOrderApi';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { PERMISSION_KEYS } from '../shared/utils/permissions';
import type { Customer } from '../types/customer';
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
storage.setItem(STORAGE_KEYS.RECOVERY_ORDERS, JSON.stringify([created.data, readerOwnOrder, readerAssignedOrder]));

setSession('user-recovery-reader');
const readerReviewList = await recoveryOrderApi.fetchRecoveryOrders({
  statuses: [created.data.status],
  scopeDomain: 'recoveryOrderApplications',
  pageSize: 20,
});
assert.deepEqual(readerReviewList.data.items.map((item) => item.id), [readerOwnOrder.id]);
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

setSession('user-service');
const resubmitted = await recoveryOrderApi.updateRecoveryOrder(created.data.id, {
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
  recoveryUserId: 'user-service',
  recoveryUserName: '售后小陈',
  createdBy: 'user-service',
  createdByName: '售后小陈',
});
assert.equal(resubmitted.code, 0);
assert.equal(resubmitted.data?.status, '待审核');

setSession('user-finance');
const approved = await recoveryOrderApi.approveRecoveryOrder(created.data.id, 'user-finance', '财务专员');
assert.equal(approved.code, 0);
assert.equal(approved.data?.status, '待分账');
assert.equal(approved.data?.settlementStatus, '待处理');
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
const storedCommissions = JSON.parse(storage.getItem(STORAGE_KEYS.COMMISSIONS) || '[]') as any[];
assert.equal(storedCommissions.length, 1);
assert.equal(storedCommissions[0].departmentId, 'dept-service');
assert.equal(storedCommissions[0].department, '售后服务部');

const period = new Date().toISOString().slice(0, 7);
const payouts = await commissionApi.fetchMonthlyCommissionPayouts(period);
assert.equal(payouts.code, 0);
const servicePayout = payouts.data.find((item) => item.ownerId === 'user-service');
assert.equal(Boolean(servicePayout), true);
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
