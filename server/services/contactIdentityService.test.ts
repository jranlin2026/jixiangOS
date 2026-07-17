import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import {
  CONTACT_IDENTITY_MUTATION_GATE_KEY,
  ContactIdentityConflictError,
  backfillContactIdentities,
  hashContactIdentity,
  linkLeadAndCustomerIdentity,
  normalizeContactIdentity,
  upsertCustomerContactIdentities,
} from './contactIdentityService';

const crypto = {
  hmacKey: Buffer.alloc(32, 7),
  keyVersion: 1 as const,
  encryptionKey: Buffer.alloc(32, 8),
  encryptionKeyVersion: 1 as const,
};

type State = {
  identities: any[];
  links: any[];
  groups: any[];
  customers: any[];
  leads: any[];
  appStorage: Array<{ key: string; value: unknown }>;
};

function matchesWhere(row: any, where: any): boolean {
  return Object.entries(where || {}).every(([key, value]) => {
    if (key === 'type_normalizedHash') {
      return row.type === (value as any).type && row.normalizedHash === (value as any).normalizedHash;
    }
    if (key === 'identityId_entityType_entityId') {
      const compound = value as any;
      return row.identityId === compound.identityId
        && row.entityType === compound.entityType
        && row.entityId === compound.entityId;
    }
    if (value && typeof value === 'object' && 'in' in (value as any)) {
      return (value as any).in.includes(row[key]);
    }
    return row[key] === value;
  });
}

function createStore(
  input: Partial<State> = {},
  options: {
    beforeTransaction?: (state: State) => void;
    queryLog?: string[];
    transactionAttempts?: { value: number };
    failTransactions?: number;
  } = {},
) {
  const state: State = {
    identities: structuredClone(input.identities || []),
    links: structuredClone(input.links || []),
    groups: structuredClone(input.groups || []),
    customers: structuredClone(input.customers || []),
    leads: structuredClone(input.leads || []),
    appStorage: structuredClone((input as any).appStorage || []),
  };
  let remainingTransactionFailures = options.failTransactions || 0;
  const store: any = {
    contactIdentity: {
      findUnique: async ({ where }: any) => state.identities.find((row) => matchesWhere(row, where)) || null,
      create: async ({ data }: any) => {
        if (state.identities.some((row) => (
          row.id === data.id || (row.type === data.type && row.normalizedHash === data.normalizedHash)
        ))) {
          throw Object.assign(new Error('duplicate identity'), { code: 'P2002' });
        }
        const row = { ...structuredClone(data), createdAt: new Date(), updatedAt: new Date() };
        state.identities.push(row);
        return structuredClone(row);
      },
      update: async ({ where, data }: any) => {
        const row = state.identities.find((candidate) => candidate.id === where.id);
        assert.ok(row);
        Object.assign(row, structuredClone(data), { updatedAt: new Date() });
        return structuredClone(row);
      },
    },
    contactIdentityLink: {
      findMany: async ({ where }: any = {}) => structuredClone(state.links.filter((row) => matchesWhere(row, where))),
      upsert: async ({ where, create, update }: any) => {
        const row = state.links.find((candidate) => matchesWhere(candidate, where));
        if (row) {
          Object.assign(row, structuredClone(update));
          return structuredClone(row);
        }
        const created = { ...structuredClone(create), createdAt: new Date() };
        state.links.push(created);
        return structuredClone(created);
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of state.links) {
          if (!matchesWhere(row, where)) continue;
          Object.assign(row, structuredClone(data));
          count += 1;
        }
        return { count };
      },
    },
    customerDuplicateGroup: {
      findUnique: async ({ where }: any) => state.groups.find((row) => matchesWhere(row, where)) || null,
      create: async ({ data }: any) => {
        if (state.groups.some((row) => row.groupKey === data.groupKey)) {
          throw Object.assign(new Error('duplicate group'), { code: 'P2002' });
        }
        const row = { ...structuredClone(data), createdAt: new Date() };
        state.groups.push(row);
        return structuredClone(row);
      },
      update: async ({ where, data }: any) => {
        const row = state.groups.find((candidate) => candidate.groupKey === where.groupKey || candidate.id === where.id);
        assert.ok(row);
        Object.assign(row, structuredClone(data));
        return structuredClone(row);
      },
    },
    businessRecord: {
      findMany: async () => structuredClone(state.customers),
      findUnique: async ({ where }: any) => {
        const compound = where.domain_recordId;
        return structuredClone(state.customers.find((row) => (
          row.domain === compound.domain && row.recordId === compound.recordId
        )) || null);
      },
    },
    leadRecord: {
      findMany: async () => structuredClone(state.leads),
    },
    appStorage: {
      findMany: async () => structuredClone(state.appStorage),
      upsert: async ({ where, update, create }: any) => {
        options.queryLog?.push(`app_storage_upsert:${where.key}`);
        const row = state.appStorage.find((candidate) => candidate.key === where.key);
        if (row) {
          Object.assign(row, structuredClone(update));
          return structuredClone(row);
        }
        state.appStorage.push(structuredClone(create));
        return structuredClone(create);
      },
      deleteMany: async ({ where }: any) => {
        const keys = new Set<string>(where?.key?.in || []);
        const before = state.appStorage.length;
        state.appStorage = state.appStorage.filter((row) => !keys.has(row.key));
        return { count: before - state.appStorage.length };
      },
    },
    $queryRaw: async (query: any) => {
      const text = Array.isArray(query?.strings) ? query.strings.join('?') : String(query || '');
      options.queryLog?.push(text);
      const values = query?.values || [];
      if (text.includes('FROM contact_identities')) {
        const [type, normalizedHash] = values;
        return structuredClone(state.identities.filter((row) => (
          row.type === type && row.normalizedHash === normalizedHash
        )));
      }
      if (text.includes('FROM contact_identity_links')) {
        if (text.includes('WHERE identityId')) {
          const [identityId] = values;
          return structuredClone(state.links.filter((row) => (
            row.identityId === identityId && row.entityType === 'customer' && row.linkStatus === 'active'
          )).map((row) => ({ entityId: row.entityId })));
        }
        const [entityType, entityId] = values;
        return structuredClone(state.links.filter((row) => (
          row.entityType === entityType && row.entityId === entityId && row.linkStatus === 'active'
        )).map((row) => ({ identityId: row.identityId })));
      }
      if (text.includes('FROM customer_duplicate_groups')) {
        const [groupKey] = values;
        return structuredClone(state.groups.filter((row) => row.groupKey === groupKey));
      }
      if (text.includes('FROM business_records')) return structuredClone(state.customers);
      if (text.includes('FROM lead_records')) return structuredClone(state.leads);
      return [];
    },
  };
  store.$transaction = async (operation: any) => {
    if (options.transactionAttempts) options.transactionAttempts.value += 1;
    if (remainingTransactionFailures > 0) {
      remainingTransactionFailures -= 1;
      throw Object.assign(new Error('backfill deadlock'), { code: 'P2034' });
    }
    options.beforeTransaction?.(state);
    return operation(store);
  };
  return { store, state };
}

// RED: identity primary keys must include the contact type. A phone and a
// WeChat value can normalize to the same string while remaining separate
// identities under the schema's (type, normalizedHash) uniqueness boundary.
{
  const { store, state } = createStore({
    customers: [{
      id: 'aaos_customers:c-type', domain: 'aaos_customers', recordId: 'c-type',
      data: { id: 'c-type', name: '跨类型客户', phone: '13800138000', wechat: '13800138000' },
    }],
  });
  const identities = await upsertCustomerContactIdentities(store, {
    customerId: 'c-type', phone: '13800138000', wechat: '13800138000', crypto,
  });
  assert.equal(identities.length, 2);
  assert.deepEqual(identities.map((identity) => identity.type).sort(), ['phone', 'wechat']);
  assert.notEqual(identities[0].id, identities[1].id);
  assert.equal(new Set(state.identities.map((identity) => identity.id)).size, 2);
}

// Existing pre-fix rows retain their legacy primary key. A subsequent
// backfill safely keeps that row and creates the missing other contact type
// under the new type-qualified key; no schema/data ID rewrite is required.
{
  const normalizedHash = hashContactIdentity('13800138000', crypto.hmacKey);
  const legacyId = `contact-${normalizedHash.slice(0, 32)}`;
  const { store, state } = createStore({
    identities: [{
      id: legacyId, type: 'phone', normalizedHash, hashKeyVersion: 1, status: 'active',
      encryptedNormalizedValue: 'ci:v1:legacy', canonicalCustomerId: 'c-legacy-id', conflictReason: null,
    }],
    customers: [{
      id: 'aaos_customers:c-legacy-id', domain: 'aaos_customers', recordId: 'c-legacy-id',
      data: { id: 'c-legacy-id', name: '兼容客户', phone: '13800138000', wechat: '13800138000' },
    }],
  });
  await backfillContactIdentities(store, { apply: true, crypto });
  assert.equal(state.identities.find((identity) => identity.type === 'phone')?.id, legacyId);
  assert.match(state.identities.find((identity) => identity.type === 'wechat')?.id || '', /^ci_wechat_/);
  assert.equal(state.identities.length, 2);
}

// RED: a P2002 loser must use a locking current read, not its repeatable-read
// snapshot, to reload the already-committed identity winner.
{
  const expectedHash = hashContactIdentity('13800138000', crypto.hmacKey);
  const winner = {
    id: 'ci_phone_current-read', type: 'phone', normalizedHash: expectedHash, hashKeyVersion: 1,
    status: 'active', encryptedNormalizedValue: 'ci:v1:test', canonicalCustomerId: 'c-winner', conflictReason: null,
  };
  let currentReads = 0;
  let linkCurrentReads = 0;
  let loserUpserts = 0;
  const store: any = {
    contactIdentity: {
      findUnique: async () => null,
      create: async () => { throw Object.assign(new Error('duplicate identity'), { code: 'P2002' }); },
      update: async ({ data }: any) => ({ ...winner, ...data }),
    },
    contactIdentityLink: {
      findMany: async () => { throw new Error('stale ORM link snapshot must not decide admission'); },
      upsert: async () => { loserUpserts += 1; return {}; },
      updateMany: async () => ({ count: 0 }),
    },
    businessRecord: { findMany: async () => [], findUnique: async () => null },
    $queryRaw: async (query: any) => {
      const text = Array.isArray(query?.strings) ? query.strings.join('?') : String(query || '');
      if (text.includes('FROM contact_identities')) {
        currentReads += 1;
        assert.match(text, /FOR UPDATE/);
        assert.deepEqual(query.values, ['phone', expectedHash]);
        return [winner];
      }
      if (text.includes('FROM contact_identity_links')) {
        linkCurrentReads += 1;
        assert.match(text, /FOR UPDATE/);
        assert.deepEqual(query.values, [winner.id]);
        return [{ entityId: 'c-winner' }];
      }
      return [];
    },
  };
  await assert.rejects(
    () => upsertCustomerContactIdentities(store, {
      customerId: 'c-current-read', phone: '13800138000', crypto,
    }),
    (error: unknown) => error instanceof ContactIdentityConflictError,
  );
  assert.ok(currentReads >= 1, 'P2002 recovery must use SELECT ... FOR UPDATE current read');
  assert.ok(linkCurrentReads >= 1, 'admission after P2002 must use a current locked link read');
  assert.equal(loserUpserts, 0);
}

// A transaction can also have an existing stale identity snapshot before any
// insert attempt. The same current identity/link reads must reject the loser
// without relying on P2002 as the only refresh trigger.
{
  const expectedHash = hashContactIdentity('13900000006', crypto.hmacKey);
  const identity = {
    id: 'ci_phone_existing-current-read', type: 'phone', normalizedHash: expectedHash, hashKeyVersion: 1,
    status: 'active', encryptedNormalizedValue: 'ci:v1:test', canonicalCustomerId: null, conflictReason: null,
  };
  let creates = 0;
  let upserts = 0;
  const store: any = {
    contactIdentity: {
      findUnique: async () => ({ ...identity }),
      create: async () => { creates += 1; return identity; },
      update: async ({ data }: any) => ({ ...identity, ...data }),
    },
    contactIdentityLink: {
      findMany: async () => { throw new Error('stale ORM link snapshot must not decide admission'); },
      upsert: async () => { upserts += 1; return {}; },
      updateMany: async () => ({ count: 0 }),
    },
    businessRecord: { findMany: async () => [], findUnique: async () => null },
    $queryRaw: async (query: any) => {
      const text = Array.isArray(query?.strings) ? query.strings.join('?') : String(query || '');
      if (text.includes('FROM contact_identities')) return [{ ...identity, canonicalCustomerId: 'c-winner' }];
      if (text.includes('FROM contact_identity_links')) return [{ entityId: 'c-winner' }];
      return [];
    },
  };
  await assert.rejects(
    () => upsertCustomerContactIdentities(store, {
      customerId: 'c-stale-reader', phone: '13900000006', crypto,
    }),
    (error: unknown) => error instanceof ContactIdentityConflictError,
  );
  assert.equal(creates, 0);
  assert.equal(upserts, 0);
}

// RED: before a full historical backfill, a matching active legacy customer
// without an identity link is reconciled inside the write transaction and
// blocks a new duplicate customer.
{
  const { store, state } = createStore({
    customers: [{
      id: 'aaos_customers:c-legacy', domain: 'aaos_customers', recordId: 'c-legacy',
      data: { id: 'c-legacy', name: '历史客户', phone: '13800138000' },
    }],
  });
  await assert.rejects(
    () => upsertCustomerContactIdentities(store, {
      customerId: 'c-new', phone: '13800138000', crypto,
    }),
    (error: unknown) => error instanceof ContactIdentityConflictError,
  );
  assert.equal(state.identities.length, 1);
  assert.equal(state.links.some((link) => link.entityId === 'c-legacy' && link.linkStatus === 'active'), true);
}

assert.equal(normalizeContactIdentity('phone', ' +86 138 0013 8000 '), '13800138000');
assert.equal(normalizeContactIdentity('wechat', ' WeiXin_A '), 'weixin_a');

// RED: apply must rebuild from the current locked source rows, not reactivate
// an identity planned before a customer changed contact details.
{
  const oldPhone = '13900000041';
  const newPhone = '13900000042';
  const oldHash = hashContactIdentity(oldPhone, crypto.hmacKey);
  const queryLog: string[] = [];
  const { store, state } = createStore({
    identities: [{
      id: `ci_phone_${oldHash.slice(0, 32)}`, type: 'phone', normalizedHash: oldHash,
      hashKeyVersion: 1, status: 'active', encryptedNormalizedValue: 'ci:v1:test',
      canonicalCustomerId: null, conflictReason: null,
    }],
    links: [{
      id: 'link-before-edit', identityId: `ci_phone_${oldHash.slice(0, 32)}`,
      entityType: 'customer', entityId: 'c-backfill-edit', linkStatus: 'ended',
      source: 'historical_backfill', endedAt: new Date(),
    }],
    customers: [{
      id: 'aaos_customers:c-backfill-edit', domain: 'aaos_customers', recordId: 'c-backfill-edit',
      data: { id: 'c-backfill-edit', name: '回填并发编辑客户', phone: oldPhone },
    }],
  }, {
    queryLog,
    beforeTransaction: (current) => {
      current.customers[0].data.phone = newPhone;
    },
  });

  await backfillContactIdentities(store, { apply: true, crypto });
  assert.equal(
    state.links.find((link) => link.id === 'link-before-edit')?.linkStatus,
    'ended',
    'apply must not reactivate the old pre-transaction contact link',
  );
  const currentIdentity = state.identities.find((identity) => (
    identity.normalizedHash === hashContactIdentity(newPhone, crypto.hmacKey)
  ));
  assert.ok(currentIdentity);
  assert.equal(state.links.some((link) => (
    link.identityId === currentIdentity.id && link.entityId === 'c-backfill-edit' && link.linkStatus === 'active'
  )), true);
  const sourceCustomerLock = queryLog.findIndex((text) => (
    text.includes('FROM business_records') && text.includes('ORDER BY recordId ASC') && text.includes('FOR UPDATE')
  ));
  const mutationGateLock = queryLog.findIndex((text) => (
    text === 'app_storage_upsert:aaos_contact_identity_mutation_gate_v1'
  ));
  const sourceLeadLock = queryLog.findIndex((text) => (
    text.includes('FROM lead_records') && text.includes('ORDER BY id ASC') && text.includes('FOR UPDATE')
  ));
  const firstIdentityLock = queryLog.findIndex((text) => text.includes('FROM contact_identities'));
  assert.ok(mutationGateLock >= 0 && sourceCustomerLock > mutationGateLock);
  assert.ok(sourceCustomerLock >= 0 && sourceLeadLock > sourceCustomerLock);
  assert.ok(firstIdentityLock > sourceLeadLock, 'source rows must be current-locked before identities are touched');
}

// RED: a source soft-delete between preview and apply ends its old active
// link. A second apply remains idempotent instead of resurrecting it.
{
  const phone = '13900000043';
  const normalizedHash = hashContactIdentity(phone, crypto.hmacKey);
  const identityId = `ci_phone_${normalizedHash.slice(0, 32)}`;
  const { store, state } = createStore({
    identities: [{
      id: identityId, type: 'phone', normalizedHash, hashKeyVersion: 1, status: 'active',
      encryptedNormalizedValue: 'ci:v1:test', canonicalCustomerId: 'c-backfill-delete', conflictReason: null,
    }],
    links: [{
      id: 'link-before-delete', identityId, entityType: 'customer', entityId: 'c-backfill-delete',
      linkStatus: 'active', source: 'historical_backfill', endedAt: null,
    }],
    customers: [{
      id: 'aaos_customers:c-backfill-delete', domain: 'aaos_customers', recordId: 'c-backfill-delete',
      data: { id: 'c-backfill-delete', name: '回填并发删除客户', phone },
    }],
  }, {
    beforeTransaction: (current) => {
      current.customers[0].data.deletedAt = '2026-07-18T00:00:00.000Z';
    },
  });

  await backfillContactIdentities(store, { apply: true, crypto });
  assert.equal(state.links.find((link) => link.id === 'link-before-delete')?.linkStatus, 'ended');
  const deletedIdentity = state.identities.find((identity) => identity.id === identityId);
  assert.equal(deletedIdentity?.status, 'active');
  assert.equal(deletedIdentity?.canonicalCustomerId, null);
  assert.equal(deletedIdentity?.conflictReason, null);
  const stable = {
    identities: structuredClone(state.identities),
    links: structuredClone(state.links),
    groups: structuredClone(state.groups),
  };
  await backfillContactIdentities(store, { apply: true, crypto });
  assert.deepEqual(
    { identities: state.identities, links: state.links, groups: state.groups },
    stable,
    'deleted source cleanup must stay idempotent on rerun',
  );
}

// RED: whole backfill apply retries a transaction-level deadlock from a clean
// attempt and stops after three failed attempts.
{
  const attempts = { value: 0 };
  const { store, state } = createStore({
    customers: [{
      id: 'aaos_customers:c-backfill-retry', domain: 'aaos_customers', recordId: 'c-backfill-retry',
      data: { id: 'c-backfill-retry', name: '回填重试客户', phone: '13900000044' },
    }],
  }, { failTransactions: 1, transactionAttempts: attempts });
  const result = await backfillContactIdentities(store, { apply: true, crypto });
  assert.equal(attempts.value, 2);
  assert.equal(result.canonicalCustomers, 1);
  assert.equal(state.links.filter((link) => link.linkStatus === 'active').length, 1);

  const exhaustedAttempts = { value: 0 };
  const exhausted = createStore({}, { failTransactions: 3, transactionAttempts: exhaustedAttempts });
  await assert.rejects(
    () => backfillContactIdentities(exhausted.store, { apply: true, crypto }),
    (error: unknown) => (error as { code?: string }).code === 'P2034',
  );
  assert.equal(exhaustedAttempts.value, 3);
}

{
  const { store, state } = createStore({
    customers: [{
      id: 'aaos_customers:c-1', domain: 'aaos_customers', recordId: 'c-1',
      data: { id: 'c-1', name: '客户一', phone: '13800138000', ownerId: 'u-1', ownerIdentityStatus: 'resolved' },
    }],
  });
  const identities = await upsertCustomerContactIdentities(store, {
    customerId: 'c-1', phone: '138 0013 8000', wechat: '', crypto,
  });
  assert.equal(identities.length, 1);
  assert.equal(
    identities[0].normalizedHash,
    createHmac('sha256', crypto.hmacKey).update('13800138000').digest('hex'),
  );
  assert.equal(identities[0].hashKeyVersion, 1);
  assert.equal(identities[0].canonicalCustomerId, 'c-1');
  assert.doesNotMatch(identities[0].encryptedNormalizedValue, /13800138000/);
  assert.equal(state.links.filter((link) => link.linkStatus === 'active').length, 1);

  await linkLeadAndCustomerIdentity(store, {
    leadId: 'lead-1', customerId: 'c-1', phone: '13800138000', wechat: '', crypto,
  });
  assert.equal(
    state.links.filter((link) => link.identityId === identities[0].id && link.linkStatus === 'active').length,
    2,
  );

  await assert.rejects(
    () => upsertCustomerContactIdentities(store, {
      customerId: 'c-2', phone: '13800138000', wechat: '', crypto,
    }),
    (error: unknown) => {
      assert.ok(error instanceof ContactIdentityConflictError);
      assert.equal(error.code, 'CONTACT_IDENTITY_CONFLICT');
      assert.deepEqual(error.safePayload, { message: '系统中已存在相同联系方式' });
      return true;
    },
  );

  await assert.rejects(
    () => upsertCustomerContactIdentities(store, {
      customerId: 'c-2', phone: '13800138000', wechat: '', crypto,
      conflictViewer: {
        canReadCustomerList: false,
        canReadCustomer: (customer) => customer.id === 'c-1',
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof ContactIdentityConflictError);
      assert.deepEqual(error.safePayload, { message: '系统中已存在相同联系方式' });
      return true;
    },
  );

  await assert.rejects(
    () => upsertCustomerContactIdentities(store, {
      customerId: 'c-2', phone: '13800138000', wechat: '', crypto,
      conflictViewer: {
        canReadCustomerList: true,
        canReadCustomer: (customer) => customer.id === 'c-1',
      },
    }),
    (error: unknown) => {
      const conflict = error as ContactIdentityConflictError;
      assert.deepEqual(conflict.safePayload, {
        message: '系统中已存在相同联系方式',
        customer: { id: 'c-1', name: '客户一', company: undefined, owner: undefined },
      });
      assert.equal(JSON.stringify(conflict.safePayload).includes('13800138000'), false);
      return true;
    },
  );
}

{
  const { store, state } = createStore({
    customers: [
      {
        id: 'aaos_customers:c-1', domain: 'aaos_customers', recordId: 'c-1',
        data: { id: 'c-1', name: '历史客户一', phone: '13800138000' },
      },
      {
        id: 'aaos_customers:c-2', domain: 'aaos_customers', recordId: 'c-2',
        data: { id: 'c-2', name: '历史客户二', phone: '+86 13800138000' },
      },
      {
        id: 'aaos_customers:c-3', domain: 'aaos_customers', recordId: 'c-3',
        data: { id: 'c-3', name: '正常客户', wechat: 'Unique_Wechat' },
      },
      {
        id: 'aaos_customers:c-4', domain: 'aaos_customers', recordId: 'c-4',
        data: { id: 'c-4', name: '无效号码', phone: '1234' },
      },
    ],
    leads: [{ id: 'lead-3', data: { id: 'lead-3', wechat: 'unique_wechat', customerId: 'c-3' } }],
  });

  const dryRun = await backfillContactIdentities(store, { apply: false, crypto });
  assert.deepEqual(dryRun, {
    canonicalCustomers: 1,
    conflicts: 1,
    invalidValues: 1,
    duplicateGroups: 1,
    legacyContactLockKeysCleared: 0,
  });
  assert.equal(state.identities.length, 0);

  const applied = await backfillContactIdentities(store, { apply: true, crypto });
  assert.deepEqual(applied, dryRun);
  const conflict = state.identities.find((identity) => identity.status === 'conflict');
  assert.ok(conflict);
  assert.equal(conflict.canonicalCustomerId, null);
  assert.equal(state.links.filter((link) => link.identityId === conflict.id && link.linkStatus === 'active').length, 2);
  assert.equal(state.groups.length, 1);
  assert.deepEqual(state.groups[0].customerIds, ['c-1', 'c-2']);
  assert.equal(
    state.groups[0].groupKey,
    createHash('sha256').update(JSON.stringify({
      rule: 'contact_identity:phone',
      customerIds: ['c-1', 'c-2'],
    })).digest('hex'),
    '联系方式回填必须复用 Task 5 的候选组规范哈希',
  );

  const counts = { identities: state.identities.length, links: state.links.length, groups: state.groups.length };
  assert.deepEqual(await backfillContactIdentities(store, { apply: true, crypto }), dryRun);
  assert.deepEqual(
    { identities: state.identities.length, links: state.links.length, groups: state.groups.length },
    counts,
    '回填重跑必须依赖唯一索引保持幂等',
  );

  const canonical = state.identities.find((identity) => identity.canonicalCustomerId === 'c-3');
  assert.ok(canonical);
  assert.equal(state.links.filter((link) => link.identityId === canonical.id && link.linkStatus === 'active').length, 2);
}

// RED: a controlled contact-backfill apply clears only the obsolete Task 5
// unversioned SHA-256 lock shape, including when every identity is already
// backfilled. New HMAC locks and unrelated AppStorage entries survive.
{
  const legacyKey = `aaos_contact_lock_${'a'.repeat(64)}`;
  const currentKey = `aaos_contact_lock_v1_phone_${'b'.repeat(64)}`;
  const uppercaseLookalikeKey = `aaos_contact_lock_${'A'.repeat(64)}`;
  const unrelatedKey = 'aaos_contact_lock_not-a-legacy-digest';
  const { store, state } = createStore({
    appStorage: [
      { key: legacyKey, value: { kind: 'obsolete' } },
      { key: currentKey, value: { kind: 'customer_contact_lock' } },
      { key: uppercaseLookalikeKey, value: { keep: true } },
      { key: unrelatedKey, value: { keep: true } },
    ],
  } as any);
  const preview = await backfillContactIdentities(store, { apply: false, crypto });
  assert.equal(preview.legacyContactLockKeysCleared, 0);
  assert.equal(state.appStorage.length, 4);
  const applied = await backfillContactIdentities(store, { apply: true, crypto });
  assert.equal(applied.legacyContactLockKeysCleared, 1);
  assert.deepEqual(
    state.appStorage.map((row) => row.key).sort(),
    [CONTACT_IDENTITY_MUTATION_GATE_KEY, currentKey, uppercaseLookalikeKey, unrelatedKey].sort(),
  );
}
