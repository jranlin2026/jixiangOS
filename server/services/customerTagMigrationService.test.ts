import assert from 'node:assert/strict';
import express from 'express';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { createCustomerTagMigrationRouter, createCustomerTagMigrationService } from './customerTagMigrationService';
import { createCustomerTagService } from './customerTagService';

const clone = <T>(value: T): T => structuredClone(value);

class FakePrisma {
  rows = new Map<string, any>();
  leads = new Map<string, any>();
  lockHeld = false;
  lockWaiters: Array<() => void> = [];
  lockWaitCount = 0;
  roleLookups: string[] = [];
  role = { findUnique: async ({ where }: any) => {
    this.roleLookups.push(where.id);
    if (where.id === 'role-admin') return { code: 'super_admin', isActive: true };
    if (where.id === 'role-disabled') return { code: 'super_admin', isActive: false };
    return { code: 'sales', isActive: true };
  } };
  businessRecord = {
    findMany: async ({ where }: any = {}) => [...this.rows.values()].filter((row) => !where?.domain || row.domain === where.domain || where.domain?.in?.includes(row.domain)).map(clone),
    create: async ({ data }: any) => { this.rows.set(`${data.domain}:${data.recordId}`, clone(data)); return clone(data); },
    upsert: async ({ where, create }: any) => {
      if (this.lockHeld) {
        this.lockWaitCount += 1;
        await new Promise<void>((resolve) => this.lockWaiters.push(resolve));
      }
      this.lockHeld = true;
      const key = `${where.domain_recordId.domain}:${where.domain_recordId.recordId}`;
      if (!this.rows.has(key)) this.rows.set(key, clone(create));
      return clone(this.rows.get(key));
    },
    update: async ({ where, data }: any) => {
      const key = `${where.domain_recordId.domain}:${where.domain_recordId.recordId}`;
      this.rows.set(key, { ...this.rows.get(key), ...clone(data) }); return clone(this.rows.get(key));
    },
  };
  leadRecord = {
    findMany: async () => [...this.leads.values()].map(clone),
    update: async ({ where, data }: any) => { this.leads.set(where.id, { ...this.leads.get(where.id), ...clone(data) }); return clone(this.leads.get(where.id)); },
  };
  $queryRaw = async () => [{ id: 'lock' }];
  async $transaction<T>(fn: (tx: this) => Promise<T>) {
    try { return await fn(this); }
    finally { this.lockHeld = false; this.lockWaiters.shift()?.(); }
  }
  seed(domain: string, data: any, status = 'active') { this.rows.set(`${domain}:${data.id}`, { id: `${domain}:${data.id}`, domain, recordId: data.id, status, data: clone(data) }); }
  seedLead(data: any) { this.leads.set(data.id, { id: data.id, data: clone(data) }); }
}

const prisma = new FakePrisma();
prisma.seed(STORAGE_KEYS.TAG_GROUPS, { id: 'group-sales', name: '销售意向', color: '#1677ff', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
prisma.seed(STORAGE_KEYS.TAGS, { id: 'tag-high', groupId: 'group-sales', name: '高意向', isActive: true, sortOrder: 0, usageCount: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
prisma.seed(STORAGE_KEYS.TAGS, { id: 'tag-refund', groupId: 'group-sales', name: '已退款', isActive: true, sortOrder: 1, usageCount: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
prisma.seed(STORAGE_KEYS.TAGS, { id: 'tag-none', groupId: 'group-sales', name: '无意向', isActive: true, sortOrder: 2, usageCount: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
prisma.seed(STORAGE_KEYS.CUSTOMERS, { id: 'customer-1', name: '客户', tags: [' 已退款 ', '无意向'], lifecycleStatusCode: 'public_pool', owner: '张三', orderIds: ['o1'] });
prisma.seedLead({ id: 'lead-1', name: '线索', tags: ['高意向', '历史自定义'], lifecycleStatusCode: 'new', owner: '李四' });
prisma.seed(STORAGE_KEYS.CUSTOMERS, { id: 'deleted', tags: ['历史自定义'] }, 'deleted');

const service = createCustomerTagMigrationService(prisma as any);
const actor = { id: 'admin', name: '管理员', roleId: 'role-admin' } as any;
const sales = { ...actor, id: 'sales', roleId: 'role-sales' };
assert.equal((await service.previewLegacyTagMigration(sales)).code, 403);
assert.equal((await service.previewLegacyTagMigration({ ...actor, roleId: 'role-disabled' })).code, 403);
const previewResult = await service.previewLegacyTagMigration(actor);
assert.equal(previewResult.code, 0);
const preview = previewResult.data!;
assert.deepEqual(preview.missingNames, ['历史自定义']);
assert.equal(preview.ambiguousNameCount, 0);
assert.deepEqual(preview.ambiguousNames, []);
assert.equal(preview.assignmentCount, 4);
assert.equal(preview.customerCount, 1);
assert.equal(preview.leadCount, 1);
assert.match(preview.checksum, /^[a-f0-9]{64}$/);
assert.equal(prisma.rows.has(`${STORAGE_KEYS.TAG_GROUPS}:legacy`), false, '预览不得写数据');

const stale = await service.applyLegacyTagMigration('stale', actor);
assert.equal(stale.code, 409);
const concurrent = await Promise.all([
  service.applyLegacyTagMigration(preview.checksum, actor),
  service.applyLegacyTagMigration(preview.checksum, actor),
]);
assert.deepEqual(concurrent.map((item) => item.code).sort((a, b) => a - b), [0, 409]);
const applied = concurrent.find((item) => item.code === 0)!;
assert.equal(applied.data?.updatedCustomers, 1);
assert.equal(applied.data?.updatedLeads, 1);
const updatedCustomer = prisma.rows.get(`${STORAGE_KEYS.CUSTOMERS}:customer-1`).data;
assert.equal(updatedCustomer.lifecycleStatusCode, 'public_pool');
assert.equal(updatedCustomer.owner, '张三');
assert.deepEqual(updatedCustomer.orderIds, ['o1']);
assert.ok(updatedCustomer.manualTagIds?.length);
assert.deepEqual(updatedCustomer.tags, [' 已退款 ', '无意向']);
assert.equal([...prisma.rows.values()].filter((row) => row.domain === 'aaos_customer_tag_migrations').length, 1);

assert.equal([...prisma.rows.values()].filter((row) => row.domain === STORAGE_KEYS.TAG_GROUPS && row.data.name === '历史未归类').length, 1);
assert.equal([...prisma.rows.values()].filter((row) => row.domain === STORAGE_KEYS.TAGS && row.data.name === '历史自定义').length, 1);
const after = (await service.previewLegacyTagMigration(actor)).data!;
const secondApply = await service.applyLegacyTagMigration(after.checksum, actor);
assert.equal(secondApply.code, 0);
assert.equal(secondApply.data?.updatedCustomers, 0);
assert.equal(secondApply.data?.updatedLeads, 0);
assert.equal([...prisma.rows.values()].filter((row) => row.domain === 'aaos_customer_tag_migrations').length, 1, '幂等重试不应重复审计');
assert.ok(prisma.roleLookups.length >= 7, '预览和执行每次都必须查实时角色');

prisma.seed(STORAGE_KEYS.CUSTOMERS, { id: 'customer-2', name: '客户二', tags: ['另一历史标签'] });
const sharedLockPreview = (await service.previewLegacyTagMigration(actor)).data!;
const catalogService = createCustomerTagService(prisma as any);
const waitsBefore = prisma.lockWaitCount;
const [catalogWrite, migrationWrite] = await Promise.all([
  catalogService.createGroup({ name: '并发目录分组', selectionMode: 'multiple', scope: 'both' }, actor),
  service.applyLegacyTagMigration(sharedLockPreview.checksum, actor),
]);
assert.equal(catalogWrite.code, 0);
assert.equal(migrationWrite.code, 0);
assert.ok(prisma.lockWaitCount > waitsBefore, '目录写和迁移必须竞争同一把 sentinel 锁');
assert.equal([...prisma.rows.values()].filter((row) => row.domain === STORAGE_KEYS.TAGS && row.data.name === '另一历史标签').length, 1);

const app = express();
app.use(express.json());
const requireAuth: express.RequestHandler = (req, _res, next) => {
  (req as any).currentUser = req.header('x-user') === 'sales' ? sales : actor;
  next();
};
app.use('/api/customer-tags', createCustomerTagMigrationRouter({ service, requireAuth }));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
try {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/customer-tags/migration/preview`, { headers: { 'x-user': 'sales' } });
  assert.equal(response.status, 403, '普通登录用户不得预览迁移');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

const ambiguousPrisma = new FakePrisma();
ambiguousPrisma.seed(STORAGE_KEYS.TAG_GROUPS, { id: 'group-a', name: 'A组', color: '#111', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
ambiguousPrisma.seed(STORAGE_KEYS.TAG_GROUPS, { id: 'group-b', name: 'B组', color: '#222', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
ambiguousPrisma.seed(STORAGE_KEYS.TAGS, { id: 'tag-a', groupId: 'group-a', name: '跨组同名', isActive: true, sortOrder: 0, usageCount: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
ambiguousPrisma.seed(STORAGE_KEYS.TAGS, { id: 'tag-b', groupId: 'group-b', name: '跨组同名', isActive: true, sortOrder: 0, usageCount: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
ambiguousPrisma.seed(STORAGE_KEYS.CUSTOMERS, { id: 'ambiguous-customer', tags: ['跨组同名'], manualTagIds: [] });
const ambiguousService = createCustomerTagMigrationService(ambiguousPrisma as any);
const ambiguousPreview = (await ambiguousService.previewLegacyTagMigration(actor)).data!;
assert.equal(ambiguousPreview.ambiguousNameCount, 1);
assert.deepEqual(ambiguousPreview.ambiguousNames, [{ name: '跨组同名', tagIds: ['tag-a', 'tag-b'], groupIds: ['group-a', 'group-b'] }]);
const customerBefore = clone(ambiguousPrisma.rows.get(`${STORAGE_KEYS.CUSTOMERS}:ambiguous-customer`).data);
const ambiguousApply = await ambiguousService.applyLegacyTagMigration(ambiguousPreview.checksum, actor);
assert.equal(ambiguousApply.code, 409);
assert.match(ambiguousApply.message, /合并或重命名/);
assert.deepEqual(ambiguousPrisma.rows.get(`${STORAGE_KEYS.CUSTOMERS}:ambiguous-customer`).data, customerBefore, '歧义迁移不得写客户');
assert.equal([...ambiguousPrisma.rows.values()].some((row) => row.domain === 'aaos_customer_tag_migrations'), false, '歧义迁移不得写审计假成功');

const conflictPrisma = new FakePrisma();
conflictPrisma.seed(STORAGE_KEYS.TAG_GROUPS, { id: 'group-single', name: '单选组', color: '#111', selectionMode: 'single', scope: 'both', isActive: true, sortOrder: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
conflictPrisma.seed(STORAGE_KEYS.TAGS, { id: 'tag-one', groupId: 'group-single', name: '选项一', isActive: true, sortOrder: 0, usageCount: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
conflictPrisma.seed(STORAGE_KEYS.TAGS, { id: 'tag-two', groupId: 'group-single', name: '选项二', isActive: true, sortOrder: 1, usageCount: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
conflictPrisma.seed(STORAGE_KEYS.CUSTOMERS, { id: 'customer-conflict', tags: ['选项一', '选项二'], manualTagIds: [] });
conflictPrisma.seedLead({ id: 'lead-conflict', tags: [], manualTagIds: ['tag-one', 'tag-two'] });
const conflictService = createCustomerTagMigrationService(conflictPrisma as any);
const conflictPreview = (await conflictService.previewLegacyTagMigration(actor)).data!;
assert.deepEqual(conflictPreview.assignmentConflicts.map((item) => [item.recordType, item.recordId]), [['customer', 'customer-conflict'], ['lead', 'lead-conflict']]);
assert.ok(conflictPreview.assignmentConflicts.every((item) => item.reason.includes('单选')));
const conflictRowsBefore = clone([...conflictPrisma.rows.entries()].filter(([, row]) => row.domain !== 'aaos_internal_locks'));
const conflictLeadsBefore = clone([...conflictPrisma.leads.entries()]);
const conflictApply = await conflictService.applyLegacyTagMigration(conflictPreview.checksum, actor);
assert.equal(conflictApply.code, 409);
assert.deepEqual([...conflictPrisma.rows.entries()].filter(([, row]) => row.domain !== 'aaos_internal_locks'), conflictRowsBefore, '分配冲突不得写目录、客户或审计');
assert.deepEqual([...conflictPrisma.leads.entries()], conflictLeadsBefore, '分配冲突不得写线索');

const mixedLeadPrisma = new FakePrisma();
mixedLeadPrisma.seed(STORAGE_KEYS.TAG_GROUPS, { id: 'group-both', name: '通用组', color: '#111', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
mixedLeadPrisma.seed(STORAGE_KEYS.TAGS, { id: 'tag-existing', groupId: 'group-both', name: '已有标签', isActive: true, sortOrder: 0, usageCount: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
mixedLeadPrisma.seed(STORAGE_KEYS.LEADS, { id: 'legacy-only', tags: ['已有标签'], manualTagIds: [] });
mixedLeadPrisma.seed(STORAGE_KEYS.LEADS, { id: 'duplicate-lead', tags: ['legacy-不应采用'], manualTagIds: [] });
mixedLeadPrisma.seedLead({ id: 'duplicate-lead', tags: ['已有标签'], manualTagIds: [] });
const mixedLeadService = createCustomerTagMigrationService(mixedLeadPrisma as any);
const mixedPreview = (await mixedLeadService.previewLegacyTagMigration(actor)).data!;
assert.equal(mixedPreview.leadCount, 2, 'canonical LeadRecord 与 legacy BusinessRecord 必须按 ID 去重');
assert.equal(mixedPreview.assignmentCount, 2);
assert.deepEqual(mixedPreview.missingNames, [], 'canonical LeadRecord 必须优先，不得读取重复 legacy 快照');
const mixedApply = await mixedLeadService.applyLegacyTagMigration(mixedPreview.checksum, actor);
assert.equal(mixedApply.code, 0);
assert.equal(mixedApply.data?.updatedLeads, 2);
assert.deepEqual(mixedLeadPrisma.rows.get(`${STORAGE_KEYS.LEADS}:legacy-only`).data.manualTagIds, ['tag-existing'], 'legacy-only lead 必须写回 BusinessRecord');
assert.deepEqual(mixedLeadPrisma.leads.get('duplicate-lead').data.manualTagIds, ['tag-existing'], '重复 ID 必须只写 canonical LeadRecord');
assert.deepEqual(mixedLeadPrisma.rows.get(`${STORAGE_KEYS.LEADS}:duplicate-lead`).data.manualTagIds, [], '重复 legacy 快照不得双写');
const mixedAudits = [...mixedLeadPrisma.rows.values()].filter((row) => row.domain === 'aaos_customer_tag_migrations');
assert.equal(mixedAudits.length, 1);
assert.equal(mixedAudits[0].data.leadCount, 2, '审计计数必须使用去重后线索数');
