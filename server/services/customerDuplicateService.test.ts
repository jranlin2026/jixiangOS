import assert from 'node:assert/strict';
import {
  classifyContactIdentityConflict,
  createCustomerDuplicateService,
  redactOutOfScopeConflict,
} from './customerDuplicateService';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';

assert.equal(classifyContactIdentityConflict({ type: 'phone', activeCustomerIds: ['c1', 'c2'] }).confidence, 'high');
assert.equal(classifyContactIdentityConflict({ type: 'name_company', activeCustomerIds: ['c1', 'c2'] }).confidence, 'possible');
assert.deepEqual(
  redactOutOfScopeConflict({ customerId: 'c9', customerName: '张三', ownerName: '李四' }, false),
  { code: 'CONTACT_EXISTS_OUT_OF_SCOPE', message: '系统中已存在相同联系方式' },
);

const groups: any[] = [];
const customers = [
  { id: 'c1', name: '主客户', company: '', phone: '13800138000', owner: '销售甲', ownerId: 'u1', ownerIdentityStatus: 'resolved', customerLevel: 'L1', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], createdAt: '2026-07-18T00:00:00Z', updatedAt: '2026-07-18T00:00:00Z' },
  { id: 'c2', name: '重复客户', company: '', phone: '13800138000', owner: '销售甲', ownerId: 'u1', ownerIdentityStatus: 'resolved', customerLevel: 'L1', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], createdAt: '2026-07-18T00:00:00Z', updatedAt: '2026-07-18T00:00:00Z' },
];
const store = {
  customerDuplicateGroup: {
    async upsert(args: any) {
      const existing = groups.find((group) => group.groupKey === args.where.groupKey);
      if (existing) return existing;
      const created = { ...args.create, createdAt: new Date('2026-07-18T00:00:00Z'), resolvedAt: null, mergeLedgerId: null };
      groups.push(created);
      return created;
    },
    async findUnique(args: any) { return groups.find((group) => group.groupKey === args.where.groupKey) || null; },
    async findMany() { return [...groups]; },
  },
  businessRecord: {
    async findMany() { return customers.map((customer) => ({ domain: 'aaos_customers', recordId: customer.id, data: customer })); },
  },
};
const context = {
  actorId: 'u1', actorName: '销售甲',
  readableUserIds: new Set(['u1']), legacyReadableNames: new Set(['销售甲']), manageableOwnerIds: new Set(['u1']),
  canReadPublicPool: false, canReadCustomerList: true, grantedPermissions: new Set([PERMISSION_KEYS.CUSTOMER_MERGE]),
};
const service = createCustomerDuplicateService(store);
const manual = await service.createManual(context, ['c2', 'c1', 'c2']);
assert.equal(manual.status, 'open', '人工建组不能自动执行合并');
assert.deepEqual(manual.customerIds, ['c1', 'c2']);
assert.equal((await service.list(context))[0].visibleCustomers.length, 2);
assert.deepEqual(await service.list({ ...context, manageableOwnerIds: new Set(['other']) }), [], '范围外候选组必须整体隐藏');

console.log('customer duplicate candidates: ok');
