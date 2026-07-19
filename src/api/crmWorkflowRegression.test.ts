import assert from 'node:assert/strict';
import { customerApi } from './customerApi';
import { leadApi } from './leadApi';
import { leadFlowApi } from './leadFlowApi';
import { orderApi } from './orderApi';
import { LEAD_STATUS, STORAGE_KEYS } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { PERMISSION_KEYS } from '../shared/utils/permissions';

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

function seed() {
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
    id: 'user-admin',
    name: 'Sales Manager',
    account: 'admin',
    email: 'admin@company.com',
    phone: '',
    role: 'Sales Manager',
    roleId: 'role-sales-manager',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }]));
  storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([{
    id: 'role-sales-manager', name: 'Sales Manager', code: 'sales_manager',
    permissions: [{ module: PERMISSION_KEYS.LEADS_FOLLOW, actions: ['read', 'write'] }],
    dataScopes: { leads: 'all' }, memberCount: 1, isActive: true, createdAt: now, updatedAt: now,
  }]));
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    userId: 'user-admin',
    token: 'test-token',
    remember: true,
    createdAt: now,
  }));
  storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.COMMISSIONS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.DELIVERIES, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS, JSON.stringify([]));
  storage.setItem(STORAGE_KEYS.OPPORTUNITIES, JSON.stringify([]));
}

function intakeLead(name: string, phone: string) {
  const res = leadFlowApi.intakeLead({
    name,
    company: `${name} Company`,
    phone,
    wechat: '',
    source: 'Live',
    sourceName: 'Douyin',
    sourceType: 'company',
    status: LEAD_STATUS.NEW,
    inputBy: 'InputUser',
    owner: '待分配',
    industry: '',
    city: '',
    tags: [],
    remark: '',
  });
  assert.ok(res.lead);
  assert.equal(res.lead?.lifecycleStatusCode, 'pending_followup');
  return res.lead!;
}

seed();

const lostLead = intakeLead('33333', '13333000001');
const lostClaim = await leadFlowApi.claimLeadAsCustomer(lostLead.id);
assert.equal(lostClaim.code, 0);
assert.equal(lostClaim.data?.lifecycleStatusCode, 'following');
assert.ok(lostClaim.data?.customerId);

const lostRelease = await customerApi.releaseCustomerToPublicPool(lostClaim.data!.customerId!, 'No intent');
assert.equal(lostRelease.code, 0);
assert.equal(lostRelease.data?.lifecycleStatusCode, 'public_pool');

const lostLeadAfter = await leadApi.fetchLeadById(lostLead.id);
assert.equal(lostLeadAfter.code, 0);
assert.equal(lostLeadAfter.data?.lifecycleStatusCode, 'public_pool');
assert.equal(lostLeadAfter.data?.owner, 'Sales Manager');

const reclaimCustomer = await customerApi.claimCustomerFromPublicPool(lostClaim.data!.customerId!, 'Sales C');
assert.equal(reclaimCustomer.code, 0);
assert.equal(reclaimCustomer.data?.lifecycleStatusCode, 'pending_followup');

const reclaimedLeadAfter = await leadApi.fetchLeadById(lostLead.id);
assert.equal(reclaimedLeadAfter.code, 0);
assert.equal(reclaimedLeadAfter.data?.lifecycleStatusCode, 'pending_followup');

const customerFollowUp = await customerApi.addCustomerFollowUp(lostClaim.data!.customerId!, {
  content: 'Customer reopened and contacted',
  operator: 'Sales C',
});
assert.equal(customerFollowUp.code, 0);
assert.equal(customerFollowUp.data?.lifecycleStatusCode, 'following');

const followedLeadAfter = await leadApi.fetchLeadById(lostLead.id);
assert.equal(followedLeadAfter.code, 0);
assert.equal(followedLeadAfter.data?.lifecycleStatusCode, 'following');

const orderedLead = intakeLead('11111', '13333000002');
const orderedClaim = await leadFlowApi.claimLeadAsCustomer(orderedLead.id);
assert.equal(orderedClaim.code, 0);
assert.equal(orderedClaim.data?.lifecycleStatusCode, 'following');
assert.ok(orderedClaim.data?.customerId);

const orderCreate = await orderApi.createOrder({
  customerId: orderedClaim.data!.customerId!,
  customerName: orderedClaim.data!.name,
  productLevel: '899',
  orderType: 'new',
  amount: 9800,
  actualAmount: 9800,
  paymentMethod: '对公转账',
  status: '已确认',
  refundStatus: '无',
  owner: 'Sales B',
  salesName: 'Sales B',
  sourceType: 'company',
  resourceOwnership: '公司资源',
  officialPaymentChannel: '对公转账',
  dealScene: '线索',
  proofStatus: '已齐全',
  payments: [],
} as any);
assert.equal(orderCreate.code, 0);

const orderedLeadAfter = await leadApi.fetchLeadById(orderedLead.id);
assert.equal(orderedLeadAfter.code, 0);
assert.equal(orderedLeadAfter.data?.lifecycleStatusCode, 'ordered');
assert.equal(orderedLeadAfter.data?.orderId, orderCreate.data.id);

const orderedCustomerAfter = await customerApi.fetchCustomerById(orderedClaim.data!.customerId!);
assert.equal(orderedCustomerAfter.code, 0);
assert.equal(orderedCustomerAfter.data?.lifecycleStatusCode, 'ordered');
assert.equal(orderedCustomerAfter.data?.orderCount, 1);
