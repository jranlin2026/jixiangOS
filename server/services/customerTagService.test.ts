import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { createCustomerTagService, loadCustomerTagCatalog } from './customerTagService';

const clone = <T>(value: T): T => structuredClone(value);
const rowKey = (domain: string, recordId: string) => `${domain}:${recordId}`;

class FakePrisma {
  rows = new Map<string, any>();
  roles = new Map([
    ['role-sales', { id: 'role-sales', code: 'sales', isActive: true }],
    ['role-admin', { id: 'role-admin', code: 'super_admin', isActive: true }],
    ['role-disabled-admin', { id: 'role-disabled-admin', code: 'super_admin', isActive: false }],
  ]);
  roleLookups: string[] = [];

  role = {
    findUnique: async (_args: any): Promise<any> => undefined,
  } as any;

  businessRecord = {
    findMany: async ({ where }: any = {}) => Array.from(this.rows.values())
      .filter((row) => !where?.domain || row.domain === where.domain || where.domain?.in?.includes(row.domain))
      .map(clone),
    findUnique: async ({ where }: any) => {
      const pair = where.domain_recordId;
      return clone(this.rows.get(rowKey(pair.domain, pair.recordId)) || null);
    },
    create: async ({ data }: any) => {
      const row = clone(data);
      this.rows.set(rowKey(row.domain, row.recordId), row);
      return clone(row);
    },
    update: async ({ where, data }: any) => {
      const pair = where.domain_recordId;
      const key = rowKey(pair.domain, pair.recordId);
      const row = { ...this.rows.get(key), ...clone(data) };
      this.rows.set(key, row);
      return clone(row);
    },
  };

  leadRecord = {
    findMany: async () => [],
    update: async () => null,
  };

  constructor() {
    this.role.findUnique = async ({ where }: any) => {
      this.roleLookups.push(where.id);
      return clone(this.roles.get(where.id) || null);
    };
  }

  $transaction = async (fn: any) => fn(this);
  seed(domain: string, value: any) {
    this.rows.set(rowKey(domain, value.id), {
      id: rowKey(domain, value.id), domain, recordId: value.id, data: clone(value),
    });
  }
}

const prisma = new FakePrisma();
const service = createCustomerTagService(prisma as any);
const salesUser = {
  id: 'sales', name: '销售', account: 'sales', email: '', phone: '', role: '超级管理员', roleId: 'role-sales',
  isActive: true, permissions: [{ module: '全部', actions: ['read', 'write', 'delete'] }],
} as any;
const superAdmin = { ...salesUser, id: 'admin', name: '管理员', roleId: 'role-admin' };
const disabledAdmin = { ...superAdmin, id: 'disabled', roleId: 'role-disabled-admin' };
const validGroup = { name: '客户阶段', color: '#1677ff', selectionMode: 'multiple', scope: 'both' } as const;

assert.equal((await service.createGroup(validGroup, salesUser)).code, 403);
assert.equal((await service.createGroup(validGroup, disabledAdmin)).code, 403);
const createdGroup = await service.createGroup(validGroup, superAdmin);
assert.equal(createdGroup.code, 0);
assert.equal((await service.createGroup(validGroup, superAdmin)).code, 409);
assert.deepEqual(prisma.roleLookups.slice(0, 4), ['role-sales', 'role-disabled-admin', 'role-admin', 'role-admin']);

const groupId = (createdGroup.data as any).id;
const createdTag = await service.createTag({ groupId, name: '高意向' }, superAdmin);
assert.equal(createdTag.code, 0);
assert.equal((await service.createTag({ groupId, name: ' 高意向 ' }, superAdmin)).code, 409);

const inUseTagId = (createdTag.data as any).id;
prisma.seed(STORAGE_KEYS.CUSTOMERS, {
  id: 'customer-1', name: '客户甲', manualTagIds: [inUseTagId], manualTagNames: ['高意向'], activityRecords: [],
});
assert.equal((await service.updateTag(inUseTagId, { isActive: false }, superAdmin)).code, 0);
const catalogWithInactive = await loadCustomerTagCatalog(prisma as any, true);
assert.equal(catalogWithInactive.tags.find((tag) => tag.id === inUseTagId)?.usageCount, 1);
assert.equal((await loadCustomerTagCatalog(prisma as any)).tags.some((tag) => tag.id === inUseTagId), false);

const target = await service.createTag({ groupId, name: '重点客户' }, superAdmin);
assert.equal(target.code, 0);
const sourceId = inUseTagId;
const targetId = (target.data as any).id;
assert.equal((await service.mergeTag(sourceId, targetId, superAdmin)).code, 0);
const updatedCustomer = prisma.rows.get(rowKey(STORAGE_KEYS.CUSTOMERS, 'customer-1')).data;
assert.deepEqual(updatedCustomer.manualTagIds, [targetId]);
assert.deepEqual(updatedCustomer.manualTagNames, ['重点客户']);
assert.ok(updatedCustomer.activityRecords.some((item: any) => item.title === '合并客户标签'));
