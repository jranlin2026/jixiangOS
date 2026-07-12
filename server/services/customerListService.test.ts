import assert from 'node:assert/strict';
import { createCustomerListService } from './customerListService';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';

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
