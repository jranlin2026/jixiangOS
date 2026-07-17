import assert from 'node:assert/strict';
import {
  createAuditedCustomerAtomicCommandService,
  createCustomerCommandService,
} from './customerCommandService';
import { createPrismaCustomerAuditAppender } from './customerAuditService';
import { hashContactIdentity, normalizeContactIdentity } from './contactIdentityService';
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
  for (const row of state.businessRecords.filter((item) => item.domain === STORAGE_KEYS.CUSTOMERS)) {
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
        if (String(where.key).startsWith('aaos_contact_lock_')) contactLockUpserts += 1;
        await lockContact(where.key);
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
        if (rows.some((item) => item.type === data.type && item.normalizedHash === data.normalizedHash)) {
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
      const values = query?.values || [];
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
          return clone(working.leads);
        }
        const [leadId] = values;
        return clone(working.leads.filter((row) => row.id === leadId));
      }
      if (text.includes('FROM customer_todos')) {
        return clone(working.customerTodos || []);
      }
      if (text.includes('FROM contact_identities')) return [];
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

// RED: 部门管理者只能把客户分配给数据范围内的在职员工。
{
  const fake = createFakePrisma({
    businessRecords: [businessCustomer(customer('cust-assign'))],
    leads: [lead('lead-assign', salesA.name, 'cust-assign')],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);

  const denied = await service.assignOwner('cust-assign', 'user-c', '越部门分配', manager);
  assert.equal(denied.code, 403);

  const nonSales = await service.assignOwner('cust-assign', 'user-finance', '错误分配', manager);
  assert.equal(nonSales.code, 400, '客户不得分配给没有线索接收能力的员工');

  const assigned = await service.assignOwner('cust-assign', 'user-b', '主管调整', manager);
  assert.equal(assigned.code, 0);
  assert.equal(assigned.data?.owner, '销售乙');
  const next = fake.getState();
  assert.equal(next.leads[0].owner, '销售乙');
  assert.equal(next.leads[0].assignedTo, '销售乙');
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

// RED: 稳定 customerId 关联的线索是外部业务关联，必须阻断删除，不能级联软删除。
{
  const value = customer('cust-delete');
  const deniedFake = createFakePrisma({ businessRecords: [businessCustomer(value)], leads: [] });
  const deniedService = createCustomerCommandService(deniedFake.prisma, serviceOptions);
  const denied = await deniedService.deleteCustomer(value.id, '普通员工删除', customerEditor);
  assert.equal(denied.code, 403);
  assert.equal(deniedFake.transactionCalls, 0);

  const fake = createFakePrisma({
    businessRecords: [businessCustomer(value)],
    leads: [lead('lead-customer-delete', salesA.name, value.id)],
  });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.deleteCustomer(value.id, '重复客户', superAdmin);

  assert.equal(result.code, 409);
  const next = fake.getState();
  assert.equal(next.businessRecords[0].data.deletedAt, undefined);
  assert.equal(next.leads[0].data.deletedAt, undefined);
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

// RED: 线索删除只允许超级管理员，已转客户的线索不得单独删除。
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

  const converted = pendingLead('lead-delete-linked', salesA.name, 'cust-linked');
  const convertedFake = createFakePrisma({ businessRecords: [], leads: [converted] });
  const convertedResult = await createCustomerCommandService(convertedFake.prisma, serviceOptions)
    .deleteLead(converted.id, '错误删除', superAdmin);
  assert.equal(convertedResult.code, 409);
}

// RED: 线索转客户要原子创建 BusinessRecord 并回写 LeadRecord，重试不得重复创建。
{
  const fake = createFakePrisma({ businessRecords: [], leads: [lead('lead-convert')] });
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
  assert.equal(fake.contactLockQueries, 1, '联系人锁必须使用 FOR UPDATE');

  const replay = await service.convertLeadToCustomer('lead-convert', salesA);
  assert.equal(replay.code, 0);
  next = fake.getState();
  assert.equal(next.businessRecords.length, 1);
  assert.equal(next.leads[0].data.changeHistory.length, 1, '转客户重试不得重复写入历史');
  assert.equal(fake.customerLockQueries, 0, '已转客户重放不得再按线索→客户的反向顺序加锁');
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

// RED: 部门主管代为转换已分配线索时，必须保留原销售归属。
{
  const subordinateLead = lead('lead-manager-convert', salesA.name);
  const fake = createFakePrisma({ businessRecords: [], leads: [subordinateLead] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.convertLeadToCustomer('lead-manager-convert', manager);

  assert.equal(result.code, 0);
  const next = fake.getState();
  assert.equal(next.businessRecords[0].owner, salesA.name);
  assert.equal(next.leads[0].owner, salesA.name);
  assert.equal(next.leads[0].assignedTo, salesA.name);
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
  const fake = createFakePrisma({ businessRecords: [existingCustomer], leads: [sourceLead] });
  const service = createCustomerCommandService(fake.prisma, serviceOptions);
  const result = await service.convertLeadToCustomer('lead-duplicate-customer', salesA);

  assert.equal(result.code, 409);
  assert.equal(result.message, '系统中已存在相同联系方式');
  assert.deepEqual(result.data, {
    id: 'cust-existing',
    name: '客户-cust-existing',
    company: '公司-cust-existing',
    owner: salesA.name,
  });
  assert.doesNotMatch(JSON.stringify(result), /13800000000|normalizedHash|encryptedNormalizedValue/);
  const next = fake.getState();
  assert.equal(next.businessRecords.length, 1);
  assert.equal(next.leads[0].data.customerId, undefined);
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
