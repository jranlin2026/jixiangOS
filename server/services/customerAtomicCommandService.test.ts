import assert from 'node:assert/strict';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { createCustomerAtomicCommandService } from './customerCommandService';

const customer = {
  id: 'c-1', name: '客户甲', company: '公司甲', phone: '13800138000', owner: '销售甲', ownerId: 'u-1',
  ownerIdentityStatus: 'resolved' as const, customerLevel: 'L1' as const, lifecycleStatusCode: 'following' as const,
  totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], activityRecords: [],
  createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-17T00:00:00.000Z',
};

let saved: any = null;
let savedLead: any = null;
let cancelledTodo: any = null;
const transaction = { marker: 'caller-owned-tx' } as any;
transaction.appStorage = {
  upsert: async () => undefined,
  findUnique: async () => ({ value: [] }),
};
transaction.$queryRaw = async (query: any) => {
  const text = String(query?.strings?.join(' ') || '');
  if (text.includes('lead_records')) {
    return [{
      id: 'lead-linked-by-id',
      data: {
        id: 'lead-1', customerId: 'c-1', name: '客户甲', owner: '销售甲', ownerId: 'u-1',
        assignedTo: '销售甲', assignedToId: 'u-1', changeHistory: [],
      },
    }];
  }
  if (text.includes('business_records') && text.includes('recordId')) {
    return [{ id: 'row-c-1', domain: 'aaos_customers', recordId: 'c-1', data: customer, updatedAt: new Date('2026-07-17T00:00:00.000Z') }];
  }
  return [];
};
transaction.businessRecord = {
  updateMany: async ({ data }: any) => { saved = data.data; return { count: 1 }; },
};
transaction.leadRecord = { update: async ({ data }: any) => { savedLead = data.data; return data; } };
transaction.customerTodo = {
  updateMany: async ({ data }: any) => { cancelledTodo = data; return { count: 2 }; },
  create: async () => ({ id: 'todo-1' }),
};
transaction.user = {
  findUnique: async ({ where }: any) => where.id === 'u-1'
    ? { id: 'u-1', name: '销售甲', isActive: true, employmentStatus: 'active' }
    : { id: 'u-2', name: '销售乙', isActive: true, employmentStatus: 'active' },
};

let audit: any = null;
const commands = createCustomerAtomicCommandService({
  auditAppender: {
    append: async (tx, event) => {
      assert.equal(tx, transaction, '审计必须使用调用方拥有的同一事务');
      audit = event;
      return { id: 'audit-1' };
    },
  },
  now: () => new Date('2026-07-17T01:00:00.000Z'),
  createId: () => 'fixed',
});

const result = await commands.execute({
  action: 'release_to_pool', customerId: 'c-1', reason: '客户主动放弃',
}, {
  tx: transaction,
  actor: { id: 'u-1', name: '销售甲' },
  access: {
    actorId: 'u-1', actorName: '销售甲', readableUserIds: new Set(['u-1']), legacyReadableNames: new Set(['销售甲']),
    manageableOwnerIds: new Set(['u-1']), canReadPublicPool: false,
    grantedPermissions: new Set([PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL]),
  },
  idempotencyKey: 'job-1:c-1',
});

assert.equal(result.cancelledTodoCount, 2);
assert.equal(saved.owner, '公海');
assert.equal(saved.ownerIdentityStatus, 'public_pool');
assert.equal(audit.reason, '客户主动放弃');
assert.equal(audit.idempotencyKey, 'job-1:c-1');
assert.equal(audit.beforeSnapshot.owner, '销售甲');
assert.equal(audit.afterSnapshot.owner, '公海');
assert.deepEqual(audit.actor, { id: 'u-1', name: '销售甲' });
assert.equal(cancelledTodo.canceledById, 'u-1');
assert.equal(cancelledTodo.canceledByName, '销售甲');
assert.equal(savedLead.customerId, 'c-1');
assert.equal(savedLead.owner, '公海');

await assert.rejects(
  () => commands.execute({ action: 'release_to_pool', customerId: 'c-1', reason: '' }, {
    tx: transaction, actor: { id: 'u-1', name: '销售甲' },
    access: { actorId: 'u-1', actorName: '销售甲', readableUserIds: new Set(), legacyReadableNames: new Set(), manageableOwnerIds: new Set(), canReadPublicPool: false, grantedPermissions: new Set() },
  }),
  /操作原因不能为空/,
);

function createAtomicFixture(options: {
  auditFails?: boolean;
  blockedAssociation?: boolean;
  customerOverrides?: Record<string, unknown>;
  lifecycleConfigOverride?: unknown;
} = {}) {
  let source = { ...structuredClone(customer), ...(options.customerOverrides || {}) };
  let savedCustomer: any = null;
  let todoMutation: any = null;
  let createdTodo: any = null;
  let auditEvent: any = null;
  const lifecycleConfig = options.lifecycleConfigOverride || {
    statuses: [
      { id: 'following', code: 'following', name: '跟进中', color: '#2196F3', isActive: true, sortOrder: 1, createdAt: '', updatedAt: '' },
      { id: 'pending', code: 'pending_followup', name: '待跟进', color: '#999', isActive: true, sortOrder: 2, createdAt: '', updatedAt: '' },
    ],
    enabledStatusCodes: ['following', 'pending_followup'],
    transitions: { following: ['pending_followup'], pending_followup: ['following'] },
  };
  const tagGroup = { id: 'group-1', name: '客户级别', color: '#1677ff', selectionMode: 'single', scope: 'customer', isActive: true, sortOrder: 1 };
  const tag = { id: 'tag-1', groupId: 'group-1', name: '重点客户', color: '#1677ff', isActive: true, sortOrder: 1 };
  const conflictingTag = { id: 'tag-2', groupId: 'group-1', name: '普通客户', color: '#94a3b8', isActive: true, sortOrder: 2 };
  const tx = { marker: `atomic-${Math.random()}` } as any;
  tx.appStorage = {
    upsert: async () => undefined,
    findUnique: async () => null,
  };
  tx.$queryRaw = async (query: any) => {
    const text = String(query?.strings?.join(' ') || '');
    if (text.includes('business_records') && text.includes('recordId')) {
      return [{ id: 'row-c-1', domain: 'aaos_customers', recordId: 'c-1', data: source, updatedAt: new Date('2026-07-17T00:00:00.000Z') }];
    }
    if (text.includes('app_storage') && text.includes('value')) {
      return [{ key: 'lifecycle_status_configs', value: lifecycleConfig }];
    }
    return [];
  };
  tx.businessRecord = {
    findMany: async ({ where }: any = {}) => {
      if (!where?.domain) return [{ id: 'root', domain: 'aaos_customers', recordId: 'c-1', customerId: 'c-1', data: source }];
      if (where.domain === 'aaos_tag_groups') return [{ data: tagGroup }];
      if (where.domain === 'aaos_tags') return [{ data: tag }, { data: conflictingTag }];
      if (where.domain === 'aaos_customers') return [{ id: 'root', domain: 'aaos_customers', recordId: 'c-1', customerId: 'c-1', data: source }];
      return [];
    },
    updateMany: async ({ data }: any) => { source = data.data; savedCustomer = data.data; return { count: 1 }; },
  };
  tx.leadRecord = { findMany: async () => [], update: async () => undefined };
  tx.customerTodo = {
    findMany: async () => options.blockedAssociation ? [{ id: 'todo-blocker', customerId: 'c-1' }] : [],
    updateMany: async ({ data }: any) => { todoMutation = data; return { count: 1 }; },
    create: async ({ data }: any) => (createdTodo = { ...data, id: 'todo-created' }),
  };
  tx.user = {
    findUnique: async ({ where }: any) => where.id === 'u-target'
      ? { id: 'u-target', name: '销售乙', role: '销售顾问', roleId: 'role-sales', isActive: true, employmentStatus: 'active' }
      : { id: 'u-1', name: '销售甲', role: '销售顾问', roleId: 'role-sales', isActive: true, employmentStatus: 'active' },
  };
  const service = createCustomerAtomicCommandService({
    now: () => new Date('2026-07-17T02:00:00.000Z'),
    createId: () => 'fixed',
    auditAppender: {
      append: async (auditTx, event) => {
        assert.equal(auditTx, tx, '每个命令的审计必须复用调用方事务');
        if (options.auditFails) throw new Error('audit write failed');
        auditEvent = event;
        return { id: `audit-${event.operation}` };
      },
    },
  });
  return {
    service, tx, get: () => ({ savedCustomer, todoMutation, createdTodo, auditEvent }),
    context: {
      tx,
      actor: { id: 'u-1', name: '伪造姓名不得生效' },
      access: {
        actorId: 'u-1', actorName: '销售甲', readableUserIds: new Set(['u-1']), legacyReadableNames: new Set(['销售甲']),
        manageableOwnerIds: new Set(['u-1', 'u-target']), canReadPublicPool: true,
        grantedPermissions: new Set([
          PERMISSION_KEYS.CUSTOMER_TRANSFER,
          PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL,
          PERMISSION_KEYS.CUSTOMER_SET_PROGRESS,
          PERMISSION_KEYS.CUSTOMER_SET_TAGS,
          PERMISSION_KEYS.CUSTOMER_SET_TODOS,
          PERMISSION_KEYS.CUSTOMER_DELETE,
        ]),
      },
      roles: [{
        id: 'role-sales', name: '销售顾问', code: 'sales_consultant', isActive: true,
        permissions: [{ module: PERMISSION_KEYS.LEADS_FOLLOW, actions: ['read', 'write'] }],
      }] as any,
    },
  };
}

// 六种命令各自写入客户、待办和审计；批量调用只需复用同一口径。
{
  const fixture = createAtomicFixture();
  const result = await fixture.service.execute({ action: 'transfer', customerId: 'c-1', targetOwnerId: 'u-target', reason: '分配客户' }, fixture.context);
  assert.equal(result.reassignedTodoCount, 1);
  assert.equal(fixture.get().savedCustomer.ownerId, 'u-target');
  assert.equal(fixture.get().todoMutation.assigneeId, 'u-target');
  assert.equal(fixture.get().auditEvent.actor.id, 'u-1');
}
{
  const fixture = createAtomicFixture();
  const result = await fixture.service.execute({ action: 'set_progress', customerId: 'c-1', lifecycleStatusCode: 'pending_followup', reason: '已联系' }, fixture.context);
  assert.equal(result.customer.lifecycleStatusCode, 'pending_followup');
  await assert.rejects(
    () => fixture.service.execute({ action: 'set_progress', customerId: 'c-1', lifecycleStatusCode: 'public_pool', reason: '不能手设' }, fixture.context),
    /系统状态/,
  );
}

// 历史客户和旧配置都可能只保存中文展示名。原子进展命令必须先把两端
// 归一为稳定码，再按同一张图校验，并把稳定码写回客户记录。
{
  const fixture = createAtomicFixture({
    customerOverrides: { lifecycleStatusCode: '未转商机' },
    lifecycleConfigOverride: [
      { id: 'legacy-pending', name: '未转商机', color: '#999', isActive: true, sortOrder: 1, createdAt: '', updatedAt: '' },
      { id: 'legacy-following', name: '商机跟进中', color: '#369', isActive: true, sortOrder: 2, createdAt: '', updatedAt: '' },
    ],
  });
  const result = await fixture.service.execute({
    action: 'set_progress', customerId: 'c-1', lifecycleStatusCode: '商机跟进中', reason: '开始跟进',
  }, fixture.context);

  assert.equal(result.customer.lifecycleStatusCode, 'following');
  assert.equal(fixture.get().savedCustomer.lifecycleStatusCode, 'following');
  await assert.rejects(
    () => fixture.service.execute({
      action: 'set_progress', customerId: 'c-1', lifecycleStatusCode: '已流失', reason: '不得手设系统状态',
    }, fixture.context),
    /系统状态/,
  );
}
{
  const fixture = createAtomicFixture();
  const result = await fixture.service.execute({ action: 'update_tags', customerId: 'c-1', mode: 'add', tagIds: ['tag-1'], reason: '标记重点' }, fixture.context);
  assert.deepEqual(result.customer.manualTagIds, ['tag-1']);
  assert.deepEqual(result.customer.tags, ['重点客户']);
  const removed = await fixture.service.execute({ action: 'update_tags', customerId: 'c-1', mode: 'remove', tagIds: ['tag-1'], reason: '取消重点' }, fixture.context);
  assert.deepEqual(removed.customer.manualTagIds, []);
  await assert.rejects(
    () => fixture.service.execute({ action: 'update_tags', customerId: 'c-1', mode: 'add', tagIds: ['tag-1', 'tag-2'], reason: '单选冲突' }, fixture.context),
    /只能选择一项/,
  );
}
{
  const fixture = createAtomicFixture();
  const result = await fixture.service.execute({ action: 'add_todo', customerId: 'c-1', title: '回访', content: '电话确认', dueAt: '2026-07-18T02:00:00.000Z', executionMethod: 'phone', reason: '安排回访' }, fixture.context);
  assert.equal(result.createdTodoId, 'todo-created');
  assert.equal(fixture.get().createdTodo.createdById, 'u-1');
}
{
  const fixture = createAtomicFixture();
  const result = await fixture.service.execute({ action: 'soft_delete', customerId: 'c-1', confirmed: true, reason: '重复测试数据' }, fixture.context);
  assert.equal(result.customer.deletedBy, '销售甲');
}
{
  const fixture = createAtomicFixture({ blockedAssociation: true });
  await assert.rejects(
    () => fixture.service.execute({ action: 'soft_delete', customerId: 'c-1', confirmed: true, reason: '不得绕过关联' }, fixture.context),
    /待办关联/,
  );
}
{
  const fixture = createAtomicFixture({ auditFails: true });
  await assert.rejects(
    () => fixture.service.execute({ action: 'release_to_pool', customerId: 'c-1', reason: '审计失败需整体回滚' }, fixture.context),
    /audit write failed/,
  );
}

console.log('customer atomic command service tests passed');
