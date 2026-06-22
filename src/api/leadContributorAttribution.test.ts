import assert from 'node:assert/strict';
import { commissionApi, customerApi, leadApi, leadFlowApi, orderReviewApi } from './index';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { Commission, CommissionRule } from '../types/commission';
import type { Customer } from '../types/customer';
import type { Lead } from '../types/lead';
import type { Order } from '../types/order';

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

const now = '2026-06-20T08:00:00.000Z';
const zh = {
  all: '\u5168\u90e8',
  sales: '\u9500\u552e',
  finance: '\u8d22\u52a1',
  leadRole: '\u7ebf\u7d22',
  salesRole: '\u9500\u552e',
  companyResource: '\u516c\u53f8\u8d44\u6e90',
  personalResource: '\u4e2a\u4eba\u8d44\u6e90',
  source: '\u5b98\u7f51',
  pendingReview: '\u5f85\u8d22\u52a1\u5ba1\u6838',
  approved: '\u5df2\u5165\u5e93',
  confirmed: '\u5df2\u786e\u8ba4',
  none: '\u65e0',
  bankTransfer: '\u5bf9\u516c\u8f6c\u8d26',
  officialChannel: '\u5bf9\u516c\u94f6\u884c\u8f6c\u8d26',
  orderType: '899\u6210\u4ea4',
  product: '899',
} as const;

function seed(userId = 'user-sales') {
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([
    { id: 'user-sales', name: 'Sales A', account: 'sales', email: '', phone: '', role: zh.sales, roleId: 'role-sales', departmentId: 'dept-sales', isActive: true, createdAt: now, updatedAt: now },
    { id: 'user-lead', name: 'Lead A', account: 'lead', email: '', phone: '', role: zh.sales, roleId: 'role-sales', departmentId: 'dept-market', isActive: true, createdAt: now, updatedAt: now },
    { id: 'user-finance', name: 'Finance A', account: 'finance', email: '', phone: '', role: zh.finance, roleId: 'role-finance', departmentId: 'dept-finance', isActive: true, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([
    { id: 'role-sales', name: zh.sales, code: 'sales_consultant', permissions: [], memberCount: 2, isActive: true, createdAt: now, updatedAt: now },
    { id: 'role-finance', name: zh.finance, code: 'finance', permissions: [{ module: zh.all, actions: ['admin'] }], memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify([
    { id: 'dept-sales', name: '\u9500\u552e\u90e8', code: 'SALES', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
    { id: 'dept-market', name: '\u5e02\u573a\u90e8', code: 'MARKET', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
    { id: 'dept-finance', name: zh.finance, code: 'FINANCE', memberCount: 1, isActive: true, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId, token: `token-${userId}`, remember: true, createdAt: now }));
  storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.ORDER_APPLICATIONS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.DELIVERIES, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.COMMISSION_RULES, JSON.stringify([
    {
      id: 'rule-sales',
      name: 'Sales split',
      productLevel: zh.product,
      orderType: zh.orderType,
      sourceType: '',
      scene: zh.orderType,
      resourceOwnership: zh.companyResource,
      paymentChannels: [zh.officialChannel],
      excludeExternalTalent: true,
      role: zh.salesRole,
      commissionType: 'fixed',
      commissionValue: 120,
      isActive: true,
      priority: 1,
    },
    {
      id: 'rule-lead',
      name: 'Lead split',
      productLevel: zh.product,
      orderType: zh.orderType,
      sourceType: '',
      scene: zh.orderType,
      resourceOwnership: zh.companyResource,
      paymentChannels: [zh.officialChannel],
      excludeExternalTalent: true,
      role: zh.leadRole,
      commissionType: 'fixed',
      commissionValue: 30,
      isActive: true,
      priority: 2,
    },
  ] satisfies CommissionRule[]));
}

async function approveCustomerOrder(customer: Customer) {
  const submitRes = await orderReviewApi.submitOrderApplication({
    customerId: customer.id,
    customerName: customer.name,
    productLevel: zh.product,
    orderType: zh.orderType,
    amount: 899,
    actualAmount: 899,
    paymentMethod: zh.bankTransfer,
    officialPaymentChannel: zh.officialChannel,
    status: zh.confirmed,
    refundStatus: zh.none,
    owner: customer.owner,
    salesId: 'user-sales',
    salesName: 'Sales A',
    sourceType: customer.sourceType,
    resourceOwnership: customer.sourceType,
    dealScene: zh.orderType,
    proofStatus: '\u5df2\u4e0a\u4f20',
    payments: [{ id: 'pay-1', amount: 899, paidAt: now, method: zh.bankTransfer }],
  } as any);
  assert.equal(submitRes.data.status, zh.pendingReview);
  const approveRes = await orderReviewApi.approveOrderApplication(submitRes.data.id);
  assert.equal(approveRes.data?.status, zh.approved);
  assert.ok(approveRes.data?.orderId);
  return approveRes.data.orderId!;
}

seed();

const invalidLead = await leadApi.createLead({
  name: 'Personal Lead Missing Contributor',
  company: 'Missing Co',
  phone: '13900000001',
  source: zh.source,
  status: '\u65b0\u7ebf\u7d22',
  sourceType: zh.personalResource,
  inputBy: 'Sales A',
  owner: 'Sales A',
} as any);
assert.notEqual(invalidLead.code, 0);

const validLead = await leadApi.createLead({
  name: 'Lead Customer',
  company: 'Lead Co',
  phone: '13900000002',
  source: zh.source,
  status: '\u65b0\u7ebf\u7d22',
  sourceType: zh.companyResource,
  inputBy: 'Sales A',
  leadContributorId: 'user-lead',
  leadContributorName: 'Lead A',
  owner: 'Sales A',
} as any);
assert.equal(validLead.code, 0);
assert.equal((validLead.data as Lead).inputBy, 'Sales A');
assert.equal((validLead.data as any).leadContributorName, 'Lead A');

const claimedLead = await leadFlowApi.claimLeadAsCustomer((validLead.data as Lead).id, 'Sales A');
assert.equal(claimedLead.code, 0);
assert.ok(claimedLead.data?.customerId);

const storedCustomer = (JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]') as Customer[])
  .find((item) => item.phone === '+8613900000002');
assert.equal(storedCustomer?.leadInputBy, 'Sales A');
assert.equal((storedCustomer as any)?.leadContributorId, 'user-lead');
assert.equal((storedCustomer as any)?.leadContributorName, 'Lead A');

const invalidCustomer = await customerApi.createCustomer({
  name: 'Invalid Personal Customer',
  company: 'Invalid Co',
  phone: '13900000003',
  owner: 'Sales A',
  sourceType: zh.personalResource,
} as any);
assert.notEqual(invalidCustomer.code, 0);

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'user-lead', token: 'token-user-lead', remember: true, createdAt: now }));
const visibleLeads = await leadApi.fetchLeads({ pageSize: 20 });
assert.deepEqual(visibleLeads.data.items.map((item) => item.name), ['Lead Customer']);
const visibleCustomer = await customerApi.fetchCustomerById(storedCustomer!.id);
assert.equal(visibleCustomer.data?.id, storedCustomer!.id);

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ userId: 'user-finance', token: 'token-user-finance', remember: true, createdAt: now }));
const orderIdWithContributor = await approveCustomerOrder(storedCustomer!);
const orderWithContributor = (JSON.parse(storage.getItem(STORAGE_KEYS.ORDERS) || '[]') as Order[])
  .find((item) => item.id === orderIdWithContributor)!;
assert.equal((orderWithContributor as any).leadContributorId, 'user-lead');
assert.equal(orderWithContributor.leadContributorName, 'Lead A');
let commissions = ((await (commissionApi as any).fetchCommissionsByOrder(orderIdWithContributor)).data || []) as Commission[];
assert.equal(commissions.find((item) => item.role === zh.leadRole)?.owner, 'Lead A');

await customerApi.updateCustomer(storedCustomer!.id, { leadContributorId: 'user-sales', leadContributorName: 'Sales A' } as any);
const orderAfterCustomerEdit = (JSON.parse(storage.getItem(STORAGE_KEYS.ORDERS) || '[]') as Order[])
  .find((item) => item.id === orderIdWithContributor)!;
assert.equal(orderAfterCustomerEdit.leadContributorName, 'Lead A');

const companyCustomer = await customerApi.createCustomer({
  name: 'Company Resource Customer',
  company: 'Company Resource Co',
  phone: '13900000004',
  owner: 'Sales A',
  sourceType: zh.companyResource,
  leadSource: zh.source,
  leadInputBy: 'Sales A',
} as any);
assert.equal(companyCustomer.code, 0);
const companyOrderId = await approveCustomerOrder(companyCustomer.data);
commissions = ((await (commissionApi as any).fetchCommissionsByOrder(companyOrderId)).data || []) as Commission[];
assert.deepEqual(commissions.map((item) => item.role), [zh.salesRole]);
