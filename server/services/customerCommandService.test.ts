import assert from 'node:assert/strict';
import {
  createAuditedCustomerAtomicCommandService,
  createCustomerCommandService,
} from './customerCommandService';
import { createPrismaCustomerAuditAppender, hashCustomerAuditInput } from './customerAuditService';
import {
  CONTACT_IDENTITY_MUTATION_GATE_KEY,
  backfillContactIdentities,
  hashContactIdentity,
  normalizeContactIdentity,
} from './contactIdentityService';
import { DEFAULT_LEAD_FLOW_CONFIG, LIFECYCLE_STATUS_CODES, STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { Customer } from '../../src/types/customer';

const FIXED_NOW = new Date('2026-07-12T01:02:03.000Z');
const TEST_CONTACT_CRYPTO = {
  hmacKey: Buffer.alloc(32, 11),
  keyVersion: 1 as const,
  encryptionKey: Buffer.alloc(32, 12),
  encryptionKeyVersion: 1 as const,
};

const salesRole = {
  id: 'role-sales',
  name: '销售顾问',
  code: 'sales_consultant',
  description: null,
  departmentId: 'dept-sales',
  permissions: [
    { module: PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.CUSTOMER_SET_PROGRESS, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.CUSTOMER_SET_TAGS, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.CUSTOMER_EDIT_ATTRIBUTION, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.CUSTOMER_TRANSFER, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.LEADS_FOLLOW, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.LEADS_CONVERT, actions: ['read', 'write'] },
  ],
  dataScopes: { leads: 'self', customers: 'self' },
  memberCount: 2,
  isActive: true,
  createdAt: FIXED_NOW,
  updatedAt: FIXED_NOW,
};

const managerRole = {
  ...salesRole,
  id: 'role-manager',
  name: '销售经理',
  code: 'sales_manager',
  dataScopes: { leads: 'department', customers: 'department' },
};

const superRole = {
  ...salesRole,
  id: 'role-super',
  name: '超级管理员',
  code: 'super_admin',
  departmentId: 'dept-sales',
  permissions: [
    { module: '全部', actions: ['read', 'write', 'delete', 'admin'] },
    { module: PERMISSION_KEYS.CUSTOMER_DELETE, actions: ['read', 'delete'] },
  ],
  dataScopes: { leads: 'all', customers: 'all' },
};

const financeRole = {
  ...salesRole,
  id: 'role-finance',
  name: '财务专员',
  code: 'finance_specialist',
  permissions: [{ module: '财务中心', actions: ['read'] }],
  dataScopes: { leads: 'self', customers: 'all' },
};

const users = [
  {
    id: 'user-a',
    name: '销售甲',
    account: 'sales-a',
    email: '',
    phone: '',
    role: '销售顾问',
    avatar: null,
    departmentId: 'dept-sales',
    positionId: null,
    positionName: null,
    roleId: salesRole.id,
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
    lastLoginAt: null,
    isActive: true,
    employmentStatus: 'active',
    leftAt: null,
    leftBy: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  },
  {
    id: 'user-b',
    name: '销售乙',
    account: 'sales-b',
    email: '',
    phone: '',
    role: '销售顾问',
    avatar: null,
    departmentId: 'dept-sales',
    positionId: null,
    positionName: null,
    roleId: salesRole.id,
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
    lastLoginAt: null,
    isActive: true,
    employmentStatus: 'active',
    leftAt: null,
    leftBy: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  },
  {
    id: 'user-c',
    name: '外部销售',
    account: 'sales-c',
    email: '',
    phone: '',
    role: '销售顾问',
    avatar: null,
    departmentId: 'dept-other',
    positionId: null,
    positionName: null,
    roleId: salesRole.id,
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
    lastLoginAt: null,
    isActive: true,
    employmentStatus: 'active',
    leftAt: null,
    leftBy: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  },
  {
    id: 'user-finance',
    name: '财务甲',
    account: 'finance-a',
    email: '',
    phone: '',
    role: '财务专员',
    avatar: null,
    departmentId: 'dept-sales',
    positionId: null,
    positionName: null,
    roleId: financeRole.id,
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
    lastLoginAt: null,
    isActive: true,
    employmentStatus: 'active',
    leftAt: null,
    leftBy: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  },
  {
    id: 'user-super',
    name: '超级管理员',
    account: 'super-admin',
    email: 'super@example.com',
    phone: '',
    role: '超级管理员',
    avatar: null,
    departmentId: 'dept-sales',
    positionId: null,
    positionName: null,
    roleId: superRole.id,
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
    lastLoginAt: null,
    isActive: true,
    employmentStatus: 'active',
    leftAt: null,
    leftBy: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  },
];

const departments = [
  {
    id: 'dept-sales',
    name: '销售部',
    code: 'sales',
    description: null,
    parentId: null,
    managerId: 'user-manager',
    memberCount: 3,
    sortOrder: 1,
    isActive: true,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  },
  {
    id: 'dept-other',
    name: '其他部门',
    code: 'other',
    description: null,
    parentId: null,
    managerId: null,
    memberCount: 1,
    sortOrder: 2,
    isActive: true,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  },
];

const salesA = {
  id: 'user-a',
  name: '销售甲',
  account: 'sales-a',
  email: '',
  phone: '',
  role: '销售顾问' as const,
  roleId: salesRole.id,
  departmentId: 'dept-sales',
  permissions: salesRole.permissions,
  isActive: true,
};

const manager = {
  ...salesA,
  id: 'user-manager',
  name: '销售主管',
  account: 'manager',
  role: '销售经理' as const,
  roleId: managerRole.id,
};

const financeActor = {
  ...salesA,
  id: 'user-finance',
  name: '财务甲',
  account: 'finance-a',
  role: '财务专员' as const,
  roleId: financeRole.id,
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_ASSIGN, actions: ['read', 'write'] }],
};

const claimOnlySales = {
  ...salesA,
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM, actions: ['read', 'write'] }],
};

const customerEditor = {
  ...salesA,
  permissions: [
    { module: PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.CUSTOMER_SET_PROGRESS, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.CUSTOMER_SET_TAGS, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.CUSTOMER_EDIT_ATTRIBUTION, actions: ['read', 'write'] },
  ],
};

const leadEditor = {
  ...salesA,
  permissions: [{ module: PERMISSION_KEYS.LEADS_CREATE, actions: ['read', 'write'] }],
};

const leadFollower = {
  ...salesA,
  permissions: [{ module: PERMISSION_KEYS.LEADS_FOLLOW, actions: ['read', 'write'] }],
};

const leadAssigner = {
  ...manager,
  permissions: [{ module: PERMISSION_KEYS.LEADS_FLOW_CONFIG, actions: ['read', 'write'] }],
};

const leadCreatorAssigner = {
  ...manager,
  permissions: [
    { module: PERMISSION_KEYS.LEADS_CREATE, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.LEADS_FLOW_CONFIG, actions: ['read', 'write'] },
  ],
};

const superAdmin = {
  ...salesA,
  id: 'user-super',
  name: '超级管理员',
  account: 'super-admin',
  role: '超级管理员' as const,
  roleId: superRole.id,
  permissions: superRole.permissions,
};

type BusinessRow = {
  id: string;
  domain: string;
  recordId: string;
  data: any;
  [key: string]: any;
};

type LeadRow = {
  id: string;
  data: any;
  [key: string]: any;
};

type FakeState = {
  businessRecords: BusinessRow[];
  leads: LeadRow[];
  contactIdentities?: any[];
  contactIdentityLinks?: any[];
  customerTodos?: any[];
  customerAuditEvents?: any[];
  appStorage?: Array<{ key: string; value: any; createdAt?: Date; updatedAt?: Date }>;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function applyPatch(target: Record<string, any>, patch: Record<string, any>): void {
  Object.entries(patch).forEach(([key, value]) => {
    target[key] = value;
  });
}

function queryText(query: any): string {
  return Array.isArray(query?.strings) ? query.strings.join('?') : String(query || '');
}

function createFakePrisma(
  initial: FakeState,
  options: {
    failLeadUpdate?: boolean;
    failCustomerCreate?: boolean;
    failCustomerCompareAndSave?: boolean;
    failCustomerAuditCreate?: boolean;
    failTransactions?: number;
    extraUsers?: any[];
    roleRows?: any[];
    seedContactIdentities?: boolean;
    queryLog?: string[];
    onMutationGateLocked?: () => void | Promise<void>;
  } = {},
) {
  let state: FakeState = {
    ...clone(initial),
    customerTodos: clone(initial.customerTodos || []),
    customerAuditEvents: clone(initial.customerAuditEvents || []),
    appStorage: clone(initial.appStorage || []),
    contactIdentities: clone(initial.contactIdentities || []),
    contactIdentityLinks: clone(initial.contactIdentityLinks || []),
  };
  for (const row of (options.seedContactIdentities === false
    ? []
    : state.businessRecords.filter((item) => item.domain === STORAGE_KEYS.CUSTOMERS))) {
    const value = row.data as Customer;
    if (value.deletedAt) continue;
    for (const type of ['phone', 'wechat'] as const) {
      const normalized = normalizeContactIdentity(type, String(value[type] || ''));
      if (!normalized) continue;
      const normalizedHash = hashContactIdentity(normalized, TEST_CONTACT_CRYPTO.hmacKey);
      let identity = state.contactIdentities!.find((candidate) => (
        candidate.type === type && candidate.normalizedHash === normalizedHash
      ));
      if (!identity) {
        identity = {
          id: `seed-${type}-${normalizedHash.slice(0, 20)}`,
          type,
          normalizedHash,
          hashKeyVersion: 1,
          status: 'active',
          encryptedNormalizedValue: 'ci:v1:test',
          canonicalCustomerId: value.id,
          conflictReason: null,
        };
        state.contactIdentities!.push(identity);
      } else if (identity.canonicalCustomerId !== value.id) {
        identity.status = 'conflict';
        identity.canonicalCustomerId = null;
        identity.conflictReason = 'multiple_active_customers';
      }
      if (!state.contactIdentityLinks!.some((link) => (
        link.identityId === identity.id && link.entityType === 'customer' && link.entityId === value.id
      ))) {
        state.contactIdentityLinks!.push({
          id: `seed-link-${identity.id}-${value.id}`,
          identityId: identity.id,
          entityType: 'customer',
          entityId: value.id,
          linkStatus: 'active',
          source: 'test_backfill',
          endedAt: null,
        });
      }
    }
  }
  let transactionCalls = 0;
  let linkedLeadLockQueries = 0;
  let contactLockQueries = 0;
  let contactLockUpserts = 0;
  let customerLockQueries = 0;
  let businessRecordUpdateCalls = 0;
  let businessRecordCompareAndSaveCalls = 0;
  let remainingTransactionFailures = options.failTransactions || 0;
  const contactLockTails = new Map<string, Promise<void>>();

  const acquireContactLock = async (key: string) => {
    const previous = contactLockTails.get(key) || Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const tail = previous.then(() => current);
    contactLockTails.set(key, tail);
    await previous;
    return () => {
      releaseCurrent();
      if (contactLockTails.get(key) === tail) contactLockTails.delete(key);
    };
  };

  const makeClient = (working: FakeState, lockContact: (key: string) => Promise<void>) => {
    const directoryUsers = () => [...users, ...(options.extraUsers || []), {
      ...users[0],
      id: manager.id,
      name: manager.name,
      account: manager.account,
      role: manager.role,
      roleId: manager.roleId,
    }];
    return {
    user: {
      findMany: async () => clone(directoryUsers()),
      findUnique: async ({ where }: any) => {
        const user = directoryUsers().find((candidate) => candidate.id === where.id);
        return user ? clone(user) : null;
      },
    },
    role: { findMany: async () => clone(options.roleRows || [salesRole, managerRole, financeRole, superRole]) },
    department: { findMany: async () => clone(departments) },
    appStorage: {
      findUnique: async ({ where }: any) => {
        const row = (working.appStorage || []).find((item) => item.key === where.key);
        return row ? clone(row) : null;
      },
      upsert: async ({ where, update, create }: any) => {
        options.queryLog?.push(`app_storage_upsert:${where.key}`);
        if (String(where.key).startsWith('aaos_contact_lock_')) contactLockUpserts += 1;
        await lockContact(where.key);
        if (where.key === CONTACT_IDENTITY_MUTATION_GATE_KEY) await options.onMutationGateLocked?.();
        const rows = working.appStorage || (working.appStorage = []);
        const row = rows.find((item) => item.key === where.key);
        if (row) {
          applyPatch(row, clone(update || {}));
          return clone(row);
        }
        rows.push(clone(create));
        return clone(create);
      },
    },
    businessRecord: {
      findMany: async (args: any = {}) => {
        const rows = args.where?.domain
          ? working.businessRecords.filter((item) => item.domain === args.where.domain)
          : working.businessRecords;
        return clone(rows);
      },
      findUnique: async ({ where }: any) => {
        const key = where.domain_recordId;
        const row = working.businessRecords.find((item) => (
          item.domain === key.domain && item.recordId === key.recordId
        ));
        return row ? clone(row) : null;
      },
      update: async ({ where, data }: any) => {
        businessRecordUpdateCalls += 1;
        const row = working.businessRecords.find((item) => item.id === where.id);
        if (!row) throw new Error('business record missing');
        applyPatch(row, clone(data));
        return clone(row);
      },
      updateMany: async ({ where, data }: any) => {
        businessRecordCompareAndSaveCalls += 1;
        if (options.failCustomerCompareAndSave) return { count: 0 };
        const row = working.businessRecords.find((item) => (
          item.id === where.id
          && item.domain === where.domain
          && item.recordId === where.recordId
          && new Date(item.updatedAt).getTime() === new Date(where.updatedAt).getTime()
        ));
        if (!row) return { count: 0 };
        applyPatch(row, clone(data));
        row.updatedAt = new Date(new Date(where.updatedAt).getTime() + 1);
        return { count: 1 };
      },
      create: async ({ data }: any) => {
        if (options.failCustomerCreate) throw new Error('customer create failed');
        if (working.businessRecords.some((item) => item.domain === data.domain && item.recordId === data.recordId)) {
          throw new Error('duplicate business record');
        }
        working.businessRecords.push({ ...clone(data), updatedAt: new Date(data.updatedAt || data.eventAt || FIXED_NOW) });
        return clone(data);
      },
    },
    leadRecord: {
      findMany: async () => clone(working.leads),
      findUnique: async ({ where }: any) => {
        const row = working.leads.find((item) => item.id === where.id);
        return row ? clone(row) : null;
      },
      create: async ({ data }: any) => {
        if (working.leads.some((lead) => lead.id === data.id)) throw new Error('duplicate lead');
        working.leads.push(clone(data));
        return clone(data);
      },
      update: async ({ where, data }: any) => {
        if (options.failLeadUpdate) throw new Error('lead update failed');
        const row = working.leads.find((item) => item.id === where.id);
        if (!row) throw new Error('lead missing');
        applyPatch(row, clone(data));
        return clone(row);
      },
    },
    customerTodo: {
      findMany: async () => clone(working.customerTodos || []),
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of working.customerTodos || []) {
          if (row.customerId === where.customerId && (!where.status || row.status === where.status)) {
            applyPatch(row, clone(data));
            count += 1;
          }
        }
        return { count };
      },
    },
    customerAuditEvent: {
      create: async ({ data }: any) => {
        if (options.failCustomerAuditCreate) throw new Error('audit write failed');
        const events = working.customerAuditEvents || (working.customerAuditEvents = []);
        const event = {
          ...clone(data),
          eventSequence: BigInt(events.length + 1),
          createdAt: new Date(FIXED_NOW),
        };
        events.push(event);
        return clone(event);
      },
    },
    contactIdentity: {
      findUnique: async ({ where }: any) => {
        const compound = where.type_normalizedHash;
        const row = (working.contactIdentities || []).find((item) => (
          item.type === compound.type && item.normalizedHash === compound.normalizedHash
        ));
        return row ? clone(row) : null;
      },
      create: async ({ data }: any) => {
        const rows = working.contactIdentities || (working.contactIdentities = []);
        if (rows.some((item) => (
          item.id === data.id || (item.type === data.type && item.normalizedHash === data.normalizedHash)
        ))) {
          throw Object.assign(new Error('duplicate contact identity'), { code: 'P2002' });
        }
        const row = { ...clone(data), createdAt: new Date(FIXED_NOW), updatedAt: new Date(FIXED_NOW) };
        rows.push(row);
        return clone(row);
      },
      update: async ({ where, data }: any) => {
        const row = (working.contactIdentities || []).find((item) => item.id === where.id);
        if (!row) throw new Error('contact identity missing');
        applyPatch(row, clone(data));
        return clone(row);
      },
    },
    contactIdentityLink: {
      findMany: async ({ where }: any = {}) => clone((working.contactIdentityLinks || []).filter((row) => (
        Object.entries(where || {}).every(([key, value]) => row[key] === value)
      ))),
      upsert: async ({ where, update, create }: any) => {
        const key = where.identityId_entityType_entityId;
        const rows = working.contactIdentityLinks || (working.contactIdentityLinks = []);
        const row = rows.find((item) => item.identityId === key.identityId
          && item.entityType === key.entityType && item.entityId === key.entityId);
        if (row) {
          applyPatch(row, clone(update));
          return clone(row);
        }
        const created = { ...clone(create), createdAt: new Date(FIXED_NOW) };
        rows.push(created);
        return clone(created);
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of working.contactIdentityLinks || []) {
          if (!Object.entries(where || {}).every(([key, value]) => row[key] === value)) continue;
          applyPatch(row, clone(data));
          count += 1;
        }
        return { count };
      },
    },
    $queryRaw: async (query: any) => {
      const text = queryText(query);
      options.queryLog?.push(text);
      const values = query?.values || [];
      if (text.includes('FROM contact_identity_links')) {
        if (text.includes('WHERE identityId')) {
          const [identityId] = values;
          return clone((working.contactIdentityLinks || []).filter((row) => (
            row.identityId === identityId && row.entityType === 'customer' && row.linkStatus === 'active'
          )).map((row) => ({ entityId: row.entityId })));
        }
        const [entityType, entityId] = values;
        return clone((working.contactIdentityLinks || []).filter((row) => (
          row.entityType === entityType && row.entityId === entityId && row.linkStatus === 'active'
        )).map((row) => ({ identityId: row.identityId })));
      }
      if (text.includes('FROM contact_identities')) {
        const [type, normalizedHash] = values;
        return clone((working.contactIdentities || []).filter((row) => (
          row.type === type && row.normalizedHash === normalizedHash
        )));
      }
      if (text.includes('FROM business_records')) {
        if (text.includes('recordId =') && text.includes('FOR UPDATE')) customerLockQueries += 1;
        const [domain, recordId] = values;
        if (text.includes('customerId =') && domain === STORAGE_KEYS.ORDERS) {
          return clone(working.businessRecords.filter((row) => (
            row.domain === domain
            && (
              row.customerId === recordId
              || row.data?.customerId === recordId
              || row.data?.customerName === values[3]
              || row.data?.customerName === values[4]
            )
          )).slice(0, 1));
        }
        if (text.includes('ORDER BY recordId') && text.includes('FOR UPDATE')) {
          const [legacyDomain, normalized] = values;
          if (!text.includes('AND (')) {
            return clone(working.businessRecords.filter((row) => row.domain === legacyDomain));
          }
          const type = text.includes("'$.wechat'") ? 'wechat' : 'phone';
          return clone(working.businessRecords.filter((row) => (
            row.domain === legacyDomain
            && !row.data?.deletedAt
            && normalizeContactIdentity(type, String(row.data?.[type] || '')) === normalized
          )));
        }
        if (text.includes("'$.phone'") || text.includes("'$.wechat'")) {
          const hasExcludedRecord = text.includes('recordId <>');
          const excludedRecordId = hasExcludedRecord ? recordId : undefined;
          const contacts = values.slice(hasExcludedRecord ? 2 : 1).map((value: unknown) => cleanTestText(value));
          return clone(working.businessRecords.filter((row) => (
            row.domain === domain
            && row.recordId !== excludedRecordId
            && (
              contacts.includes(cleanTestText(row.data?.phone))
              || contacts.includes(cleanTestText(row.data?.wechat))
            )
          )));
        }
        return clone(working.businessRecords.filter((row) => row.domain === domain && row.recordId === recordId));
      }
      if (text.includes('FROM lead_records')) {
        if (text.includes('id <>')) {
          const [excludedLeadId, ...contacts] = values;
          const normalizedContacts = contacts.map((value: unknown) => cleanTestText(value));
          return clone(working.leads.filter((row) => (
            row.id !== excludedLeadId
            && (
              normalizedContacts.includes(cleanTestText(row.phone || row.data?.phone))
              || normalizedContacts.includes(cleanTestText(row.data?.wechat))
            )
          )).slice(0, 1));
        }
        if (!text.includes('WHERE id =')) {
          if (text.includes('FOR UPDATE') && text.includes('SELECT id, data')) linkedLeadLockQueries += 1;
          if (text.includes("JSON_EXTRACT(data, '$.customerId')")) {
            const customerIds = new Set(values.map((value: unknown) => String(value)));
            return clone(working.leads.filter((row) => customerIds.has(String(row.data?.customerId || ''))));
          }
          return clone(working.leads);
        }
        const [leadId] = values;
        return clone(working.leads.filter((row) => row.id === leadId));
      }
      if (text.includes('FROM customer_todos')) {
        return clone(working.customerTodos || []);
      }
      if (text.includes('FROM users') || text.includes('FROM roles') || text.includes('FROM departments')) {
        return [];
      }
      if (text.includes('FROM app_storage')) {
        if (text.includes('FOR UPDATE')) contactLockQueries += 1;
        const row = (working.appStorage || []).find((item) => item.key === values[0]);
        return row ? [clone(row)] : [];
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
  };

  const prisma: any = {
    leadRecord: {
      findUnique: async ({ where }: any) => {
        const row = state.leads.find((item) => item.id === where.id);
        return row ? { data: clone(row.data) } : null;
      },
    },
    $transaction: async (callback: (tx: any) => Promise<unknown>) => {
      transactionCalls += 1;
      if (remainingTransactionFailures > 0) {
        remainingTransactionFailures -= 1;
        throw Object.assign(new Error('write conflict'), { code: 'P2034' });
      }
      const working = clone(state);
      const releaseContactLocks: Array<() => void> = [];
      const heldContactKeys = new Set<string>();
      try {
        const result = await callback(makeClient(working, async (key) => {
          if (heldContactKeys.has(key)) return;
          releaseContactLocks.push(await acquireContactLock(key));
          heldContactKeys.add(key);
          const latest = clone(state);
          working.businessRecords = latest.businessRecords;
          working.leads = latest.leads;
          working.customerTodos = latest.customerTodos || [];
          working.appStorage = latest.appStorage || [];
          working.contactIdentities = latest.contactIdentities || [];
          working.contactIdentityLinks = latest.contactIdentityLinks || [];
        }));
        state = working;
        return result;
      } finally {
        releaseContactLocks.reverse().forEach((release) => release());
      }
    },
  };

  return {
    prisma,
    getState: () => clone(state),
    get transactionCalls() { return transactionCalls; },
    get linkedLeadLockQueries() { return linkedLeadLockQueries; },
    get contactLockQueries() { return contactLockQueries; },
    get contactLockUpserts() { return contactLockUpserts; },
    get customerLockQueries() { return customerLockQueries; },
    get businessRecordUpdateCalls() { return businessRecordUpdateCalls; },
    get businessRecordCompareAndSaveCalls() { return businessRecordCompareAndSaveCalls; },
  };
}

function cleanTestText(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function customer(
  id: string,
  owner = salesA.name,
  lifecycleStatusCode: 'pending_followup' | 'following' | 'ordered' | 'refunded' | 'public_pool' = LIFECYCLE_STATUS_CODES.FOLLOWING,
): Customer {
  const ownerId = owner === salesA.name
    ? salesA.id
    : owner === '销售乙'
      ? 'user-b'
      : owner === '外部销售'
        ? 'user-c'
        : undefined;
  const isPublicPool = owner === '公海' || lifecycleStatusCode === LIFECYCLE_STATUS_CODES.PUBLIC_POOL;
  return {
    id,
    name: `客户-${id}`,
    company: `公司-${id}`,
    phone: '13800000000',
    owner,
    ownerId: isPublicPool ? undefined : ownerId,
    ownerIdentityStatus: isPublicPool ? 'public_pool' : ownerId ? 'resolved' : 'unresolved',
    customerLevel: 'L1',
    lifecycleStatusCode,
    lifecycleStatusUpdatedAt: '2026-07-01T00:00:00.000Z',
    totalSpent: 0,
    orderCount: 0,
    growthPath: [],
    growthRecords: [],
    activityRecords: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
}

function businessCustomer(value: ReturnType<typeof customer>): BusinessRow {
  return {
    id: `${STORAGE_KEYS.CUSTOMERS}:${value.id}`,
    domain: STORAGE_KEYS.CUSTOMERS,
    recordId: value.id,
    title: value.name,
    status: value.lifecycleStatusCode,
    owner: value.owner,
    customerId: value.id,
    data: clone(value),
    updatedAt: new Date(value.updatedAt),
  };
}

const tagGroups = [
  { id: 'group-both', name: '通用', color: '#1677ff', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 0, createdAt: FIXED_NOW, updatedAt: FIXED_NOW },
  { id: 'group-lead', name: '线索专用', color: '#1677ff', selectionMode: 'multiple', scope: 'lead', isActive: true, sortOrder: 1, createdAt: FIXED_NOW, updatedAt: FIXED_NOW },
  { id: 'group-customer', name: '客户专用', color: '#1677ff', selectionMode: 'multiple', scope: 'customer', isActive: true, sortOrder: 2, createdAt: FIXED_NOW, updatedAt: FIXED_NOW },
  { id: 'group-single', name: '单选组', color: '#1677ff', selectionMode: 'single', scope: 'lead', isActive: true, sortOrder: 3, createdAt: FIXED_NOW, updatedAt: FIXED_NOW },
] as const;
const tagDefinitions = [
  { id: 'shared', groupId: 'group-both', name: '高意向', color: '#1677ff', isActive: true, sortOrder: 0, createdAt: FIXED_NOW, updatedAt: FIXED_NOW },
  { id: 'lead-only', groupId: 'group-lead', name: '线索专用', color: '#1677ff', isActive: true, sortOrder: 0, createdAt: FIXED_NOW, updatedAt: FIXED_NOW },
  { id: 'customer-only', groupId: 'group-customer', name: '客户专用', color: '#1677ff', isActive: true, sortOrder: 0, createdAt: FIXED_NOW, updatedAt: FIXED_NOW },
  { id: 'single-a', groupId: 'group-single', name: '单选甲', color: '#1677ff', isActive: true, sortOrder: 0, createdAt: FIXED_NOW, updatedAt: FIXED_NOW },
  { id: 'single-b', groupId: 'group-single', name: '单选乙', color: '#1677ff', isActive: true, sortOrder: 1, createdAt: FIXED_NOW, updatedAt: FIXED_NOW },
  { id: 'inactive-shared', groupId: 'group-both', name: '已停用通用', color: '#94a3b8', isActive: false, sortOrder: 2, createdAt: FIXED_NOW, updatedAt: FIXED_NOW },
] as const;

function tagCatalogRows(): BusinessRow[] {
  return [
    ...tagGroups.map((value) => ({ id: `${STORAGE_KEYS.TAG_GROUPS}:${value.id}`, domain: STORAGE_KEYS.TAG_GROUPS, recordId: value.id, data: clone(value) })),
    ...tagDefinitions.map((value) => ({ id: `${STORAGE_KEYS.TAGS}:${value.id}`, domain: STORAGE_KEYS.TAGS, recordId: value.id, data: clone(value) })),
  ];
}

function lead(id: string, owner = salesA.name, customerId?: string): LeadRow {
  const data = {
    id,
    customerId,
    name: `线索-${id}`,
    company: `公司-${id}`,
    phone: '13800000000',
    source: '转介绍',
    status: '新线索',
    lifecycleStatusCode: LIFECYCLE_STATUS_CODES.FOLLOWING,
    lifecycleStatus: '跟进中',
    lifecycleStatusUpdatedAt: '2026-07-01T00:00:00.000Z',
    inputBy: salesA.name,
    assignedTo: owner,
    owner,
    sourceType: '公司资源',
    followUpRecords: [],
    changeHistory: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
  return {
    id,
    name: data.name,
    company: data.company,
    phone: data.phone,
    source: data.source,
    status: data.status,
    lifecycleStatusCode: data.lifecycleStatusCode,
    owner,
    assignedTo: owner,
    inputBy: salesA.name,
    data,
  };
}

function pendingLead(id: string, owner = salesA.name, customerId?: string): LeadRow {
  const row = lead(id, owner, customerId);
  row.lifecycleStatusCode = LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP;
  row.data.lifecycleStatusCode = LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP;
  row.data.lifecycleStatus = '待跟进';
  return row;
}

const serviceOptions = {
  now: () => new Date(FIXED_NOW),
  createId: (() => {
    let index = 0;
    return () => `generated-${++index}`;
  })(),
  contactIdentityCrypto: TEST_CONTACT_CRYPTO,
};

// RED: single-customer transfer must lock the employee/role/department
// directory before deriving the transaction-local customer data scope.
{
  const queryLog: string[] = [];
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(customer('cust-transfer-directory-lock'))],
    leads: [],
  }, { queryLog });
  const result = await createAuditedCustomerAtomicCommandService(fake.prisma, {
    ...serviceOptions,
    auditAppender: createPrismaCustomerAuditAppender(),
  }).execute({
    action: 'transfer', customerId: 'cust-transfer-directory-lock', targetOwnerId: 'user-finance', reason: '部门内转让',
  }, manager);

  assert.equal(result.code, 0, result.message);
  const userLock = queryLog.findIndex((query) => query.includes('FROM users') && query.includes('FOR UPDATE'));
  const roleLock = queryLog.findIndex((query) => query.includes('FROM roles') && query.includes('FOR UPDATE'));
  const departmentLock = queryLog.findIndex((query) => query.includes('FROM departments') && query.includes('FOR UPDATE'));
  const customerLock = queryLog.findIndex((query) => query.includes('FROM business_records') && query.includes('FOR UPDATE'));
  assert.ok(userLock >= 0 && roleLock > userLock && departmentLock > roleLock, '必须按用户、角色、部门的固定顺序锁定权限目录');
  assert.ok(customerLock > departmentLock, '客户锁定必须发生在范围目录复核之后');
}

// 更新只能原样保留该记录已有的停用标签；移除后不得重新添加。
{
  const value = customer('cust-inactive-tag-update');
  (value as any).manualTagIds = ['inactive-shared'];
  (value as any).tags = ['已停用通用'];
  const fake = createFakePrisma({ businessRecords: [businessCustomer(value), ...tagCatalogRows()], leads: [] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const retained = await service.updateCustomer(value.id, { name: '其他字段已修改', manualTagIds: ['inactive-shared'] }, customerEditor);
  assert.equal(retained.code, 0);
  assert.deepEqual(retained.data?.manualTagIds, ['inactive-shared']);
  assert.equal((await service.updateCustomer(value.id, { manualTagIds: [] }, customerEditor)).code, 0);
  assert.equal((await service.updateCustomer(value.id, { manualTagIds: ['inactive-shared'] }, customerEditor)).code, 400);

  const fresh = customer('cust-new-inactive-tag');
  const freshFake = createFakePrisma({ businessRecords: [businessCustomer(fresh), ...tagCatalogRows()], leads: [] });
  assert.equal((await createCustomerCommandService(freshFake.prisma, serviceOptions).updateCustomer(fresh.id, { manualTagIds: ['inactive-shared'] }, customerEditor)).code, 400);
}

// 线索更新必须忽略并清理历史标签字段。
{
  const source = pendingLead('lead-inactive-tag-update');
  source.data.manualTagIds = ['inactive-shared'];
  source.data.tags = ['已停用通用'];
  const fake = createFakePrisma({ businessRecords: tagCatalogRows(), leads: [source] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const retained = await service.updateLead(source.id, { company: '更新公司', manualTagIds: ['inactive-shared'] }, leadEditor);
  assert.equal(retained.code, 0);
  assert.equal(retained.data?.manualTagIds, undefined);
  assert.equal(retained.data?.tags, undefined);
  assert.equal((await service.updateLead(source.id, { manualTagIds: [] }, leadEditor)).code, 0);
  assert.equal((await service.updateLead(source.id, { manualTagIds: ['inactive-shared'] }, leadEditor)).code, 0);
}

// RED: 客户放公海必须在一个事务中同步客户与关联线索。
{
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(customer('cust-release'))],
    leads: [lead('lead-release', salesA.name, 'cust-release')],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.releaseToPublicPool('cust-release', '暂时无意向', salesA);

  assert.equal(result.code, 0, result.message);
  assert.equal(fake.transactionCalls, 1);
  const next = fake.getState();
  assert.equal(next.businessRecords[0].owner, '公海');
  assert.equal(next.businessRecords[0].status, LIFECYCLE_STATUS_CODES.PUBLIC_POOL);
  assert.equal(next.businessRecords[0].data.releaseReason, '暂时无意向');
  assert.equal(next.businessRecords[0].data.activityRecords.length, 1);
  assert.equal(next.leads[0].owner, '公海');
  assert.equal(next.leads[0].assignedTo, null);
  assert.equal(next.leads[0].data.lifecycleStatusCode, LIFECYCLE_STATUS_CODES.PUBLIC_POOL);
  assert.equal(fake.linkedLeadLockQueries, 1, '关联线索必须先行锁定再更新整段 JSON');
}

// RED: 关联线索写入失败时，客户不得先行进入公海。
{
  const originalCustomer = businessCustomer(customer('cust-rollback'));
  const fake = createFakePrisma({
    businessRecords: [originalCustomer],
    leads: [lead('lead-rollback', salesA.name, 'cust-rollback')],
  }, { failLeadUpdate: true });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);

  await assert.rejects(
    () => service.releaseToPublicPool('cust-rollback', '回滚验证', salesA),
    /lead update failed/,
  );
  assert.deepEqual(fake.getState().businessRecords[0], originalCustomer);
}

// RED: 审计适配器必须使用同一 Prisma 事务；客户 JSON、待办、活动和审计要么一起提交，要么一起回滚。
{
  const initialCustomer = businessCustomer(customer('cust-audited-release'));
  const initialTodo = { id: 'todo-audited-release', customerId: 'cust-audited-release', status: 'PENDING' };
  const fake = createFakePrisma({
    businessRecords: [initialCustomer],
    leads: [],
    customerTodos: [initialTodo],
  });
  const service = createAuditedCustomerAtomicCommandService(fake.prisma, {
    ...serviceOptions,
    auditAppender: createPrismaCustomerAuditAppender(),
  });
  const result = await service.execute({
    action: 'release_to_pool', customerId: 'cust-audited-release', reason: '审计事务提交验证',
  }, salesA);

  assert.equal(result.code, 0, result.message);
  const committed = fake.getState();
  assert.equal(committed.businessRecords[0].data.owner, '公海');
  assert.equal(committed.businessRecords[0].data.activityRecords.length, 1);
  assert.equal(committed.customerTodos?.[0].status, 'CANCELED');
  assert.equal(committed.customerAuditEvents?.length, 1);
  assert.equal(committed.customerAuditEvents?.[0].customerId, 'cust-audited-release');
  assert.match(committed.customerAuditEvents?.[0].inputHash || '', /^[a-f0-9]{64}$/, 'single commands derive a correlation hash when callers do not supply one');

  const sameCommandFake = createFakePrisma({
    businessRecords: [businessCustomer(customer('cust-audited-release'))],
    leads: [],
    customerTodos: [initialTodo],
  });
  const sameCommandResult = await createAuditedCustomerAtomicCommandService(sameCommandFake.prisma, {
    ...serviceOptions,
    auditAppender: createPrismaCustomerAuditAppender(),
  }).execute({
    action: 'release_to_pool', customerId: 'cust-audited-release', reason: '审计事务提交验证',
  }, salesA, { inputHash: 'raw-contact:13800138000' } as any);
  assert.equal(sameCommandResult.code, 0, sameCommandResult.message);
  assert.equal(
    sameCommandFake.getState().customerAuditEvents?.[0].inputHash,
    committed.customerAuditEvents?.[0].inputHash,
    'caller-provided inputHash is ignored; the canonical command hash stays stable',
  );
  assert.notEqual(
    committed.customerAuditEvents?.[0].inputHash,
    'raw-contact:13800138000',
    'raw caller input must never be persisted as audit inputHash',
  );

  const blankReasonFake = createFakePrisma({
    businessRecords: [businessCustomer(customer('cust-audited-no-reason'))],
    leads: [],
  });
  const blankReasonResult = await createAuditedCustomerAtomicCommandService(blankReasonFake.prisma, {
    ...serviceOptions,
    auditAppender: createPrismaCustomerAuditAppender(),
  }).execute({
    action: 'release_to_pool', customerId: 'cust-audited-no-reason', reason: '   ',
  }, salesA);
  assert.equal(blankReasonResult.code, 400, 'atomic routes must reject a missing user-supplied reason');
  assert.equal(blankReasonFake.getState().customerAuditEvents?.length, 0);
  assert.equal(blankReasonFake.getState().businessRecords[0].data.owner, salesA.name);

  const missingDeleteResult = await createAuditedCustomerAtomicCommandService(createFakePrisma({
    businessRecords: [], leads: [],
  }).prisma, {
    ...serviceOptions,
    auditAppender: createPrismaCustomerAuditAppender(),
  }).execute({
    action: 'soft_delete', customerId: 'cust-missing-delete', reason: '幂等删除', confirmed: true,
  }, superAdmin);
  assert.equal(missingDeleteResult.code, 404, 'the facade exposes a missing customer so the HTTP DELETE route can deliberately retain its legacy no-op contract');

  const rollbackCustomer = businessCustomer(customer('cust-audited-rollback'));
  const rollbackTodo = { id: 'todo-audited-rollback', customerId: 'cust-audited-rollback', status: 'PENDING' };
  const rollbackFake = createFakePrisma({
    businessRecords: [rollbackCustomer],
    leads: [],
    customerTodos: [rollbackTodo],
  }, { failCustomerAuditCreate: true });
  const rollbackService = createAuditedCustomerAtomicCommandService(rollbackFake.prisma, {
    ...serviceOptions,
    auditAppender: createPrismaCustomerAuditAppender(),
  });
  const rejected = await rollbackService.execute({
    action: 'release_to_pool', customerId: 'cust-audited-rollback', reason: '审计失败必须回滚',
  }, salesA);

  assert.notEqual(rejected.code, 0);
  assert.deepEqual(rollbackFake.getState().businessRecords[0], rollbackCustomer);
  assert.deepEqual(rollbackFake.getState().customerTodos, [rollbackTodo]);
  assert.deepEqual(rollbackFake.getState().customerAuditEvents, []);
}

// RED: the atomic DELETE facade must end active customer identity links in the
// same transaction and recompute the identity's reusable canonical state.
{
  const value = customer('cust-atomic-delete-contact');
  const fake = createFakePrisma({ businessRecords: [businessCustomer(value)], leads: [] });
  const result = await createAuditedCustomerAtomicCommandService(fake.prisma, {
    ...serviceOptions,
    auditAppender: createPrismaCustomerAuditAppender(),
  }).execute({
    action: 'soft_delete', customerId: value.id, reason: '原子删除身份收尾', confirmed: true,
  }, superAdmin);
  assert.equal(result.code, 0, result.message);
  const next = fake.getState();
  const identity = next.contactIdentities?.find((item) => item.canonicalCustomerId === null);
  assert.ok(identity);
  assert.equal(next.contactIdentityLinks?.some((link) => (
    link.entityId === value.id && link.linkStatus === 'active'
  )), false);
  assert.equal(next.contactIdentityLinks?.some((link) => (
    link.entityId === value.id && link.linkStatus === 'ended'
  )), true);
  assert.equal(identity.status, 'active');
}

// RED: 员工不能仅因自己是线索贡献人就释放他人的客户。
{
  const value = {
    ...customer('cust-not-owner', salesA.name === '销售甲' ? '销售乙' : '其他人'),
    leadContributorId: salesA.id,
    leadContributorName: salesA.name,
  };
  const fake = createFakePrisma({ businessRecords: [businessCustomer(value)], leads: [] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.releaseToPublicPool('cust-not-owner', '越权尝试', salesA);

  assert.equal(result.code, 403);
  assert.equal(fake.getState().businessRecords[0].owner, '销售乙');
}

// RED: owner 只存姓名时，同名源归属无法安全解析，必须拒绝写操作。
{
  const duplicateSalesA = {
    ...users.find((user) => user.id === salesA.id)!,
    id: 'user-a-duplicate',
    account: 'sales-a-duplicate',
    email: 'sales-a-duplicate@example.com',
  };
  const ambiguousCustomer = {
    ...customer('cust-ambiguous-source'),
    ownerId: undefined,
    ownerIdentityStatus: 'ambiguous' as const,
  };
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(ambiguousCustomer)],
    leads: [],
  }, { extraUsers: [duplicateSalesA] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.releaseToPublicPool('cust-ambiguous-source', '同名源归属', salesA);

  assert.equal(result.code, 403);
  assert.equal(fake.getState().businessRecords[0].owner, salesA.name);
}

// RED: 公海领取只能归属当前操作人，并同步关联线索。
{
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(customer('cust-claim', '公海', LIFECYCLE_STATUS_CODES.PUBLIC_POOL))],
    leads: [lead('lead-claim', '公海', 'cust-claim')],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.claimFromPublicPool('cust-claim', claimOnlySales);

  assert.equal(result.code, 0);
  assert.equal(result.data?.owner, salesA.name);
  assert.equal(result.data?.lifecycleStatusCode, LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP);
  const next = fake.getState();
  assert.equal(next.leads[0].owner, salesA.name);
  assert.equal(next.leads[0].assignedTo, salesA.name);
  assert.equal(next.leads[0].data.lifecycleStatusCode, LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP);
  assert.equal(next.customerAuditEvents?.[0]?.operation, 'claim_from_pool');

  const replay = await service.claimFromPublicPool('cust-claim', claimOnlySales);
  assert.equal(replay.code, 0);
  assert.equal(fake.getState().businessRecords[0].data.activityRecords.length, 1, '重试领取不得重复写入活动');
}

// 仅伪造展示姓名“公海”不得把普通客户变成可领取客户。
{
  const spoofed = customer('cust-owner-name-pool');
  spoofed.owner = '公海';
  spoofed.ownerId = 'user-b';
  const fake = createFakePrisma({ businessRecords: [businessCustomer(spoofed)], leads: [] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.claimFromPublicPool(spoofed.id, claimOnlySales);

  assert.equal(result.code, 409);
  assert.equal(fake.getState().businessRecords[0].data.ownerId, 'user-b');
  assert.equal(fake.getState().businessRecords[0].data.lifecycleStatusCode, LIFECYCLE_STATUS_CODES.FOLLOWING);
}

// RED: 即使自定义角色拥有客户分配权和 all 范围，非销售也不得领取公海。
{
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(customer('cust-finance-claim', '公海', LIFECYCLE_STATUS_CODES.PUBLIC_POOL))],
    leads: [],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.claimFromPublicPool('cust-finance-claim', financeActor);

  assert.equal(result.code, 403);
  assert.equal(fake.getState().businessRecords[0].owner, '公海');
}

// 部门管理者可以转让给客户数据范围内的在职员工，不依赖目标员工的线索接收资格。
{
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(customer('cust-assign'))],
    leads: [lead('lead-assign', salesA.name, 'cust-assign')],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);

  const denied = await service.assignOwner('cust-assign', 'user-c', '越部门分配', manager);
  assert.equal(denied.code, 403);
  assert.match(denied.message, /转让客户/);

  const nonLeadReceiver = await service.assignOwner('cust-assign', 'user-finance', '部门内转让', manager);
  assert.equal(nonLeadReceiver.code, 0, '客户转让只服从客户数据范围，不应复用线索接收资格');
  assert.equal(nonLeadReceiver.data?.ownerId, 'user-finance');

  const assigned = await service.assignOwner('cust-assign', 'user-b', '主管调整', manager);
  assert.equal(assigned.code, 0);
  assert.equal(assigned.data?.owner, '销售乙');
  const next = fake.getState();
  assert.equal(next.leads[0].owner, '销售乙');
  assert.equal(next.leads[0].assignedTo, '销售乙');
  assert.equal(next.businessRecords[0].data.activityRecords[0].title, '转让客户给 销售乙');
}

// Stable IDs allow selecting the intended employee even when names are duplicated.
{
  const duplicateSalesB = {
    ...users.find((user) => user.id === 'user-b')!,
    id: 'user-b-duplicate',
    account: 'sales-b-duplicate',
    email: 'sales-b-duplicate@example.com',
  };
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(customer('cust-duplicate-owner'))],
    leads: [],
  }, { extraUsers: [duplicateSalesB] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.assignOwner('cust-duplicate-owner', 'user-b', '同名分配', manager);

  assert.equal(result.code, 0);
  assert.equal(result.data?.ownerId, 'user-b');
  assert.equal(result.data?.owner, '销售乙');
}

// RED: 客户资料更新必须逐记录事务写入，由服务端生成操作人和历史，并同步关联线索。
{
  const value = customer('cust-update');
  (value as any).tags = ['历史标签'];
  (value as any).manualTagIds = ['legacy-id'];
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(value)],
    leads: [lead('lead-customer-update', salesA.name, value.id)],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.updateCustomer(value.id, {
    name: '更新后客户',
    phone: '13900000000',
    tags: ['伪造标签'],
  }, customerEditor);

  assert.equal(result.code, 0);
  assert.equal(result.data?.name, '更新后客户');
  assert.equal(result.data?.phone, '+8613800000000', '非超管只能保留原号码并做存储格式规范化');
  assert.equal(result.data?.activityRecords?.[0].operator, salesA.name);
  assert.deepEqual(result.data?.tags, ['历史标签'], '未显式提交 manualTagIds 时必须忽略调用方 tags 并保留历史快照');
  assert.deepEqual(result.data?.manualTagIds, ['legacy-id']);
  const next = fake.getState();
  assert.equal(next.leads[0].data.name, '更新后客户');
  assert.deepEqual(next.leads[0].data.tags, ['历史标签']);
  assert.equal(fake.businessRecordUpdateCalls, 0, '客户写入必须统一走 compare-and-save 边界');
  assert.equal(fake.businessRecordCompareAndSaveCalls, 1);
  assert.equal(next.customerAuditEvents?.[0]?.operation, 'update_profile');
  assert.match(next.customerAuditEvents?.[0]?.inputHash || '', /^[a-f0-9]{64}$/);
}

// A legacy profile write and its audit event share the same transaction. An
// audit failure must leave the BusinessRecord JSON untouched.
{
  const original = businessCustomer(customer('cust-update-audit-rollback'));
  const fake = createFakePrisma({ businessRecords: [original], leads: [] }, { failCustomerAuditCreate: true });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  await assert.rejects(
    () => service.updateCustomer('cust-update-audit-rollback', { name: '不得提交' }, customerEditor),
    /audit write failed/,
  );
  assert.deepEqual(fake.getState().businessRecords[0], original);
  assert.deepEqual(fake.getState().customerAuditEvents, []);
}

// RED: profile synchronization must use the locked LeadRecord id for link
// lifecycle work, even when a linked lead retains a stale JSON payload id.
{
  const value = customer('cust-profile-sync-real-lead-id');
  const oldPhone = '13800000081';
  const newPhone = '13900000081';
  value.phone = oldPhone;
  const linked = lead('lead-row-profile-sync-real-id', salesA.name, value.id);
  linked.phone = oldPhone;
  linked.data.phone = oldPhone;
  linked.data.id = 'stale-json-profile-sync-id';
  const oldHash = hashContactIdentity(normalizeContactIdentity('phone', oldPhone), TEST_CONTACT_CRYPTO.hmacKey);
  const oldIdentityId = `ci_phone_${oldHash.slice(0, 32)}`;
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(value)],
    leads: [linked],
    contactIdentities: [{
      id: oldIdentityId,
      type: 'phone',
      normalizedHash: oldHash,
      hashKeyVersion: 1,
      status: 'active',
      encryptedNormalizedValue: 'ci:v1:test',
      canonicalCustomerId: value.id,
      conflictReason: null,
    }],
    contactIdentityLinks: [
      {
        id: 'profile-sync-old-customer-link',
        identityId: oldIdentityId,
        entityType: 'customer',
        entityId: value.id,
        linkStatus: 'active',
        source: 'historical_backfill',
        endedAt: null,
      },
      {
        id: 'profile-sync-old-lead-link',
        identityId: oldIdentityId,
        entityType: 'lead',
        entityId: linked.id,
        linkStatus: 'active',
        source: 'historical_backfill',
        endedAt: null,
      },
    ],
  }, { seedContactIdentities: false });

  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .updateCustomer(value.id, { phone: newPhone }, superAdmin);

  assert.equal(result.code, 0);
  const next = fake.getState();
  const newHash = hashContactIdentity(normalizeContactIdentity('phone', newPhone), TEST_CONTACT_CRYPTO.hmacKey);
  assert.equal(next.contactIdentityLinks?.find((link) => link.id === 'profile-sync-old-lead-link')?.linkStatus, 'ended');
  assert.deepEqual(
    next.contactIdentityLinks?.filter((link) => link.entityType === 'lead' && link.linkStatus === 'active')
      .map((link) => ({
        entityId: link.entityId,
        normalizedHash: next.contactIdentities?.find((identity) => identity.id === link.identityId)?.normalizedHash,
      })),
    [{ entityId: linked.id, normalizedHash: newHash }],
  );
  assert.equal(next.contactIdentityLinks?.some((link) => (
    link.entityType === 'lead' && link.entityId === 'stale-json-profile-sync-id'
  )), false);
}

// RED: 贡献人可读不等于可写，未解析负责人也必须 fail closed。
{
  const contributed = {
    ...customer('cust-contributor-read-only', '销售乙'),
    leadContributorId: salesA.id,
    leadContributorName: salesA.name,
  };
  const unresolved = {
    ...customer('cust-unresolved-owner'),
    ownerId: undefined,
    ownerIdentityStatus: 'unresolved' as const,
  };
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(contributed), businessCustomer(unresolved)],
    leads: [],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  assert.equal((await service.updateCustomer(contributed.id, { name: '贡献人越权' }, customerEditor)).code, 403);
  assert.equal((await service.updateCustomer(unresolved.id, { name: '未解析越权' }, customerEditor)).code, 403);
  assert.equal(fake.businessRecordCompareAndSaveCalls, 0);
}

// RED: 混合字段缺任一叶子权限时，整请求必须在任何写入前拒绝。
{
  const value = customer('cust-mixed-field-denied');
  const profileOnlyRole = {
    ...salesRole,
    permissions: [{ module: PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, actions: ['read', 'write'] }],
  };
  const fake = createFakePrisma(
    { businessRecords: [businessCustomer(value), ...tagCatalogRows()], leads: [] },
    { roleRows: [profileOnlyRole, managerRole, financeRole, superRole] },
  );
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const denied = await service.updateCustomer(value.id, { name: '不应保存', manualTagIds: ['shared'] }, customerEditor);
  assert.equal(denied.code, 403);
  assert.equal(fake.businessRecordCompareAndSaveCalls, 0);
  assert.equal(fake.getState().businessRecords.find((row) => row.recordId === value.id)?.data.name, value.name);
}

// 标签校验只接受适用于客户的权威 ID；无权限请求必须在读取目录前返回 403。
{
  const value = customer('cust-update-tag-policy');
  const fake = createFakePrisma({ businessRecords: [businessCustomer(value), ...tagCatalogRows()], leads: [] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const wrongScope = await service.updateCustomer(value.id, { manualTagIds: ['lead-only'] }, customerEditor);
  assert.equal(wrongScope.code, 400);
  assert.deepEqual(fake.getState().businessRecords.find((row) => row.recordId === value.id)?.data.manualTagIds, undefined);
  const valid = await service.updateCustomer(value.id, { manualTagIds: ['shared'], tags: ['伪造名称'] }, customerEditor);
  assert.equal(valid.code, 0);
  assert.deepEqual(valid.data?.manualTagIds, ['shared']);
  assert.deepEqual(valid.data?.tags, ['高意向']);
  assert.equal(valid.data?.activityRecords?.[0]?.title, '更新了客户标签');
  assert.deepEqual(valid.data?.activityRecords?.[0]?.changes, [{
    field: 'manualTagIds', label: '客户标签', oldValue: null, newValue: '高意向',
  }]);

  const deniedFake = createFakePrisma(
    { businessRecords: [businessCustomer(value), ...tagCatalogRows()], leads: [] },
    {
      roleRows: [
        { ...salesRole, permissions: [] },
        managerRole,
        financeRole,
        superRole,
      ],
    },
  );
  const denied = await createCustomerCommandService(deniedFake.prisma, serviceOptions).updateCustomer(
    value.id,
    { manualTagIds: ['missing'], tags: ['目录探测'] },
    { ...customerEditor, permissions: [] },
  );
  assert.equal(denied.code, 403);
  assert.equal(deniedFake.transactionCalls, 0);
}

// 通用客户编辑不得绕过客户分配命令修改 owner。
{
  const value = customer('cust-update-owner');
  const fake = createFakePrisma({ businessRecords: [businessCustomer(value)], leads: [] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.updateCustomer(value.id, { owner: '销售乙' }, customerEditor);

  assert.equal(result.code, 0);
  assert.equal(result.data?.owner, salesA.name);
  assert.equal(fake.getState().businessRecords[0].owner, salesA.name);
}

// RED: 通用客户资料更新必须忽略所有归属别名和原始录入人字段。
{
  const value = { ...customer('cust-update-profile-only'), leadInputBy: '原录入人' };
  const fake = createFakePrisma({ businessRecords: [businessCustomer(value)], leads: [] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.updateCustomer(value.id, {
    name: '仅更新资料',
    owner: '',
    leadInputBy: '伪造录入人',
    assignedTo: '销售乙',
    ownerName: '销售乙',
  } as Partial<typeof value>, customerEditor);

  assert.equal(result.code, 0);
  assert.equal(result.data?.name, '仅更新资料');
  assert.equal(result.data?.owner, salesA.name);
  assert.equal(result.data?.leadInputBy, '原录入人');
}

// RED: 通用 PUT 只能走人工生命周期图，不能伪造成公海/成交/退款等系统终态。
{
  const value = customer('cust-update-lifecycle-policy');
  const fake = createFakePrisma({ businessRecords: [businessCustomer(value)], leads: [] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  for (const terminal of [
    LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
    LIFECYCLE_STATUS_CODES.ORDERED,
    LIFECYCLE_STATUS_CODES.REFUNDED,
    'deal_closed',
  ]) {
    const result = await service.updateCustomer(value.id, { lifecycleStatusCode: terminal } as any, customerEditor);
    assert.equal(result.code, 400, `通用更新不得直接写入系统终态 ${terminal}`);
    assert.equal(fake.getState().businessRecords[0].data.lifecycleStatusCode, LIFECYCLE_STATUS_CODES.FOLLOWING);
  }
  const blank = await service.updateCustomer(value.id, { lifecycleStatusCode: '   ' } as any, customerEditor);
  assert.equal(blank.code, 400, '通用更新不得把空进展默认为其他人工状态');
  assert.equal(fake.getState().businessRecords[0].data.lifecycleStatusCode, LIFECYCLE_STATUS_CODES.FOLLOWING);
  const manual = await service.updateCustomer(
    value.id,
    { lifecycleStatusCode: LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP },
    customerEditor,
  );
  assert.equal(manual.code, 0, '普通人工进展仍可经通用更新走配置的转换图');
  assert.equal(manual.data?.lifecycleStatusCode, LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP);
}

// 历史客户与早期状态配置可能只保留中文展示名。通用更新应在校验前
// 归一当前值和提交值，成功后持久化稳定生命周期码；系统终态仍不可手设。
{
  const value = customer('cust-update-legacy-lifecycle') as any;
  value.lifecycleStatusCode = '未转商机';
  const legacyNameOnlyLifecycleConfig = [
    { id: 'legacy-pending', name: '未转商机', color: '#999', isActive: true, sortOrder: 1, createdAt: '', updatedAt: '' },
    { id: 'legacy-following', name: '商机跟进中', color: '#369', isActive: true, sortOrder: 2, createdAt: '', updatedAt: '' },
  ];
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(value), ...tagCatalogRows()],
    leads: [],
    appStorage: [{ key: STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS, value: legacyNameOnlyLifecycleConfig }],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const updated = await service.updateCustomer(value.id, {
    lifecycleStatusCode: '商机跟进中',
  } as any, customerEditor);

  assert.equal(updated.code, 0);
  assert.equal(updated.data?.lifecycleStatusCode, LIFECYCLE_STATUS_CODES.FOLLOWING);
  assert.equal(fake.getState().businessRecords[0].data.lifecycleStatusCode, LIFECYCLE_STATUS_CODES.FOLLOWING);
  const systemStatus = await service.updateCustomer(value.id, {
    lifecycleStatusCode: '已流失',
  } as any, customerEditor);
  assert.equal(systemStatus.code, 400, '历史展示名也不得绕过系统终态限制');
  assert.equal(fake.getState().businessRecords[0].data.lifecycleStatusCode, LIFECYCLE_STATUS_CODES.FOLLOWING);
}

// RED: 客户更新仍要执行个人资源贡献人归因校验。
{
  const value = customer('cust-update-attribution');
  const fake = createFakePrisma({ businessRecords: [businessCustomer(value)], leads: [] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.updateCustomer(value.id, { sourceType: '个人资源' }, customerEditor);

  assert.equal(result.code, 400);
  assert.equal(fake.getState().businessRecords[0].data.sourceType, undefined);
}

// RED: 关联线索写入失败时，客户资料更新必须整笔回滚。
{
  const value = customer('cust-update-rollback');
  const original = businessCustomer(value);
  const fake = createFakePrisma({
    businessRecords: [original],
    leads: [lead('lead-update-rollback', salesA.name, value.id)],
  }, { failLeadUpdate: true });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);

  await assert.rejects(
    () => service.updateCustomer(value.id, { name: '不应保存' }, customerEditor),
    /lead update failed/,
  );
  assert.deepEqual(fake.getState().businessRecords[0], original);
}

// RED: 客户删除必须把稳定 customerId 关联的来源线索一起软删除，避免互锁。
{
  const value = customer('cust-delete');
  const deniedFake = createFakePrisma({ businessRecords: [businessCustomer(value)], leads: [] });
  const deniedService = createCustomerCommandService(deniedFake.prisma, serviceOptions);
  const denied = await deniedService.deleteCustomer(value.id, '普通员工删除', customerEditor);
  assert.equal(denied.code, 403);
  assert.equal(deniedFake.transactionCalls, 0);

  const normalizedHash = hashContactIdentity(
    normalizeContactIdentity('phone', value.phone),
    TEST_CONTACT_CRYPTO.hmacKey,
  );
  const identityId = `seed-phone-${normalizedHash.slice(0, 20)}`;
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(value)],
    leads: [lead('lead-customer-delete', salesA.name, value.id)],
    contactIdentityLinks: [{
      id: 'linked-lead-delete-contact',
      identityId,
      entityType: 'lead',
      entityId: 'lead-customer-delete',
      linkStatus: 'active',
      source: 'lead_conversion',
      endedAt: null,
    }],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.deleteCustomer(value.id, '重复客户', superAdmin);

  assert.equal(result.code, 0, result.message);
  const next = fake.getState();
  assert.equal(next.businessRecords[0].data.deletedBy, superAdmin.name);
  assert.equal(next.businessRecords[0].data.deleteReason, '重复客户');
  assert.equal(next.leads[0].data.deletedBy, superAdmin.name);
  assert.equal(next.leads[0].data.deleteReason, '重复客户');
  assert.ok(next.businessRecords[0].data.deletionCascadeId);
  assert.equal(next.leads[0].data.deletionCascadeId, next.businessRecords[0].data.deletionCascadeId);
  assert.deepEqual(next.businessRecords[0].data.cascadeDeletedLeadIds, ['lead-customer-delete']);
  assert.equal(next.contactIdentityLinks?.find((link) => link.id === 'linked-lead-delete-contact')?.linkStatus, 'ended');

  const rollbackCustomer = customer('cust-delete-linked-rollback');
  const rollbackLead = lead('lead-customer-delete-rollback', salesA.name, rollbackCustomer.id);
  const rollbackFake = createFakePrisma({
    businessRecords: [businessCustomer(rollbackCustomer)],
    leads: [rollbackLead],
  }, { failLeadUpdate: true });
  await assert.rejects(
    () => createCustomerCommandService(rollbackFake.prisma, serviceOptions)
      .deleteCustomer(rollbackCustomer.id, '级联失败必须回滚', superAdmin),
    /lead update failed/,
  );
  const rollbackNext = rollbackFake.getState();
  assert.equal(rollbackNext.businessRecords[0].data.deletedAt, undefined);
  assert.equal(rollbackNext.leads[0].data.deletedAt, undefined);

}

// RED: 仅手机号/微信相同但没有稳定 customerId 的线索，不得被删除操作猜测关联或级联删除。
{
  const value = customer('cust-delete-same-contact');
  const unlinked = lead('lead-same-contact', salesA.name);
  unlinked.phone = value.phone;
  unlinked.data.phone = value.phone;
  unlinked.wechat = value.wechat;
  unlinked.data.wechat = value.wechat;
  const fake = createFakePrisma({ businessRecords: [businessCustomer(value)], leads: [unlinked] });
  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .deleteCustomer(value.id, '可安全删除', superAdmin);

  assert.equal(result.code, 0);
  const next = fake.getState();
  assert.equal(next.businessRecords[0].data.deletedBy, superAdmin.name);
  assert.equal(next.leads[0].data.deletedAt, undefined);
  assert.equal(next.leads[0].data.deleteReason, undefined);
}

// RED: the legacy direct delete path shares the same identity-link cleanup;
// a soft-deleted customer cannot remain an active contact owner.
{
  const value = customer('cust-direct-delete-contact');
  const fake = createFakePrisma({ businessRecords: [businessCustomer(value)], leads: [] });
  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .deleteCustomer(value.id, '直接删除身份收尾', superAdmin);
  assert.equal(result.code, 0, result.message);
  const next = fake.getState();
  const identity = next.contactIdentities?.[0];
  assert.ok(identity);
  assert.equal(identity.canonicalCustomerId, null);
  assert.equal(identity.status, 'active');
  assert.equal(next.contactIdentityLinks?.some((link) => (
    link.entityId === value.id && link.linkStatus === 'active'
  )), false);
  assert.equal(next.contactIdentityLinks?.some((link) => (
    link.entityId === value.id && link.linkStatus === 'ended'
  )), true);
}

// RED: 只有名称的历史订单不能在同名客户之间被猜测为关联，删除只依据注册的稳定 ID。
{
  const target = { ...customer('cust-delete-name-only-target'), name: '同名客户', company: '同名公司' };
  const sibling = { ...customer('cust-delete-name-only-sibling'), name: '同名客户', company: '同名公司' };
  const fake = createFakePrisma({
    businessRecords: [
      businessCustomer(target),
      businessCustomer(sibling),
      {
        id: `${STORAGE_KEYS.ORDERS}:legacy-name-only`,
        domain: STORAGE_KEYS.ORDERS,
        recordId: 'legacy-name-only',
        customerId: null,
        data: { id: 'legacy-name-only', customerName: '同名客户', status: '已审核' },
      },
    ],
    leads: [],
  });
  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .deleteCustomer(target.id, '无稳定关联可安全删除', superAdmin);

  assert.equal(result.code, 0);
  assert.equal(fake.getState().businessRecords[0].data.deletedAt, FIXED_NOW.toISOString());
}

// RED: “全部”的 delete/admin 不得绕过 Task 2 客户删除 explicit-only 规则。
{
  const value = customer('cust-delete-global-only');
  const globalOnlySuperRole = {
    ...superRole,
    permissions: [{ module: '全部', actions: ['read', 'write', 'delete', 'admin'] }],
  };
  const fake = createFakePrisma(
    { businessRecords: [businessCustomer(value)], leads: [] },
    { roleRows: [salesRole, managerRole, financeRole, globalOnlySuperRole] },
  );
  const denied = await createCustomerCommandService(fake.prisma, serviceOptions)
    .deleteCustomer(value.id, '不应删除', superAdmin);
  assert.equal(denied.code, 403);
  assert.equal(fake.businessRecordCompareAndSaveCalls, 0);
}

// RED: 存在有效关联订单的客户不得删除。
{
  const value = customer('cust-delete-ordered');
  const fake = createFakePrisma({
    businessRecords: [
      businessCustomer(value),
      {
        id: `${STORAGE_KEYS.ORDERS}:order-1`,
        domain: STORAGE_KEYS.ORDERS,
        recordId: 'order-1',
        customerId: value.id,
        data: { id: 'order-1', customerId: value.id, status: '已审核' },
      },
    ],
    leads: [],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.deleteCustomer(value.id, '错误删除', superAdmin);

  assert.equal(result.code, 409);
  assert.equal(fake.getState().businessRecords[0].data.deletedAt, undefined);
}

// RED: 待跟进线索资料必须逐记录更新，由服务端生成修改历史。
{
  const source = pendingLead('lead-update-profile');
  source.data.tags = ['历史标签'];
  source.data.manualTagIds = ['legacy-id'];
  const fake = createFakePrisma({ businessRecords: [], leads: [source] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.updateLead(source.id, {
    name: '更新后线索',
    phone: '13900000000',
    tags: ['伪造标签'],
  }, leadEditor);

  assert.equal(result.code, 0);
  assert.equal(result.data?.name, '更新后线索');
  assert.equal(result.data?.phone, '+8613800000000', '非超管只保留原联系号码并做规范化');
  assert.equal(result.data?.changeHistory?.[0].operator, salesA.name);
  assert.match(result.data?.changeHistory?.[0].summary || '', /修改了/);
  assert.equal(result.data?.tags, undefined, '线索更新必须清理历史标签');
  assert.equal(result.data?.manualTagIds, undefined);
}

// The locked relational id, rather than a stale embedded JSON id, must also
// exclude the source lead from collision detection.
{
  const source = pendingLead('lead-stale-json-self-collision');
  source.data.id = 'stale-json-lead-id-for-collision';
  source.phone = '13800000076';
  source.data.phone = source.phone;
  const fake = createFakePrisma({ businessRecords: [], leads: [source] });
  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .updateLead(source.id, { company: '不应把自己判为冲突' }, superAdmin);

  assert.equal(result.code, 0);
  const next = fake.getState();
  assert.equal(next.leads[0]?.data.company, '不应把自己判为冲突');
  assert.equal(next.contactIdentityLinks?.some((link) => (
    link.entityType === 'lead' && link.entityId === source.id && link.linkStatus === 'active'
  )), true, 'a non-backfilled lead is linked using the authoritative record id');
}

// RED: 已被回填的独立线索修改联系方式时，旧 identity link 必须在同一
// 事务中结束，新联系方式必须建立 active link；该路径也必须先取得全局
// identity mutation gate，避免与 backfill 的 source/identity 锁交错。
{
  const source = pendingLead('lead-identity-contact-rollover');
  const lockedLeadId = source.id;
  const oldPhone = '13800000071';
  const newPhone = '13900000071';
  source.phone = oldPhone;
  source.data.phone = oldPhone;
  source.data.id = 'stale-json-lead-id';
  const oldHash = hashContactIdentity(normalizeContactIdentity('phone', oldPhone), TEST_CONTACT_CRYPTO.hmacKey);
  const oldIdentityId = `ci_phone_${oldHash.slice(0, 32)}`;
  const queryLog: string[] = [];
  const fake = createFakePrisma({
    businessRecords: [],
    leads: [source],
    contactIdentities: [{
      id: oldIdentityId,
      type: 'phone',
      normalizedHash: oldHash,
      hashKeyVersion: 1,
      status: 'active',
      encryptedNormalizedValue: 'ci:v1:test',
      canonicalCustomerId: null,
      conflictReason: null,
    }],
    contactIdentityLinks: [{
      id: 'lead-old-phone-link',
      identityId: oldIdentityId,
      entityType: 'lead',
      entityId: lockedLeadId,
      linkStatus: 'active',
      source: 'historical_backfill',
      endedAt: null,
    }],
  }, { queryLog });

  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .updateLead(lockedLeadId, { phone: newPhone }, superAdmin);

  assert.equal(result.code, 0);
  const next = fake.getState();
  const newHash = hashContactIdentity(normalizeContactIdentity('phone', newPhone), TEST_CONTACT_CRYPTO.hmacKey);
  const newIdentity = next.contactIdentities?.find((identity) => identity.type === 'phone' && identity.normalizedHash === newHash);
  assert.ok(newIdentity, 'current contact must have an identity');
  assert.equal(next.contactIdentityLinks?.find((link) => link.id === 'lead-old-phone-link')?.linkStatus, 'ended');
  assert.equal(next.contactIdentityLinks?.some((link) => (
    link.identityId === newIdentity.id
    && link.entityType === 'lead'
    && link.entityId === lockedLeadId
    && link.linkStatus === 'active'
  )), true);
  assert.equal(next.contactIdentities?.find((identity) => identity.id === oldIdentityId)?.canonicalCustomerId, null);
  assert.equal(newIdentity.canonicalCustomerId, null, 'standalone lead sync must not claim a customer canonical pointer');
  const gate = queryLog.indexOf(`app_storage_upsert:${CONTACT_IDENTITY_MUTATION_GATE_KEY}`);
  const leadLock = queryLog.findIndex((text) => text.includes('FROM lead_records') && text.includes('WHERE id =') && text.includes('FOR UPDATE'));
  assert.ok(gate >= 0 && leadLock > gate, 'lead update must take the mutation gate before locking the source lead');
}

// Clearing every contact on a standalone lead ends all of its active identity
// links without altering customer canonical state on the historical identities.
{
  const source = pendingLead('lead-identity-contact-clear');
  const phone = '13800000072';
  const wechat = 'lead_clear_old';
  source.phone = phone;
  source.data.phone = phone;
  source.wechat = wechat;
  source.data.wechat = wechat;
  const phoneHash = hashContactIdentity(normalizeContactIdentity('phone', phone), TEST_CONTACT_CRYPTO.hmacKey);
  const wechatHash = hashContactIdentity(normalizeContactIdentity('wechat', wechat), TEST_CONTACT_CRYPTO.hmacKey);
  const phoneIdentityId = `ci_phone_${phoneHash.slice(0, 32)}`;
  const wechatIdentityId = `ci_wechat_${wechatHash.slice(0, 32)}`;
  const fake = createFakePrisma({
    businessRecords: [],
    leads: [source],
    contactIdentities: [
      {
        id: phoneIdentityId,
        type: 'phone',
        normalizedHash: phoneHash,
        hashKeyVersion: 1,
        status: 'active',
        encryptedNormalizedValue: 'ci:v1:test',
        canonicalCustomerId: null,
        conflictReason: null,
      },
      {
        id: wechatIdentityId,
        type: 'wechat',
        normalizedHash: wechatHash,
        hashKeyVersion: 1,
        status: 'active',
        encryptedNormalizedValue: 'ci:v1:test',
        canonicalCustomerId: null,
        conflictReason: null,
      },
    ],
    contactIdentityLinks: [
      {
        id: 'lead-clear-phone-link',
        identityId: phoneIdentityId,
        entityType: 'lead',
        entityId: source.id,
        linkStatus: 'active',
        source: 'historical_backfill',
        endedAt: null,
      },
      {
        id: 'lead-clear-wechat-link',
        identityId: wechatIdentityId,
        entityType: 'lead',
        entityId: source.id,
        linkStatus: 'active',
        source: 'historical_backfill',
        endedAt: null,
      },
    ],
  });

  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .updateLead(source.id, { phone: '', wechat: '' }, superAdmin);

  assert.equal(result.code, 0);
  const next = fake.getState();
  assert.equal(next.contactIdentityLinks?.some((link) => (
    link.entityType === 'lead' && link.entityId === source.id && link.linkStatus === 'active'
  )), false);
  assert.equal(next.contactIdentityLinks?.filter((link) => (
    link.entityType === 'lead' && link.entityId === source.id && link.linkStatus === 'ended'
  )).length, 2);
  assert.equal(next.contactIdentities?.find((identity) => identity.id === phoneIdentityId)?.canonicalCustomerId, null);
  assert.equal(next.contactIdentities?.find((identity) => identity.id === wechatIdentityId)?.canonicalCustomerId, null);
}

// A lead update holding the mutation gate and a backfill apply started while
// that gate is held must serialize. Backfill therefore sees the committed new
// Lead source and cannot reactivate the obsolete old-contact link.
{
  const source = pendingLead('lead-identity-backfill-interleave');
  const oldPhone = '13800000073';
  const newPhone = '13900000073';
  source.phone = oldPhone;
  source.data.phone = oldPhone;
  const oldHash = hashContactIdentity(normalizeContactIdentity('phone', oldPhone), TEST_CONTACT_CRYPTO.hmacKey);
  const oldIdentityId = `ci_phone_${oldHash.slice(0, 32)}`;
  const queryLog: string[] = [];
  let markFirstGate!: () => void;
  let releaseFirstGate!: () => void;
  const firstGateLocked = new Promise<void>((resolve) => { markFirstGate = resolve; });
  const continueFirstTransaction = new Promise<void>((resolve) => { releaseFirstGate = resolve; });
  let mutationGateAcquisitions = 0;
  const fake = createFakePrisma({
    businessRecords: [],
    leads: [source],
    contactIdentities: [{
      id: oldIdentityId,
      type: 'phone',
      normalizedHash: oldHash,
      hashKeyVersion: 1,
      status: 'active',
      encryptedNormalizedValue: 'ci:v1:test',
      canonicalCustomerId: null,
      conflictReason: null,
    }],
    contactIdentityLinks: [{
      id: 'lead-interleave-old-link',
      identityId: oldIdentityId,
      entityType: 'lead',
      entityId: source.id,
      linkStatus: 'active',
      source: 'historical_backfill',
      endedAt: null,
    }],
  }, {
    queryLog,
    onMutationGateLocked: async () => {
      mutationGateAcquisitions += 1;
      if (mutationGateAcquisitions === 1) {
        markFirstGate();
        await continueFirstTransaction;
      }
    },
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const update = service.updateLead(source.id, { phone: newPhone }, superAdmin);
  await firstGateLocked;
  const backfill = backfillContactIdentities(fake.prisma, { apply: true, crypto: TEST_CONTACT_CRYPTO });
  releaseFirstGate();
  const [updated, summary] = await Promise.all([update, backfill]);

  assert.equal(updated.code, 0);
  assert.equal(summary.canonicalCustomers, 0);
  assert.equal(mutationGateAcquisitions, 2);
  const next = fake.getState();
  const newHash = hashContactIdentity(normalizeContactIdentity('phone', newPhone), TEST_CONTACT_CRYPTO.hmacKey);
  assert.equal(next.contactIdentityLinks?.find((link) => link.id === 'lead-interleave-old-link')?.linkStatus, 'ended');
  assert.deepEqual(
    next.contactIdentityLinks?.filter((link) => link.entityType === 'lead' && link.entityId === source.id && link.linkStatus === 'active')
      .map((link) => next.contactIdentities?.find((identity) => identity.id === link.identityId)?.normalizedHash),
    [newHash],
  );
  const gateIndexes = queryLog
    .map((entry, index) => entry === `app_storage_upsert:${CONTACT_IDENTITY_MUTATION_GATE_KEY}` ? index : -1)
    .filter((index) => index >= 0);
  const backfillLeadSourceLock = queryLog.findIndex((text) => (
    text.includes('FROM lead_records') && text.includes('ORDER BY id ASC') && text.includes('FOR UPDATE')
  ));
  assert.equal(gateIndexes.length, 2);
  assert.ok(backfillLeadSourceLock > gateIndexes[1], 'backfill source reads must wait until its mutation gate is held');
}

// Collision validation precedes standalone-link synchronization. A rejected
// contact edit must leave the historical active link intact whether the target
// contact belongs to an existing customer or another lead.
for (const targetType of ['customer', 'lead'] as const) {
  const source = pendingLead(`lead-identity-collision-${targetType}`);
  const oldPhone = targetType === 'customer' ? '13800000074' : '13800000075';
  const blockedPhone = targetType === 'customer' ? '13900000074' : '13900000075';
  source.phone = oldPhone;
  source.data.phone = oldPhone;
  const oldHash = hashContactIdentity(normalizeContactIdentity('phone', oldPhone), TEST_CONTACT_CRYPTO.hmacKey);
  const oldIdentityId = `ci_phone_${oldHash.slice(0, 32)}`;
  const blockingCustomer = customer(`cust-blocking-lead-contact-${targetType}`);
  blockingCustomer.phone = blockedPhone;
  const blockingLead = pendingLead(`lead-blocking-lead-contact-${targetType}`);
  blockingLead.phone = blockedPhone;
  blockingLead.data.phone = blockedPhone;
  const fake = createFakePrisma({
    businessRecords: targetType === 'customer' ? [businessCustomer(blockingCustomer)] : [],
    leads: targetType === 'lead' ? [source, blockingLead] : [source],
    contactIdentities: [{
      id: oldIdentityId,
      type: 'phone',
      normalizedHash: oldHash,
      hashKeyVersion: 1,
      status: 'active',
      encryptedNormalizedValue: 'ci:v1:test',
      canonicalCustomerId: null,
      conflictReason: null,
    }],
    contactIdentityLinks: [{
      id: `lead-collision-old-link-${targetType}`,
      identityId: oldIdentityId,
      entityType: 'lead',
      entityId: source.id,
      linkStatus: 'active',
      source: 'historical_backfill',
      endedAt: null,
    }],
  });

  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .updateLead(source.id, { phone: blockedPhone }, superAdmin);

  assert.equal(result.code, 409, `${targetType} collision must reject the edit`);
  const next = fake.getState();
  assert.deepEqual(
    next.contactIdentityLinks?.filter((link) => link.entityType === 'lead' && link.entityId === source.id),
    [{
      id: `lead-collision-old-link-${targetType}`,
      identityId: oldIdentityId,
      entityType: 'lead',
      entityId: source.id,
      linkStatus: 'active',
      source: 'historical_backfill',
      endedAt: null,
    }],
  );
  assert.equal(next.leads.find((lead) => lead.id === source.id)?.data.phone, oldPhone);
}

// 线索标签请求必须被忽略，且无权限时仍需在事务前拒绝。
{
  const source = pendingLead('lead-update-tag-policy');
  const fake = createFakePrisma({ businessRecords: tagCatalogRows(), leads: [source] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const conflict = await service.updateLead(source.id, { manualTagIds: ['single-a', 'single-b'] }, leadEditor);
  assert.equal(conflict.code, 0);
  assert.deepEqual(fake.getState().leads[0].data.manualTagIds, undefined);

  const deniedFake = createFakePrisma({ businessRecords: tagCatalogRows(), leads: [source] });
  const denied = await createCustomerCommandService(deniedFake.prisma, serviceOptions).updateLead(
    source.id,
    { manualTagIds: ['missing'], tags: ['目录探测'] },
    { ...leadEditor, permissions: [] },
  );
  assert.equal(denied.code, 403);
  assert.equal(deniedFake.transactionCalls, 0);
}

// RED: 通用线索资料更新不得修改录入人或任何分配字段。
{
  const source = pendingLead('lead-update-profile-only');
  const fake = createFakePrisma({ businessRecords: [], leads: [source] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.updateLead(source.id, {
    name: '仅更新线索资料',
    inputBy: '伪造录入人',
    owner: '销售乙',
    assignedTo: '销售乙',
    assignedAt: '2099-01-01T00:00:00.000Z',
  }, leadEditor);

  assert.equal(result.code, 0);
  assert.equal(result.data?.name, '仅更新线索资料');
  assert.equal(result.data?.inputBy, salesA.name);
  assert.equal(result.data?.owner, salesA.name);
  assert.equal(result.data?.assignedTo, salesA.name);
}

// RED: 新建线索必须由服务端生成 ID/录入人，查重并逐记录写入。
{
  const fake = createFakePrisma({
    businessRecords: tagCatalogRows(),
    leads: [],
    appStorage: [{
      key: STORAGE_KEYS.LEAD_FLOW_CONFIG,
      value: { ...DEFAULT_LEAD_FLOW_CONFIG, autoAssignEnabled: false },
    }],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.createLead({
    name: '新线索',
    company: '新公司',
    phone: '13900000009',
    source: '官网',
    status: '新线索',
    owner: '待分配',
    inputBy: '伪造录入人',
    sourceType: '公司资源',
  }, leadEditor);

  assert.equal(result.code, 0);
  assert.match(result.data?.id || '', /^lead-/);
  assert.equal(result.data?.inputBy, salesA.name);
  assert.equal(result.data?.owner, '待分配');
  assert.equal(fake.getState().leads.length, 1);
}

// RED: 服务端新建线索必须保留轮询分配、规则游标和入库记录语义。
{
  const fake = createFakePrisma({
    businessRecords: [],
    leads: [],
    appStorage: [
      {
        key: STORAGE_KEYS.LEAD_FLOW_CONFIG,
        value: {
          ...DEFAULT_LEAD_FLOW_CONFIG,
          participantUserIds: ['user-a', 'user-b'],
          dailyLimitEnabled: false,
          lastAssignedIndex: -1,
        },
      },
      { key: STORAGE_KEYS.LEAD_INTAKE_RECORDS, value: [] },
    ],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const first = await service.createLead({
    name: '轮询线索一',
    phone: '13900000031',
    source: '官网',
    status: '新线索',
    owner: '待分配',
    sourceType: '公司资源',
  }, leadEditor);
  const second = await service.createLead({
    name: '轮询线索二',
    phone: '13900000032',
    source: '官网',
    status: '新线索',
    owner: '待分配',
    sourceType: '公司资源',
  }, leadEditor);

  assert.equal(first.data?.assignedTo, '销售甲');
  assert.equal(second.data?.assignedTo, '销售乙');
  const nextStorage = fake.getState().appStorage || [];
  assert.equal(nextStorage.find((row) => row.key === STORAGE_KEYS.LEAD_FLOW_CONFIG)?.value.lastAssignedIndex, 1);
  const records = nextStorage.find((row) => row.key === STORAGE_KEYS.LEAD_INTAKE_RECORDS)?.value || [];
  assert.equal(records.length, 2);
  assert.equal(records[0].assignedTo, '销售乙');
  assert.equal(records[0].status, '入库成功');
}

// RED: 开启“分配后自动领取”时，线索和客户必须在同一事务中创建。
{
  const fake = createFakePrisma({
    businessRecords: tagCatalogRows(),
    leads: [],
    appStorage: [
      {
        key: STORAGE_KEYS.LEAD_FLOW_CONFIG,
        value: {
          ...DEFAULT_LEAD_FLOW_CONFIG,
          participantUserIds: ['user-a'],
          autoClaimAfterAssignmentEnabled: true,
          dailyLimitEnabled: false,
          lastAssignedIndex: -1,
        },
      },
      { key: STORAGE_KEYS.LEAD_INTAKE_RECORDS, value: [] },
    ],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.createLead({
    name: '自动领取线索',
    company: '自动领取公司',
    phone: '13900000033',
    source: '抖音',
    status: '新线索',
    owner: '待分配',
    sourceType: '公司资源',
    manualTagIds: ['shared', 'lead-only'],
    tags: ['伪造通用名', '伪造线索名'],
  }, leadEditor);

  assert.equal(result.code, 0);
  assert.equal(result.data?.lifecycleStatusCode, LIFECYCLE_STATUS_CODES.FOLLOWING);
  assert.match(result.data?.customerId || '', /^cust-/);
  const next = fake.getState();
  const autoCustomer = next.businessRecords.find((row) => row.domain === STORAGE_KEYS.CUSTOMERS)?.data;
  assert.equal(autoCustomer?.id, result.data?.customerId);
  assert.equal(autoCustomer?.owner, '销售甲');
  assert.deepEqual(autoCustomer?.manualTagIds, []);
  assert.deepEqual(autoCustomer?.tags, []);
  assert.equal(next.leads[0].data.manualTagIds, undefined);
  assert.equal(next.leads[0].data.tags, undefined);
  const autoIdentity = next.contactIdentities?.find((identity) => identity.canonicalCustomerId === autoCustomer?.id);
  assert.ok(autoIdentity, '自动领取必须在同一事务中建立联系方式身份');
  assert.deepEqual(
    next.contactIdentityLinks?.filter((link) => link.identityId === autoIdentity.id && link.linkStatus === 'active')
      .map((link) => link.entityType).sort(),
    ['customer', 'lead'],
  );
}

// A caller-controlled JSON id must never become the identity link, audit, or
// intake source key during auto-claim. The generated LeadRecord id is the
// authoritative value before any of those writes occur.
{
  const forgedId = 'forged-json-auto-claim-id';
  const fake = createFakePrisma({
    businessRecords: tagCatalogRows(),
    leads: [],
    appStorage: [
      {
        key: STORAGE_KEYS.LEAD_FLOW_CONFIG,
        value: {
          ...DEFAULT_LEAD_FLOW_CONFIG,
          participantUserIds: ['user-a'],
          autoClaimAfterAssignmentEnabled: true,
          dailyLimitEnabled: false,
          lastAssignedIndex: -1,
        },
      },
      { key: STORAGE_KEYS.LEAD_INTAKE_RECORDS, value: [] },
    ],
  });
  const result = await createCustomerCommandService(fake.prisma, serviceOptions).createLead({
    id: forgedId,
    name: '伪造 ID 自动领取线索',
    phone: '13900000036',
    source: '抖音',
    status: '新线索',
    owner: '待分配',
    sourceType: '公司资源',
  } as any, leadEditor);

  assert.equal(result.code, 0);
  const next = fake.getState();
  const leadRow = next.leads[0];
  const customerId = result.data?.customerId;
  assert.ok(leadRow && customerId);
  assert.notEqual(leadRow.id, forgedId);
  assert.equal(leadRow.data.id, leadRow.id);
  const identity = next.contactIdentities?.find((candidate) => candidate.canonicalCustomerId === customerId);
  assert.ok(identity);
  assert.deepEqual(
    next.contactIdentityLinks?.filter((link) => link.identityId === identity.id && link.entityType === 'lead' && link.linkStatus === 'active')
      .map((link) => link.entityId),
    [leadRow.id],
  );
  assert.equal(next.contactIdentityLinks?.some((link) => link.entityId === forgedId), false);
  const customer = next.businessRecords.find((row) => row.domain === STORAGE_KEYS.CUSTOMERS)?.data;
  assert.equal(customer?.activityRecords?.[0]?.relatedId, leadRow.id);
  const intake = next.appStorage?.find((row) => row.key === STORAGE_KEYS.LEAD_INTAKE_RECORDS)?.value?.[0];
  assert.equal(intake?.leadId, leadRow.id);
  assert.equal(
    next.customerAuditEvents?.[0]?.inputHash,
    hashCustomerAuditInput({
      operation: 'create_customer', customerId, sourceLeadId: leadRow.id,
      assignedToId: 'user-a', source: 'lead_auto_claim',
    }),
  );
}

// RED: automatic claim must also be blocked by an active historical customer
// whose ContactIdentity rows have not been backfilled yet.
{
  const legacyCustomer = customer('cust-auto-claim-legacy');
  legacyCustomer.phone = '13900000035';
  const fake = createFakePrisma({
    businessRecords: [
      ...tagCatalogRows(),
      businessCustomer(legacyCustomer),
    ],
    leads: [],
    appStorage: [
      {
        key: STORAGE_KEYS.LEAD_FLOW_CONFIG,
        value: {
          ...DEFAULT_LEAD_FLOW_CONFIG,
          participantUserIds: ['user-a'],
          autoClaimAfterAssignmentEnabled: true,
          dailyLimitEnabled: false,
          lastAssignedIndex: -1,
        },
      },
      { key: STORAGE_KEYS.LEAD_INTAKE_RECORDS, value: [] },
    ],
  }, { seedContactIdentities: false });
  const result = await createCustomerCommandService(fake.prisma, serviceOptions).createLead({
    name: '不应自动领取的重复线索', phone: legacyCustomer.phone, source: '官网', status: '新线索',
    owner: '待分配', sourceType: '公司资源',
  }, leadEditor);
  assert.equal(result.code, 409);
  assert.equal(fake.getState().businessRecords.filter((row) => row.domain === STORAGE_KEYS.CUSTOMERS).length, 1);
  assert.equal(fake.getState().leads.length, 0);
}

// RED: auto-claim reaches the identity conflict path after normal legacy
// contact prechecks pass. Self scope is insufficient to disclose the linked
// customer when the server role lacks CUSTOMER_LIST/read.
{
  const incomingPhone = '13900000037';
  const existing = customer('cust-auto-claim-summary-hidden');
  existing.phone = '13900000038';
  const normalizedHash = hashContactIdentity(incomingPhone, TEST_CONTACT_CRYPTO.hmacKey);
  const fake = createFakePrisma({
    businessRecords: [...tagCatalogRows(), businessCustomer(existing)],
    leads: [],
    contactIdentities: [{
      id: 'ci-auto-claim-summary-hidden', type: 'phone', normalizedHash, hashKeyVersion: 1,
      status: 'active', encryptedNormalizedValue: 'ci:v1:test', canonicalCustomerId: existing.id,
      conflictReason: null,
    }],
    contactIdentityLinks: [{
      id: 'cil-auto-claim-summary-hidden', identityId: 'ci-auto-claim-summary-hidden',
      entityType: 'customer', entityId: existing.id, linkStatus: 'active', source: 'test', endedAt: null,
    }],
    appStorage: [
      {
        key: STORAGE_KEYS.LEAD_FLOW_CONFIG,
        value: {
          ...DEFAULT_LEAD_FLOW_CONFIG,
          participantUserIds: ['user-a'],
          autoClaimAfterAssignmentEnabled: true,
          dailyLimitEnabled: false,
          lastAssignedIndex: -1,
        },
      },
      { key: STORAGE_KEYS.LEAD_INTAKE_RECORDS, value: [] },
    ],
  }, { seedContactIdentities: false });
  const result = await createCustomerCommandService(fake.prisma, serviceOptions).createLead({
    name: '自动领取摘要保护', phone: incomingPhone, source: '官网', status: '新线索',
    owner: '待分配', sourceType: '公司资源',
  }, leadEditor);

  assert.equal(result.code, 409);
  assert.equal(result.data, null);
  assert.equal(fake.getState().businessRecords.filter((row) => row.domain === STORAGE_KEYS.CUSTOMERS).length, 1);
  assert.equal(fake.getState().leads.length, 0);
}

// RED: 显式分配新线索需要分配权限，且手机/微信不得与客户或线索重复。
{
  const explicitFake = createFakePrisma({ businessRecords: [], leads: [] });
  const explicitService = createCustomerCommandService(explicitFake.prisma, serviceOptions);
  const assigned = await explicitService.createLead({
    name: '主管新线索',
    phone: '13900000008',
    source: '抖音',
    status: '新线索',
    owner: '销售乙',
    assignedTo: '销售乙',
    sourceType: '公司资源',
  }, leadCreatorAssigner);
  assert.equal(assigned.code, 0);
  assert.equal(assigned.data?.assignedTo, '销售乙');

  const collisionCustomer = customer('cust-create-collision');
  collisionCustomer.phone = '+8613900000007';
  const collisionFake = createFakePrisma({
    businessRecords: [businessCustomer(collisionCustomer)],
    leads: [],
  });
  const collisionService = createCustomerCommandService(collisionFake.prisma, serviceOptions);
  const collision = await collisionService.createLead({
    name: '重复线索',
    phone: '13900000007',
    source: '官网',
    status: '新线索',
    owner: '待分配',
    sourceType: '公司资源',
  }, leadEditor);
  assert.equal(collision.code, 409);
  assert.equal(collisionFake.getState().leads.length, 0);
}

// RED: 被拦截的重复线索也必须留下服务端入库失败记录。
{
  const existing = customer('cust-intake-collision');
  existing.phone = '+8613900000034';
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(existing)],
    leads: [],
    appStorage: [
      { key: STORAGE_KEYS.LEAD_FLOW_CONFIG, value: { ...DEFAULT_LEAD_FLOW_CONFIG, autoAssignEnabled: false } },
      { key: STORAGE_KEYS.LEAD_INTAKE_RECORDS, value: [] },
    ],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.createLead({
    name: '重复入库线索',
    phone: '13900000034',
    source: '官网',
    status: '新线索',
    owner: '待分配',
    sourceType: '公司资源',
  }, leadEditor);

  assert.equal(result.code, 409);
  const records = fake.getState().appStorage?.find((row) => row.key === STORAGE_KEYS.LEAD_INTAKE_RECORDS)?.value || [];
  assert.equal(records[0]?.status, '入库失败');
  assert.equal(records[0]?.failureReason, '系统中已存在相同联系方式');
  assert.equal(records[0]?.collisionTargetType, undefined);
}

// 线索资料编辑不得绕过分配命令，也不得修改已转客户线索。
{
  const source = pendingLead('lead-update-assignee');
  const fake = createFakePrisma({ businessRecords: [], leads: [source] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const denied = await service.updateLead(source.id, { assignedTo: '销售乙', owner: '销售乙' }, leadEditor);
  assert.equal(denied.code, 0);
  assert.equal(denied.data?.assignedTo, salesA.name);
  assert.equal(denied.data?.owner, salesA.name);

  const converted = pendingLead('lead-update-converted', salesA.name, 'cust-existing');
  const convertedFake = createFakePrisma({ businessRecords: [], leads: [converted] });
  const convertedService = createCustomerCommandService(convertedFake.prisma, serviceOptions);
  const convertedResult = await convertedService.updateLead(converted.id, { name: '不应更新' }, leadEditor);
  assert.equal(convertedResult.code, 409);
}

// RED: 线索跟进记录的 createdBy 必须来自服务端会话，并同事务更新关联客户生命周期。
{
  const linkedCustomer = customer('cust-lead-follow');
  linkedCustomer.lifecycleStatusCode = LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP;
  const source = pendingLead('lead-follow', salesA.name, linkedCustomer.id);
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(linkedCustomer)],
    leads: [source],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.addLeadFollowUp(source.id, {
    type: '电话',
    content: '客户已回复',
    createdBy: '伪造人员',
  }, leadFollower);

  assert.equal(result.code, 0);
  assert.equal(result.data?.createdBy, salesA.name);
  const next = fake.getState();
  assert.equal(next.leads[0].data.followUpRecords[0].content, '客户已回复');
  assert.equal(next.leads[0].data.lifecycleStatusCode, LIFECYCLE_STATUS_CODES.FOLLOWING);
  assert.equal(next.businessRecords[0].data.lifecycleStatusCode, LIFECYCLE_STATUS_CODES.FOLLOWING);
}

// RED: 线索手动分配必须校验目标销售和部门数据范围。
{
  const source = pendingLead('lead-assign-command');
  const fake = createFakePrisma({ businessRecords: [], leads: [source] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const denied = await service.assignLead(source.id, '外部销售', leadAssigner);
  assert.equal(denied.code, 403);

  const result = await service.assignLead(source.id, '销售乙', leadAssigner);
  assert.equal(result.code, 0);
  assert.equal(result.data?.owner, '销售乙');
  assert.equal(result.data?.assignedTo, '销售乙');
  assert.equal(result.data?.changeHistory?.[0].operator, manager.name);
}

// RED: 线索删除只允许超级管理员；已转客户的线索必须与客户一起软删除。
{
  const source = pendingLead('lead-delete-command');
  const deniedFake = createFakePrisma({ businessRecords: [], leads: [source] });
  const deniedService = createCustomerCommandService(deniedFake.prisma, serviceOptions);
  const denied = await deniedService.deleteLead(source.id, '普通员工删除', leadEditor);
  assert.equal(denied.code, 403);
  assert.equal(deniedFake.transactionCalls, 0);

  const service = createCustomerCommandService(deniedFake.prisma, serviceOptions);
  const result = await service.deleteLead(source.id, '重复线索', superAdmin);
  assert.equal(result.code, 0);
  assert.equal(deniedFake.getState().leads[0].data.deletedBy, superAdmin.name);

  const linkedCustomer = customer('cust-linked');
  const converted = pendingLead('lead-delete-linked', salesA.name, linkedCustomer.id);
  const convertedFake = createFakePrisma({
    businessRecords: [businessCustomer(linkedCustomer)],
    leads: [converted],
  });
  const convertedResult = await createCustomerCommandService(convertedFake.prisma, serviceOptions)
    .deleteLead(converted.id, '清理已转客户线索', superAdmin);
  assert.equal(convertedResult.code, 0, convertedResult.message);
  const convertedNext = convertedFake.getState();
  assert.equal(convertedNext.leads[0].data.deletedBy, superAdmin.name);
  assert.equal(convertedNext.leads[0].data.deleteReason, '清理已转客户线索');
  assert.equal(convertedNext.businessRecords[0].data.deletedBy, superAdmin.name);
  assert.equal(convertedNext.businessRecords[0].data.deleteReason, '清理已转客户线索');

  const alreadyDeletedCustomer = {
    ...customer('cust-already-deleted'),
    deletedAt: '2026-07-01T00:00:00.000Z',
    deletedBy: '历史管理员',
    deletionCascadeId: 'delete-cascade-existing',
  };
  const siblingA = pendingLead('lead-deleted-customer-a', salesA.name, alreadyDeletedCustomer.id);
  const siblingB = pendingLead('lead-deleted-customer-b', salesA.name, alreadyDeletedCustomer.id);
  const alreadyDeletedFake = createFakePrisma({
    businessRecords: [businessCustomer(alreadyDeletedCustomer)],
    leads: [siblingA, siblingB],
  });
  const alreadyDeletedResult = await createCustomerCommandService(alreadyDeletedFake.prisma, serviceOptions)
    .deleteLead(siblingA.id, '补齐历史联合删除', superAdmin);
  assert.equal(alreadyDeletedResult.code, 0, alreadyDeletedResult.message);
  assert.equal(alreadyDeletedFake.getState().leads.every((item) => Boolean(item.data.deletedAt)), true);
  assert.equal(alreadyDeletedFake.getState().leads.every((item) => item.data.deletionCascadeId === 'delete-cascade-existing'), true);

  const orderedCustomer = customer('cust-linked-ordered');
  const orderedLead = pendingLead('lead-delete-linked-ordered', salesA.name, orderedCustomer.id);
  const orderedFake = createFakePrisma({
    businessRecords: [
      businessCustomer(orderedCustomer),
      {
        id: `${STORAGE_KEYS.ORDERS}:order-linked`,
        domain: STORAGE_KEYS.ORDERS,
        recordId: 'order-linked',
        customerId: orderedCustomer.id,
        data: { id: 'order-linked', customerId: orderedCustomer.id, status: '已审核' },
      },
    ],
    leads: [orderedLead],
  });
  const orderedResult = await createCustomerCommandService(orderedFake.prisma, serviceOptions)
    .deleteLead(orderedLead.id, '有关联订单不得删除', superAdmin);
  assert.equal(orderedResult.code, 409);
  assert.match(orderedResult.message, /订单关联/);
  assert.equal(orderedFake.getState().leads[0].data.deletedAt, undefined);
  assert.equal(orderedFake.getState().businessRecords[0].data.deletedAt, undefined);
}

// RED: lead link cleanup follows the locked relational record id, not a stale
// JSON id embedded in the deleted lead payload.
{
  const source = pendingLead('lead-row-delete-real-id');
  const phone = '13800000082';
  source.phone = phone;
  source.data.phone = phone;
  source.data.id = 'stale-json-delete-id';
  const normalizedHash = hashContactIdentity(normalizeContactIdentity('phone', phone), TEST_CONTACT_CRYPTO.hmacKey);
  const identityId = `ci_phone_${normalizedHash.slice(0, 32)}`;
  const fake = createFakePrisma({
    businessRecords: [],
    leads: [source],
    contactIdentities: [{
      id: identityId,
      type: 'phone',
      normalizedHash,
      hashKeyVersion: 1,
      status: 'active',
      encryptedNormalizedValue: 'ci:v1:test',
      canonicalCustomerId: null,
      conflictReason: null,
    }],
    contactIdentityLinks: [{
      id: 'delete-real-id-lead-link',
      identityId,
      entityType: 'lead',
      entityId: source.id,
      linkStatus: 'active',
      source: 'historical_backfill',
      endedAt: null,
    }],
  });

  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .deleteLead(source.id, '清理真实行 ID 链接', superAdmin);

  assert.equal(result.code, 0);
  const next = fake.getState();
  assert.equal(next.contactIdentityLinks?.find((link) => link.id === 'delete-real-id-lead-link')?.linkStatus, 'ended');
  assert.equal(next.contactIdentityLinks?.some((link) => (
    link.entityType === 'lead' && link.entityId === 'stale-json-delete-id'
  )), false);
}

// RED: 线索转客户要原子创建 BusinessRecord 并回写 LeadRecord，重试不得重复创建。
{
  const queryLog: string[] = [];
  const fake = createFakePrisma({ businessRecords: [], leads: [lead('lead-convert')] }, { queryLog });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.convertLeadToCustomer('lead-convert', salesA);

  assert.equal(result.code, 0);
  assert.ok(result.data?.customerId);
  let next = fake.getState();
  assert.equal(next.businessRecords.length, 1);
  assert.equal(next.businessRecords[0].domain, STORAGE_KEYS.CUSTOMERS);
  assert.equal(next.businessRecords[0].owner, salesA.name);
  assert.equal(next.leads[0].data.customerId, next.businessRecords[0].recordId);
  const conversionIdentity = next.contactIdentities?.find((identity) => (
    identity.canonicalCustomerId === next.businessRecords[0].recordId
  ));
  assert.ok(conversionIdentity);
  assert.deepEqual(
    next.contactIdentityLinks?.filter((link) => link.identityId === conversionIdentity.id && link.linkStatus === 'active')
      .map((link) => link.entityType).sort(),
    ['customer', 'lead'],
  );
  assert.equal(fake.contactLockUpserts, 1, '转客户前必须建立规范化联系人锁');
  assert.equal(fake.contactLockQueries, 2, '身份门与联系人锁都必须使用 FOR UPDATE');
  const customerSourceLock = queryLog.findIndex((text) => (
    text.includes('FROM business_records') && text.includes('ORDER BY recordId ASC') && text.includes('FOR UPDATE')
  ));
  const mutationGateLock = queryLog.findIndex((text) => (
    text === 'app_storage_upsert:aaos_contact_identity_mutation_gate_v1'
  ));
  const leadSourceLock = queryLog.findIndex((text) => (
    text.includes('FROM lead_records') && text.includes('WHERE id =') && text.includes('FOR UPDATE')
  ));
  assert.ok(mutationGateLock >= 0 && leadSourceLock > mutationGateLock);
  assert.ok(customerSourceLock > mutationGateLock,
    'the shared gate must precede conversion source locks that otherwise oppose backfill order');

  const replay = await service.convertLeadToCustomer('lead-convert', salesA);
  assert.equal(replay.code, 0);
  next = fake.getState();
  assert.equal(next.businessRecords.length, 1);
  assert.equal(next.leads[0].data.changeHistory.length, 1, '转客户重试不得重复写入历史');
  assert.equal(fake.customerLockQueries, 0, '已转客户重放不得再按线索→客户的反向顺序加锁');
}

// RED: conversion must retain the locked LeadRecord id for its active identity
// link and customer activity relation when legacy JSON contains a stale id.
{
  const source = lead('lead-row-convert-real-id');
  source.data.id = 'stale-json-convert-id';
  const fake = createFakePrisma({ businessRecords: [], leads: [source] });
  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .convertLeadToCustomer(source.id, salesA);

  assert.equal(result.code, 0);
  const next = fake.getState();
  const converted = next.businessRecords.find((row) => row.domain === STORAGE_KEYS.CUSTOMERS)?.data;
  const identity = next.contactIdentities?.find((candidate) => candidate.canonicalCustomerId === converted?.id);
  assert.ok(identity);
  assert.deepEqual(
    next.contactIdentityLinks?.filter((link) => link.identityId === identity.id && link.entityType === 'lead' && link.linkStatus === 'active')
      .map((link) => link.entityId),
    [source.id],
  );
  assert.equal(next.contactIdentityLinks?.some((link) => (
    link.entityType === 'lead' && link.entityId === 'stale-json-convert-id'
  )), false);
  assert.equal(converted?.activityRecords?.[0]?.relatedId, source.id);
}

// 显式转客户不得继承线索历史标签。
{
  const source = lead('lead-convert-tags');
  source.data.manualTagIds = ['shared', 'lead-only'];
  source.data.tags = ['高意向', '线索专用'];
  const fake = createFakePrisma({ businessRecords: tagCatalogRows(), leads: [source] });
  const result = await createCustomerCommandService(fake.prisma, serviceOptions).convertLeadToCustomer(source.id, salesA);
  assert.equal(result.code, 0);
  const next = fake.getState();
  const converted = next.businessRecords.find((row) => row.domain === STORAGE_KEYS.CUSTOMERS)?.data;
  assert.deepEqual(converted?.manualTagIds, []);
  assert.deepEqual(converted?.tags, []);
  assert.equal(next.leads[0].data.manualTagIds, undefined);
  assert.equal(next.leads[0].data.tags, undefined);
}

// RED: 部门主管主动点击“开始跟进并加入客户”时，
// 客户与线索应归实际领取人，原分配人只保留在变更历史中。
{
  const subordinateLead = lead('lead-manager-convert', salesA.name);
  subordinateLead.data.ownerId = salesA.id;
  subordinateLead.data.assignedToId = salesA.id;
  const fake = createFakePrisma({ businessRecords: [], leads: [subordinateLead] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.convertLeadToCustomer('lead-manager-convert', manager);

  assert.equal(result.code, 0);
  const next = fake.getState();
  assert.equal(next.businessRecords[0].owner, manager.name);
  assert.equal(next.businessRecords[0].data.ownerId, manager.id);
  assert.equal(next.leads[0].owner, manager.name);
  assert.equal(next.leads[0].assignedTo, manager.name);
  assert.equal(next.leads[0].data.ownerId, manager.id);
  assert.equal(next.leads[0].data.assignedToId, manager.id);
  assert.equal(next.leads[0].data.changeHistory[0].changes.some((change: any) => (
    change.field === 'assignedTo'
    && change.oldValue === salesA.name
    && change.newValue === manager.name
  )), true);
}

// 拥有“开始跟进并加入客户”权限的超级管理员也是合法领取人，
// 可领取能力不得再按角色名称硬排除。
{
  const source = lead('lead-super-admin-convert', salesA.name);
  const superRoleWithLeadFollow = {
    ...superRole,
    permissions: [
      ...superRole.permissions,
      { module: PERMISSION_KEYS.LEADS_FOLLOW, actions: ['read', 'write'] },
    ],
  };
  const fake = createFakePrisma(
    { businessRecords: [], leads: [source] },
    { roleRows: [salesRole, managerRole, financeRole, superRoleWithLeadFollow] },
  );
  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .convertLeadToCustomer(source.id, superAdmin);

  assert.equal(result.code, 0);
  const next = fake.getState();
  assert.equal(next.businessRecords[0].owner, superAdmin.name);
  assert.equal(next.businessRecords[0].data.ownerId, superAdmin.id);
  assert.equal(next.leads[0].data.owner, superAdmin.name);
  assert.equal(next.leads[0].data.ownerId, superAdmin.id);
}

// 同一联系人的两条线索并发转客户时，联系人行锁保证只创建一个客户。
{
  const firstLead = lead('lead-concurrent-a');
  const secondLead = lead('lead-concurrent-b');
  const fake = createFakePrisma({ businessRecords: [], leads: [firstLead, secondLead] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const results = await Promise.all([
    service.convertLeadToCustomer(firstLead.id, salesA),
    service.convertLeadToCustomer(secondLead.id, salesA),
  ]);

  assert.deepEqual(results.map((result) => result.code).sort((a, b) => a - b), [0, 409]);
  assert.equal(fake.getState().businessRecords.length, 1);
}

// 联系人锁要按单个身份字段加锁，部分重叠也必须串行化。
{
  const firstLead = lead('lead-overlap-phone-a');
  firstLead.wechat = 'wechat-a';
  firstLead.data.wechat = 'wechat-a';
  const secondLead = lead('lead-overlap-phone-b');
  secondLead.wechat = 'wechat-b';
  secondLead.data.wechat = 'wechat-b';
  const fake = createFakePrisma({ businessRecords: [], leads: [firstLead, secondLead] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const results = await Promise.all([
    service.convertLeadToCustomer(firstLead.id, salesA),
    service.convertLeadToCustomer(secondLead.id, salesA),
  ]);

  assert.deepEqual(results.map((result) => result.code).sort((a, b) => a - b), [0, 409]);
  assert.equal(fake.getState().businessRecords.length, 1);
}

{
  const firstLead = lead('lead-overlap-wechat-a');
  firstLead.phone = '13800000001';
  firstLead.data.phone = '13800000001';
  firstLead.wechat = 'shared-wechat';
  firstLead.data.wechat = 'shared-wechat';
  const secondLead = lead('lead-overlap-wechat-b');
  secondLead.phone = '13800000002';
  secondLead.data.phone = '13800000002';
  secondLead.wechat = 'shared-wechat';
  secondLead.data.wechat = 'shared-wechat';
  const fake = createFakePrisma({ businessRecords: [], leads: [firstLead, secondLead] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const results = await Promise.all([
    service.convertLeadToCustomer(firstLead.id, salesA),
    service.convertLeadToCustomer(secondLead.id, salesA),
  ]);

  assert.deepEqual(results.map((result) => result.code).sort((a, b) => a - b), [0, 409]);
  assert.equal(fake.getState().businessRecords.length, 1);
}

// RED: 真正待分配的线索允许具备接收能力的录入人领取转客户。
{
  const pendingLead = lead('lead-pending', '待分配');
  pendingLead.assignedTo = null;
  pendingLead.data.owner = '待分配';
  pendingLead.data.assignedTo = undefined;
  pendingLead.data.inputBy = salesA.name;
  const fake = createFakePrisma({ businessRecords: [], leads: [pendingLead] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.convertLeadToCustomer('lead-pending', salesA);

  assert.equal(result.code, 0);
  assert.equal(fake.getState().businessRecords[0].owner, salesA.name);
}

// RED: 线索录入人只有可见权而非负责人时，不得越权转客户。
{
  const otherOwnedLead = lead('lead-other-owner', '销售乙');
  otherOwnedLead.data.inputBy = salesA.name;
  const fake = createFakePrisma({ businessRecords: [], leads: [otherOwnedLead] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.convertLeadToCustomer('lead-other-owner', salesA);

  assert.equal(result.code, 403);
  assert.equal(fake.getState().businessRecords.length, 0);
}

// RED: 线索的手机号或微信已存在于客户库时，不得再创建重复客户。
{
  const existingCustomer = businessCustomer(customer('cust-existing'));
  const sourceLead = lead('lead-duplicate-customer');
  const fake = createFakePrisma(
    { businessRecords: [existingCustomer], leads: [sourceLead] },
    { seedContactIdentities: false },
  );
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.convertLeadToCustomer('lead-duplicate-customer', salesA);

  assert.equal(result.code, 409);
  assert.equal(result.message, '系统中已存在相同联系方式');
  assert.equal(result.data, null, 'self data scope without CUSTOMER_LIST/read must not disclose the matching customer');
  assert.doesNotMatch(JSON.stringify(result), /13800000000|normalizedHash|encryptedNormalizedValue/);
  const next = fake.getState();
  assert.equal(next.businessRecords.length, 1);
  assert.equal(next.leads[0].data.customerId, undefined);
}

// The same in-scope conversion may disclose the four safe fields only when
// the server role directory explicitly grants CUSTOMER_LIST/read.
{
  const existingCustomer = businessCustomer(customer('cust-existing-list-readable'));
  const sourceLead = lead('lead-duplicate-customer-list-readable');
  const listReadableRole = {
    ...salesRole,
    permissions: [
      ...salesRole.permissions,
      { module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] },
    ],
  };
  const fake = createFakePrisma(
    { businessRecords: [existingCustomer], leads: [sourceLead] },
    { seedContactIdentities: false, roleRows: [listReadableRole, managerRole, financeRole, superRole] },
  );
  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .convertLeadToCustomer(sourceLead.id, salesA);

  assert.equal(result.code, 409);
  assert.deepEqual(result.data, {
    id: 'cust-existing-list-readable',
    name: '客户-cust-existing-list-readable',
    company: '公司-cust-existing-list-readable',
    owner: salesA.name,
  });
}

// RED: 范围外联系方式冲突只允许返回通用语义，不得泄露对象。
{
  const hidden = customer('cust-hidden-contact', '外部销售');
  hidden.phone = '13900000077';
  const sourceLead = lead('lead-hidden-contact');
  sourceLead.phone = '13900000077';
  sourceLead.data.phone = '13900000077';
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(hidden)],
    leads: [sourceLead],
  });
  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .convertLeadToCustomer(sourceLead.id, salesA);

  assert.equal(result.code, 409);
  assert.equal(result.message, '系统中已存在相同联系方式');
  assert.equal(result.data, null);
  assert.doesNotMatch(JSON.stringify(result), /外部销售|cust-hidden-contact|13900000077/);
}

// RED: 客户联系方式变更必须先建立新身份，再结束旧关联。
{
  const value = customer('cust-contact-rotate');
  value.phone = '13800000000';
  const fake = createFakePrisma({ businessRecords: [businessCustomer(value)], leads: [] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.updateCustomer(value.id, { phone: '13900000066' }, superAdmin);

  assert.equal(result.code, 0, result.message);
  const next = fake.getState();
  const customerLinks = next.contactIdentityLinks?.filter((link) => (
    link.entityType === 'customer' && link.entityId === value.id
  )) || [];
  assert.equal(customerLinks.filter((link) => link.linkStatus === 'active').length, 1);
  assert.equal(customerLinks.filter((link) => link.linkStatus === 'ended').length, 1);
  const activeIdentity = next.contactIdentities?.find((identity) => (
    identity.id === customerLinks.find((link) => link.linkStatus === 'active')?.identityId
  ));
  assert.equal(
    activeIdentity?.normalizedHash,
    hashContactIdentity('13900000066', TEST_CONTACT_CRYPTO.hmacKey),
  );
}

// RED: 编辑者即使在同一数据范围内，也不能仅凭范围读取权限获知
// 冲突客户；摘要还要求服务端 CUSTOMER_LIST/read capability。
{
  const target = customer('cust-profile-conflict-target');
  // A blank historical value is legitimately completable by a profile editor;
  // use it so the contact-edit lock does not mask the identity conflict path.
  target.phone = '';
  const existing = customer('cust-profile-conflict-existing');
  existing.phone = '13900000062';
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(target), businessCustomer(existing)],
    leads: [],
  });
  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .updateCustomer(target.id, { phone: existing.phone }, customerEditor);

  assert.equal(result.code, 409);
  assert.equal(result.data, null);
  assert.equal(fake.getState().businessRecords.find((row) => row.recordId === target.id)?.data.phone, target.phone);
}

// RED: an ordinary profile edit on a pre-backfill customer starts with an
// empty identity table, claims its own legacy record under row locking, and
// creates the link atomically rather than relying on a global completion flag.
{
  const value = customer('cust-legacy-profile-edit');
  value.phone = '13900000065';
  const fake = createFakePrisma(
    { businessRecords: [businessCustomer(value)], leads: [] },
    { seedContactIdentities: false },
  );
  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .updateCustomer(value.id, { company: '完成过渡的历史公司' }, superAdmin);
  assert.equal(result.code, 0, result.message);
  const next = fake.getState();
  assert.equal(next.contactIdentities?.length, 1);
  assert.equal(next.contactIdentityLinks?.some((link) => (
    link.entityType === 'customer' && link.entityId === value.id && link.linkStatus === 'active'
  )), true);
}

// RED: 联系人碰撞应使用规范化身份，不得被国家码、空格或大小写绕过。
{
  const existingValue = customer('cust-formatted-phone');
  existingValue.phone = '13800000000';
  const sourceLead = lead('lead-formatted-phone');
  sourceLead.phone = '+8613800000000';
  sourceLead.data.phone = '+8613800000000';
  const fake = createFakePrisma({ businessRecords: [businessCustomer(existingValue)], leads: [sourceLead] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.convertLeadToCustomer(sourceLead.id, salesA);

  assert.equal(result.code, 409);
  assert.equal(fake.getState().businessRecords.length, 1);
}

{
  const existingValue = { ...customer('cust-formatted-wechat'), phone: '13800000003', wechat: ' WeChat-ID ' };
  const sourceLead = lead('lead-formatted-wechat');
  sourceLead.phone = '13800000004';
  sourceLead.data.phone = '13800000004';
  sourceLead.wechat = 'wechat-id';
  sourceLead.data.wechat = 'wechat-id';
  const fake = createFakePrisma({ businessRecords: [businessCustomer(existingValue)], leads: [sourceLead] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.convertLeadToCustomer(sourceLead.id, salesA);

  assert.equal(result.code, 409);
  assert.equal(fake.getState().businessRecords.length, 1);
}

// RED: 客户创建失败时，线索不得残留 customerId。
{
  const originalLead = lead('lead-convert-rollback');
  const fake = createFakePrisma({ businessRecords: [], leads: [originalLead] }, { failCustomerCreate: true });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);

  await assert.rejects(
    () => service.convertLeadToCustomer('lead-convert-rollback', salesA),
    /customer create failed/,
  );
  assert.deepEqual(fake.getState().leads[0], originalLead);
}

// RED: 没有业务写权限时应在开启事务前拒绝。
{
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(customer('cust-no-permission'))],
    leads: [],
  }, {
    roleRows: [
      { ...salesRole, permissions: [{ module: PERMISSION_KEYS.CUSTOMER_ASSIGN, actions: ['read', 'write'] }] },
      managerRole,
      financeRole,
      superRole,
    ],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.releaseToPublicPool('cust-no-permission', '', {
    ...salesA,
    permissions: [{ module: PERMISSION_KEYS.CUSTOMER_ASSIGN, actions: ['read', 'write'] }],
  });

  assert.equal(result.code, 403);
  assert.equal(fake.transactionCalls, 0);
}

// RED: 客户 CAS 版本冲突必须返回可恢复的 409，不得冒泡为 500。
{
  const value = customer('cust-cas-conflict');
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(value)],
    leads: [],
  }, { failCustomerCompareAndSave: true });
  const result = await createCustomerCommandService(fake.prisma, serviceOptions)
    .updateCustomer(value.id, { name: '并发修改' }, customerEditor);

  assert.equal(result.code, 409);
  assert.match(result.message, /客户记录已更新/);
}

// RED: 批量工作者冻结的顶层 BusinessRecord.updatedAt 必须在原子写入事务内再次校验。
{
  const value = customer('cust-batch-version-conflict');
  const fake = createFakePrisma({ businessRecords: [businessCustomer(value)], leads: [] });
  const result = await createAuditedCustomerAtomicCommandService(fake.prisma, {
    ...serviceOptions,
    auditAppender: createPrismaCustomerAuditAppender(),
  }).execute({
    action: 'release_to_pool', customerId: value.id, reason: '批量版本重验',
  }, salesA, {
    expectedUpdatedAt: '2026-07-18T09:00:00.000Z',
    batchJobId: 'job-version-conflict',
    idempotencyKey: 'job-version-conflict:customer:cust-batch-version-conflict',
  } as any);

  assert.equal(result.code, 409);
  assert.match(result.message, /客户记录已更新/);
  assert.equal(fake.getState().businessRecords[0].data.owner, salesA.name);
  assert.equal(fake.getState().customerAuditEvents?.length, 0);
}

// RED: MySQL 死锁/Prisma P2034 应有限重试，且不重复写入历史。
{
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(customer('cust-retry'))],
    leads: [lead('lead-retry', salesA.name, 'cust-retry')],
  }, { failTransactions: 1 });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.releaseToPublicPool('cust-retry', '冲突重试', salesA);

  assert.equal(result.code, 0);
  assert.equal(fake.transactionCalls, 2);
  assert.equal(fake.getState().businessRecords[0].data.activityRecords.length, 1);
}
