import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import {
  ContactIdentityConflictError,
  backfillContactIdentities,
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

function createStore(input: Partial<State> = {}) {
  const state: State = {
    identities: structuredClone(input.identities || []),
    links: structuredClone(input.links || []),
    groups: structuredClone(input.groups || []),
    customers: structuredClone(input.customers || []),
    leads: structuredClone(input.leads || []),
  };
  const store: any = {
    contactIdentity: {
      findUnique: async ({ where }: any) => state.identities.find((row) => matchesWhere(row, where)) || null,
      create: async ({ data }: any) => {
        if (state.identities.some((row) => row.type === data.type && row.normalizedHash === data.normalizedHash)) {
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
    $queryRaw: async () => [],
  };
  store.$transaction = async (operation: any) => operation(store);
  return { store, state };
}

assert.equal(normalizeContactIdentity('phone', ' +86 138 0013 8000 '), '13800138000');
assert.equal(normalizeContactIdentity('wechat', ' WeiXin_A '), 'weixin_a');

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
