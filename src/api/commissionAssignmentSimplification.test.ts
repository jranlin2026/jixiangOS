import assert from 'node:assert/strict';
import { commissionApi, commissionRuleApi, orderApi } from './index';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { Commission } from '../types/commission';

const storage = (() => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

const now = '2026-06-19T08:00:00.000Z';
const paidAt = '2026-05-20T10:30:00.000Z';

const zh = {
  sales: '\u9500\u552e',
  lead: '\u7ebf\u7d22',
  success: '\u5ba2\u6237\u6210\u529f',
  service: '\u552e\u540e',
  salesManager: '\u9500\u552e\u4e3b\u7ba1',
  customRole: '\u6e20\u9053\u4f19\u4f34',
  pendingAssign: '\u5f85\u5206\u914d',
  salesDept: '\u9500\u552e\u90e8',
  marketDept: '\u5e02\u573a\u90e8',
  successDept: '\u5ba2\u6237\u6210\u529f\u90e8',
  finance: '\u8d22\u52a1',
  companyResource: '\u516c\u53f8\u8d44\u6e90',
  product: '\u4ee3\u7406',
  orderType: '\u65b0\u4ee3\u7406',
  confirmed: '\u5df2\u786e\u8ba4',
  none: '\u65e0',
  bankTransfer: '\u5bf9\u516c\u8f6c\u8d26',
  officialChannel: '\u5bf9\u516c\u94f6\u884c\u8f6c\u8d26',
  uploaded: '\u5df2\u4e0a\u4f20',
} as const;

function seed() {
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([
    { id: 'user-sales', name: 'Sales A', account: 'sales', email: '', phone: '', role: zh.sales, roleId: 'role-sales', departmentId: 'dept-sales', isActive: true, createdAt: now, updatedAt: now },
    { id: 'user-manager', name: 'Manager A', account: 'manager', email: '', phone: '', role: zh.salesManager, roleId: 'role-manager', departmentId: 'dept-sales', isActive: true, createdAt: now, updatedAt: now },
    { id: 'user-lead', name: 'Lead A', account: 'lead', email: '', phone: '', role: zh.sales, roleId: 'role-sales', departmentId: 'dept-market', isActive: true, createdAt: now, updatedAt: now },
    { id: 'user-success', name: 'Success A', account: 'success', email: '', phone: '', role: zh.success, roleId: 'role-success', departmentId: 'dept-success', isActive: true, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify([
    { id: 'dept-sales', name: zh.salesDept, code: 'SALES', managerId: 'user-manager', memberCount: 2, isActive: true, createdAt: now, updatedAt: now },
    { id: 'dept-market', name: zh.marketDept, code: 'MARKET', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
    { id: 'dept-success', name: zh.successDept, code: 'SUCCESS', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.ORDERS, '[]');
  storage.setItem(STORAGE_KEYS.COMMISSIONS, '[]');
  storage.setItem(STORAGE_KEYS.COMMISSION_RULES, '[]');
  storage.setItem(STORAGE_KEYS.COMMISSION_ROLE_CONFIGS, '[]');
  storage.setItem(STORAGE_KEYS.DELIVERIES, '[]');
  storage.setItem(STORAGE_KEYS.CUSTOMERS, '[]');
}

async function createRuleGroup() {
  async function fixedPlan(name: string, amount: number) {
    const res = await commissionRuleApi.createCommissionPayoutPlan({
      name,
      commissionType: 'fixed',
      commissionValue: amount,
      isActive: true,
      description: '',
    });
    assert.equal(res.code, 0);
    return res.data.id;
  }

  const salesPlanId = await fixedPlan('测试销售固定 100', 100);
  const leadPlanId = await fixedPlan('测试线索固定 30', 30);
  const successPlanId = await fixedPlan('测试客户成功固定 10', 10);
  const servicePlanId = await fixedPlan('测试售后固定 5', 5);
  const managerPlanId = await fixedPlan('测试招商主管固定 2', 2);
  const customPlanId = await fixedPlan('测试渠道固定 1', 1);

  const customRole = await commissionRuleApi.createCommissionRoleConfig({
    name: zh.customRole,
    code: 'channel_partner',
    isActive: true,
    sortOrder: 90,
    description: '\u81ea\u5b9a\u4e49\u5206\u8d26\u89d2\u8272\u9ed8\u8ba4\u5f85\u5206\u914d',
  } as any);
  assert.equal(customRole.code, 0);

  const group = await commissionRuleApi.createSimpleCommissionRuleGroup({
    name: '\u65b0\u4ee3\u7406-\u516c\u53f8\u8d44\u6e90',
    orderType: zh.orderType,
    resourceOwnership: zh.companyResource,
    isActive: true,
    payouts: [
      { role: zh.sales, payoutPlanId: salesPlanId, commissionType: 'fixed', commissionValue: 100 },
      { role: zh.lead, payoutPlanId: leadPlanId, commissionType: 'fixed', commissionValue: 30 },
      { role: zh.success, payoutPlanId: successPlanId, commissionType: 'fixed', commissionValue: 10 },
      { role: zh.service, payoutPlanId: servicePlanId, commissionType: 'fixed', commissionValue: 5 },
      { role: zh.salesManager, payoutPlanId: managerPlanId, commissionType: 'fixed', commissionValue: 2 },
      { role: zh.customRole, payoutPlanId: customPlanId, commissionType: 'fixed', commissionValue: 1 },
    ],
  });
  assert.equal(group.code, 0);
}

function byRole(rows: Commission[], role: string): Commission {
  const row = rows.find((item) => item.role === role);
  assert.ok(row, `missing commission role ${role}`);
  return row;
}

seed();
await createRuleGroup();

const orderRes = await orderApi.createOrder({
  customerId: 'cust-1',
  customerName: 'Customer A',
  productLevel: zh.product,
  orderType: zh.orderType,
  amount: 9800,
  actualAmount: 9800,
  paymentMethod: zh.bankTransfer,
  officialPaymentChannel: zh.officialChannel,
  status: zh.confirmed,
  refundStatus: zh.none,
  owner: 'Sales A',
  salesId: 'user-sales',
  salesName: 'Sales A',
  leadContributorName: 'Lead A',
  resourceOwnership: zh.companyResource,
  dealScene: zh.orderType,
  proofStatus: zh.uploaded,
  payments: [{ id: 'pay-1', amount: 9800, paidAt, method: zh.bankTransfer }],
} as any);
assert.equal(orderRes.code, 0);

const commissions = ((await commissionApi.fetchCommissionsByOrder(orderRes.data.id)).data || []) as Commission[];
assert.equal(commissions.length, 6);

assert.equal(byRole(commissions, zh.sales).owner, 'Sales A');
assert.equal(byRole(commissions, zh.sales).ownerId, 'user-sales');
assert.equal(byRole(commissions, zh.sales).departmentId, 'dept-sales');
assert.equal(byRole(commissions, zh.sales).paymentDate, paidAt);

assert.equal(byRole(commissions, zh.lead).owner, 'Lead A');
assert.equal(byRole(commissions, zh.lead).ownerId, 'user-lead');
assert.equal(byRole(commissions, zh.lead).departmentId, 'dept-market');

assert.equal(byRole(commissions, zh.success).owner, zh.pendingAssign);
assert.equal(byRole(commissions, zh.service).owner, zh.pendingAssign);
assert.equal(byRole(commissions, zh.customRole).owner, zh.pendingAssign);

assert.equal(byRole(commissions, zh.salesManager).owner, 'Manager A');
assert.equal(byRole(commissions, zh.salesManager).ownerId, 'user-manager');
assert.equal(byRole(commissions, zh.salesManager).departmentId, 'dept-sales');

const filteredByOwner = await commissionApi.fetchCommissions({ ownerId: 'user-sales', pageSize: 100 } as any);
assert.equal(filteredByOwner.data.items.length, 1);
assert.equal(filteredByOwner.data.items[0].role, zh.sales);

const filteredByPaymentDate = await commissionApi.fetchCommissions({ startDate: '2026-05-01', endDate: '2026-05-31', pageSize: 100 } as any);
assert.equal(filteredByPaymentDate.data.items.length, 6);

const filteredOutsidePaymentDate = await commissionApi.fetchCommissions({ startDate: '2026-06-01', endDate: '2026-06-30', pageSize: 100 } as any);
assert.equal(filteredOutsidePaymentDate.data.items.length, 0);

const invalidManualAdjust = await commissionApi.saveOrderCommissionAdjustments(orderRes.data.id, [{
  orderId: orderRes.data.id,
  role: zh.success,
  owner: 'Random Text',
  commissionAmount: 20,
  commissionRate: 0,
  performanceAmount: 9800,
  calculationNote: 'invalid owner should fail',
} as any], '\u8c03\u6574\u6d4b\u8bd5');
assert.notEqual(invalidManualAdjust.code, 0);

const validManualAdjust = await commissionApi.saveOrderCommissionAdjustments(orderRes.data.id, [{
  orderId: orderRes.data.id,
  role: zh.success,
  ownerId: 'user-success',
  commissionAmount: 20,
  commissionRate: 0,
  performanceAmount: 9800,
  calculationNote: 'manual owner selected from employees',
} as any], '\u8c03\u6574\u6d4b\u8bd5');
assert.equal(validManualAdjust.code, 0);
assert.equal(validManualAdjust.data[0].owner, 'Success A');
assert.equal(validManualAdjust.data[0].ownerId, 'user-success');
assert.equal(validManualAdjust.data[0].department, zh.successDept);
assert.equal(validManualAdjust.data[0].departmentId, 'dept-success');
