import assert from 'node:assert/strict';
import { createCustomerListService, matchesCustomerTagFilters } from './customerListService';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { CustomerFilters } from '../../src/types/customer';

const now = '2026-07-12T00:00:00.000Z';

const created: any[] = [];
const auditEvents: any[] = [];
const contactIdentities: any[] = [];
const contactLinks: any[] = [];
const appStorage: any[] = [];
let transactionTail = Promise.resolve<unknown>(undefined);
let remainingTransactionFailures = 0;
let remainingPostBusinessRecordFailures = 0;
let transactionCalls = 0;
let serverDirectoryAllowsCustomerList = false;
const directCreateLockOrder: string[] = [];
let servicePrisma: any;
const service = createCustomerListService(servicePrisma = {
  businessRecord: {
    findMany: async (args: any) => {
      if (args?.where?.domain === STORAGE_KEYS.TAG_GROUPS) return [{ data: { id: 'group-both', name: '通用', color: '#1677ff', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 0 } }];
      if (args?.where?.domain === STORAGE_KEYS.TAGS) return [{ data: { id: 'shared', groupId: 'group-both', name: '高意向', color: '#1677ff', isActive: true, sortOrder: 0 } }];
      return created.map((item) => ({
        id: item.data.id,
        domain: item.data.domain,
        recordId: item.data.recordId,
        data: item.data.data,
        updatedAt: new Date(item.data.eventAt),
      }));
    },
    findUnique: async ({ where }: any) => {
      const compound = where?.domain_recordId;
      const row = created.map((item) => item.data).find((item) => (
        item.domain === compound?.domain && item.recordId === compound?.recordId
      ));
      return row ? { data: structuredClone(row.data) } : null;
    },
    create: async (input: any) => {
      directCreateLockOrder.push('business-record');
      if (created.some((item) => item.data.id === input.data.id)) {
        const error = new Error('duplicate business record') as Error & { code?: string };
        error.code = 'P2002';
        throw error;
      }
      created.push(input);
      if (remainingPostBusinessRecordFailures > 0) {
        remainingPostBusinessRecordFailures -= 1;
        throw Object.assign(new Error('deadlock after private customer record write'), { code: 'P2034' });
      }
      return input.data;
    },
  },
  leadRecord: { findMany: async () => [] },
  user: {
    findMany: async () => [{
      id: 'user-sales', name: '销售', account: 'sales', email: '', phone: '', role: '销售顾问', avatar: null,
      departmentId: 'dept-sales', positionId: null, positionName: null, roleId: 'role-sales', passwordHash: null,
      passwordSalt: null, passwordUpdatedAt: null, lastLoginAt: null, isActive: true, employmentStatus: 'active',
      createdAt: now, updatedAt: now,
    }],
  },
  role: {
    findMany: async () => [{
      id: 'role-sales', name: '销售顾问', code: 'sales', description: null, departmentId: null,
      permissions: [
        { module: PERMISSION_KEYS.CUSTOMER_CREATE, actions: ['write'] },
        ...(serverDirectoryAllowsCustomerList
          ? [{ module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] }]
          : []),
      ],
      dataScopes: { customers: 'self' }, memberCount: 1, isActive: true, createdAt: now, updatedAt: now,
    }],
  },
  department: { findMany: async () => [] },
  customerAuditEvent: {
    create: async ({ data }: any) => {
      const event = { ...data, eventSequence: BigInt(auditEvents.length + 1), createdAt: new Date(now) };
      auditEvents.push(event);
      return event;
    },
  },
  contactIdentity: {
    findUnique: async ({ where }: any) => contactIdentities.find((identity) => (
      where.id ? identity.id === where.id : (
        identity.type === where.type_normalizedHash.type
        && identity.normalizedHash === where.type_normalizedHash.normalizedHash
      )
    )) || null,
    create: async ({ data }: any) => {
      if (contactIdentities.some((identity) => (
        identity.id === data.id || (identity.type === data.type && identity.normalizedHash === data.normalizedHash)
      ))) throw Object.assign(new Error('duplicate identity'), { code: 'P2002' });
      contactIdentities.push({ ...data });
      return { ...data };
    },
    update: async ({ where, data }: any) => {
      const identity = contactIdentities.find((candidate) => candidate.id === where.id)!;
      Object.assign(identity, data);
      return { ...identity };
    },
  },
  contactIdentityLink: {
    findMany: async ({ where }: any) => contactLinks.filter((link) => (
      Object.entries(where || {}).every(([key, value]) => link[key] === value)
    )).map((link) => ({ ...link })),
    upsert: async ({ where, create, update }: any) => {
      const key = where.identityId_entityType_entityId;
      const link = contactLinks.find((candidate) => candidate.identityId === key.identityId
        && candidate.entityType === key.entityType && candidate.entityId === key.entityId);
      if (link) { Object.assign(link, update); return { ...link }; }
      contactLinks.push({ ...create });
      return { ...create };
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const link of contactLinks) {
        if (!Object.entries(where || {}).every(([key, value]) => link[key] === value)) continue;
        Object.assign(link, data); count += 1;
      }
      return { count };
    },
  },
  appStorage: {
    upsert: async ({ where, update, create }: any) => {
      directCreateLockOrder.push('mutation-gate');
      const row = appStorage.find((candidate) => candidate.key === where.key);
      if (row) {
        Object.assign(row, structuredClone(update));
        return { ...row };
      }
      appStorage.push(structuredClone(create));
      return structuredClone(create);
    },
  },
  $queryRaw: async (query: any) => {
    const text = Array.isArray(query?.strings) ? query.strings.join('?') : String(query || '');
    const values = query?.values || [];
    if (text.includes('FROM business_records') && text.includes('ORDER BY recordId') && text.includes('FOR UPDATE')) {
      directCreateLockOrder.push('legacy-source');
    }
    if (text.includes('FROM contact_identities')) directCreateLockOrder.push('identity');
    if (text.includes('FROM contact_identities')) {
      const [type, normalizedHash] = values;
      return contactIdentities.filter((identity) => identity.type === type && identity.normalizedHash === normalizedHash)
        .map((identity) => ({ ...identity }));
    }
    if (text.includes('FROM contact_identity_links')) {
      if (text.includes('WHERE identityId')) {
        const [identityId] = values;
        return contactLinks.filter((link) => (
          link.identityId === identityId && link.entityType === 'customer' && link.linkStatus === 'active'
        )).map((link) => ({ entityId: link.entityId }));
      }
      const [entityType, entityId] = values;
      return contactLinks.filter((link) => (
        link.entityType === entityType && link.entityId === entityId && link.linkStatus === 'active'
      )).map((link) => ({ identityId: link.identityId }));
    }
    if (text.includes('FROM business_records')) return created.map((item) => ({ ...item.data, data: structuredClone(item.data.data) }));
    return [];
  },
  $transaction: async (operation: any) => {
    const result = transactionTail.then(async () => {
      transactionCalls += 1;
      if (remainingTransactionFailures > 0) {
        remainingTransactionFailures -= 1;
        throw Object.assign(new Error('deadlock while creating customer'), { code: 'P2034' });
      }
      // The fake needs transaction rollback now that create intentionally
      // writes its private BusinessRecord before claiming the shared identity.
      const snapshot = structuredClone({ created, auditEvents, contactIdentities, contactLinks, appStorage });
      try {
        return await operation(servicePrisma);
      } catch (error) {
        created.splice(0, created.length, ...snapshot.created);
        auditEvents.splice(0, auditEvents.length, ...snapshot.auditEvents);
        contactIdentities.splice(0, contactIdentities.length, ...snapshot.contactIdentities);
        contactLinks.splice(0, contactLinks.length, ...snapshot.contactLinks);
        appStorage.splice(0, appStorage.length, ...snapshot.appStorage);
        throw error;
      }
    });
    transactionTail = result.then(() => undefined, () => undefined);
    return result;
  },
} as any, { contactIdentityCrypto: {
  hmacKey: Buffer.alloc(32, 21), keyVersion: 1,
  encryptionKey: Buffer.alloc(32, 22), encryptionKeyVersion: 1,
} });

const actor = {
  id: 'user-sales',
  name: '销售',
  account: 'sales',
  email: '',
  phone: '',
  role: '销售顾问' as any,
  isActive: true,
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_CREATE, actions: ['write'] }],
};

const tagCatalog = {
  groups: [
    { id: 'g-intent', name: '意向', scope: 'customer', isActive: true, sortOrder: 0 },
    { id: 'g-value', name: '价值', scope: 'customer', isActive: true, sortOrder: 1 },
  ],
  tags: [
    { id: 't-agent', groupId: 'g-intent', name: '代理', isActive: true, sortOrder: 0 },
    { id: 't-private', groupId: 'g-intent', name: '私域', isActive: true, sortOrder: 1 },
    { id: 't-high-budget', groupId: 'g-value', name: '高预算', isActive: true, sortOrder: 0 },
  ],
} as any;
const tagCustomers = [
  { id: 'agent-only', manualTagIds: ['t-agent'] },
  { id: 'private-only', manualTagIds: ['t-private'] },
  { id: 'both-intents', manualTagIds: ['t-agent', 't-private'] },
  { id: 'high-budget-agent', manualTagIds: ['t-agent', 't-high-budget'] },
  { id: 'high-budget-private', manualTagIds: ['t-private', 't-high-budget'] },
  { id: 'untagged', manualTagIds: [] },
] as any[];
const matchingIds = (filters: any) => tagCustomers.filter((customer) => matchesCustomerTagFilters(customer, filters, tagCatalog)).map((customer) => customer.id).sort();
assert.deepEqual(matchingIds({ tagIds: ['t-agent', 't-private'], tagMatch: 'any' }), ['agent-only', 'both-intents', 'high-budget-agent', 'high-budget-private', 'private-only']);
assert.deepEqual(matchingIds({ tagIds: ['t-agent', 't-private'], tagMatch: 'all' }), ['both-intents']);
assert.deepEqual(matchingIds({ tagIds: ['t-agent', 't-private', 't-high-budget'], tagMatch: 'grouped' }), ['high-budget-agent', 'high-budget-private']);
assert.deepEqual(matchingIds({ withoutTags: true }), ['untagged']);
assert.deepEqual(matchingIds({ missingTagGroupId: 'g-intent' }), ['untagged']);

const result = await service.create({
  name: '新客户',
  company: '新客户公司',
  phone: '13800000000',
  customerLevel: 'L1',
  owner: '销售',
  ownerId: actor.id,
  previousOwner: '销售乙',
  sourceType: '公司资源',
}, actor);

assert.equal(result.code, 0);
assert.equal(created.length, 1);
assert.equal(created[0].data.domain, STORAGE_KEYS.CUSTOMERS);
assert.equal(created[0].data.data.name, '新客户');
assert.equal(auditEvents[0]?.operation, 'create_customer');
assert.equal(result.data?.originalSalesTransferBy, actor.name, '客户首次获得销售归属时应自动记录首个销售负责人');
assert.match(auditEvents[0]?.inputHash || '', /^[a-f0-9]{64}$/);
assert.equal(contactIdentities.length, 1);
assert.equal(contactLinks[0]?.entityId, result.data?.id);
assert.equal(directCreateLockOrder[0], 'mutation-gate');
assert.ok(directCreateLockOrder.indexOf('business-record') >= 0);
assert.ok(directCreateLockOrder.indexOf('legacy-source') > directCreateLockOrder.indexOf('business-record'));
assert.ok(directCreateLockOrder.indexOf('identity') > directCreateLockOrder.indexOf('legacy-source'));

const importedWithFollowUp = await service.create({
  name: '带历史跟进的客户',
  company: '导入测试公司',
  phone: '13800000096',
  customerLevel: 'L1',
  owner: '销售',
  ownerId: actor.id,
  previousOwner: '销售乙',
  originalSalesTransferBy: '销售丙',
  sourceType: '公司资源',
}, actor, {
  importDestination: 'assigned',
  importedLastFollowUpRecord: '已确认报价，等待客户回复',
});
assert.equal(importedWithFollowUp.code, 0);
assert.equal(importedWithFollowUp.data?.previousOwner, '销售乙');
assert.equal(importedWithFollowUp.data?.originalSalesTransferBy, '销售丙');
assert.deepEqual(importedWithFollowUp.data?.activityRecords?.map((record) => ({
  type: record.type,
  title: record.title,
  content: record.content,
  operator: record.operator,
})), [
  { type: 'follow', title: '历史最后跟进记录', content: '已确认报价，等待客户回复', operator: '跟进人未知' },
  { type: 'create', title: '创建了客户', content: undefined, operator: actor.name },
]);

const publicPoolActor = {
  ...actor,
  permissions: [
    ...(actor.permissions || []),
    { module: PERMISSION_KEYS.CUSTOMER_IMPORT, actions: ['write'] },
    { module: PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL, actions: ['write'] },
  ],
};
const publicPoolCreated = await service.create({
  name: '导入公海客户',
  company: '公海测试公司',
  phone: '13800000099',
  customerLevel: 'L1',
  owner: '公海',
  previousOwner: '历史销售乙',
  originalSalesTransferBy: '首任销售甲',
  sourceType: '公司资源',
}, publicPoolActor, { importDestination: 'public_pool', batchJobId: 'import-public-pool' });
assert.equal(publicPoolCreated.code, 0);
assert.equal(publicPoolCreated.data?.owner, '公海');
assert.equal(publicPoolCreated.data?.ownerId, undefined);
assert.equal(publicPoolCreated.data?.ownerIdentityStatus, 'public_pool');
assert.equal(publicPoolCreated.data?.previousOwner, '历史销售乙');
assert.equal(publicPoolCreated.data?.originalSalesTransferBy, '首任销售甲');
assert.equal(publicPoolCreated.data?.lifecycleStatusCode, 'public_pool');
assert.equal(publicPoolCreated.data?.releasedBy, actor.name);
assert.equal(publicPoolCreated.data?.releaseReason, '批量导入至公海');
assert.equal(auditEvents[auditEvents.length - 1]?.operation, 'import_customer_to_public_pool');

const releaseOnlyActor = {
  ...actor,
  permissions: [
    ...(actor.permissions || []),
    { module: PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL, actions: ['write'] },
  ],
};
const deniedWithoutImportPermission = await service.create({
  name: '缺少导入权限', company: '', phone: '13800000097', customerLevel: 'L1', owner: '公海', sourceType: '公司资源',
}, releaseOnlyActor, { importDestination: 'public_pool' });
assert.equal(deniedWithoutImportPermission.code, 403);
assert.match(deniedWithoutImportPermission.message, /无权导入客户/);

const deniedPublicPoolImport = await service.create({
  name: '无权公海导入', company: '', phone: '13800000098', customerLevel: 'L1', owner: '公海', sourceType: '公司资源',
}, actor, { importDestination: 'public_pool' });
assert.equal(deniedPublicPoolImport.code, 403);
assert.match(deniedPublicPoolImport.message, /无权导入客户/);

// RED: a direct POST customer create must reconcile an active pre-backfill
// BusinessRecord (identity table intentionally empty for this customer) and
// return only the generic conflict to an actor with matching data scope but
// no server-authoritative customer-list read permission.
const legacyContact = '13900000008';
created.push({
  data: {
    id: `${STORAGE_KEYS.CUSTOMERS}:legacy-no-identity`,
    domain: STORAGE_KEYS.CUSTOMERS,
    recordId: 'legacy-no-identity',
    title: '历史客户',
    status: 'following',
    owner: actor.name,
    customerId: 'legacy-no-identity',
    amount: 0,
    eventAt: new Date(now),
    data: {
      id: 'legacy-no-identity', name: '历史客户', company: '历史公司', owner: actor.name,
      ownerId: actor.id, ownerIdentityStatus: 'resolved', phone: legacyContact,
    },
  },
});
const createdBeforeLegacyConflict = created.length;
const directLegacyConflict = await service.create({
  name: '重复新建', company: '', phone: legacyContact, customerLevel: 'L1', owner: actor.name,
  ownerId: actor.id, sourceType: '公司资源',
}, actor);
assert.equal(directLegacyConflict.code, 409);
assert.equal(directLegacyConflict.data, null);
assert.equal(created.length, createdBeforeLegacyConflict, '冲突回滚不得写入新客户');
assert.equal(contactLinks.some((link) => (
  link.entityId === 'legacy-no-identity' && link.entityType === 'customer' && link.linkStatus === 'active'
)), false, 'conflicting create must roll back every tentative identity write as well');

// The same self-scoped actor may receive the minimal summary only after the
// server role directory grants CUSTOMER_LIST/read; a client token alone is
// deliberately not the authority for disclosure.
serverDirectoryAllowsCustomerList = true;
const directLegacyConflictAllowed = await service.create({
  name: '可披露重复新建', company: '', phone: legacyContact, customerLevel: 'L1', owner: actor.name,
  ownerId: actor.id, sourceType: '公司资源',
}, actor);
assert.equal(directLegacyConflictAllowed.code, 409);
assert.deepEqual(directLegacyConflictAllowed.data, {
  id: 'legacy-no-identity', name: '历史客户', company: '历史公司', owner: actor.name,
});
serverDirectoryAllowsCustomerList = false;

// RED: direct create retries an entire transaction after the deterministic
// deadlock signal, then returns a safe 409 after the bounded retry budget is
// exhausted without duplicating customer/audit writes.
{
  const beforeRetry = { created: created.length, audits: auditEvents.length, transactions: transactionCalls };
  const linksBeforeRetry = contactLinks.length;
  remainingPostBusinessRecordFailures = 1;
  const retried = await service.create({
    name: '死锁重试客户', company: '', phone: '13600000090', customerLevel: 'L1', owner: actor.name,
    ownerId: actor.id, sourceType: '公司资源',
  }, actor);
  assert.equal(retried.code, 0);
  assert.equal(transactionCalls - beforeRetry.transactions, 2, 'P2034 must retry the whole create transaction once');
  assert.equal(created.length, beforeRetry.created + 1);
  assert.equal(auditEvents.length, beforeRetry.audits + 1, 'retry must not duplicate audit history');
  assert.equal(contactLinks.length, linksBeforeRetry + 1, 'post-create rollback must not leave a duplicate identity link');

  const beforeExhausted = { created: created.length, audits: auditEvents.length, transactions: transactionCalls };
  remainingPostBusinessRecordFailures = 3;
  const exhausted = await service.create({
    name: '死锁耗尽客户', company: '', phone: '13600000091', customerLevel: 'L1', owner: actor.name,
    ownerId: actor.id, sourceType: '公司资源',
  }, actor);
  assert.equal(exhausted.code, 409);
  assert.equal(exhausted.data, null);
  assert.match(exhausted.message, /并发冲突/);
  assert.equal(transactionCalls - beforeExhausted.transactions, 3, 'retry budget must remain bounded');
  assert.equal(created.length, beforeExhausted.created);
  assert.equal(auditEvents.length, beforeExhausted.audits);
}

const tagged = await service.create({
  name: '标签客户', company: '', phone: '13800000001', customerLevel: 'L1', owner: '销售', ownerId: actor.id, sourceType: '公司资源', manualTagIds: ['shared'],
}, actor);
assert.deepEqual(tagged.data?.tags, ['高意向']);

const missingTag = await service.create({
  name: '非法标签客户', company: '', phone: '13800000002', customerLevel: 'L1', owner: '销售', ownerId: actor.id, sourceType: '公司资源', manualTagIds: ['missing'],
}, actor);
assert.equal(missingTag.code, 400);

const denied = await service.create({
  name: '越权客户',
  company: '越权客户公司',
  phone: '13900000000',
  customerLevel: 'L1',
  owner: '另一位销售',
  sourceType: '公司资源',
}, actor);

assert.equal(denied.code, 0, 'ownerId 缺失时必须由服务端明确归属当前 actor，不能按姓名分配');
assert.equal(denied.data?.ownerId, actor.id);
assert.equal(denied.data?.owner, actor.name);
assert.equal(created.length, 7);

const emptyName = await service.create({
  name: '',
  company: '',
  phone: '13700000000',
  customerLevel: 'L1',
  owner: '销售',
  ownerId: actor.id,
  sourceType: '公司资源',
}, actor);

assert.equal(emptyName.code, 400);
assert.equal(emptyName.message, '客户姓名不能为空');

const emptyPhone = await service.create({
  name: '缺少手机号',
  company: '',
  phone: '',
  customerLevel: 'L1',
  owner: '销售',
  ownerId: actor.id,
  sourceType: '公司资源',
}, actor);

assert.equal(emptyPhone.code, 400);
assert.equal(emptyPhone.message, '客户手机号或微信至少填写一项');

const wechatOnly = await service.create({
  name: '微信客户',
  company: '',
  phone: '',
  wechat: 'wechat_customer_2026',
  customerLevel: 'L1',
  owner: '销售',
  ownerId: actor.id,
  sourceType: '公司资源',
}, actor);

assert.equal(wechatOnly.code, 0, '页面允许手机号或微信二选一，服务端必须接受仅微信客户');

const overlongName = await service.create({
  name: '客'.repeat(101),
  company: '',
  phone: '13700000001',
  customerLevel: 'L1',
  owner: '销售',
  ownerId: actor.id,
  sourceType: '公司资源',
}, actor);

assert.equal(overlongName.code, 400);
assert.equal(overlongName.message, '客户姓名不能超过100个字符');

const [firstDuplicate, secondDuplicate] = await Promise.all([
  service.create({
    name: '并发客户甲',
    company: '',
    phone: '136 0000 0000',
    customerLevel: 'L1',
    owner: '销售',
    ownerId: actor.id,
    sourceType: '公司资源',
  }, actor),
  service.create({
    name: '并发客户乙',
    company: '',
    phone: '+86 13600000000',
    customerLevel: 'L1',
    owner: '销售',
    ownerId: actor.id,
    sourceType: '公司资源',
  }, actor),
]);

assert.equal(firstDuplicate.code, 0);
assert.equal(secondDuplicate.code, 409);
assert.equal(secondDuplicate.message, '系统中已存在相同联系方式');

const flattenSql = (value: any): string => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value) && !(value as any).strings) return value.map(flattenSql).join(' ');
  const strings = value.strings || (Array.isArray(value[0]) ? value[0] : undefined);
  const values = value.values || (strings ? Array.prototype.slice.call(value, 1) : []);
  if (!strings) return Object.values(value).map(flattenSql).join(' ');
  return Array.from(strings).map((part, index) => `${part}${index < values.length ? flattenSql(values[index]) : ''}`).join('');
};
const capturedQueries: string[] = [];
const listFixtures = [
  { ...created[0].data.data, id: 'sales-a-hit-1', owner: '销售甲', ownerId: 'sales-1', ownerIdentityStatus: 'resolved', manualTagIds: ['t-agent', 't-high-budget'] },
  { ...created[0].data.data, id: 'sales-a-hit-2', owner: '销售甲', ownerId: 'sales-1', ownerIdentityStatus: 'resolved', manualTagIds: ['t-private', 't-high-budget'] },
  { ...created[0].data.data, id: 'sales-a-miss', owner: '销售甲', ownerId: 'sales-1', ownerIdentityStatus: 'resolved', manualTagIds: ['t-agent'] },
  { ...created[0].data.data, id: 'sales-b-hit', owner: '销售乙', ownerId: 'sales-2', ownerIdentityStatus: 'resolved', manualTagIds: ['t-agent', 't-high-budget'] },
];
let executingFilters: any = {};
const listService = createCustomerListService({
  businessRecord: { findMany: async ({ where }: any) => {
    if (where.domain === STORAGE_KEYS.TAG_GROUPS) return tagCatalog.groups.map((data: any) => ({ data }));
    if (where.domain === STORAGE_KEYS.TAGS) return tagCatalog.tags.map((data: any) => ({ data }));
    return [];
  } },
  leadRecord: { findMany: async () => [] },
  user: { findMany: async () => [{ id: 'sales-1', name: '销售甲', account: 'sales', email: '', phone: '', role: '销售顾问', avatar: null, departmentId: 'd1', positionId: null, positionName: null, roleId: 'r1', passwordHash: null, passwordSalt: null, passwordUpdatedAt: null, lastLoginAt: null, isActive: true, employmentStatus: 'active', createdAt: now, updatedAt: now }] },
  role: { findMany: async () => [{ id: 'r1', name: '销售顾问', code: 'sales', description: null, departmentId: null, permissions: [{ module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] }], dataScopes: { customers: 'self' }, memberCount: 1, isActive: true, createdAt: now, updatedAt: now }] },
  department: { findMany: async () => [] },
  $queryRaw: async (...args: any[]) => {
    const sql = flattenSql(args);
    capturedQueries.push(sql);
    if (sql.includes('public_pool_follow_ups')) return [{ name: '历史跟进人' }, { name: '跟进人未知' }];
    const filtered = listFixtures.filter((item) => item.owner === '销售甲' && matchesCustomerTagFilters(item, executingFilters, tagCatalog));
    if (sql.includes('COUNT(*)')) return [{ total: BigInt(filtered.length) }];
    const page = Number(executingFilters.page || 1); const pageSize = Number(executingFilters.pageSize || 10);
    return filtered.slice((page - 1) * pageSize, page * pageSize).map((data) => ({
      id: `${STORAGE_KEYS.CUSTOMERS}:${data.id}`,
      domain: STORAGE_KEYS.CUSTOMERS,
      recordId: data.id,
      data,
      updatedAt: new Date(data.updatedAt),
    }));
  },
} as any);
const salesActor = { ...actor, id: 'sales-1', name: '销售甲', account: 'sales', role: '销售顾问', roleId: 'r1', departmentId: 'd1' } as any;
executingFilters = { tagIds: ['t-agent', 't-private', 't-high-budget'], tagMatch: 'grouped', page: 1, pageSize: 1 };
const sqlList = await listService.list(executingFilters, salesActor);
assert.equal(sqlList.code, 0);
assert.deepEqual(sqlList.data?.items.map((item) => item.id), ['sales-a-hit-1']);
assert.deepEqual(sqlList.data?.pagination, { page: 1, pageSize: 1, total: 2, totalPages: 2 });
assert.equal(capturedQueries.length, 2);
for (const sql of capturedQueries) {
  assert.match(sql, /JSON_CONTAINS/);
  assert.match(sql, /t-agent/); assert.match(sql, /t-private/); assert.match(sql, /t-high-budget/);
  assert.match(sql, /JSON_UNQUOTE\(JSON_EXTRACT\(data, '\$\.owner'\)\) IN/); assert.match(sql, /销售甲/);
  assert.doesNotMatch(sql, /AND owner IN/);
}
assert.match(capturedQueries[1], /LIMIT[\s\S]*OFFSET[\s\S]*1 0$/);

const filterCases: Array<[CustomerFilters, string]> = [[{ tagIds: ['t-agent', 't-private'], tagMatch: 'any' }, ' OR '], [{ tagIds: ['t-agent', 't-private'], tagMatch: 'all' }, ' AND '], [{ withoutTags: true }, 'JSON_LENGTH']];
for (const [filters, joiner] of filterCases) {
  capturedQueries.length = 0;
  executingFilters = filters;
  await listService.list(filters, salesActor);
  assert.match(capturedQueries[0], joiner === 'JSON_LENGTH' ? /JSON_LENGTH/ : new RegExp(joiner.trim()));
}

capturedQueries.length = 0;
const followUpOperators = await listService.listPublicPoolFollowUpOperators(salesActor);
assert.deepEqual(followUpOperators.data, ['历史跟进人', '跟进人未知']);
assert.match(capturedQueries[0], /SELECT DISTINCT last_follow_up_owner/);
assert.match(capturedQueries[0], /JSON_TABLE/);
assert.match(capturedQueries[0], /JSON_UNQUOTE\(JSON_EXTRACT\(data, '\$\.owner'\)\) IN/);

const mirrorListDirectory = {
  businessRecord: { findMany: async () => [] },
  leadRecord: { findMany: async () => [] },
  user: {
    findMany: async () => [
      { id: 'sales-1', name: '销售甲', account: 'sales-a', email: '', phone: '', role: '销售顾问', avatar: null, departmentId: 'd1', positionId: null, positionName: null, roleId: 'r1', passwordHash: null, passwordSalt: null, passwordUpdatedAt: null, lastLoginAt: null, isActive: true, employmentStatus: 'active', createdAt: now, updatedAt: now },
      { id: 'sales-2', name: '销售乙', account: 'sales-b', email: '', phone: '', role: '销售顾问', avatar: null, departmentId: 'd1', positionId: null, positionName: null, roleId: 'r1', passwordHash: null, passwordSalt: null, passwordUpdatedAt: null, lastLoginAt: null, isActive: true, employmentStatus: 'active', createdAt: now, updatedAt: now },
    ],
  },
  role: { findMany: async () => [{ id: 'r1', name: '销售顾问', code: 'sales', description: null, departmentId: null, permissions: [{ module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] }], dataScopes: { customers: 'self' }, memberCount: 2, isActive: true, createdAt: now, updatedAt: now }] },
  department: { findMany: async () => [] },
};
const createMirrorListService = ($queryRaw: (...args: any[]) => Promise<any>) => createCustomerListService({
  ...mirrorListDirectory,
  $queryRaw,
} as any);

const mirrorMismatchRows = [
  {
    owner: '销售乙',
    data: {
      ...created[0].data.data,
      id: 'canonical-sales-a',
      owner: '销售甲',
      ownerId: 'sales-1',
      ownerIdentityStatus: 'resolved',
    },
  },
  {
    owner: '销售甲',
    data: {
      ...created[0].data.data,
      id: 'canonical-sales-b',
      owner: '销售乙',
      ownerId: 'sales-2',
      ownerIdentityStatus: 'resolved',
    },
  },
];
const mirrorMismatchService = createMirrorListService(async (...args: any[]) => {
    const sql = flattenSql(args);
    const ownerFilterReadsJson = /JSON_UNQUOTE\(JSON_EXTRACT\(data, '\$\.owner'\)\)\s*=\s*销售甲/.test(sql);
    const matchingRows = mirrorMismatchRows.filter((row) => (
      row.data.ownerId === 'sales-1'
      && (ownerFilterReadsJson ? row.data.owner === '销售甲' : row.owner === '销售甲')
    ));
    if (sql.includes('COUNT(*)')) return [{ total: BigInt(matchingRows.length) }];
    return matchingRows.map((row) => ({
      id: `${STORAGE_KEYS.CUSTOMERS}:${row.data.id}`,
      domain: STORAGE_KEYS.CUSTOMERS,
      recordId: row.data.id,
      data: row.data,
      updatedAt: new Date(row.data.updatedAt),
    }));
});

const mirrorMismatchResult = await mirrorMismatchService.list(
  { owner: '销售甲', page: 1, pageSize: 10 },
  salesActor,
);
assert.equal(mirrorMismatchResult.code, 0);
assert.deepEqual(
  mirrorMismatchResult.data?.items.map((customer) => customer.id),
  ['canonical-sales-a'],
  '客户 JSON 是权威数据，不得因顶层 owner 镜像滞后丢失可见客户',
);
assert.deepEqual(mirrorMismatchResult.data?.pagination, {
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
});

const unresolvedMirrorService = createMirrorListService(async (...args: any[]) => {
    const sql = flattenSql(args);
    const visibilityReadsJsonOwner = /JSON_UNQUOTE\(JSON_EXTRACT\(data, '\$\.owner'\)\)\s+IN\s+\(销售甲\)/.test(sql);
    const row = {
      owner: '销售乙',
      data: {
        ...created[0].data.data,
        id: 'legacy-canonical-sales-a',
        owner: '销售甲',
        ownerId: undefined,
        ownerIdentityStatus: 'unresolved' as const,
      },
    };
    const matchingRows = (visibilityReadsJsonOwner ? row.data.owner : row.owner) === '销售甲' ? [row] : [];
    if (sql.includes('COUNT(*)')) return [{ total: BigInt(matchingRows.length) }];
    return matchingRows.map((item) => ({
      id: `${STORAGE_KEYS.CUSTOMERS}:${item.data.id}`,
      domain: STORAGE_KEYS.CUSTOMERS,
      recordId: item.data.id,
      data: item.data,
      updatedAt: new Date(item.data.updatedAt),
    }));
});

const unresolvedMirrorResult = await unresolvedMirrorService.list(
  { page: 1, pageSize: 10 },
  salesActor,
);
assert.deepEqual(unresolvedMirrorResult.data?.items.map((customer) => customer.id), [
  'legacy-canonical-sales-a',
]);
assert.deepEqual(unresolvedMirrorResult.data?.pagination, {
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
});

const searchMirrorRows = [
  {
    title: '旧标题',
    data: {
      ...created[0].data.data,
      id: 'canonical-search-hit',
      name: '目标客户',
      owner: '销售甲',
      ownerId: 'sales-1',
      ownerIdentityStatus: 'resolved' as const,
    },
  },
  {
    title: '目标客户',
    data: {
      ...created[0].data.data,
      id: 'stale-title-only',
      name: '其他客户',
      company: '',
      phone: '13900000009',
      wechat: '',
      owner: '销售甲',
      ownerId: 'sales-1',
      ownerIdentityStatus: 'resolved' as const,
    },
  },
];
const searchMirrorService = createMirrorListService(async (...args: any[]) => {
    const sql = flattenSql(args);
    const queryReadsMirrorTitle = /LOWER\(COALESCE\(title, ''\)\)/.test(sql);
    const matchingRows = searchMirrorRows.filter((row) => (
      row.data.name.includes('目标') || (queryReadsMirrorTitle && row.title.includes('目标'))
    ));
    if (sql.includes('COUNT(*)')) return [{ total: BigInt(matchingRows.length) }];
    return matchingRows.map((row) => ({
      id: `${STORAGE_KEYS.CUSTOMERS}:${row.data.id}`,
      domain: STORAGE_KEYS.CUSTOMERS,
      recordId: row.data.id,
      data: row.data,
      updatedAt: new Date(row.data.updatedAt),
    }));
});

const searchMirrorResult = await searchMirrorService.list(
  { search: '目标', page: 1, pageSize: 10 },
  salesActor,
);
assert.deepEqual(searchMirrorResult.data?.items.map((customer) => customer.id), [
  'canonical-search-hit',
]);
assert.deepEqual(searchMirrorResult.data?.pagination, {
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
});

const transactionCallsBeforeBatchCreate = transactionCalls;
let batchDirectoryReads = 0;
const originalBatchUserFindMany = servicePrisma.user.findMany;
servicePrisma.user.findMany = async (...args: any[]) => {
  batchDirectoryReads += 1;
  return originalBatchUserFindMany(...args);
};
const batchCreated = await service.create({
  name: '批量导入事务客户', company: '', phone: '13500000088', customerLevel: 'L1',
  owner: actor.name, ownerId: actor.id, sourceType: '公司资源',
}, actor, {
  tx: servicePrisma,
  batchJobId: 'import-job-test',
  requestId: 'import-job-test:row:1',
  idempotencyKey: 'import-job-test:row:1',
  accessContext: {
    actorId: actor.id,
    actorName: actor.name,
    readableUserIds: new Set([actor.id]),
    legacyReadableNames: new Set([actor.name]),
    manageableOwnerIds: new Set([actor.id]),
    canReadPublicPool: false,
    canReadCustomerList: false,
    grantedPermissions: new Set([PERMISSION_KEYS.CUSTOMER_CREATE]),
  },
});
assert.equal(batchCreated.code, 0);
assert.equal(transactionCalls, transactionCallsBeforeBatchCreate, 'existing transaction must not open a nested transaction');
assert.equal(batchDirectoryReads, 0, 'batch create must reuse the transaction-authoritative access context');
servicePrisma.user.findMany = originalBatchUserFindMany;
assert.equal(auditEvents[auditEvents.length - 1]?.batchJobId, 'import-job-test');
assert.equal(auditEvents[auditEvents.length - 1]?.requestId, 'import-job-test:row:1');
