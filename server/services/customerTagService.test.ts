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
    delete: async ({ where }: any) => {
      const pair = where.domain_recordId;
      const key = rowKey(pair.domain, pair.recordId);
      const row = this.rows.get(key);
      if (!row) throw new Error('missing record');
      this.rows.delete(key);
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
  id: 'customer-1', name: '客户甲', manualTagIds: [inUseTagId], tags: ['高意向'], activityRecords: [],
});
prisma.seedLead({ id: 'lead-1', manualTagIds: [inUseTagId], tags: ['高意向'], activityRecords: [] });
assert.equal((await service.updateTag(inUseTagId, { isActive: false }, superAdmin)).code, 0);
const catalogWithInactive = await loadCustomerTagCatalog(prisma as any, true);
assert.equal(catalogWithInactive.tags.find((tag) => tag.id === inUseTagId)?.usageCount, 2);
assert.equal((await loadCustomerTagCatalog(prisma as any)).tags.some((tag) => tag.id === inUseTagId), false);

const target = await service.createTag({ groupId, name: '重点客户' }, superAdmin);
assert.equal(target.code, 0);
const sourceId = inUseTagId;
const targetId = (target.data as any).id;
assert.equal((await service.mergeTag(sourceId, targetId, superAdmin)).code, 0);
assert.equal(prisma.rows.get(rowKey(STORAGE_KEYS.TAGS, sourceId)).data.isActive, false, '停用 source 标签可治理合并到启用 target');
const updatedCustomer = prisma.rows.get(rowKey(STORAGE_KEYS.CUSTOMERS, 'customer-1')).data;
assert.deepEqual(updatedCustomer.manualTagIds, [targetId]);
assert.deepEqual(updatedCustomer.tags, ['重点客户']);
assert.equal('manualTagNames' in updatedCustomer, false);
assert.ok(updatedCustomer.activityRecords.some((item: any) => item.title === '合并客户标签'));
const updatedLead = prisma.leads.get('lead-1').data;
assert.deepEqual(updatedLead.manualTagIds, [targetId]);

const inactiveMergeTarget = await service.createTag({ groupId, name: '停用合并目标', isActive: false }, superAdmin);
const activeMergeSource = await service.createTag({ groupId, name: '活动合并源' }, superAdmin);
const inactiveTargetSnapshot = clone(prisma.rows);
const inactiveTargetResult = await service.mergeTag((activeMergeSource.data as any).id, (inactiveMergeTarget.data as any).id, superAdmin);
assert.equal(inactiveTargetResult.code, 409);
assert.match(inactiveTargetResult.message, /目标标签.*启用/);
assert.deepEqual(prisma.rows, inactiveTargetSnapshot, '停用 target 必须在客户/线索/标签/审计写入前原子拒绝');

const inactiveMergeGroup = await service.createGroup({ ...validGroup, name: '停用合并分组', isActive: false }, superAdmin);
const inactiveMergeGroupId = (inactiveMergeGroup.data as any).id;
const sourceInInactiveGroup = await service.createTag({ groupId: inactiveMergeGroupId, name: '停用组源' }, superAdmin);
const targetInInactiveGroup = await service.createTag({ groupId: inactiveMergeGroupId, name: '停用组目标' }, superAdmin);
const inactiveGroupSnapshot = clone(prisma.rows);
const inactiveGroupResult = await service.mergeTag((sourceInInactiveGroup.data as any).id, (targetInInactiveGroup.data as any).id, superAdmin);
assert.equal(inactiveGroupResult.code, 409);
assert.match(inactiveGroupResult.message, /目标标签所属分组.*启用/);
assert.deepEqual(prisma.rows, inactiveGroupSnapshot, '停用 target group 必须零写入');

const leadOnlyGroup = await service.createGroup({ ...validGroup, name: '待收窄范围', scope: 'both' }, superAdmin);
const leadOnlyGroupId = (leadOnlyGroup.data as any).id;
const leadOnlyTag = await service.createTag({ groupId: leadOnlyGroupId, name: '线索标签' }, superAdmin);
const leadOnlyTagId = (leadOnlyTag.data as any).id;
prisma.seed(STORAGE_KEYS.CUSTOMERS, { id: 'customer-scope', manualTagIds: [leadOnlyTagId], tags: ['线索标签'] });
const scopeRowsBefore = clone(prisma.rows);
const unsafeScope = await service.updateGroup(leadOnlyGroupId, { scope: 'lead' }, superAdmin);
assert.equal(unsafeScope.code, 409, '客户引用的分组不得改为线索专用');
assert.deepEqual(prisma.rows, scopeRowsBefore, '目录冲突不得写入任何记录');

const legacyUsageTag = await service.createTag({ groupId, name: '历史线索引用' }, superAdmin);
const legacyUsageTagId = (legacyUsageTag.data as any).id;
prisma.seed(STORAGE_KEYS.LEADS, { id: 'legacy-live-lead', manualTagIds: [legacyUsageTagId] });
assert.equal((await loadCustomerTagCatalog(prisma as any, true)).tags.find((tag) => tag.id === legacyUsageTagId)?.usageCount, 1, '未被 canonical LeadRecord 接管的 live legacy 引用必须计入使用次数');
assert.equal((await service.deleteTag(legacyUsageTagId, superAdmin)).code, 409, 'live legacy 线索引用必须阻止删除标签');
const supersededLegacyTag = await service.createTag({ groupId, name: '已接管历史线索引用' }, superAdmin);
const supersededLegacyTagId = (supersededLegacyTag.data as any).id;
prisma.seed(STORAGE_KEYS.LEADS, { id: 'legacy-owned-by-deleted-canonical', manualTagIds: [supersededLegacyTagId] });
prisma.seedLead({ id: 'legacy-owned-by-deleted-canonical', manualTagIds: [], deletedAt: '2026-07-13T00:00:00.000Z' });
assert.equal((await loadCustomerTagCatalog(prisma as any, true)).tags.find((tag) => tag.id === supersededLegacyTagId)?.usageCount, 0, '任意 canonical LeadRecord（包括已删除记录）都必须接管同 ID legacy 引用');

const unused = await service.createTag({ groupId, name: '可删除标签' }, superAdmin);
assert.equal((await service.deleteTag((unused.data as any).id, salesUser)).code, 403);
assert.equal((await service.deleteTag((unused.data as any).id, superAdmin)).code, 0);
assert.equal(prisma.rows.has(rowKey(STORAGE_KEYS.TAGS, (unused.data as any).id)), false);
assert.equal((await service.deleteTag(targetId, superAdmin)).code, 409);
const empty = await service.createGroup({ ...validGroup, name: '空分组' }, superAdmin);
assert.equal((await service.deleteGroup((empty.data as any).id, salesUser)).code, 403);
assert.equal((await service.deleteGroup((empty.data as any).id, superAdmin)).code, 0);
assert.equal((await service.deleteGroup(groupId, superAdmin)).code, 409);

const secondInGroup = await service.createTag({ groupId, name: '第二选项' }, superAdmin);
prisma.seedLead({ id: 'lead-single-conflict', manualTagIds: [targetId, (secondInGroup.data as any).id], tags: ['重点客户', '第二选项'] });
const selectionBefore = clone(prisma.rows.get(rowKey(STORAGE_KEYS.TAG_GROUPS, groupId)));
const unsafeSingle = await service.updateGroup(groupId, { selectionMode: 'single' }, superAdmin);
assert.equal(unsafeSingle.code, 409, '切换单选前必须扫描真实 LeadRecord');
assert.deepEqual(prisma.rows.get(rowKey(STORAGE_KEYS.TAG_GROUPS, groupId)), selectionBefore);

const strictLeadGroup = await service.createGroup({ ...validGroup, name: '严格线索组', scope: 'lead' }, superAdmin);
const strictLeadGroupId = (strictLeadGroup.data as any).id;
const unsafeMove = await service.updateTag(targetId, { groupId: strictLeadGroupId }, superAdmin);
assert.equal(unsafeMove.code, 409, '客户正在使用的标签不得移入线索专用组');
assert.equal(prisma.rows.get(rowKey(STORAGE_KEYS.TAGS, targetId)).data.groupId, groupId);
const unusedMoveTag = await service.createTag({ groupId, name: '可安全移动' }, superAdmin);
assert.equal((await service.updateTag((unusedMoveTag.data as any).id, { groupId: strictLeadGroupId }, superAdmin)).code, 0);

const destinationGroup = await service.createGroup({ ...validGroup, name: '归档分组' }, superAdmin);
const destinationGroupId = (destinationGroup.data as any).id;
const duplicateName = await service.createTag({ groupId: destinationGroupId, name: '第二选项' }, superAdmin);
const mergeGroupConflict = await service.mergeGroup(groupId, destinationGroupId, superAdmin);
assert.equal(mergeGroupConflict.code, 409);
assert.match(mergeGroupConflict.message, /同名/);
assert.equal(prisma.rows.get(rowKey(STORAGE_KEYS.TAGS, (secondInGroup.data as any).id)).data.groupId, groupId, '冲突合并不得部分移动');
await service.updateTag((duplicateName.data as any).id, { name: '归档唯一名' }, superAdmin);
const mergedGroup = await service.mergeGroup(leadOnlyGroupId, destinationGroupId, superAdmin);
assert.equal(mergedGroup.code, 0, '无冲突分组可安全合并');
assert.equal(prisma.rows.get(rowKey(STORAGE_KEYS.TAGS, leadOnlyTagId)).data.groupId, destinationGroupId);
assert.equal(prisma.rows.get(rowKey(STORAGE_KEYS.TAG_GROUPS, leadOnlyGroupId)).data.isActive, false);
assert.equal((await loadCustomerTagCatalog(prisma as any, true)).tags.find((tag) => tag.id === leadOnlyTagId)?.usageCount, 1, '移动分组不得丢失使用次数');
const inactiveTarget = await service.createGroup({ ...validGroup, name: '停用目标', isActive: false }, superAdmin);
const emptyActiveSource = await service.createGroup({ ...validGroup, name: '空源组' }, superAdmin);
const beforeInactiveTarget = clone(prisma.rows);
const rejectedInactiveTarget = await service.mergeGroup((emptyActiveSource.data as any).id, (inactiveTarget.data as any).id, superAdmin);
assert.equal(rejectedInactiveTarget.code, 409, '分组合并目标必须启用');
assert.match(rejectedInactiveTarget.message, /启用/);
assert.deepEqual(prisma.rows, beforeInactiveTarget, '停用目标冲突必须零写入且不得写审计');
const inactiveSource = await service.createGroup({ ...validGroup, name: '已停用源组', isActive: false }, superAdmin);
assert.equal((await service.mergeGroup((inactiveSource.data as any).id, destinationGroupId, superAdmin)).code, 0, '允许将历史停用源组治理合并到启用目标');

const rollbackSource = await service.createGroup({ ...validGroup, name: '回滚源组' }, superAdmin);
const rollbackTarget = await service.createGroup({ ...validGroup, name: '回滚目标组' }, superAdmin);
const rollbackSourceId = (rollbackSource.data as any).id;
await service.createTag({ groupId: rollbackSourceId, name: '回滚 A' }, superAdmin);
await service.createTag({ groupId: rollbackSourceId, name: '回滚 B' }, superAdmin);
const rollbackSnapshot = clone(prisma.rows);
prisma.failUpdateAfter = 1;
await assert.rejects(service.mergeGroup(rollbackSourceId, (rollbackTarget.data as any).id, superAdmin), /injected update failure/);
assert.deepEqual(prisma.rows, rollbackSnapshot, '分组合并中途失败必须原子回滚');

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
assert.deepEqual(updatedLead.tags, ['重点客户']);
assert.equal('manualTagNames' in updatedLead, false);
