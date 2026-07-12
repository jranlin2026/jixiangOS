import assert from 'node:assert/strict';
import { createCustomerListService, matchesCustomerTagFilters } from './customerListService';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';

const now = '2026-07-12T00:00:00.000Z';

const created: any[] = [];
const service = createCustomerListService({
  businessRecord: {
    findMany: async (args: any) => {
      if (args?.where?.domain === STORAGE_KEYS.TAG_GROUPS) return [{ data: { id: 'group-both', name: '通用', color: '#1677ff', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 0 } }];
      if (args?.where?.domain === STORAGE_KEYS.TAGS) return [{ data: { id: 'shared', groupId: 'group-both', name: '高意向', color: '#1677ff', isActive: true, sortOrder: 0 } }];
      return created.map((item) => ({ data: item.data.data }));
    },
    create: async (input: any) => {
      if (created.some((item) => item.data.id === input.data.id)) {
        const error = new Error('duplicate business record') as Error & { code?: string };
        error.code = 'P2002';
        throw error;
      }
      created.push(input);
      return input.data;
    },
  },
  leadRecord: { findMany: async () => [] },
} as any);

const actor = {
  id: 'user-sales',
  name: '销售',
  account: 'sales',
  email: '',
  phone: '',
  role: '销售顾问' as any,
  isActive: true,
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_CREATE, actions: ['write'] }],
};

const tagCatalog = {
  groups: [
    { id: 'g-intent', name: '意向', scope: 'customer', isActive: true, sortOrder: 0 },
    { id: 'g-value', name: '价值', scope: 'customer', isActive: true, sortOrder: 1 },
  ],
  tags: [
    { id: 't-agent', groupId: 'g-intent', name: '代理', isActive: true, sortOrder: 0 },
    { id: 't-private', groupId: 'g-intent', name: '私域', isActive: true, sortOrder: 1 },
    { id: 't-high-budget', groupId: 'g-value', name: '高预算', isActive: true, sortOrder: 0 },
  ],
} as any;
const tagCustomers = [
  { id: 'agent-only', manualTagIds: ['t-agent'] },
  { id: 'private-only', manualTagIds: ['t-private'] },
  { id: 'both-intents', manualTagIds: ['t-agent', 't-private'] },
  { id: 'high-budget-agent', manualTagIds: ['t-agent', 't-high-budget'] },
  { id: 'high-budget-private', manualTagIds: ['t-private', 't-high-budget'] },
  { id: 'untagged', manualTagIds: [] },
] as any[];
const matchingIds = (filters: any) => tagCustomers.filter((customer) => matchesCustomerTagFilters(customer, filters, tagCatalog)).map((customer) => customer.id).sort();
assert.deepEqual(matchingIds({ tagIds: ['t-agent', 't-private'], tagMatch: 'any' }), ['agent-only', 'both-intents', 'high-budget-agent', 'high-budget-private', 'private-only']);
assert.deepEqual(matchingIds({ tagIds: ['t-agent', 't-private'], tagMatch: 'all' }), ['both-intents']);
assert.deepEqual(matchingIds({ tagIds: ['t-agent', 't-private', 't-high-budget'], tagMatch: 'grouped' }), ['high-budget-agent', 'high-budget-private']);
assert.deepEqual(matchingIds({ withoutTags: true }), ['untagged']);
assert.deepEqual(matchingIds({ missingTagGroupId: 'g-intent' }), ['untagged']);

const result = await service.create({
  name: '新客户',
  company: '新客户公司',
  phone: '13800000000',
  customerLevel: 'L1',
  owner: '销售',
  sourceType: '公司资源',
}, actor);

assert.equal(result.code, 0);
assert.equal(created.length, 1);
assert.equal(created[0].data.domain, STORAGE_KEYS.CUSTOMERS);
assert.equal(created[0].data.data.name, '新客户');

const tagged = await service.create({
  name: '标签客户', company: '', phone: '13800000001', customerLevel: 'L1', owner: '销售', sourceType: '公司资源', manualTagIds: ['shared'],
}, actor);
assert.deepEqual(tagged.data?.tags, ['高意向']);

const missingTag = await service.create({
  name: '非法标签客户', company: '', phone: '13800000002', customerLevel: 'L1', owner: '销售', sourceType: '公司资源', manualTagIds: ['missing'],
}, actor);
assert.equal(missingTag.code, 400);

const denied = await service.create({
  name: '越权客户',
  company: '越权客户公司',
  phone: '13900000000',
  customerLevel: 'L1',
  owner: '另一位销售',
  sourceType: '公司资源',
}, actor);

assert.equal(denied.code, 403);
assert.equal(created.length, 2);

const emptyName = await service.create({
  name: '',
  company: '',
  phone: '13700000000',
  customerLevel: 'L1',
  owner: '销售',
  sourceType: '公司资源',
}, actor);

assert.equal(emptyName.code, 400);
assert.equal(emptyName.message, '客户姓名不能为空');

const emptyPhone = await service.create({
  name: '缺少手机号',
  company: '',
  phone: '',
  customerLevel: 'L1',
  owner: '销售',
  sourceType: '公司资源',
}, actor);

assert.equal(emptyPhone.code, 400);
assert.equal(emptyPhone.message, '客户手机号或微信至少填写一项');

const wechatOnly = await service.create({
  name: '微信客户',
  company: '',
  phone: '',
  wechat: 'wechat_customer_2026',
  customerLevel: 'L1',
  owner: '销售',
  sourceType: '公司资源',
}, actor);

assert.equal(wechatOnly.code, 0, '页面允许手机号或微信二选一，服务端必须接受仅微信客户');

const overlongName = await service.create({
  name: '客'.repeat(101),
  company: '',
  phone: '13700000001',
  customerLevel: 'L1',
  owner: '销售',
  sourceType: '公司资源',
}, actor);

assert.equal(overlongName.code, 400);
assert.equal(overlongName.message, '客户姓名不能超过100个字符');

const [firstDuplicate, secondDuplicate] = await Promise.all([
  service.create({
    name: '并发客户甲',
    company: '',
    phone: '136 0000 0000',
    customerLevel: 'L1',
    owner: '销售',
    sourceType: '公司资源',
  }, actor),
  service.create({
    name: '并发客户乙',
    company: '',
    phone: '+86 13600000000',
    customerLevel: 'L1',
    owner: '销售',
    sourceType: '公司资源',
  }, actor),
]);

assert.equal(firstDuplicate.code, 0);
assert.equal(secondDuplicate.code, 409);
assert.equal(secondDuplicate.message, '该手机号已存在客户');

const flattenSql = (value: any): string => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value) && !(value as any).strings) return value.map(flattenSql).join(' ');
  const strings = value.strings || (Array.isArray(value[0]) ? value[0] : undefined);
  const values = value.values || (strings ? Array.prototype.slice.call(value, 1) : []);
  if (!strings) return Object.values(value).map(flattenSql).join(' ');
  return Array.from(strings).map((part, index) => `${part}${index < values.length ? flattenSql(values[index]) : ''}`).join('');
};
const capturedQueries: string[] = [];
const listService = createCustomerListService({
  businessRecord: { findMany: async ({ where }: any) => {
    if (where.domain === STORAGE_KEYS.TAG_GROUPS) return tagCatalog.groups.map((data: any) => ({ data }));
    if (where.domain === STORAGE_KEYS.TAGS) return tagCatalog.tags.map((data: any) => ({ data }));
    return [];
  } },
  leadRecord: { findMany: async () => [] },
  user: { findMany: async () => [{ id: 'sales-1', name: '销售甲', account: 'sales', email: '', phone: '', role: '销售顾问', avatar: null, departmentId: 'd1', positionId: null, positionName: null, roleId: 'r1', passwordHash: null, passwordSalt: null, passwordUpdatedAt: null, lastLoginAt: null, isActive: true, employmentStatus: 'active', createdAt: now, updatedAt: now }] },
  role: { findMany: async () => [{ id: 'r1', name: '销售顾问', code: 'sales', description: null, departmentId: null, permissions: [], dataScopes: { customers: 'self' }, memberCount: 1, isActive: true, createdAt: now, updatedAt: now }] },
  department: { findMany: async () => [] },
  $queryRaw: async (...args: any[]) => {
    const sql = flattenSql(args);
    capturedQueries.push(sql);
    return sql.includes('COUNT(*)') ? [{ total: 3n }] : [{ data: { ...created[0].data.data, id: 'page-two' } }];
  },
} as any);
const salesActor = { ...actor, id: 'sales-1', name: '销售甲', account: 'sales', role: '销售顾问', roleId: 'r1', departmentId: 'd1' } as any;
const sqlList = await listService.list({ tagIds: ['t-agent', 't-private', 't-high-budget'], tagMatch: 'grouped', page: 2, pageSize: 2 }, salesActor);
assert.equal(sqlList.code, 0);
assert.deepEqual(sqlList.data?.pagination, { page: 2, pageSize: 2, total: 3, totalPages: 2 });
assert.equal(capturedQueries.length, 2);
for (const sql of capturedQueries) {
  assert.match(sql, /JSON_CONTAINS/);
  assert.match(sql, /t-agent/); assert.match(sql, /t-private/); assert.match(sql, /t-high-budget/);
  assert.match(sql, /owner IN/); assert.match(sql, /销售甲/);
}
assert.match(capturedQueries[1], /LIMIT[\s\S]*OFFSET[\s\S]*2 2$/);

for (const [filters, joiner] of [[{ tagIds: ['t-agent', 't-private'], tagMatch: 'any' }, ' OR '], [{ tagIds: ['t-agent', 't-private'], tagMatch: 'all' }, ' AND '], [{ withoutTags: true }, 'JSON_LENGTH']] as const) {
  capturedQueries.length = 0;
  await listService.list(filters as any, salesActor);
  assert.match(capturedQueries[0], joiner === 'JSON_LENGTH' ? /JSON_LENGTH/ : new RegExp(joiner.trim()));
}
