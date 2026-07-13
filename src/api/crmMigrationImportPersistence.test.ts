import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { crmMigrationTestUtils } from './crmMigrationApi';

const originalFetch = globalThis.fetch;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const storage = new Map<string, string>();
const requests: Array<{ url: string; method?: string; body?: string }> = [];

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    get length() {
      return storage.size;
    },
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => Array.from(storage.keys())[index] || null,
  },
});

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  storage.set(STORAGE_KEYS.CUSTOMERS, JSON.stringify([{
    id: 'stale-browser-customer',
    name: '旧缓存客户',
    phone: '13900000000',
  }]));
  storage.set(STORAGE_KEYS.LEADS, JSON.stringify([]));

  globalThis.fetch = async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method,
      body: typeof init?.body === 'string' ? init.body : undefined,
    });
    return {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      text: async () => {
        const submitted = JSON.parse(String(init?.body || '{}'));
        return JSON.stringify({
          code: 0,
          data: {
            createdIds: [submitted.customers.find((customer: { name: string }) => customer.name === '团队客户').id],
            skippedDuplicates: 1,
          },
          message: 'success',
        });
      },
    } as Response;
  };

  const importResult = await crmMigrationTestUtils.importMigrationTables({
    teamCustomers: [{
      客户全名: '团队客户',
      手机: '13800000001',
      '微信号/昵称': 'team-wechat',
      公司名称: '团队公司',
      客户行业: '零售',
      客户备注: '团队备注',
      最后跟进记录: '已确认报价，等待客户回复',
    }],
    publicPool: [{ 客户全名: '公海客户', 手机: '13800000002' }],
    teamContacts: [{ 客户全名: '公海客户', 姓名: '张联系人', 职务: '总经理', 手机: '13800000009' }],
    assignedLeads: [{ 联系人姓名: '不应导入的商机', 联系方式: '13800000003' }],
  } as any);
  assert.equal(importResult.code, 0);
  assert.deepEqual(importResult.data?.customers, {
    teamCreated: 1,
    publicCreated: 0,
    skippedDuplicates: 1,
  });
  assert.deepEqual(requests.map((request) => [request.url, request.method]), [
    ['http://127.0.0.1:3001/api/crm-migration/import', 'POST'],
  ]);
  const requestBody = JSON.parse(requests[0].body || '{}');
  assert.equal(requestBody.customers.length, 2);
  assert.equal(
    requestBody.customers.some((customer: { id: string }) => customer.id === 'stale-browser-customer'),
    false,
    'EC CRM 导入只能提交本次文件解析出的客户，不能夹带浏览器旧缓存。',
  );
  assert.equal('leads' in requestBody, false, '客户迁移不得再提交或创建线索');
  const publicCustomer = requestBody.customers.find((customer: { name: string }) => customer.name === '公海客户');
  assert.match(publicCustomer.remark, /企业联系人：张联系人（总经理，13800000009）/);
  const teamCustomer = requestBody.customers.find((customer: { name: string }) => customer.name === '团队客户');
  assert.equal(teamCustomer.wechat, 'team-wechat');
  assert.equal(teamCustomer.company, '团队公司');
  assert.equal(teamCustomer.industry, '零售');
  assert.match(teamCustomer.remark, /团队备注/);
  assert.deepEqual(
    teamCustomer.activityRecords.find((record: { type: string }) => record.type === 'follow'),
    {
      id: teamCustomer.activityRecords.find((record: { type: string }) => record.type === 'follow')?.id,
      type: 'follow',
      title: '历史最后跟进记录',
      content: '已确认报价，等待客户回复',
      operator: '系统',
      createdAt: teamCustomer.activityRecords.find((record: { type: string }) => record.type === 'follow')?.createdAt,
    },
  );
} finally {
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) {
    delete process.env.VITE_USE_BACKEND_API;
  } else {
    process.env.VITE_USE_BACKEND_API = originalUseBackend;
  }
  if (originalApiBase === undefined) {
    delete process.env.VITE_AI_API_BASE;
  } else {
    process.env.VITE_AI_API_BASE = originalApiBase;
  }
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  } else {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  }
}
