import assert from 'node:assert/strict';
import express from 'express';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { createCustomerTagMigrationRouter, createCustomerTagMigrationService } from './customerTagMigrationService';
import { createCustomerTagService } from './customerTagService';

const clone = <T>(value: T): T => structuredClone(value);

class FakePrisma {
  rows = new Map<string, any>();
  leads = new Map<string, any>();
  lockHeld = false;
  lockWaiters: Array<() => void> = [];
  lockWaitCount = 0;
  directCustomerUpdates = 0;
  customerCompareSaves = 0;
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
      if (where.domain_recordId.domain === STORAGE_KEYS.CUSTOMERS) this.directCustomerUpdates += 1;
      this.rows.set(key, { ...this.rows.get(key), ...clone(data) }); return clone(this.rows.get(key));
    },
    updateMany: async ({ where, data }: any) => {
      const key = `${where.domain}:${where.recordId}`;
      const row = this.rows.get(key);
      if (!row || new Date(row.updatedAt).getTime() !== new Date(where.updatedAt).getTime()) return { count: 0 };
      this.customerCompareSaves += 1;
      this.rows.set(key, {
        ...row,
        ...clone(data),
        updatedAt: new Date(new Date(row.updatedAt).getTime() + 1),
      });
      return { count: 1 };
    },
  };
  leadRecord = {
    findMany: async () => [...this.leads.values()].map(clone),
    update: async ({ where, data }: any) => { this.leads.set(where.id, { ...this.leads.get(where.id), ...clone(data) }); return clone(this.leads.get(where.id)); },
  };
  $queryRaw = async (query: any) => {
    const values = query.values || [];
    const domain = String(values[0] || '');
    const recordId = String(values[1] || '');
    if (domain === STORAGE_KEYS.CUSTOMERS) {
      const row = this.rows.get(`${domain}:${recordId}`);
      return row ? [clone(row)] : [];
    }
    return [{ id: 'lock' }];
  };
  async $transaction<T>(fn: (tx: this) => Promise<T>) {
    try { return await fn(this); }
    finally { this.lockHeld = false; this.lockWaiters.shift()?.(); }
  }
  seed(domain: string, data: any, status = 'active') {
    this.rows.set(`${domain}:${data.id}`, {
      id: `${domain}:${data.id}`,
      domain,
      recordId: data.id,
      status,
      data: clone(data),
      updatedAt: new Date('2026-07-17T00:00:00.000Z'),
    });
  }
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
const actor = {
  id: 'maintenance',
  name: '数据维护员',
  roleId: 'role-sales',
  isActive: true,
  permissions: [
    { module: PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE, actions: ['read', 'write'] },
  ],
} as any;
const sales = {
  ...actor,
  id: 'sales',
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] }],
};
const roleCodeOnlyAdmin = { ...sales, id: 'role-code-only', roleId: 'role-admin' };
const tagManager = {
  ...actor,
  id: 'tag-manager',
  permissions: [{ module: PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS, actions: ['read', 'write'] }],
};
assert.equal((await service.previewLegacyTagMigration(sales)).code, 403);
assert.equal((await service.previewLegacyTagMigration(roleCodeOnlyAdmin)).code, 403, '角色代码不得授予迁移维护权');
assert.equal((await service.previewLegacyTagMigration({ ...sales, roleId: 'role-disabled' })).code, 403);
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
assert.equal(prisma.directCustomerUpdates, 0, '标签迁移不得直接覆盖客户 JSON');
assert.equal(prisma.customerCompareSaves, 1, '标签迁移必须锁定客户并 compare-and-save');
assert.equal([...prisma.rows.values()].filter((row) => row.domain === 'aaos_customer_tag_migrations').length, 1);

assert.equal([...prisma.rows.values()].filter((row) => row.domain === STORAGE_KEYS.TAG_GROUPS && row.data.name === '历史未归类').length, 1);
assert.equal([...prisma.rows.values()].filter((row) => row.domain === STORAGE_KEYS.TAGS && row.data.name === '历史自定义').length, 1);
const after = (await service.previewLegacyTagMigration(actor)).data!;
const secondApply = await service.applyLegacyTagMigration(after.checksum, actor);
assert.equal(secondApply.code, 0);
assert.equal(secondApply.data?.updatedCustomers, 0);
assert.equal(secondApply.data?.updatedLeads, 0);
assert.equal([...prisma.rows.values()].filter((row) => row.domain === 'aaos_customer_tag_migrations').length, 1, '幂等重试不应重复审计');
assert.deepEqual(prisma.roleLookups, [], '迁移授权不得查询或识别角色代码');

const casConflictPrisma = new FakePrisma();
casConflictPrisma.seed(STORAGE_KEYS.TAG_GROUPS, { id: 'group-cas', name: 'CAS组', color: '#111', selectionMode: 'multiple', scope: 'customer', isActive: true, sortOrder: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
casConflictPrisma.seed(STORAGE_KEYS.TAGS, { id: 'tag-cas', groupId: 'group-cas', name: 'CAS标签', isActive: true, sortOrder: 0, usageCount: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
casConflictPrisma.seed(STORAGE_KEYS.CUSTOMERS, { id: 'customer-cas', name: '并发客户', tags: ['CAS标签'], manualTagIds: [] });
const casConflictService = createCustomerTagMigrationService(casConflictPrisma as any);
const casConflictPreview = (await casConflictService.previewLegacyTagMigration(actor)).data!;
const customerBeforeConflict = clone(casConflictPrisma.rows.get(`${STORAGE_KEYS.CUSTOMERS}:customer-cas`).data);
casConflictPrisma.businessRecord.updateMany = async () => ({ count: 0 });
const casConflictResult = await casConflictService.applyLegacyTagMigration(casConflictPreview.checksum, actor);
assert.equal(casConflictResult.code, 409, '客户版本冲突必须显式返回 409');
assert.deepEqual(casConflictPrisma.rows.get(`${STORAGE_KEYS.CUSTOMERS}:customer-cas`).data, customerBeforeConflict);
assert.equal([...casConflictPrisma.rows.values()].filter((row) => row.domain === 'aaos_customer_tag_migrations').length, 0, 'CAS 冲突不得记录迁移成功审计');

prisma.seed(STORAGE_KEYS.CUSTOMERS, { id: 'customer-2', name: '客户二', tags: ['另一历史标签'] });
const sharedLockPreview = (await service.previewLegacyTagMigration(actor)).data!;
const catalogService = createCustomerTagService(prisma as any);
const waitsBefore = prisma.lockWaitCount;
const [catalogWrite, migrationWrite] = await Promise.all([
  catalogService.createGroup({ name: '并发目录分组', selectionMode: 'multiple', scope: 'both' }, tagManager as any),
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
mixedLeadPrisma.seed(STORAGE_KEYS.LEADS, { id: 'deleted-duplicate', tags: ['legacy-删除重复不得采用'], manualTagIds: [] });
mixedLeadPrisma.seedLead({ id: 'deleted-duplicate', tags: ['canonical-已删除'], manualTagIds: [], isDeleted: true });
const mixedLeadService = createCustomerTagMigrationService(mixedLeadPrisma as any);
const mixedPreview = (await mixedLeadService.previewLegacyTagMigration(actor)).data!;
assert.equal(mixedPreview.leadCount, 2, 'canonical LeadRecord 与 legacy BusinessRecord 必须按 ID 去重');
assert.equal(mixedPreview.assignmentCount, 2);
assert.deepEqual(mixedPreview.missingNames, [], 'canonical LeadRecord 必须优先，不得读取重复 legacy 快照');
assert.deepEqual(mixedPreview.assignmentConflicts, [], '已删除 canonical 同 ID legacy 不得进入冲突扫描');
mixedLeadPrisma.rows.get(`${STORAGE_KEYS.LEADS}:deleted-duplicate`).data.tags = ['改变后仍应忽略'];
assert.equal((await mixedLeadService.previewLegacyTagMigration(actor)).data?.checksum, mixedPreview.checksum, '被删除 canonical 抑制的 legacy 快照不得进入 checksum');
const mixedApply = await mixedLeadService.applyLegacyTagMigration(mixedPreview.checksum, actor);
assert.equal(mixedApply.code, 0);
assert.equal(mixedApply.data?.updatedLeads, 2);
assert.deepEqual(mixedLeadPrisma.rows.get(`${STORAGE_KEYS.LEADS}:legacy-only`).data.manualTagIds, ['tag-existing'], 'legacy-only lead 必须写回 BusinessRecord');
assert.deepEqual(mixedLeadPrisma.leads.get('duplicate-lead').data.manualTagIds, ['tag-existing'], '重复 ID 必须只写 canonical LeadRecord');
assert.deepEqual(mixedLeadPrisma.rows.get(`${STORAGE_KEYS.LEADS}:duplicate-lead`).data.manualTagIds, [], '重复 legacy 快照不得双写');
assert.deepEqual(mixedLeadPrisma.leads.get('deleted-duplicate').data.manualTagIds, [], '已删除 canonical 不得写入');
assert.deepEqual(mixedLeadPrisma.rows.get(`${STORAGE_KEYS.LEADS}:deleted-duplicate`).data.manualTagIds, [], '被删除 canonical 抑制的 legacy 不得写入');
const mixedAudits = [...mixedLeadPrisma.rows.values()].filter((row) => row.domain === 'aaos_customer_tag_migrations');
assert.equal(mixedAudits.length, 1);
assert.equal(mixedAudits[0].data.leadCount, 2, '审计计数必须使用去重后线索数');
