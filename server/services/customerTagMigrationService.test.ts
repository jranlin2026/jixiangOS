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
