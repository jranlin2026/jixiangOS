import assert from 'node:assert/strict';
import { customerApi } from './customerApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
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

const now = '2026-06-18T12:00:00.000Z';

const customer: Customer = {
  id: 'cust-test',
  name: '测试客户',
  company: '测试公司',
  phone: '13900000000',
  wechat: 'wx-test',
  email: '',
  customerLevel: 'L1',
  owner: '王磊',
  totalSpent: 0,
  orderCount: 0,
  growthPath: [],
  growthRecords: [],
  activityRecords: [],
  leadInputBy: '张伟',
  leadSource: '直播部',
  sourceName: '抖音02',
  sourceType: '公司资源',
  industry: '制造业',
  city: '深圳',
  remark: '',
  createdAt: now,
  updatedAt: now,
};

const legacyCustomer: Customer = {
  ...customer,
  id: 'cust-legacy',
  name: '旧来源客户',
  phone: '13800000000',
  wechat: 'wx-legacy',
  leadSource: undefined,
  sourceName: '老客户推荐',
  sourceType: '转介绍',
};

const blankContactCustomer: Customer = {
  ...customer,
  id: 'cust-blank-contact',
  name: 'Blank Contact Customer',
  phone: '',
  wechat: '',
};

const invalidContactCustomer: Customer = {
  ...customer,
  id: 'cust-invalid-contact',
  name: 'Invalid Contact Customer',
  phone: '12100019019',
  wechat: 'invalid_contact_wx',
};

const lead: Lead = {
  id: 'lead-test',
  customerId: 'cust-test',
  name: '测试客户',
  company: '测试公司',
  phone: '13900000000',
  wechat: 'wx-test',
  source: '直播部',
  sourceName: '抖音02',
  sourceType: '公司资源',
  status: '新线索',
  lifecycleStatus: '待跟进',
  intakeStatus: '入库成功',
  inputBy: '张伟',
  assignedTo: '王磊',
  owner: '王磊',
  industry: '制造业',
  city: '深圳',
  createdAt: now,
  updatedAt: now,
  followUpRecords: [],
};

const order: Order = {
  id: 'order-test',
  orderNo: 'ORD-TEST-0001',
  customerId: 'cust-test',
  customerName: '测试公司',
  productLevel: '899',
  orderType: '新购',
  amount: 899,
  actualAmount: 899,
  paymentMethod: '对公转账',
  status: '已确认',
  refundStatus: '无',
  owner: '王磊',
  sourceType: '公司资源',
  resourceOwnership: '公司资源',
  payments: [{
    id: 'pay-test',
    amount: 899,
    paymentMethod: '对公转账',
    paidAt: now,
  }],
  createdAt: now,
  updatedAt: now,
};

storage.clear();
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
  id: 'user-admin',
  name: '系统管理员',
  account: 'admin',
  email: '',
  phone: '',
  role: '超级管理员',
  roleId: 'role-admin',
  departmentId: 'dept-admin',
  isActive: true,
  createdAt: now,
  updatedAt: now,
}]));
storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([{
  id: 'role-admin',
  name: '超级管理员',
  code: 'super_admin',
  permissions: [{ module: '全部', actions: ['admin'] }],
  memberCount: 1,
  isActive: true,
  createdAt: now,
  updatedAt: now,
}]));
storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify([{
  id: 'dept-admin',
  name: '总经办',
  code: 'ADMIN',
  memberCount: 1,
  isActive: true,
  createdAt: now,
  updatedAt: now,
}]));
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  userId: 'user-admin',
  token: 'token-admin',
  remember: true,
  createdAt: now,
}));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([customer, legacyCustomer, blankContactCustomer, invalidContactCustomer]));
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([lead]));
storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([order]));
const listRes = await customerApi.fetchCustomers({ pageSize: 10 });
const normalizedCustomer = listRes.data.items.find((item) => item.id === 'cust-test');
const normalizedLegacy = listRes.data.items.find((item) => item.id === 'cust-legacy');
assert.equal(normalizedCustomer?.totalSpent, 899);
assert.equal(normalizedCustomer?.orderCount, 1);
assert.equal(normalizedCustomer?.productLevel, '899');
assert.equal(normalizedCustomer?.growthPath?.[0]?.orderNo, 'ORD-TEST-0001');
const secondListRes = await customerApi.fetchCustomers({ pageSize: 10 });
const secondNormalizedCustomer = secondListRes.data.items.find((item) => item.id === 'cust-test');
assert.equal(secondNormalizedCustomer?.growthPath?.filter((item) => item.orderNo === 'ORD-TEST-0001').length, 1);
assert.equal(secondNormalizedCustomer?.activityRecords?.filter((item) => item.relatedId === 'order-test' && item.type === 'order').length, 1);
assert.equal(normalizedLegacy?.leadSource, '转介绍');
assert.equal(normalizedLegacy?.sourceType, '个人资源');

const res = await customerApi.updateCustomer('cust-test', {
  owner: '李娜',
  industry: '智能制造',
  city: '广州',
  remark: '客户资料已完善',
});

assert.equal(res.code, 0);
assert.ok(res.data);

const updatedLeads = JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]') as Lead[];
const updatedLead = updatedLeads.find((item) => item.id === 'lead-test');
assert.ok(updatedLead);
assert.equal(updatedLead.assignedTo, '李娜');
assert.equal(updatedLead.owner, '李娜');
assert.equal(updatedLead.industry, '智能制造');
assert.equal(updatedLead.city, '广州');
assert.equal(updatedLead.remark, '客户资料已完善');
assert.deepEqual(updatedLead.changeHistory?.[0]?.changes?.map((item) => item.field), ['phone', 'industry', 'city', 'assignedTo', 'remark']);

const followUpWithAttachmentRes = await customerApi.addCustomerFollowUp('cust-test', {
  content: 'Shared proposal and voice memo',
  attachments: [{
    id: 'att-test-image',
    name: 'proposal.png',
    size: 2048,
    type: 'image/png',
    category: 'image',
    dataUrl: 'data:image/png;base64,AA==',
    uploadedAt: now,
  }],
} as any);
assert.equal(followUpWithAttachmentRes.code, 0);
assert.equal(followUpWithAttachmentRes.data?.activityRecords?.[0]?.attachments?.[0]?.name, 'proposal.png');
assert.equal(followUpWithAttachmentRes.data?.activityRecords?.[0]?.attachments?.[0]?.category, 'image');

storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
  id: 'user-sales',
  name: 'Sales User',
  account: 'sales',
  email: 'sales@company.com',
  phone: '',
  role: '\u9500\u552e\u987e\u95ee',
  isActive: true,
  createdAt: now,
  updatedAt: now,
}]));
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  userId: 'user-sales',
  token: 'test-token',
  remember: true,
  createdAt: now,
}));

const completedCustomerContactRes = await customerApi.updateCustomer('cust-blank-contact', {
  phone: '13811112222',
  wechat: 'customer_wx_001',
});
assert.equal(completedCustomerContactRes.code, 0);
assert.equal(completedCustomerContactRes.data?.phone, '+8613811112222');
assert.equal(completedCustomerContactRes.data?.wechat, 'customer_wx_001');

const lockedCustomerContactRes = await customerApi.updateCustomer('cust-blank-contact', {
  phone: '13833334444',
  wechat: 'customer_wx_002',
});
assert.equal(lockedCustomerContactRes.code, 0);
assert.equal(lockedCustomerContactRes.data?.phone, '+8613811112222');
assert.equal(lockedCustomerContactRes.data?.wechat, 'customer_wx_001');

const correctedInvalidContactRes = await customerApi.updateCustomer('cust-invalid-contact', {
  phone: '13328951873',
  wechat: 'invalid_contact_wx_002',
});
assert.equal(correctedInvalidContactRes.code, 0);
assert.equal(correctedInvalidContactRes.data?.phone, '+8613328951873');
assert.equal(correctedInvalidContactRes.data?.wechat, 'invalid_contact_wx');

storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
  id: 'user-sales',
  name: 'System Admin',
  account: 'admin',
  email: 'admin@company.com',
  phone: '',
  role: '\u8d85\u7ea7\u7ba1\u7406\u5458',
  isActive: true,
  createdAt: now,
  updatedAt: now,
}]));

const superAdminCustomerContactRes = await customerApi.updateCustomer('cust-blank-contact', {
  phone: '13855556666',
  wechat: 'customer_wx_super',
});
assert.equal(superAdminCustomerContactRes.code, 0);
assert.equal(superAdminCustomerContactRes.data?.phone, '+8613855556666');
assert.equal(superAdminCustomerContactRes.data?.wechat, 'customer_wx_super');
