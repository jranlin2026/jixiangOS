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
  restoreOrder: async (id: string, actorName: string) => {
    repositoryInput = { action: 'restore', id, actorName };
  },
  purge: async (type: string, id: string, reason: string, actorName: string) => {
    repositoryInput = { action: 'purge', type, id, reason, actorName };
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

const restored = await service.restore('order', 'order-deleted', superAdmin);
assert.equal(restored.code, 0);
assert.deepEqual(repositoryInput, { action: 'restore', id: 'order-deleted', actorName: '管理员' });

const purged = await service.purge('order', 'order-deleted', '确认清理测试订单', superAdmin);
assert.equal(purged.code, 0);
assert.deepEqual(repositoryInput, {
  action: 'purge', type: 'order', id: 'order-deleted', reason: '确认清理测试订单', actorName: '管理员',
});

const missingReason = await service.purge('order', 'order-deleted', '  ', superAdmin);
assert.equal(missingReason.code, 400);

const customerPurge = await service.purge('customer', 'customer-deleted', '清理测试客户', superAdmin);
assert.equal(customerPurge.code, 0);
assert.deepEqual(repositoryInput, {
  action: 'purge', type: 'customer', id: 'customer-deleted', reason: '清理测试客户', actorName: '管理员',
});

const unsupportedType = await service.purge('unknown' as any, 'record-1', '清理', superAdmin);
assert.equal(unsupportedType.code, 400);

const leadRelationService = createBusinessRecycleBinService({
  ...repository,
  listDeleted: async () => ({
    total: 2,
    rows: [
      {
        type: 'lead',
        data: {
          id: 'lead-linked', name: '仍有关联客户', customerId: 'customer-existing',
          deletedAt, deletedBy: '管理员', deleteReason: '测试',
        },
        linkedCustomerExists: true,
      },
      {
        type: 'lead',
        data: {
          id: 'lead-orphan', name: '客户已不存在', customerId: 'customer-missing',
          deletedAt, deletedBy: '管理员', deleteReason: '测试',
        },
        linkedCustomerExists: false,
      },
    ],
  }),
} as any);
const leadRelationResult = await leadRelationService.list({ type: 'lead' }, superAdmin);
assert.equal(
  leadRelationResult.data?.items.find((item) => item.id === 'lead-linked')?.purgeBlockedReason,
  '请从关联客户统一永久删除',
);
assert.equal(
  leadRelationResult.data?.items.find((item) => item.id === 'lead-orphan')?.purgeBlockedReason,
  undefined,
  '只保留历史 customerId、但客户已不存在的孤儿线索必须允许永久删除',
);

console.log('business recycle bin service tests passed');
