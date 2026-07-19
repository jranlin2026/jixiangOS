import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { leadFlowApi } from './leadFlowApi';
import { leadApi } from './leadApi';
import { LEAD_STATUS, STORAGE_KEYS } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { PERMISSION_KEYS } from '../shared/utils/permissions';
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

const flowConfigSource = readFileSync(join(process.cwd(), 'src', 'pages', 'Leads', 'LeadFlowConfigTab.tsx'), 'utf8');
assert.match(flowConfigSource, /phone_or_wechat/);
assert.doesNotMatch(flowConfigSource, /value="phone"/);
assert.doesNotMatch(flowConfigSource, /value="wechat"/);
assert.doesNotMatch(flowConfigSource, /exemptionEnabled|orderMatchCustomerEnabled|dailyRestartEnabled|failedInboundCompensationEnabled|inactiveMemberSkipEnabled/);
assert.match(flowConfigSource, /participantDialogOpen/);
assert.match(flowConfigSource, /添加成员/);
assert.match(flowConfigSource, /选择成员/);
assert.match(flowConfigSource, /departmentApi/);
assert.match(flowConfigSource, /默认全体在职员工/);
assert.match(flowConfigSource, /getParticipantLabel/);
assert.match(flowConfigSource, /线索自动领取/);
assert.match(flowConfigSource, /formatEmployeeNameWithPosition\(user\)/);
assert.doesNotMatch(flowConfigSource, /salesUsers\.map\(\(user\) => \(\s*<FormControlLabel/);

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

storage.setItem(STORAGE_KEYS.LEAD_FLOW_CONFIG, JSON.stringify({
  id: 'lead-flow-global',
  uniqueKeyMode: 'phone',
  interceptionEnabled: true,
  autoAssignEnabled: true,
  assignmentMode: 'round_robin',
  participantUserIds: [],
  dailyLimitEnabled: true,
  dailyLimit: 200,
  lastAssignedIndex: -1,
  updatedAt: now,
}));
const migratedFlowConfig = await leadFlowApi.fetchLeadFlowConfig();
assert.equal(migratedFlowConfig.data.uniqueKeyMode, 'phone_or_wechat');
assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.LEAD_FLOW_CONFIG) || '{}').uniqueKeyMode, 'phone_or_wechat');

const res = await leadFlowApi.manualAssignLead('lead-flow-test', 'Li');
assert.equal(res.code, 0);
assert.ok(res.data);
assert.equal(res.data?.assignedTo, 'Li');
assert.equal(res.data?.owner, 'Li');
assert.equal(res.data?.lifecycleStatusCode, 'pending_followup');
assert.equal(res.data?.customerId, undefined);
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
assert.equal(intake.lead?.phone, '+8613900000002');

const records = JSON.parse(storage.getItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS) || '[]');
assert.equal(records[0]?.source, 'Live-Douyin02');

const customersAfterIntake = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]');
assert.equal(customersAfterIntake.length, customerCountBeforeIntake);
assert.equal(customersAfterIntake.some((item: any) => item.phone === '+8613900000002'), false);

const assignRes = await leadFlowApi.manualAssignLead(intake.lead!.id, 'Li');
assert.equal(assignRes.code, 0);
assert.equal(assignRes.data?.lifecycleStatusCode, 'pending_followup');
assert.equal(assignRes.data?.customerId, undefined);

const customersAfterAssign = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]');
assert.equal(customersAfterAssign.length, customerCountBeforeIntake);

const unauthorizedClaim = await leadFlowApi.claimLeadAsCustomer(intake.lead!.id);
assert.equal(unauthorizedClaim.code, 403, '非销售员工不得领取线索转客户');
assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]').length, customerCountBeforeIntake);

storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([
  ...JSON.parse(storage.getItem(STORAGE_KEYS.USERS) || '[]'),
  {
    id: 'user-sales-manager', name: 'Sales Manager', account: 'sales-manager', email: '', phone: '',
    role: 'Sales Manager', roleId: 'role-sales-manager', departmentId: 'dept-sales', isActive: true,
    createdAt: now, updatedAt: now,
  },
]));
storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify([{
  id: 'role-sales-manager', name: 'Sales Manager', code: 'sales_manager',
  permissions: [{ module: PERMISSION_KEYS.LEADS_FOLLOW, actions: ['read', 'write'] }],
  dataScopes: { leads: 'all' }, memberCount: 1, isActive: true, createdAt: now, updatedAt: now,
}]));
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  userId: 'user-sales-manager', token: 'sales-manager-token', remember: true, createdAt: now,
}));

assert.equal(leadFlowApi.claimLeadAsCustomer.length, 1, '领取人必须来自当前会话，接口不得接收用户名参数');
const claimRes = await leadFlowApi.claimLeadAsCustomer(intake.lead!.id);
assert.equal(claimRes.code, 0);
assert.equal(claimRes.data?.lifecycleStatusCode, 'following');
assert.ok(claimRes.data?.customerId);
assert.equal(claimRes.data?.owner, 'Sales Manager');
assert.equal(claimRes.data?.ownerId, 'user-sales-manager');
assert.equal(claimRes.data?.assignedTo, 'Sales Manager');
assert.equal(claimRes.data?.assignedToId, 'user-sales-manager');
assert.deepEqual(claimRes.data?.changeHistory?.[0].changes?.[0], {
  field: 'assignedTo',
  label: '分配销售',
  oldValue: 'Li',
  newValue: 'Sales Manager',
});

const customersAfterClaim = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]');
assert.equal(customersAfterClaim.length, customerCountBeforeIntake + 1);
const claimedCustomer = customersAfterClaim.find((item: any) => item.phone === '+8613900000002');
assert.equal(claimedCustomer?.lifecycleStatusCode, 'following');
assert.equal(claimedCustomer?.owner, 'Sales Manager');
assert.equal(claimedCustomer?.ownerId, 'user-sales-manager');
assert.equal(claimedCustomer?.ownerIdentityStatus, 'resolved');

leadFlowApi.syncCustomerByLead({
  ...claimRes.data!,
  owner: '只有姓名的历史负责人',
  ownerId: undefined,
});
const customerAfterUnsafeLegacySync = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]')
  .find((item: any) => item.id === claimedCustomer?.id);
assert.equal(customerAfterUnsafeLegacySync?.owner, 'Sales Manager');
assert.equal(customerAfterUnsafeLegacySync?.ownerId, 'user-sales-manager');
assert.equal(customerAfterUnsafeLegacySync?.ownerIdentityStatus, 'resolved');

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

const createLeadInput = (
  name: string,
  overrides: Partial<Parameters<typeof leadFlowApi.intakeLead>[0]> = {},
): Parameters<typeof leadFlowApi.intakeLead>[0] => ({
  name,
  company: `${name} Company`,
  phone: '',
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
  ...overrides,
});

storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([{
  id: 'customer-wechat',
  name: 'Existing Wechat Customer',
  company: 'Existing Company',
  phone: '',
  wechat: 'wx-existing',
  owner: 'Sales A',
  lifecycleStatusCode: 'following',
  customerLevel: 'L1',
  totalSpent: 0,
  orderCount: 0,
  growthPath: [],
  growthRecords: [],
  activityRecords: [],
  tags: [],
  createdAt: now,
  updatedAt: now,
}]));
storage.setItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS, JSON.stringify([]));
const duplicateWechat = leadFlowApi.intakeLead(createLeadInput('Duplicate Wechat', { wechat: 'wx-existing' }));
assert.equal(duplicateWechat.lead, null);
assert.equal(JSON.parse(storage.getItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS) || '[]')[0]?.collisionTargetId, 'customer-wechat');

storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS, JSON.stringify([]));
const missingContact = leadFlowApi.intakeLead(createLeadInput('Missing Contact'));
assert.equal(missingContact.lead, null);
assert.ok(JSON.parse(storage.getItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS) || '[]')[0]?.failureReason);

const salesUsers = [
  {
    id: 'user-market',
    name: 'Market A',
    account: 'market-a',
    email: 'market-a@company.com',
    phone: '',
    role: 'Market Specialist',
    roleId: 'role-market-specialist',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-sales-a',
    name: 'Sales A',
    account: 'sales-a',
    email: 'sales-a@company.com',
    phone: '',
    role: 'Sales Consultant',
    roleId: 'role-sales-consultant',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-sales-b',
    name: 'Sales B',
    account: 'sales-b',
    email: 'sales-b@company.com',
    phone: '',
    role: 'Sales Consultant',
    roleId: 'role-sales-consultant',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-admin-candidate',
    name: 'Admin Candidate',
    account: 'admin-candidate',
    email: 'admin-candidate@company.com',
    phone: '',
    role: 'Super Admin',
    roleId: 'role-super-admin',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

storage.setItem(STORAGE_KEYS.USERS, JSON.stringify(salesUsers));
storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.LEAD_FLOW_CONFIG, JSON.stringify({
  id: 'lead-flow-global',
  uniqueKeyMode: 'phone_or_wechat',
  interceptionEnabled: true,
  autoAssignEnabled: true,
  assignmentMode: 'round_robin',
  participantUserIds: [],
  dailyLimitEnabled: false,
  dailyLimit: 200,
  lastAssignedIndex: -1,
  updatedAt: now,
}));
const defaultParticipantFallback = leadFlowApi.intakeLead(createLeadInput('Default Participant Fallback', { phone: '13900001000' }));
assert.equal(defaultParticipantFallback.lead?.owner, 'Market A');
assert.equal(defaultParticipantFallback.lead?.assignedTo, 'Market A');
const defaultParticipantRecord = JSON.parse(storage.getItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS) || '[]')[0];
assert.equal(defaultParticipantRecord?.assignedTo, 'Market A');
assert.equal(defaultParticipantRecord?.status, '入库成功');

storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.LEAD_FLOW_CONFIG, JSON.stringify({
  id: 'lead-flow-global',
  uniqueKeyMode: 'phone_or_wechat',
  interceptionEnabled: true,
  autoAssignEnabled: true,
  assignmentMode: 'round_robin',
  participantUserIds: ['missing-user'],
  dailyLimitEnabled: false,
  dailyLimit: 200,
  lastAssignedIndex: -1,
  updatedAt: now,
}));
const staleParticipantFallback = leadFlowApi.intakeLead(createLeadInput('Stale Participant Fallback', { phone: '13900001005' }));
assert.equal(staleParticipantFallback.lead?.owner, '待分配');
assert.equal(staleParticipantFallback.lead?.assignedTo, undefined);
const staleParticipantRecord = JSON.parse(storage.getItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS) || '[]')[0];
assert.equal(staleParticipantRecord?.status, '待分配');

storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.LEAD_FLOW_CONFIG, JSON.stringify({
  id: 'lead-flow-global',
  uniqueKeyMode: 'phone_or_wechat',
  interceptionEnabled: true,
  autoAssignEnabled: true,
  assignmentMode: 'round_robin',
  participantUserIds: ['user-sales-a', 'user-sales-b'],
  dailyLimitEnabled: false,
  dailyLimit: 200,
  lastAssignedIndex: -1,
  updatedAt: now,
}));
const roundRobinFirst = leadFlowApi.intakeLead(createLeadInput('Round Robin First', { phone: '13900001001' }));
const roundRobinSecond = leadFlowApi.intakeLead(createLeadInput('Round Robin Second', { phone: '13900001002' }));
assert.equal(roundRobinFirst.lead?.assignedTo, 'Sales A');
assert.equal(roundRobinSecond.lead?.assignedTo, 'Sales B');

storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.LEAD_FLOW_CONFIG, JSON.stringify({
  id: 'lead-flow-global',
  uniqueKeyMode: 'phone_or_wechat',
  interceptionEnabled: true,
  autoAssignEnabled: true,
  autoClaimAfterAssignmentEnabled: true,
  assignmentMode: 'round_robin',
  participantUserIds: ['user-sales-a'],
  dailyLimitEnabled: false,
  dailyLimit: 200,
  lastAssignedIndex: -1,
  updatedAt: now,
}));
const autoClaimedIntake = leadFlowApi.intakeLead(createLeadInput('Auto Claimed Lead', { phone: '13900001007' }));
assert.equal(autoClaimedIntake.lead?.assignedTo, 'Sales A');
assert.equal(autoClaimedIntake.lead?.owner, 'Sales A');
assert.equal(autoClaimedIntake.lead?.lifecycleStatusCode, 'following');
assert.ok(autoClaimedIntake.lead?.customerId);
const autoClaimedCustomers = JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]');
assert.equal(autoClaimedCustomers.length, 1);
assert.equal(autoClaimedCustomers[0]?.owner, 'Sales A');
assert.equal(autoClaimedCustomers[0]?.phone, '+8613900001007');
assert.equal(autoClaimedCustomers[0]?.lifecycleStatusCode, 'following');

storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.LEAD_FLOW_CONFIG, JSON.stringify({
  id: 'lead-flow-global',
  uniqueKeyMode: 'phone_or_wechat',
  interceptionEnabled: true,
  autoAssignEnabled: true,
  assignmentMode: 'round_robin',
  participantUserIds: ['user-sales-a'],
  dailyLimitEnabled: false,
  dailyLimit: 200,
  lastAssignedIndex: -1,
  updatedAt: now,
}));
storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  userId: 'user-market',
  token: 'test-token-market',
  remember: true,
  createdAt: now,
}));
const marketIntake = leadFlowApi.intakeLead(createLeadInput('Market Intake', {
  phone: '13900001006',
  inputBy: 'Market A',
  owner: '待分配',
}));
assert.equal(marketIntake.lead?.inputBy, 'Market A');
assert.equal(marketIntake.lead?.assignedTo, 'Sales A');
assert.notEqual(marketIntake.lead?.assignedTo, 'Admin Candidate');

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  userId: 'user-market',
  token: 'test-token-market',
  remember: true,
  createdAt: now,
}));
assert.deepEqual((await leadApi.fetchLeads({ pageSize: 20 })).data.items.map((item) => item.id), [marketIntake.lead?.id]);

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  userId: 'user-sales-a',
  token: 'test-token-sales-a',
  remember: true,
  createdAt: now,
}));
assert.deepEqual((await leadApi.fetchLeads({ pageSize: 20 })).data.items.map((item) => item.id), [marketIntake.lead?.id]);

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  userId: 'user-sales-b',
  token: 'test-token-sales-b',
  remember: true,
  createdAt: now,
}));
assert.deepEqual((await leadApi.fetchLeads({ pageSize: 20 })).data.items.map((item) => item.id), []);

storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
  userId: 'user-admin-candidate',
  token: 'test-token-admin',
  remember: true,
  createdAt: now,
}));
assert.equal((await leadApi.fetchLeads({ pageSize: 20 })).data.items.some((item) => item.id === marketIntake.lead?.id), true);

storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([]));
storage.setItem(STORAGE_KEYS.LEAD_INTAKE_RECORDS, JSON.stringify([{
  id: 'intake-existing',
  name: 'Already Assigned',
  phone: '13900001003',
  inputBy: 'InputUser',
  assignedTo: 'Sales A',
  status: '入库成功',
  matchedRule: 'round_robin',
  createdAt: new Date().toISOString(),
}]));
storage.setItem(STORAGE_KEYS.LEAD_FLOW_CONFIG, JSON.stringify({
  id: 'lead-flow-global',
  uniqueKeyMode: 'phone_or_wechat',
  interceptionEnabled: true,
  autoAssignEnabled: true,
  assignmentMode: 'round_robin',
  participantUserIds: ['user-sales-a', 'user-sales-b'],
  dailyLimitEnabled: true,
  dailyLimit: 1,
  lastAssignedIndex: -1,
  updatedAt: now,
}));
const skippedByDailyLimit = leadFlowApi.intakeLead(createLeadInput('Daily Limit Skip', { phone: '13900001004' }));
assert.equal(skippedByDailyLimit.lead?.assignedTo, 'Sales B');
