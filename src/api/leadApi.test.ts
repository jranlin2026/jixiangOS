import assert from 'node:assert/strict';
import { leadApi } from './leadApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import type { Lead } from '../types/lead';

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
const lead: Lead = {
  id: 'lead-test',
  name: '测试线索',
  company: '测试公司',
  phone: '13900000000',
  wechat: 'wx-test',
  source: '直播部',
  sourceName: '抖音02',
  sourceType: '公司资源',
  status: '新线索' as Lead['status'],
  lifecycleStatus: '已转订单',
  intakeStatus: '入库成功',
  inputBy: '张伟',
  assignedTo: '王磊',
  owner: '王磊',
  createdAt: now,
  updatedAt: now,
  followUpRecords: [],
};

const blankContactLead: Lead = {
  ...lead,
  id: 'lead-blank-contact',
  name: 'Blank Contact Lead',
  phone: '',
  wechat: '',
};

storage.clear();
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([lead, blankContactLead]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
  id: 'user-admin',
  name: '系统管理员',
  account: 'admin',
  email: 'admin@company.com',
  phone: '',
  role: '超级管理员',
  isActive: true,
  createdAt: now,
  updatedAt: now,
}]));
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  userId: 'user-admin',
  token: 'test-token',
  remember: true,
  createdAt: now,
}));

const res = await leadApi.updateLead('lead-test', { assignedTo: '李娜', owner: '李娜' });
assert.equal(res.code, 0);
assert.ok(res.data);

const updated = res.data as Lead & {
  changeHistory?: Array<{
    action: string;
    summary: string;
    operator: string;
    changes?: Array<{ field: string; label: string; oldValue?: unknown; newValue?: unknown }>;
  }>;
};

assert.equal(updated.assignedTo, '李娜');
assert.equal(updated.owner, '李娜');
assert.equal(updated.changeHistory?.length, 1);
assert.equal(updated.changeHistory?.[0].action, 'update');
assert.equal(updated.changeHistory?.[0].operator, '系统管理员');
assert.match(updated.changeHistory?.[0].summary || '', /分配销售/);
assert.deepEqual(updated.changeHistory?.[0].changes?.find((item) => item.field === 'assignedTo'), {
  field: 'assignedTo',
  label: '分配销售',
  oldValue: '王磊',
  newValue: '李娜',
});

storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
  id: 'user-admin',
  name: 'System Admin',
  account: 'admin',
  email: 'admin@company.com',
  phone: '',
  role: '\u9500\u552e\u987e\u95ee',
  isActive: true,
  createdAt: now,
  updatedAt: now,
}]));

const completedContactRes = await leadApi.updateLead('lead-blank-contact', {
  phone: '13911112222',
  wechat: 'lead_wx_001',
});
assert.equal(completedContactRes.code, 0);
assert.equal(completedContactRes.data?.phone, '+8613911112222');
assert.equal(completedContactRes.data?.wechat, 'lead_wx_001');

const lockedContactRes = await leadApi.updateLead('lead-blank-contact', {
  phone: '13933334444',
  wechat: 'lead_wx_002',
});
assert.equal(lockedContactRes.code, 0);
assert.equal(lockedContactRes.data?.phone, '+8613911112222');
assert.equal(lockedContactRes.data?.wechat, 'lead_wx_001');

storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
  id: 'user-admin',
  name: 'System Admin',
  account: 'admin',
  email: 'admin@company.com',
  phone: '',
  role: '\u8d85\u7ea7\u7ba1\u7406\u5458',
  isActive: true,
  createdAt: now,
  updatedAt: now,
}]));

const superAdminContactRes = await leadApi.updateLead('lead-blank-contact', {
  phone: '13955556666',
  wechat: 'lead_wx_super',
});
assert.equal(superAdminContactRes.code, 0);
assert.equal(superAdminContactRes.data?.phone, '+8613955556666');
assert.equal(superAdminContactRes.data?.wechat, 'lead_wx_super');

const createRes = await leadApi.createLead({
  name: '无隐藏字段线索',
  company: '干净数据公司',
  phone: '13900009999',
  wechat: '',
  source: '直播部',
  sourceName: '抖音01',
  sourceType: '公司资源',
  status: '新线索',
  inputBy: '张伟',
  owner: '待分配',
  industry: '',
  city: '',
  tags: [],
  remark: '',
});

assert.equal(createRes.code, 0);
assert.ok(createRes.data);
assert.equal(createRes.data?.phone, '+8613900009999');
assert.equal(createRes.data?.email, undefined);
assert.equal(createRes.data?.estimatedAmount, undefined);

storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([
  {
    id: 'user-admin',
    name: '系统管理员',
    account: 'admin',
    email: 'admin@company.com',
    phone: '',
    role: '超级管理员',
    roleId: 'role-super-admin',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-new-sales',
    name: '新销售',
    account: 'new_sales',
    email: 'new_sales@company.com',
    phone: '',
    role: '销售顾问',
    roleId: 'role-sales-consultant',
    isActive: true,
    employmentStatus: 'active',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-system-admin',
    name: 'System Admin',
    account: 'system_admin',
    email: 'system_admin@company.com',
    phone: '',
    role: '超级管理员',
    roleId: 'role-super-admin',
    isActive: true,
    employmentStatus: 'active',
    createdAt: now,
    updatedAt: now,
  },
]));
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([
  {
    ...lead,
    id: 'lead-stale-sales',
    name: '旧销售线索',
    phone: '13900008888',
    assignedTo: '旧销售',
    owner: '旧销售',
  },
  {
    ...lead,
    id: 'lead-active-sales',
    name: '新销售线索',
    phone: '13900007777',
    assignedTo: '新销售',
    owner: '新销售',
  },
  {
    ...lead,
    id: 'lead-active-admin',
    name: '管理员分配线索',
    phone: '13900006666',
    assignedTo: 'System Admin',
    owner: 'System Admin',
  },
]));

const reassignedList = await leadApi.fetchLeads({ page: 1, pageSize: 20 });
const staleSalesLead = reassignedList.data.items.find((item) => item.id === 'lead-stale-sales');
const activeSalesLead = reassignedList.data.items.find((item) => item.id === 'lead-active-sales');
const activeAdminLead = reassignedList.data.items.find((item) => item.id === 'lead-active-admin');
assert.equal(staleSalesLead?.owner, '待分配');
assert.equal(staleSalesLead?.assignedTo, undefined);
assert.equal(activeSalesLead?.owner, '新销售');
assert.equal(activeSalesLead?.assignedTo, '新销售');
assert.equal(activeAdminLead?.owner, 'System Admin');
assert.equal(activeAdminLead?.assignedTo, 'System Admin');
