import assert from 'node:assert/strict';
import { leadFlowApi } from './leadFlowApi';
import { leadApi } from './leadApi';
import { LEAD_STATUS, STORAGE_KEYS } from '../shared/utils/constants';
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
  id: 'lead-flow-test',
  name: 'Flow Lead',
  company: 'Test Company',
  phone: '13900000001',
  wechat: 'wx-flow',
  source: 'Live',
  sourceName: 'Douyin02',
  sourceType: 'company',
  status: LEAD_STATUS.NEW,
  lifecycleStatus: 'pending',
  intakeStatus: undefined,
  inputBy: 'InputUser',
  assignedTo: 'Wang',
  owner: 'Wang',
  createdAt: now,
  updatedAt: now,
  followUpRecords: [],
};

storage.clear();
storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([lead]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
  id: 'user-admin',
  name: 'System Admin',
  account: 'admin',
  email: 'admin@company.com',
  phone: '',
  role: 'super_admin',
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

const res = await leadFlowApi.manualAssignLead('lead-flow-test', 'Li');
assert.equal(res.code, 0);
assert.ok(res.data);
assert.equal(res.data?.assignedTo, 'Li');
assert.equal(res.data?.owner, 'Li');
assert.equal(res.data?.lifecycleStatusCode, 'following');
assert.equal(res.data?.changeHistory?.[0].operator, 'System Admin');
assert.deepEqual(res.data?.changeHistory?.[0].changes?.[0], {
  field: 'assignedTo',
  label: '分配销售',
  oldValue: 'Wang',
  newValue: 'Li',
});

storage.setItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS, JSON.stringify([]));
const customerCountBeforeIntake = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]').length;
const intake = leadFlowApi.intakeLead({
  name: 'New Intake Lead',
  company: 'Source Test Company',
  phone: '13900000002',
  wechat: '',
  source: 'Live',
  sourceName: 'Douyin02',
  sourceType: 'company',
  status: LEAD_STATUS.NEW,
  inputBy: 'InputUser',
  owner: 'InputUser',
  industry: '',
  city: '',
  tags: [],
  remark: '',
});
assert.ok(intake.lead);
assert.equal(intake.lead?.lifecycleStatusCode, 'pending_followup');

const records = JSON.parse(storage.getItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS) || '[]');
assert.equal(records[0]?.source, 'Live-Douyin02');

const customersAfterIntake = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]');
assert.equal(customersAfterIntake.length, customerCountBeforeIntake);
assert.equal(customersAfterIntake.some((item: any) => item.phone === '13900000002'), false);

const claimRes = await leadFlowApi.manualAssignLead(intake.lead!.id, 'Li');
assert.equal(claimRes.code, 0);
assert.equal(claimRes.data?.lifecycleStatusCode, 'following');
assert.ok(claimRes.data?.customerId);

const customersAfterClaim = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]');
assert.equal(customersAfterClaim.length, customerCountBeforeIntake + 1);
const claimedCustomer = customersAfterClaim.find((item: any) => item.phone === '13900000002');
assert.equal(claimedCustomer?.lifecycleStatusCode, 'following');
assert.equal(claimedCustomer?.owner, 'Li');

const defaultListRes = await leadApi.fetchLeads({ page: 1, pageSize: 20 });
assert.equal(defaultListRes.code, 0);
assert.equal(defaultListRes.data.items.some((item) => item.id === intake.lead!.id), true);

const publicPoolListRes = await leadApi.fetchLeads({ page: 1, pageSize: 20, lifecycleStatusCode: 'public_pool' });
assert.equal(publicPoolListRes.code, 0);
assert.equal(publicPoolListRes.data.items.some((item) => item.id === intake.lead!.id), false);

const duplicateCustomerPhone = leadFlowApi.intakeLead({
  name: 'Duplicate Customer Phone',
  company: 'Duplicate Company',
  phone: '13900000002',
  wechat: '',
  source: 'Live',
  sourceName: 'Douyin02',
  sourceType: 'company',
  status: LEAD_STATUS.NEW,
  inputBy: 'InputUser',
  owner: 'InputUser',
  industry: '',
  city: '',
  tags: [],
  remark: '',
});
assert.equal(duplicateCustomerPhone.lead, null);
assert.match(duplicateCustomerPhone.message, /手机号已存在于客户库/);

const failedRecords = JSON.parse(storage.getItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS) || '[]');
assert.equal(failedRecords[0]?.status, '入库失败');
assert.match(failedRecords[0]?.failureReason || '', /手机号已存在于客户库/);
