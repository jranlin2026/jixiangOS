import assert from 'node:assert/strict';
import { createCustomerListService } from './customerListService';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';

const created: any[] = [];
const service = createCustomerListService({
  businessRecord: {
    create: async (input: any) => {
      created.push(input);
      return input.data;
    },
  },
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

const denied = await service.create({
  name: '越权客户',
  company: '越权客户公司',
  phone: '13900000000',
  customerLevel: 'L1',
  owner: '另一位销售',
  sourceType: '公司资源',
}, actor);

assert.equal(denied.code, 403);
assert.equal(created.length, 1);
