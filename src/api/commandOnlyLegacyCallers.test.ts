import assert from 'node:assert/strict';
import { customerApi } from './customerApi';
import { leadApi } from './leadApi';
import { businessRecycleBinApi } from './businessRecycleBinApi';
import { opportunityApi } from './opportunityApi';
import { productApi } from './productApi';
import { refundApi } from './refundApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import type { Customer } from '../types/customer';
import type { Lead } from '../types/lead';

const values = new Map<string, string>();
const storage = {
  get length() { return values.size; },
  key: (index: number) => Array.from(values.keys())[index] ?? null,
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
  clear: () => values.clear(),
};
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const originalFetch = globalThis.fetch;
const originalBackendFlag = process.env.VITE_USE_BACKEND_API;
let fetchCalls = 0;

const publicCustomer: Customer = {
  id: 'cust-public-ai',
  name: '公海客户',
  company: '公海公司',
  phone: '13900000081',
  owner: '公海',
  lifecycleStatusCode: 'public_pool',
  customerLevel: 'L1',
  totalSpent: 0,
  orderCount: 0,
  growthPath: [],
  growthRecords: [],
  activityRecords: [],
  createdAt: '2026-07-12T00:00:00.000Z',
  updatedAt: '2026-07-12T00:00:00.000Z',
};

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.USERS, JSON.stringify([{
    id: 'user-super',
    name: '超级管理员',
    account: 'super',
    email: '',
    phone: '',
    role: '超级管理员',
    isActive: true,
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
  }]));
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    userId: 'user-super',
    token: 'super-session',
    remember: true,
    createdAt: '2026-07-12T00:00:00.000Z',
  }));
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([publicCustomer]));
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error('安全禁用的功能不应请求服务器');
  }) as typeof fetch;

  const portrait = await customerApi.fetchAIPortrait(publicCustomer.id);
  assert.notEqual(portrait.code, 0);
  assert.match(portrait.message || '', /暂停|服务器|安全/);
  assert.deepEqual(
    JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]'),
    [publicCustomer],
    'AI 画像不得用本地旧快照改写公海客户',
  );
  assert.equal(fetchCalls, 0);

  const publicLead: Lead = {
    id: 'lead-public-ai',
    name: '公海线索',
    company: '公海公司',
    phone: '13900000082',
    source: '手工录入',
    status: '新线索',
    owner: '公海',
    lifecycleStatusCode: 'public_pool',
    followUpRecords: [],
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
  };
  storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([publicLead]));
  const analysis = await leadApi.refreshAIAnalysis(publicLead.id);
  assert.notEqual(analysis.code, 0);
  assert.match(analysis.message || '', /暂停|服务器|安全/);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]'), [publicLead]);
  assert.equal(fetchCalls, 0);

  const deletedLead = {
    ...publicLead,
    deletedAt: '2026-07-12T01:00:00.000Z',
    deletedBy: '超级管理员',
  };
  storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([deletedLead]));
  const restoreLead = await businessRecycleBinApi.restoreRecycleBinItem('lead', deletedLead.id);
  assert.notEqual(restoreLead.code, 0);
  assert.match(restoreLead.message || '', /服务器|暂不支持|安全/);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]'), [deletedLead]);
  assert.equal(fetchCalls, 0);

  const deletedCustomer = {
    ...publicCustomer,
    deletedAt: '2026-07-12T01:00:00.000Z',
    deletedBy: '超级管理员',
  };
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([deletedCustomer]));
  const restoreCustomer = await businessRecycleBinApi.restoreRecycleBinItem('customer', deletedCustomer.id);
  assert.notEqual(restoreCustomer.code, 0);
  assert.match(restoreCustomer.message || '', /服务器|暂不支持|安全/);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]'), [deletedCustomer]);
  assert.equal(fetchCalls, 0);

  storage.setItem(STORAGE_KEYS.LEADS, JSON.stringify([publicLead]));
  storage.setItem(STORAGE_KEYS.OPPORTUNITIES, JSON.stringify([]));
  const opportunity = await opportunityApi.createFromLead(publicLead);
  assert.notEqual(opportunity.code, 0);
  assert.match(opportunity.message || '', /服务器|暂停|安全/);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.LEADS) || '[]'), [publicLead]);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.OPPORTUNITIES) || '[]'), []);
  assert.equal(fetchCalls, 0);

  const level = {
    id: 'level-old',
    name: '旧等级',
    price: 9800,
    description: '',
    color: '#000000',
    sortOrder: 1,
    isActive: true,
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
  };
  storage.setItem(STORAGE_KEYS.PRODUCT_LEVELS, JSON.stringify([level]));
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([publicCustomer]));
  const renameLevel = await productApi.updateProductLevelConfig(level.id, { name: '新等级' });
  assert.notEqual(renameLevel.code, 0);
  assert.match(renameLevel.message || '', /服务器|暂停|安全/);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.PRODUCT_LEVELS) || '[]'), [level]);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEYS.CUSTOMERS) || '[]'), [publicCustomer]);
  assert.equal(fetchCalls, 0);

  const completeRefund = await refundApi.completeRefund('refund-backend', '对公转账');
  assert.notEqual(completeRefund.code, 0);
  assert.match(completeRefund.message || '', /服务器|暂停|安全/);
  assert.equal(fetchCalls, 0);
} finally {
  globalThis.fetch = originalFetch;
  if (originalBackendFlag === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalBackendFlag;
}
