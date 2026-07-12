import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { createCustomerTagMigrationService } from './customerTagMigrationService';

const clone = <T>(value: T): T => structuredClone(value);

class FakePrisma {
  rows = new Map<string, any>();
  leads = new Map<string, any>();
  role = { findUnique: async ({ where }: any) => where.id === 'role-admin' ? { code: 'super_admin', isActive: true } : null };
  businessRecord = {
    findMany: async ({ where }: any = {}) => [...this.rows.values()].filter((row) => !where?.domain || row.domain === where.domain || where.domain?.in?.includes(row.domain)).map(clone),
    create: async ({ data }: any) => { this.rows.set(`${data.domain}:${data.recordId}`, clone(data)); return clone(data); },
    update: async ({ where, data }: any) => {
      const key = `${where.domain_recordId.domain}:${where.domain_recordId.recordId}`;
      this.rows.set(key, { ...this.rows.get(key), ...clone(data) }); return clone(this.rows.get(key));
    },
  };
  leadRecord = {
    findMany: async () => [...this.leads.values()].map(clone),
    update: async ({ where, data }: any) => { this.leads.set(where.id, { ...this.leads.get(where.id), ...clone(data) }); return clone(this.leads.get(where.id)); },
  };
  async $transaction<T>(fn: (tx: this) => Promise<T>) { return fn(this); }
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
const preview = await service.previewLegacyTagMigration();
assert.deepEqual(preview.missingNames, ['历史自定义']);
assert.equal(preview.assignmentCount, 4);
assert.equal(preview.customerCount, 1);
assert.equal(preview.leadCount, 1);
assert.match(preview.checksum, /^[a-f0-9]{64}$/);
assert.equal(prisma.rows.has(`${STORAGE_KEYS.TAG_GROUPS}:legacy`), false, '预览不得写数据');

const actor = { id: 'admin', name: '管理员', roleId: 'role-admin' } as any;
const stale = await service.applyLegacyTagMigration('stale', actor);
assert.equal(stale.code, 409);
const applied = await service.applyLegacyTagMigration(preview.checksum, actor);
assert.equal(applied.code, 0);
assert.equal(applied.data?.updatedCustomers, 1);
assert.equal(applied.data?.updatedLeads, 1);
const updatedCustomer = prisma.rows.get(`${STORAGE_KEYS.CUSTOMERS}:customer-1`).data;
assert.equal(updatedCustomer.lifecycleStatusCode, 'public_pool');
assert.equal(updatedCustomer.owner, '张三');
assert.deepEqual(updatedCustomer.orderIds, ['o1']);
assert.ok(updatedCustomer.manualTagIds?.length);
assert.deepEqual(updatedCustomer.tags, [' 已退款 ', '无意向']);
assert.equal([...prisma.rows.values()].filter((row) => row.domain === 'aaos_customer_tag_migrations').length, 1);

const after = await service.previewLegacyTagMigration();
const secondApply = await service.applyLegacyTagMigration(after.checksum, actor);
assert.equal(secondApply.code, 0);
assert.equal(secondApply.data?.updatedCustomers, 0);
assert.equal(secondApply.data?.updatedLeads, 0);
assert.equal([...prisma.rows.values()].filter((row) => row.domain === 'aaos_customer_tag_migrations').length, 1, '幂等重试不应重复审计');
