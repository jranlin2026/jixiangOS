import assert from 'node:assert/strict';
import { createBusinessRecycleBinService } from './businessRecycleBinService';

const deletedAt = '2026-07-21T03:00:00.000Z';
let repositoryInput: any;
const repository = {
  listDeleted: async (input: any) => {
    repositoryInput = input;
    return { total: 1, rows: [
    {
      type: 'customer',
      data: {
        id: 'customer-deleted', name: '已删除客户', company: '测试公司', owner: '管理员',
        deletedAt, deletedBy: '管理员', deleteReason: '重复数据',
      },
    },
  ] };
  },
};
const superAdmin = {
  id: 'admin', name: '管理员', account: 'admin', role: '超级管理员',
  permissions: [{ module: '全部', actions: ['read', 'write', 'delete', 'admin'] }],
  isActive: true,
} as any;

const service = createBusinessRecycleBinService(repository as any);
const result = await service.list({ type: 'customer', search: '测试', page: 1, pageSize: 20 }, superAdmin);
assert.equal(result.code, 0);
assert.equal(result.data?.pagination.total, 1);
assert.deepEqual(result.data?.items.map((item) => item.id), ['customer-deleted']);
assert.equal(result.data?.items[0].deleteReason, '重复数据');
assert.deepEqual(repositoryInput, { type: 'customer', search: '测试', offset: 0, limit: 20 });

const forbidden = await service.list({}, { ...superAdmin, role: '销售顾问', permissions: [] });
assert.equal(forbidden.code, 403);

console.log('business recycle bin service tests passed');
