import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { createCustomerTagService, loadCustomerTagCatalog } from './customerTagService';

const clone = <T>(value: T): T => structuredClone(value);
const rowKey = (domain: string, recordId: string) => `${domain}:${recordId}`;

class FakePrisma {
  rows = new Map<string, any>();
  leads = new Map<string, any>();
  lockHeld = false;
  lockWaiters: Array<() => void> = [];
  forceRowLockFailure = false;
  failNextCreate = false;
  failUpdateAfter = -1;
  sqlContracts: string[] = [];
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
      if (this.failNextCreate) {
        this.failNextCreate = false;
        throw new Error('injected create failure');
      }
      const row = clone(data);
      this.rows.set(rowKey(row.domain, row.recordId), row);
      return clone(row);
    },
    upsert: async ({ where, create }: any) => {
      if (this.lockHeld) await new Promise<void>((resolve) => this.lockWaiters.push(resolve));
      else this.lockHeld = true;
      const pair = where.domain_recordId;
      const key = rowKey(pair.domain, pair.recordId);
      if (!this.rows.has(key)) this.rows.set(key, clone(create));
      return clone(this.rows.get(key));
    },
    update: async ({ where, data }: any) => {
      if (this.failUpdateAfter === 0) {
        this.failUpdateAfter = -1;
        throw new Error('injected update failure');
      }
      if (this.failUpdateAfter > 0) this.failUpdateAfter -= 1;
      const pair = where.domain_recordId;
      const key = rowKey(pair.domain, pair.recordId);
      const row = { ...this.rows.get(key), ...clone(data) };
      this.rows.set(key, row);
      return clone(row);
    },
  };

  leadRecord = {
    findMany: async () => Array.from(this.leads.values()).map(clone),
    update: async ({ where, data }: any) => {
      const row = { ...this.leads.get(where.id), ...clone(data) };
      this.leads.set(where.id, row);
      return clone(row);
    },
  };

  constructor() {
    this.role.findUnique = async ({ where }: any) => {
      this.roleLookups.push(where.id);
      return clone(this.roles.get(where.id) || null);
    };
  }

  $queryRaw = async (query: any) => {
    const sql = Array.isArray(query?.strings) ? query.strings.join('?') : String(query);
    this.sqlContracts.push(sql);
    if (/FROM business_records[\s\S]*FOR UPDATE/.test(sql)) {
      if (this.forceRowLockFailure) throw new Error('injected row lock failure');
      return [{ id: 'aaos_internal_locks:customer-tag-catalog-writes' }];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  $transaction = async (fn: any) => {
    const rows = clone(this.rows);
    const leads = clone(this.leads);
    try { return await fn(this); } catch (error) {
      this.rows = rows;
      this.leads = leads;
      throw error;
    } finally {
      const waiter = this.lockWaiters.shift();
      if (waiter) waiter();
      else this.lockHeld = false;
    }
  };
  seed(domain: string, value: any) {
    this.rows.set(rowKey(domain, value.id), {
      id: rowKey(domain, value.id), domain, recordId: value.id, data: clone(value),
    });
  }
  seedLead(value: any) {
    this.leads.set(value.id, { id: value.id, data: clone(value) });
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
assert.ok(prisma.rows.has('aaos_internal_locks:customer-tag-catalog-writes'));
assert.equal((await loadCustomerTagCatalog(prisma as any, true)).groups.length, 1, '内部锁哨兵不得出现在标签目录');
assert.equal((await service.createGroup(validGroup, superAdmin)).code, 409);
assert.deepEqual(prisma.roleLookups.slice(0, 4), ['role-sales', 'role-disabled-admin', 'role-admin', 'role-admin']);

const groupId = (createdGroup.data as any).id;
assert.equal((await service.createGroup({ ...validGroup, id: 'injected' } as any, superAdmin)).code, 400);
assert.equal((await service.createGroup({ ...validGroup, scope: 'invalid' } as any, superAdmin)).code, 400);
assert.equal((await service.updateGroup(groupId, { sortOrder: -1 } as any, superAdmin)).code, 400);
const createdTag = await service.createTag({ groupId, name: '高意向' }, superAdmin);
assert.equal(createdTag.code, 0);
assert.equal((await service.createTag({ groupId, name: ' 高意向 ' }, superAdmin)).code, 409);
assert.equal((await service.createTag({ groupId, name: '非法', createdAt: 'injected' } as any, superAdmin)).code, 400);
assert.equal((await service.updateTag((createdTag.data as any).id, { isActive: 'false' } as any, superAdmin)).code, 400);

const concurrentName = '并发唯一';
const concurrent = await Promise.all([
  service.createTag({ groupId, name: concurrentName }, superAdmin),
  service.createTag({ groupId, name: ` ${concurrentName} ` }, superAdmin),
]);
assert.deepEqual(concurrent.map((result) => result.code).sort((a, b) => a - b), [0, 409]);
assert.ok(prisma.sqlContracts.some((sql) => /FROM business_records[\s\S]*FOR UPDATE/.test(sql)), '必须使用 MySQL 事务级行锁');
assert.equal(prisma.sqlContracts.some((sql) => /GET_LOCK|RELEASE_LOCK|pg_advisory|hashtext/i.test(sql)), false, '不得出现连接级或 PostgreSQL 锁语法');
const renameA = await service.createTag({ groupId, name: '待改名 A' }, superAdmin);
const renameB = await service.createTag({ groupId, name: '待改名 B' }, superAdmin);
const concurrentRenames = await Promise.all([
  service.updateTag((renameA.data as any).id, { name: '同一新名' }, superAdmin),
  service.updateTag((renameB.data as any).id, { name: '同一新名' }, superAdmin),
]);
assert.deepEqual(concurrentRenames.map((result) => result.code).sort((a, b) => a - b), [0, 409]);

prisma.forceRowLockFailure = true;
assert.equal((await service.createTag({ groupId, name: '行锁失败' }, superAdmin)).code, 503);
prisma.forceRowLockFailure = false;
prisma.failNextCreate = true;
await assert.rejects(service.createTag({ groupId, name: '事务异常' }, superAdmin), /injected create failure/);
assert.equal((await service.createTag({ groupId, name: '异常后可继续' }, superAdmin)).code, 0, '回滚后行锁必须自动释放');

const inUseTagId = (createdTag.data as any).id;
prisma.seed(STORAGE_KEYS.CUSTOMERS, {
  id: 'customer-1', name: '客户甲', manualTagIds: [inUseTagId], manualTagNames: ['高意向'], activityRecords: [],
});
prisma.seedLead({ id: 'lead-1', manualTagIds: [inUseTagId], manualTagNames: ['高意向'], activityRecords: [] });
assert.equal((await service.updateTag(inUseTagId, { isActive: false }, superAdmin)).code, 0);
const catalogWithInactive = await loadCustomerTagCatalog(prisma as any, true);
assert.equal(catalogWithInactive.tags.find((tag) => tag.id === inUseTagId)?.usageCount, 2);
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
const updatedLead = prisma.leads.get('lead-1').data;
assert.deepEqual(updatedLead.manualTagIds, [targetId]);

const orderA = await service.createTag({ groupId, name: '排序 A', sortOrder: 1 }, superAdmin);
const orderB = await service.createTag({ groupId, name: '排序 B', sortOrder: 2 }, superAdmin);
assert.equal((await service.reorderTags(groupId, [(orderB.data as any).id, (orderA.data as any).id], superAdmin)).code, 409, '排序必须提交整组标签，避免遗漏');
const groupTagIds = (await loadCustomerTagCatalog(prisma as any, true)).tags.filter((tag) => tag.groupId === groupId).map((tag) => tag.id);
const reversedIds = [...groupTagIds].reverse();
assert.equal((await service.reorderTags(groupId, reversedIds, superAdmin)).code, 0);
const reordered = (await loadCustomerTagCatalog(prisma as any, true)).tags.filter((tag) => tag.groupId === groupId).sort((a, b) => a.sortOrder - b.sortOrder);
assert.deepEqual(reordered.map((tag) => tag.id), reversedIds);

const snapshotBeforeFailedReorder = reordered.map((tag) => ({ id: tag.id, sortOrder: tag.sortOrder }));
prisma.failUpdateAfter = 1;
await assert.rejects(service.reorderTags(groupId, [...reversedIds].reverse(), superAdmin), /injected update failure/);
const afterFailedReorder = (await loadCustomerTagCatalog(prisma as any, true)).tags.filter((tag) => tag.groupId === groupId).sort((a, b) => a.sortOrder - b.sortOrder);
assert.deepEqual(afterFailedReorder.map((tag) => ({ id: tag.id, sortOrder: tag.sortOrder })), snapshotBeforeFailedReorder, '失败事务必须回滚全部排序更新');
assert.deepEqual(updatedLead.manualTagNames, ['重点客户']);
