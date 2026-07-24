import assert from 'node:assert/strict';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { verifyWechatCustomerPrecheckToken } from './wechatAutomationSecurity';
import { hashContactIdentity } from './contactIdentityService';
import {
  createWechatCustomerAutomationService,
  type WechatCustomerAutomationContext,
} from './wechatCustomerAutomationService';

const NOW = new Date('2026-07-25T08:00:00.000Z');
const SIGNING_KEY = 'wechat-customer-automation-test-signing-key-32-bytes';
const CONTACT_CRYPTO = {
  hmacKey: Buffer.alloc(32, 31),
  keyVersion: 1 as const,
  encryptionKey: Buffer.alloc(32, 32),
  encryptionKeyVersion: 1 as const,
};

function permission(module: string, action = 'write') {
  return { module, actions: [action] };
}

function user(input: {
  id: string;
  account: string;
  name: string;
  roleId?: string;
  departmentId?: string;
  isActive?: boolean;
  employmentStatus?: string;
}) {
  return {
    email: '', phone: '', role: '销售顾问', avatar: null, positionId: null, positionName: null,
    passwordHash: null, passwordSalt: null, passwordUpdatedAt: null, lastLoginAt: null,
    createdAt: NOW, updatedAt: NOW,
    roleId: input.roleId || 'role-sales',
    departmentId: input.departmentId || 'dept-sales',
    isActive: input.isActive ?? true,
    employmentStatus: input.employmentStatus || 'active',
    ...input,
  };
}

function role(input: {
  id?: string;
  permissions?: Array<{ module: string; actions: string[] }>;
  customerScope?: string;
}) {
  return {
    id: input.id || 'role-sales',
    name: '销售顾问',
    code: 'sales',
    description: null,
    departmentId: null,
    permissions: input.permissions || [
      permission(PERMISSION_KEYS.CUSTOMER_CREATE),
      permission(PERMISSION_KEYS.CUSTOMER_LIST, 'read'),
      permission(PERMISSION_KEYS.CUSTOMER_TRANSFER),
    ],
    dataScopes: { customers: input.customerScope || 'all' },
    memberCount: 1,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function businessRow(domain: string, recordId: string, data: Record<string, unknown>) {
  return {
    id: `${domain}:${recordId}`,
    domain,
    recordId,
    title: String(data.name || recordId),
    status: 'active',
    data,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createHarness() {
  const state = {
    users: [
      user({ id: 'u-automation', account: 'wechat-bot', name: '微信录入' }),
      user({ id: 'u-sales-a', account: 'sales-a', name: '销售甲' }),
    ],
    roles: [role({})],
    departments: [{ id: 'dept-sales', name: '销售部', parentId: null, isActive: true, createdAt: NOW, updatedAt: NOW }],
    leadSources: [
      { id: 'source-website', name: '官网', isActive: true, sortOrder: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
      { id: 'source-douyin', name: '抖音', isActive: true, sortOrder: 2, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
      { id: 'source-live', name: '直播', parentId: 'source-douyin', isActive: true, sortOrder: 1, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
    ],
    tagGroups: [] as any[],
    tags: [] as any[],
    identities: [] as any[],
    links: [] as any[],
    customers: [] as any[],
    createCalls: [] as any[],
    createResult: null as any,
    currentTime: new Date(NOW),
  };

  const prisma: any = {
    user: {
      findMany: async () => structuredClone(state.users),
      findUnique: async ({ where }: any) => structuredClone(
        state.users.find((candidate) => candidate.id === where.id) || null,
      ),
    },
    role: { findMany: async () => structuredClone(state.roles) },
    department: { findMany: async () => structuredClone(state.departments) },
    appStorage: {
      findUnique: async ({ where }: any) => where.key === STORAGE_KEYS.LEAD_SOURCE_CONFIGS
        ? { key: where.key, value: structuredClone(state.leadSources) }
        : null,
    },
    businessRecord: {
      findMany: async ({ where }: any = {}) => {
        if (where.domain === STORAGE_KEYS.TAG_GROUPS) return structuredClone(state.tagGroups);
        if (where.domain === STORAGE_KEYS.TAGS) return structuredClone(state.tags);
        return structuredClone(state.customers);
      },
      findUnique: async ({ where }: any) => {
        const compound = where.domain_recordId;
        return structuredClone(state.customers.find((row) => (
          row.domain === compound.domain && row.recordId === compound.recordId
        )) || null);
      },
    },
    contactIdentity: {
      findUnique: async ({ where }: any) => structuredClone(state.identities.find((identity) => (
        identity.type === where.type_normalizedHash.type
        && identity.normalizedHash === where.type_normalizedHash.normalizedHash
      )) || null),
    },
    contactIdentityLink: {
      findMany: async ({ where }: any) => structuredClone(state.links.filter((link) => (
        Object.entries(where).every(([key, value]) => link[key] === value)
      ))),
    },
  };
  const customerService = {
    create: async (input: any, actor: any, execution: any) => {
      state.createCalls.push(structuredClone({ input, actor, execution }));
      return state.createResult || {
        code: 0,
        data: {
          ...input,
          id: 'cust-created',
          owner: input.owner,
          totalSpent: 0,
          orderCount: 0,
          growthPath: [],
          growthRecords: [],
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
        },
      };
    },
  };
  const service = createWechatCustomerAutomationService({
    prisma,
    customerService,
    automationConfig: { actorAccount: 'wechat-bot', signingKey: SIGNING_KEY },
    contactIdentityCrypto: CONTACT_CRYPTO,
    now: () => new Date(state.currentTime),
    nonce: () => 'nonce-check-1',
  });
  const actor = {
    id: 'u-automation',
    account: 'wechat-bot',
    name: '微信录入',
    email: '',
    phone: '',
    role: '销售顾问',
    roleId: 'role-sales',
    departmentId: 'dept-sales',
    permissions: state.roles[0].permissions,
    isActive: true,
  };
  const context: WechatCustomerAutomationContext = {
    actor,
    senderId: 'allowed-wechat-sender',
  };
  return { state, service, context };
}

// RED -> GREEN tracer: required fields are presented one at a time and a
// complete request is normalized against current settings before signing.
{
  const { service, context } = createHarness();
  assert.deepEqual(await service.check({
    phone: '13800138000',
    leadSource: '官网',
  }, context), {
    status: 'needs_input',
    field: 'name',
    message: '请提供客户姓名',
  });
  assert.deepEqual(await service.check({
    name: '微信客户',
    leadSource: '官网',
  }, context), {
    status: 'needs_input',
    field: 'phoneOrWechat',
    message: '请提供客户手机号或微信号',
  });
  assert.deepEqual(await service.check({
    name: '微信客户',
    phone: '13800138000',
  }, context), {
    status: 'needs_input',
    field: 'leadSource',
    message: '请提供系统中已启用的线索来源',
  });

  const checked = await service.check({
    name: ' 微信客户 ',
    company: ' 示例公司 ',
    phone: ' +86 138 0013 8000 ',
    leadSource: '官网',
  }, context);
  assert.equal(checked.status, 'ready');
  if (checked.status !== 'ready') throw new Error('expected ready precheck');
  assert.deepEqual(checked.normalized, {
    name: '微信客户',
    company: '示例公司',
    phone: '+8613800138000',
    leadSource: '官网',
    sourceType: '公司资源',
    ownerAccount: 'wechat-bot',
    ownerName: '微信录入',
    tagNames: [],
  });
  assert.equal(checked.expiresAt, '2026-07-25T08:10:00.000Z');
  const payload = verifyWechatCustomerPrecheckToken(checked.precheckToken, SIGNING_KEY, NOW);
  assert.equal(payload.actorId, context.actor.id);
  assert.match(payload.senderIdHash, /^[a-f0-9]{64}$/);
  assert.match(payload.inputHash, /^[a-f0-9]{64}$/);
  assert.equal(payload.nonce, 'nonce-check-1');
  assert.equal(JSON.stringify(payload).includes('13800138000'), false);
}

// Exact active account resolution chooses the stable owner and returns only
// its public account/name projection.
{
  const { service, context } = createHarness();
  const checked = await service.check({
    name: '指定负责人客户',
    phone: '13800138001',
    leadSource: '官网',
    ownerAccount: 'sales-a',
  }, context);
  assert.equal(checked.status, 'ready');
  if (checked.status !== 'ready') throw new Error('expected exact owner account to resolve');
  assert.equal(checked.normalized.ownerAccount, 'sales-a');
  assert.equal(checked.normalized.ownerName, '销售甲');
}

// A unique exact display name may resolve when the caller did not provide an
// account, while the normalized result still returns the stable account.
{
  const { service, context } = createHarness();
  const checked = await service.check({
    name: '按姓名指定负责人',
    wechat: 'unique_owner_name',
    leadSource: '官网',
    ownerName: '销售甲',
  }, context);
  assert.equal(checked.status, 'ready');
  if (checked.status !== 'ready') throw new Error('expected unique owner name to resolve');
  assert.equal(checked.normalized.ownerAccount, 'sales-a');
  assert.equal(checked.normalized.ownerName, '销售甲');
}

// Ambiguous exact names never pick a write target by array order. They ask
// for the stable account and expose only in-scope active candidates.
{
  const { state, service, context } = createHarness();
  state.users.push(user({ id: 'u-sales-b', account: 'sales-b', name: '销售甲' }));
  assert.deepEqual(await service.check({
    name: '同名负责人客户',
    wechat: 'ambiguous_owner_name',
    leadSource: '官网',
    ownerName: '销售甲',
  }, context), {
    status: 'needs_input',
    field: 'ownerAccount',
    message: '负责人姓名存在重名，请提供负责人账号',
    candidates: [
      { account: 'sales-a', name: '销售甲' },
      { account: 'sales-b', name: '销售甲' },
    ],
  });
}

// Tag input resolves only exact active catalog names; callers never supply
// internal tag IDs and the signed normalized view contains canonical names.
{
  const { state, service, context } = createHarness();
  state.tagGroups.push(businessRow(STORAGE_KEYS.TAG_GROUPS, 'group-intent', {
    id: 'group-intent',
    name: '意向',
    color: '#1677ff',
    selectionMode: 'multiple',
    scope: 'customer',
    isActive: true,
    sortOrder: 1,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  }));
  state.tags.push(businessRow(STORAGE_KEYS.TAGS, 'tag-high-intent', {
    id: 'tag-high-intent',
    groupId: 'group-intent',
    name: '高意向',
    color: '#1677ff',
    isActive: true,
    sortOrder: 1,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  }));
  const checked = await service.check({
    name: '标签客户',
    phone: '13800138002',
    leadSource: '官网',
    tagNames: ['高意向'],
  }, context);
  assert.equal(checked.status, 'ready');
  if (checked.status !== 'ready') throw new Error('expected exact tag name to resolve');
  assert.deepEqual(checked.normalized.tagNames, ['高意向']);
  assert.deepEqual(await service.check({
    name: '错误标签客户',
    phone: '13800138003',
    leadSource: '官网',
    tagNames: ['高意向标签'],
  }, context), {
    status: 'needs_input',
    field: 'tagNames',
    message: '标签“高意向标签”未在系统设置中预设或已停用',
  });
}

// Personal resources require an exact active contributor account and bind its
// stable public identity into the normalized precheck.
{
  const { service, context } = createHarness();
  assert.deepEqual(await service.check({
    name: '个人资源缺贡献人',
    phone: '13800138004',
    leadSource: '官网',
    sourceType: '个人资源',
  }, context), {
    status: 'needs_input',
    field: 'leadContributorAccount',
    message: '个人资源必须提供线索贡献人账号',
  });
  const checked = await service.check({
    name: '个人资源客户',
    phone: '13800138004',
    leadSource: '官网',
    sourceType: '个人资源',
    leadContributorAccount: 'sales-a',
  }, context);
  assert.equal(checked.status, 'ready');
  if (checked.status !== 'ready') throw new Error('expected personal contributor to resolve');
  assert.equal(checked.normalized.sourceType, '个人资源');
  assert.equal(checked.normalized.leadContributorAccount, 'sales-a');
  assert.equal(checked.normalized.leadContributorName, '销售甲');
}

// Exact active customer contacts stop at duplicate and disclose a summary
// only through the current customer read scope.
{
  const { state, service, context } = createHarness();
  const normalizedHash = hashContactIdentity('13800138005', CONTACT_CRYPTO.hmacKey);
  state.identities.push({
    id: 'ci-phone-duplicate',
    type: 'phone',
    normalizedHash,
    hashKeyVersion: 1,
    status: 'active',
    encryptedNormalizedValue: 'ci:v1:opaque',
    canonicalCustomerId: 'c-duplicate',
    conflictReason: null,
  });
  state.links.push({
    id: 'cil-phone-duplicate',
    identityId: 'ci-phone-duplicate',
    entityType: 'customer',
    entityId: 'c-duplicate',
    linkStatus: 'active',
  });
  state.customers.push(businessRow(STORAGE_KEYS.CUSTOMERS, 'c-duplicate', {
    id: 'c-duplicate',
    name: '已有客户',
    company: '已有公司',
    phone: '+8613800138005',
    owner: '销售甲',
    ownerId: 'u-sales-a',
    ownerIdentityStatus: 'resolved',
    customerLevel: 'L1',
    totalSpent: 0,
    orderCount: 0,
    growthPath: [],
    growthRecords: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
  }));
  assert.deepEqual(await service.check({
    name: '重复客户',
    phone: '+86 138 0013 8005',
    leadSource: '官网',
  }, context), {
    status: 'duplicate',
    message: '系统中已存在相同联系方式',
    customer: {
      id: 'c-duplicate',
      name: '已有客户',
      company: '已有公司',
      owner: '销售甲',
    },
  });
}

// A ready token executes the existing customer creator with normalized stable
// IDs, the current validation catalog, and the dedicated WeChat audit labels.
{
  const { state, service, context } = createHarness();
  const input = {
    name: '自动创建客户',
    company: '自动化公司',
    phone: '138 0013 8006',
    leadSource: '抖音',
    sourceName: '直播',
    industry: '软件',
    city: '杭州',
    remark: '已确认需求',
  };
  const checked = await service.check(input, context);
  assert.equal(checked.status, 'ready');
  if (checked.status !== 'ready') throw new Error('expected ready create precheck');

  assert.deepEqual(await service.create(input, checked.precheckToken, context), {
    status: 'created',
    customer: {
      id: 'cust-created',
      name: '自动创建客户',
      company: '自动化公司',
      owner: '微信录入',
    },
    detailPath: '/customers/cust-created',
  });
  assert.equal(state.createCalls.length, 1);
  assert.deepEqual(state.createCalls[0].input, {
    name: '自动创建客户',
    company: '自动化公司',
    phone: '+8613800138006',
    wechat: undefined,
    customerLevel: 'L1',
    owner: '微信录入',
    ownerId: 'u-automation',
    leadSource: '抖音',
    sourceName: '直播',
    sourceType: '公司资源',
    leadContributorId: undefined,
    leadContributorName: undefined,
    industry: '软件',
    city: '杭州',
    manualTagIds: [],
    remark: '已确认需求',
  });
  assert.equal(state.createCalls[0].execution.auditOperation, 'create_customer_from_wechat');
  assert.equal(state.createCalls[0].execution.auditReason, '微信自动化创建客户');
  assert.equal(state.createCalls[0].execution.accessContext, undefined);
  assert.equal(state.createCalls[0].execution.tagValidationCatalog, undefined);
}

// Create accepts only the unexpired signed binding for the same actor, sender,
// and normalized customer input.
{
  const first = createHarness();
  const input = {
    name: '令牌绑定客户',
    phone: '13800138007',
    leadSource: '官网',
  };
  const checked = await first.service.check(input, first.context);
  assert.equal(checked.status, 'ready');
  if (checked.status !== 'ready') throw new Error('expected ready token binding precheck');
  const tampered = `${checked.precheckToken.slice(0, -1)}${checked.precheckToken.endsWith('x') ? 'y' : 'x'}`;
  await assert.rejects(
    () => first.service.create(input, tampered, first.context),
    /invalid or expired/i,
  );
  await assert.rejects(
    () => first.service.create({ ...input, name: '被替换的客户' }, checked.precheckToken, first.context),
    /invalid or expired/i,
  );
  await assert.rejects(
    () => first.service.create(input, checked.precheckToken, {
      ...first.context,
      senderId: 'another-wechat-sender',
    }),
    /invalid or expired/i,
  );
  assert.equal(first.state.createCalls.length, 0);

  const expired = createHarness();
  const expiringCheck = await expired.service.check(input, expired.context);
  assert.equal(expiringCheck.status, 'ready');
  if (expiringCheck.status !== 'ready') throw new Error('expected expiring token precheck');
  expired.state.currentTime = new Date(NOW.getTime() + 10 * 60 * 1_000);
  await assert.rejects(
    () => expired.service.create(input, expiringCheck.precheckToken, expired.context),
    /invalid or expired/i,
  );
  assert.equal(expired.state.createCalls.length, 0);
}

// A signed token is not authorization or a frozen settings snapshot. Create
// re-reads the current role and lead-source configuration before any write.
{
  const permissionChanged = createHarness();
  const input = {
    name: '执行期复核客户',
    phone: '13800138008',
    leadSource: '官网',
  };
  const checked = await permissionChanged.service.check(input, permissionChanged.context);
  assert.equal(checked.status, 'ready');
  if (checked.status !== 'ready') throw new Error('expected permission revalidation precheck');
  permissionChanged.state.roles[0].permissions = [
    permission(PERMISSION_KEYS.CUSTOMER_LIST, 'read'),
    permission(PERMISSION_KEYS.CUSTOMER_TRANSFER),
  ];
  await assert.rejects(
    () => permissionChanged.service.create(input, checked.precheckToken, permissionChanged.context),
    /无权新建客户/,
  );
  assert.equal(permissionChanged.state.createCalls.length, 0);

  const configChanged = createHarness();
  const configCheck = await configChanged.service.check(input, configChanged.context);
  assert.equal(configCheck.status, 'ready');
  if (configCheck.status !== 'ready') throw new Error('expected config revalidation precheck');
  configChanged.state.leadSources[0].isActive = false;
  await assert.rejects(
    () => configChanged.service.create(input, configCheck.precheckToken, configChanged.context),
    /precheck is stale/i,
  );
  assert.equal(configChanged.state.createCalls.length, 0);

  const reboundConfig = createHarness();
  const reboundCheck = await reboundConfig.service.check(input, reboundConfig.context);
  assert.equal(reboundCheck.status, 'ready');
  if (reboundCheck.status !== 'ready') throw new Error('expected rebound config precheck');
  reboundConfig.state.leadSources[0] = {
    ...reboundConfig.state.leadSources[0],
    id: 'source-website-recreated',
  };
  await assert.rejects(
    () => reboundConfig.service.create(input, reboundCheck.precheckToken, reboundConfig.context),
    /invalid or expired/i,
  );
  assert.equal(reboundConfig.state.createCalls.length, 0);

  const malformedConfig = createHarness();
  (malformedConfig.state as any).leadSources = null;
  assert.deepEqual(await malformedConfig.service.check(input, malformedConfig.context), {
    status: 'needs_input',
    field: 'leadSource',
    message: '系统线索来源配置不可用',
  });
}

// The transactional customer creator remains the final identity arbiter. A
// contact inserted after precheck is returned as duplicate, never as created.
{
  const { state, service, context } = createHarness();
  const input = {
    name: '并发重复客户',
    phone: '13800138009',
    leadSource: '官网',
  };
  const checked = await service.check(input, context);
  assert.equal(checked.status, 'ready');
  if (checked.status !== 'ready') throw new Error('expected race precheck');
  state.createResult = {
    code: 409,
    message: '系统中已存在相同联系方式',
    data: {
      id: 'cust-race-winner',
      name: '并发先创建客户',
      company: '并发公司',
      owner: '销售甲',
    },
  };
  assert.deepEqual(await service.create(input, checked.precheckToken, context), {
    status: 'duplicate',
    message: '系统中已存在相同联系方式',
    customer: {
      id: 'cust-race-winner',
      name: '并发先创建客户',
      company: '并发公司',
      owner: '销售甲',
    },
  });
  assert.equal(state.createCalls.length, 1);
}

// Owner selection fails closed for inactive accounts and active employees
// outside the automation actor's current manageable customer scope.
{
  const baseInput = {
    name: '不可分配负责人客户',
    phone: '13800138010',
    leadSource: '官网',
    ownerAccount: 'sales-a',
  };
  const inactive = createHarness();
  inactive.state.users.find((candidate) => candidate.account === 'sales-a')!.isActive = false;
  assert.deepEqual(await inactive.service.check(baseInput, inactive.context), {
    status: 'needs_input',
    field: 'ownerAccount',
    message: '请提供可分配的负责人账号',
  });

  const outOfScope = createHarness();
  outOfScope.state.roles[0].dataScopes = { customers: 'self' };
  assert.deepEqual(await outOfScope.service.check(baseInput, outOfScope.context), {
    status: 'needs_input',
    field: 'ownerAccount',
    message: '请提供可分配的负责人账号',
  });

  const accountless = createHarness();
  accountless.state.users.find((candidate) => candidate.account === 'sales-a')!.account = '';
  assert.deepEqual(await accountless.service.check({
    ...baseInput,
    ownerAccount: undefined,
    ownerName: '销售甲',
  }, accountless.context), {
    status: 'needs_input',
    field: 'ownerAccount',
    message: '请提供可分配的负责人账号',
  });
}

console.log('wechat customer automation service tests passed');
