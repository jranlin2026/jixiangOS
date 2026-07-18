import assert from 'node:assert/strict';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { createCustomerBatchService, lockServerAccessContext } from './customerBatchService';
import { sha256Json } from './customerBatchPrecheckService';

const now = new Date('2026-07-18T00:00:00.000Z');
const customer = (id: string, updatedAt = '2026-07-18T00:00:00.000Z') => ({
  id,
  name: `客户 ${id}`,
  company: '',
  phone: '',
  owner: '销售甲',
  ownerId: 'owner-a',
  ownerIdentityStatus: 'resolved' as const,
  customerLevel: 'L1' as const,
  lifecycleStatusCode: 'following' as const,
  totalSpent: 0,
  orderCount: 0,
  growthPath: [],
  growthRecords: [],
  activityRecords: [],
  createdAt: updatedAt,
  updatedAt,
});

const access = (permissions: Set<string> = new Set([
  PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE,
  PERMISSION_KEYS.CUSTOMER_TRANSFER,
])) => ({
  actorId: 'actor-a',
  actorName: '批量管理员',
  readableUserIds: new Set(['owner-a']),
  legacyReadableNames: new Set(['销售甲']),
  manageableOwnerIds: new Set(['owner-a']),
  canReadPublicPool: false,
  canReadCustomerList: true,
  grantedPermissions: permissions,
});

{
  const rawActor = {
    id: 'actor-a', name: '批量管理员', account: 'actor-a', email: '', phone: '', role: '销售', avatar: null,
    departmentId: null, positionId: null, positionName: null, roleId: 'role-a', passwordHash: null, passwordSalt: null,
    passwordUpdatedAt: null, mustChangePassword: false, lastLoginAt: null, isActive: true, employmentStatus: 'active',
    leftAt: null, leftBy: null, createdAt: now, updatedAt: now,
  };
  const rawRole = {
    id: 'role-a', name: '销售', code: 'sales', description: null, departmentId: null,
    permissions: JSON.stringify([
      { module: PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE, actions: ['write'] },
      { module: PERMISSION_KEYS.CUSTOMER_TRANSFER, actions: ['write'] },
    ]),
    dataScopes: JSON.stringify({ customers: 'self' }), memberCount: 1, isActive: true, createdAt: now, updatedAt: now,
  };
  let rawRead = 0;
  const context = await lockServerAccessContext({
    $queryRaw: async () => {
      rawRead += 1;
      return rawRead === 1 ? [rawActor] : rawRead === 2 ? [rawRole] : [];
    },
  } as any, 'actor-a');
  assert.equal(context.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE), true, 'raw SQL role JSON 必须解析出批量管理叶子');
  assert.equal(context.grantedPermissions.has(PERMISSION_KEYS.CUSTOMER_TRANSFER), true, 'raw SQL role JSON 必须解析出动作叶子');
  assert.equal(context.manageableOwnerIds.has('actor-a'), true, 'raw SQL dataScopes JSON 必须解析出当前写入范围');
}

function fixture(options: { useDefaultOperationGuard?: boolean } = {}) {
  let currentAccess = access();
  let updatedAt = '2026-07-18T00:00:00.000Z';
  let revisions = { lifecycleConfigRevision: 'life-1', tagCatalogRevision: 'tags-1' };
  let frozenCustomerIds = ['c-1'];
  let currentCustomer = customer('c-1', updatedAt);
  let jobCustomerRows: Array<{ customer: ReturnType<typeof customer> }> | null = null;
  const prechecks: any[] = [];
  const jobs: any[] = [];
  const items: any[] = [];
  let tokenCounter = 0;
  const store: any = {
    transaction: async (operation: (tx: typeof store) => Promise<unknown>) => operation(store),
    create: async (row: any) => { prechecks.push(structuredClone(row)); },
    lockByToken: async (_tx: unknown, tokenHash: string) => prechecks.find((row) => row.tokenHash === tokenHash) || null,
    update: async (_tx: unknown, id: string, patch: any) => Object.assign(prechecks.find((row) => row.id === id), structuredClone(patch)),
    $queryRaw: async () => [],
  };
  const service = createCustomerBatchService({} as any, {
    selectionService: {
      freeze: async () => ({
        customerIds: frozenCustomerIds,
        selectionHash: sha256Json(frozenCustomerIds),
        versionManifest: Object.fromEntries(frozenCustomerIds.map((customerId) => [customerId, updatedAt])),
        customerGuards: frozenCustomerIds.map((customerId) => ({
          customerId, ownerId: currentCustomer.ownerId || '', scopeEligible: true, businessRecordUpdatedAt: updatedAt,
        })),
        itemResults: frozenCustomerIds.map((customerId) => ({ customerId, status: 'ready' as const, reason: '可执行' })),
      }),
    },
    tokenStore: store,
    loadCurrentAccess: async () => currentAccess,
    lockCurrentAccess: async () => currentAccess,
    lockCustomerRecords: async () => frozenCustomerIds.map((customerId) => ({
      customer: { ...currentCustomer, id: customerId, updatedAt }, businessRecordUpdatedAt: updatedAt,
    })),
    readGuardRevisions: async () => revisions,
    lockGuardRevisions: async () => revisions,
    lockSoftDeleteScope: async () => undefined,
    readJobCustomers: async () => jobCustomerRows || frozenCustomerIds.map((customerId) => ({ customer: { ...currentCustomer, id: customerId, updatedAt } })),
    ...(!options.useDefaultOperationGuard ? { validateOperationGuard: async () => undefined } : {}),
    jobStore: {
      findExisting: async (_tx: unknown, input: any) => jobs.find((job) => (
        job.actorId === input.actorId
        && job.handlerKey === input.handlerKey
        && job.operation === input.operation
        && job.idempotencyKey === input.idempotencyKey
      )) || null,
      create: async (_tx: unknown, input: any) => {
        const duplicate = jobs.find((job) => (
          job.actorId === input.actorId
          && job.handlerKey === input.handlerKey
          && job.operation === input.operation
          && job.idempotencyKey === input.idempotencyKey
        ));
        if (duplicate) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        const job = {
          id: `job-${jobs.length + 1}`,
          type: 'customer_batch_job' as const,
          ...input,
          selectedCustomerIds: input.customerIds,
          status: 'queued',
          createdAt: now,
          totalCount: input.customerIds.length,
          frozenCustomerCount: input.customerIds.length,
        };
        jobs.push(job);
        for (const customerId of input.customerIds) items.push({ id: `item-${customerId}`, jobId: job.id, targetKey: `customer:${customerId}`, status: 'queued' });
        return { type: 'customer_batch_job' as const, id: job.id, idempotencyFingerprint: input.idempotencyFingerprint, value: job };
      },
      load: async (_tx: unknown, id: string) => {
        const job = jobs.find((row) => row.id === id);
        return job ? { type: 'customer_batch_job' as const, id: job.id, idempotencyFingerprint: job.idempotencyFingerprint, value: job } : null;
      },
      get: async (_client: unknown, id: string) => jobs.find((row) => row.id === id) || null,
      lock: async (_tx: unknown, id: string) => jobs.find((row) => row.id === id) || null,
      list: async () => jobs,
      listItems: async (_client: unknown, jobId: string) => items.filter((item) => item.jobId === jobId),
      requestCancellation: async (_tx: unknown, job: any) => jobs.find((candidate) => candidate.id === job.id) || null,
    },
    now: () => now,
    createToken: () => `token-${++tokenCounter}`,
    createId: (prefix: string) => `${prefix}-${tokenCounter}`,
  });
  return {
    service,
    jobs,
    items,
    prechecks,
    setVersion: (value: string) => { updatedAt = value; },
    setRevisions: (value: typeof revisions) => { revisions = value; },
    setAccess: (value: typeof currentAccess) => { currentAccess = value; },
    setFrozenCustomerIds: (value: string[]) => { frozenCustomerIds = value; },
    setCurrentCustomer: (value: ReturnType<typeof customer>) => { currentCustomer = value; },
    setJobCustomerRows: (value: Array<{ customer: ReturnType<typeof customer> }>) => { jobCustomerRows = value; },
  };
}

{
  const test = fixture();
  const precheck = await test.service.precheckCustomerBatch({
    handlerKey: 'customer_mutation',
    operation: 'transfer',
    selection: { mode: 'filter_snapshot', filters: { lifecycleStatusCode: 'following' } },
    input: { targetOwnerId: 'owner-b' },
    reason: '团队调整',
  }, access());
  assert.equal(precheck.totalCount, 1);
  assert.equal(precheck.executionMode, 'background');
  const created = await test.service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'click-1' }, access());
  assert.equal(created.id, 'batch-job-1');
  assert.equal(test.items.length, 1, '任务及其明细必须在同一个确认流程中创建');
  const replayed = await test.service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'click-1' }, access());
  assert.equal(replayed.id, created.id, '同一确认键重放必须返回同一任务');
  await assert.rejects(
    () => test.service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'click-2' }, access()),
    /预检确认已使用/,
  );
}

{
  const test = fixture();
  const precheck = await test.service.precheckCustomerBatch({
    handlerKey: 'customer_mutation', operation: 'transfer', selection: { mode: 'ids', customerIds: ['c-1'] }, input: { targetOwnerId: 'owner-b' }, reason: '团队调整',
  }, access());
  test.setVersion('2026-07-18T00:01:00.000Z');
  await assert.rejects(
    () => test.service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'version-changed' }, access()),
    /客户记录已变化/,
  );
  assert.equal(test.jobs.length, 0, '版本失配必须发生在任务和明细插入之前');
}

{
  const test = fixture();
  const precheck = await test.service.precheckCustomerBatch({
    handlerKey: 'customer_mutation', operation: 'transfer', selection: { mode: 'ids', customerIds: ['c-1'] }, input: { targetOwnerId: 'owner-b' }, reason: '团队调整',
  }, access());
  test.setRevisions({ lifecycleConfigRevision: 'life-2', tagCatalogRevision: 'tags-1' });
  await assert.rejects(
    () => test.service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'config-changed' }, access()),
    /配置已变化/,
  );
  assert.equal(test.jobs.length, 0, '守卫清单变化必须在插入前阻断');
}

{
  const test = fixture();
  const precheck = await test.service.precheckCustomerBatch({
    handlerKey: 'customer_mutation', operation: 'transfer', selection: { mode: 'ids', customerIds: ['c-1'] }, input: { targetOwnerId: 'owner-b' }, reason: '团队调整',
  }, access());
  test.setAccess(access(new Set([PERMISSION_KEYS.CUSTOMER_TRANSFER])));
  await assert.rejects(
    () => test.service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'permission-revoked' }, access()),
    /无权执行批量操作/,
  );
  assert.equal(test.jobs.length, 0, '消费时必须重新确认当前角色权限');
}

{
  const test = fixture();
  const precheck = await test.service.precheckCustomerBatch({
    handlerKey: 'customer_mutation', operation: 'transfer', selection: { mode: 'ids', customerIds: ['c-1'] }, input: { targetOwnerId: 'owner-b' }, reason: '团队调整',
  }, access());
  await test.service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'replay-after-leaf-revoked' }, access());
  test.setAccess(access(new Set([PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE])));
  await assert.rejects(
    () => test.service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'replay-after-leaf-revoked' }, access()),
    (error: any) => error?.statusCode === 403,
    '已消费令牌的重放也必须按当前动作叶子权限重新授权',
  );
}

{
  const test = fixture();
  test.setFrozenCustomerIds([]);
  await assert.rejects(
    () => test.service.precheckCustomerBatch({
      handlerKey: 'customer_mutation', operation: 'transfer', selection: { mode: 'ids', customerIds: ['c-1'] }, input: { targetOwnerId: 'owner-b' }, reason: '团队调整',
    }, access()),
    /没有可执行的客户/,
  );
  assert.equal(test.prechecks.length, 0, '空选择不得签发无法确认的令牌');
}

{
  const test = fixture();
  const precheck = await test.service.precheckCustomerBatch({
    handlerKey: 'customer_mutation', operation: 'transfer', selection: { mode: 'ids', customerIds: ['c-1'] }, input: { targetOwnerId: 'owner-b' }, reason: '团队调整',
  }, access());
  test.prechecks[0].guardManifest.requiredPermissionKeys = [PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE];
  await assert.rejects(
    () => test.service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'permission-manifest-changed' }, access()),
    /权限清单已变化/,
  );
  assert.equal(test.jobs.length, 0, '守卫权限清单损坏时不得插入任务');
}

{
  const test = fixture();
  const precheck = await test.service.precheckCustomerBatch({
    handlerKey: 'customer_mutation', operation: 'transfer', selection: { mode: 'ids', customerIds: ['c-1'] }, input: { targetOwnerId: 'owner-b' }, reason: '团队调整',
  }, access());
  test.setCurrentCustomer({ ...customer('c-1'), ownerId: 'owner-b' });
  await assert.rejects(
    () => test.service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'owner-scope-changed' }, access()),
    /客户范围已变化/,
  );
  assert.equal(test.jobs.length, 0, '客户归属或当前范围变化时不得插入任务');
}

{
  const test = fixture({ useDefaultOperationGuard: true });
  const precheck = await test.service.precheckCustomerBatch({
    handlerKey: 'customer_mutation', operation: 'transfer', selection: { mode: 'ids', customerIds: ['c-1'] }, input: { targetOwnerId: 'owner-b' }, reason: '团队调整',
  }, access());
  await assert.rejects(
    () => test.service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'target-outside-current-scope' }, access()),
    /目标负责人不在当前可管理范围内/,
  );
  assert.equal(test.jobs.length, 0, '目标负责人移出当前范围后不得创建任务');
}

{
  const test = fixture();
  const precheck = await test.service.precheckCustomerBatch({
    handlerKey: 'customer_mutation', operation: 'transfer', selection: { mode: 'ids', customerIds: ['c-1'] }, input: { targetOwnerId: 'owner-b' }, reason: '团队调整',
  }, access());
  const job = await test.service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'creator-cancel' }, access());
  test.setAccess(access(new Set()));
  const cancelled = await test.service.requestCustomerBatchCancellation(job.id, access(new Set()));
  assert.equal(cancelled.id, job.id, '创建者可取消自己的任务，无需额外取消叶子权限');
}

{
  const test = fixture();
  const precheck = await test.service.precheckCustomerBatch({
    handlerKey: 'customer_mutation', operation: 'transfer', selection: { mode: 'ids', customerIds: ['c-1'] }, input: { targetOwnerId: 'owner-b' }, reason: '团队调整',
  }, access());
  const job = await test.service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'operator-cancel' }, access());
  test.jobs[0].actorId = 'other-actor';
  test.setAccess(access(new Set([PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL])));
  const cancelled = await test.service.requestCustomerBatchCancellation(job.id, access(new Set([PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL])));
  assert.equal(cancelled.id, job.id, '具取消叶子权限且仍管理全部客户的操作者可以取消');
}

{
  const test = fixture();
  const precheck = await test.service.precheckCustomerBatch({
    handlerKey: 'customer_mutation', operation: 'transfer', selection: { mode: 'ids', customerIds: ['c-1'] }, input: { targetOwnerId: 'owner-b' }, reason: '团队调整',
  }, access());
  const job = await test.service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'items-current-scope' }, access());
  test.setCurrentCustomer({ ...customer('c-1'), ownerId: 'owner-b' });
  assert.equal((await test.service.getCustomerBatchJob(job.id, access()))?.id, job.id, '创建者在客户移出范围后仍可读取不含客户明细的任务摘要');
  assert.equal((await test.service.listCustomerBatchJobs(access())).some((summary) => summary.id === job.id), true, '创建者自己的摘要不能因后续转让而从列表消失');
  const items = await test.service.listCustomerBatchJobItems(job.id, access());
  assert.deepEqual(items, [], '任务明细必须过滤已移出当前读取范围的客户，不能泄露 targetKey');
}

{
  const test = fixture();
  test.jobs.push({
    id: 'job-mixed-scope', handlerKey: 'customer_mutation', operation: 'transfer', status: 'queued', selectionMode: 'ids',
    selectedCustomerIds: ['c-1', 'c-2'], actorId: 'other-actor', actorName: '其他员工', input: { targetOwnerId: 'owner-a' },
    inputHash: 'a'.repeat(64), idempotencyFingerprint: 'b'.repeat(64), reason: '审计范围测试', idempotencyKey: 'mixed-scope',
    frozenCustomerCount: 2, totalCount: 2, successCount: 0, failedCount: 0, skippedCount: 0, cancelledCount: 0, createdAt: now,
  });
  test.items.push(
    { id: 'mixed-1', jobId: 'job-mixed-scope', targetKey: 'customer:c-1', status: 'queued' },
    { id: 'mixed-2', jobId: 'job-mixed-scope', targetKey: 'customer:c-2', status: 'queued' },
  );
  test.setJobCustomerRows([
    { customer: customer('c-1') },
    { customer: { ...customer('c-2'), ownerId: 'owner-b' } },
  ]);
  const auditContext = access(new Set([PERMISSION_KEYS.CUSTOMER_BATCH_AUDIT_READ]));
  test.setAccess(auditContext);
  assert.equal((await test.service.listCustomerBatchJobs(auditContext)).some((summary) => summary.id === 'job-mixed-scope'), true, '审计读在混合范围任务中只要可读至少一位客户就应看到脱敏摘要');
  assert.equal((await test.service.getCustomerBatchJob('job-mixed-scope', auditContext))?.id, 'job-mixed-scope');
  assert.deepEqual(
    (await test.service.listCustomerBatchJobItems('job-mixed-scope', auditContext)).map((item) => item.targetKey),
    ['customer:c-1'],
    '审计明细只能保留当前范围内的客户 targetKey',
  );
}

{
  const test = fixture();
  const precheck = await test.service.precheckCustomerBatch({
    handlerKey: 'customer_mutation', operation: 'transfer', selection: { mode: 'ids', customerIds: ['c-1'] }, input: { targetOwnerId: 'owner-b' }, reason: '团队调整',
  }, access());
  const job = await test.service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'operator-outside-scope' }, access());
  test.jobs[0].actorId = 'other-actor';
  test.setAccess(access(new Set([PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL])));
  test.setCurrentCustomer({ ...customer('c-1'), ownerId: 'owner-b' });
  await assert.rejects(
    () => test.service.requestCustomerBatchCancellation(job.id, access(new Set([PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL]))),
    (error: any) => error?.statusCode === 403,
    '非创建者需要在当前范围内管理任务中的每位客户',
  );
}

console.log('customer batch service tests passed');
