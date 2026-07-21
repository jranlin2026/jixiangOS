import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import {
  CUSTOMER_ASSOCIATION_DOMAIN_ORDER,
  CUSTOMER_ASSOCIATION_DEFINITIONS,
  assertAssociationRegistryComplete,
  auditHistoricalCustomerAssociationIds,
  discoverCustomerAssociationDomains,
  findBlockingCustomerAssociations,
  hasBlockingCustomerAssociationAuditWork,
  lockCustomerAssociationScope,
} from './customerAssociationRegistry';

const customer = {
  id: 'c-1', name: '唯一客户', company: '唯一公司', phone: '13800000000', owner: '销售甲',
  ownerId: 'u-1', ownerIdentityStatus: 'resolved', customerLevel: 'L1', lifecycleStatusCode: 'following',
  totalSpent: 0, orderCount: 0,
  activityRecords: [
    { id: 'follow-1', type: 'follow', title: '跟进', operator: '销售甲', createdAt: '2026-07-17', attachments: [] },
    { id: 'activity-1', type: 'note', title: '资料', operator: '销售甲', createdAt: '2026-07-17', attachments: [{ id: 'att-1', name: '合同.pdf' }] },
  ],
  growthPath: [{ id: 'growth-1' }], growthRecords: [{ reason: '升级' }], manualTagIds: ['tag-1'],
  createdAt: '2026-07-17', updatedAt: '2026-07-17',
};

const businessRows = [
  { id: 'customer-root', domain: STORAGE_KEYS.CUSTOMERS, recordId: 'c-1', customerId: 'c-1', data: customer },
  { id: 'order-both', domain: STORAGE_KEYS.ORDERS, recordId: 'order-1', customerId: 'c-1', data: { customerId: 'c-1' } },
  { id: 'order-unknown-path', domain: STORAGE_KEYS.ORDERS, recordId: 'order-2', customerId: null, data: { orderData: { customerId: 'c-1' } } },
  { id: 'application-nested', domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: 'application-1', customerId: null, data: { orderData: { customerId: 'c-1' } } },
  { id: 'delivery-json', domain: STORAGE_KEYS.DELIVERIES, recordId: 'delivery-1', customerId: null, data: { customerId: 'c-1' } },
  { id: 'refund-top', domain: STORAGE_KEYS.REFUNDS, recordId: 'refund-1', customerId: 'c-1', data: {} },
  { id: 'recovery-json', domain: STORAGE_KEYS.RECOVERY_ORDERS, recordId: 'recovery-1', customerId: null, data: { customerId: 'c-1' } },
  { id: 'ticket-top', domain: STORAGE_KEYS.SERVICE_TICKETS, recordId: 'ticket-1', customerId: 'c-1', data: {} },
  { id: 'opportunity-json', domain: STORAGE_KEYS.OPPORTUNITIES, recordId: 'opportunity-1', customerId: null, data: { customerId: 'c-1' } },
  { id: 'commission-json', domain: STORAGE_KEYS.COMMISSIONS, recordId: 'commission-1', customerId: null, data: { customerId: 'c-1' } },
  { id: 'ai-customer', domain: STORAGE_KEYS.AI_CARDS, recordId: 'ai-1', customerId: null, data: { subjectType: 'customer', subjectId: 'c-1' } },
  { id: 'ai-lead', domain: STORAGE_KEYS.AI_CARDS, recordId: 'ai-2', customerId: null, data: { subjectType: 'lead', subjectId: 'c-1' } },
  {
    id: 'unknown-domain', domain: 'aaos_future_business', recordId: 'future-1', customerId: 'c-1',
    data: { customerId: 'c-1', orderData: { customerId: 'c-1' }, subjectType: 'customer', subjectId: 'c-1' },
  },
];

await assert.rejects(() => lockCustomerAssociationScope({
  appStorage: { upsert: async () => ({}), findUnique: async () => null },
  $queryRaw: async () => [],
  businessRecord: { findMany: async () => [{ recordId: 'merged-customer', mergedIntoId: 'main-customer', data: { id: 'merged-customer', mergedIntoId: 'main-customer' } }] },
} as any, ['merged-customer']), /CUSTOMER_ALREADY_MERGED/);

const lockQueries: string[] = [];
await lockCustomerAssociationScope({
  appStorage: { upsert: async () => ({}) },
  businessRecord: { findMany: async () => [] },
  $queryRaw: async (query: any) => {
    lockQueries.push(Array.from(query.strings || []).join('?'));
    return [];
  },
} as any, ['customer-lock-query']);
const businessLockQuery = lockQueries.find((query) => query.includes('FROM business_records')) || '';
assert.doesNotMatch(
  businessLockQuery,
  /ORDER BY domain, recordId/,
  '客户关联锁扫描不得对整张业务记录表做 filesort，客户级锁已经提供一致的锁顺序',
);

const tx = {
  businessRecord: { findMany: async () => businessRows },
  leadRecord: { findMany: async () => [{ id: 'lead-1', data: { customerId: 'c-1', name: '唯一客户' } }] },
  customerTodo: { findMany: async () => [{ id: 'todo-1', customerId: 'c-1', customerName: '唯一客户' }] },
  appStorage: {
    findUnique: async ({ where }: any) => where.key === STORAGE_KEYS.FINANCE
      ? { key: STORAGE_KEYS.FINANCE, value: { incomes: [{ id: 'income-1', customerId: 'c-1', customerName: '唯一客户' }], expenses: [] } }
      : null,
  },
};

assert.deepEqual(CUSTOMER_ASSOCIATION_DOMAIN_ORDER, [
  'lead_records', 'orders', 'order_applications', 'deliveries', 'refunds',
  'recovery_orders', 'service_tickets', 'opportunities', 'commissions_finance',
  'customer_todos', 'customer_json_subrecords', 'ai_cards',
]);
assert.ok(CUSTOMER_ASSOCIATION_DEFINITIONS.every((definition) => (
  definition.id && definition.storageModel && definition.storageDomain && definition.pathKey
  && definition.blockerLabel && definition.legacyNamePaths && definition.mergeAdapterKind
)));

const discovered = await discoverCustomerAssociationDomains(tx as any, ['c-1']);
const occurrences = new Set(discovered.map((item) => `${item.storageDomain}:${item.pathKey}:${item.recordId}`));
for (const expected of [
  `${STORAGE_KEYS.ORDERS}:customerId:order-1`,
  `${STORAGE_KEYS.ORDERS}:data.customerId:order-1`,
  `${STORAGE_KEYS.ORDER_APPLICATIONS}:data.orderData.customerId:application-1`,
  `${STORAGE_KEYS.AI_CARDS}:data.subjectId|data.subjectType=customer:ai-1`,
  'lead_records:data.customerId:lead-1',
  'customer_todos:customerId:todo-1',
  `${STORAGE_KEYS.FINANCE}:value.incomes[].customerId:income-1`,
  `${STORAGE_KEYS.CUSTOMERS}:data.activityRecords[type=follow]:c-1`,
  `${STORAGE_KEYS.CUSTOMERS}:data.activityRecords[].attachments[]:c-1`,
]) {
  assert.equal(occurrences.has(expected), true, `missing association occurrence ${expected}`);
}
assert.equal(
  discovered.some((item) => item.storageDomain === STORAGE_KEYS.AI_CARDS && item.recordId === 'ai-2'),
  false,
  'subjectId 只有 subjectType=customer 时才是客户关联',
);
assert.equal(
  discovered.find((item) => item.recordId === 'order-2')?.definitionId,
  undefined,
  '已知域的未登记路径必须 fail closed',
);
assert.equal(
  discovered.find((item) => item.recordId === 'future-1')?.definitionId,
  undefined,
  '未知域匹配稳定形状必须 fail closed',
);
assert.deepEqual(
  discovered.filter((item) => item.recordId === 'future-1').map((item) => item.pathKey).sort(),
  ['customerId', 'data.customerId', 'data.orderData.customerId', 'data.subjectId|data.subjectType=customer'].sort(),
  '未知业务域必须覆盖全部四种明确稳定 ID 形状',
);
assert.equal(
  discovered.filter((item) => item.recordId === 'order-1').length,
  2,
  '同一记录的每个稳定路径必须分别报告',
);

const blockers = await findBlockingCustomerAssociations(tx as any, 'c-1');
for (const label of ['订单关联', '订单申请关联', '交付关联', '退款关联', '挽回订单关联', '售后工单关联', '商机关联', '佣金/财务关联', '线索关联', '待办关联', '客户附件引用', 'AI 客户卡片']) {
  assert.equal(blockers.includes(label), true, `missing blocker ${label}`);
}
assert.equal(blockers.some((label) => /跟进|成长|标签/.test(label)), false, 'intrinsic 子记录不能永久阻断删除');
assert.equal(blockers.some((label) => label.includes('aaos_orders:data.orderData.customerId')), true);
assert.equal(blockers.some((label) => label.includes('aaos_future_business:data.customerId')), true);

await assert.rejects(
  () => assertAssociationRegistryComplete(tx as any, ['c-1']),
  /UNREGISTERED_CUSTOMER_ASSOCIATION_PATH:.*aaos_future_business/,
  '未知关联域必须阻断客户合并',
);
const registeredOnlyTx = {
  ...tx,
  businessRecord: {
    findMany: async () => businessRows.filter((row) => (
      row.id !== 'unknown-domain' && row.id !== 'order-unknown-path'
    )),
  },
};
await assert.doesNotReject(
  () => assertAssociationRegistryComplete(registeredOnlyTx as any, ['c-1']),
  '全部关联路径已登记时应允许进入合并预检',
);

console.log('customer association registry tests passed');

const AUDIT_AT = new Date('2026-07-17T06:00:00.000Z');
const auditBusinessRows: any[] = [
  { id: 'customer-c1', domain: STORAGE_KEYS.CUSTOMERS, recordId: 'c-1', customerId: 'c-1', updatedAt: AUDIT_AT, data: customer },
  { id: 'customer-dup-1', domain: STORAGE_KEYS.CUSTOMERS, recordId: 'c-dup-1', customerId: 'c-dup-1', updatedAt: AUDIT_AT, data: { ...customer, id: 'c-dup-1', name: '重名客户', company: '重名公司' } },
  { id: 'customer-dup-2', domain: STORAGE_KEYS.CUSTOMERS, recordId: 'c-dup-2', customerId: 'c-dup-2', updatedAt: AUDIT_AT, data: { ...customer, id: 'c-dup-2', name: '重名客户', company: '另一公司' } },
  { id: 'legacy-application', domain: STORAGE_KEYS.ORDER_APPLICATIONS, recordId: 'legacy-application', customerId: null, updatedAt: AUDIT_AT, data: { orderData: { customerName: '唯一客户' } } },
  { id: 'legacy-commission', domain: STORAGE_KEYS.COMMISSIONS, recordId: 'legacy-commission', customerId: null, updatedAt: AUDIT_AT, data: { customerName: '重名客户' } },
  { id: 'known-unknown-path', domain: STORAGE_KEYS.ORDERS, recordId: 'known-unknown-path', customerId: null, updatedAt: AUDIT_AT, data: { orderData: { customerId: 'c-1' } } },
];
let financeValue: any = {
  incomes: [
    { id: 'income-unique', customerName: '唯一客户', orderId: 'order-1' },
    { id: 'income-ambiguous', customerName: '重名客户', orderId: 'order-2' },
  ],
  expenses: [], transactions: [],
};
let financeUpdatedAt = AUDIT_AT;
let auditTodoRows: any[] = [
  { id: 'legacy-todo-unique', customerId: null, customerName: '唯一客户', updatedAt: AUDIT_AT },
  { id: 'legacy-todo-ambiguous', customerId: null, customerName: '重名客户', updatedAt: AUDIT_AT },
];
const auditCheckpoints = new Map<string, any>();
const auditAssociationLockKeys: string[] = [];
let forceBusinessConflict = false;
let beforeAuditTransaction: (() => void) | undefined;
const auditPrisma: any = {
  businessRecord: {
    findMany: async () => auditBusinessRows,
    updateMany: async ({ where, data }: any) => {
      if (forceBusinessConflict) return { count: 0 };
      const row = auditBusinessRows.find((candidate) => candidate.id === where.id);
      if (!row || row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
      Object.assign(row, data);
      row.updatedAt = new Date(row.updatedAt.getTime() + 1);
      return { count: 1 };
    },
  },
  leadRecord: { findMany: async () => [] },
  customerTodo: {
    findMany: async () => auditTodoRows,
    updateMany: async ({ where, data }: any) => {
      const row = auditTodoRows.find((candidate) => candidate.id === where.id);
      if (!row || row.updatedAt.getTime() !== where.updatedAt.getTime()) return { count: 0 };
      Object.assign(row, data);
      row.updatedAt = new Date(row.updatedAt.getTime() + 1);
      return { count: 1 };
    },
  },
  appStorage: {
    findUnique: async ({ where }: any) => {
      if (where.key === STORAGE_KEYS.FINANCE) return { key: where.key, value: financeValue, updatedAt: financeUpdatedAt };
      return auditCheckpoints.has(where.key) ? { key: where.key, value: auditCheckpoints.get(where.key), updatedAt: AUDIT_AT } : null;
    },
    updateMany: async ({ where, data }: any) => {
      if (where.key !== STORAGE_KEYS.FINANCE || where.updatedAt.getTime() !== financeUpdatedAt.getTime()) return { count: 0 };
      financeValue = data.value;
      financeUpdatedAt = new Date(financeUpdatedAt.getTime() + 1);
      return { count: 1 };
    },
    upsert: async ({ where, create, update }: any) => {
      if (String(where.key).startsWith('aaos_customer_association_lock:')) {
        auditAssociationLockKeys.push(where.key);
        return { key: where.key, value: create.value };
      }
      auditCheckpoints.set(where.key, auditCheckpoints.has(where.key) ? update.value : create.value);
      return { key: where.key, value: auditCheckpoints.get(where.key) };
    },
  },
  $queryRaw: async () => [],
  $transaction: async (operation: any) => {
    const hook = beforeAuditTransaction;
    beforeAuditTransaction = undefined;
    hook?.();
    return operation(auditPrisma);
  },
};

const dryAudit = await auditHistoricalCustomerAssociationIds(auditPrisma, {
  apply: false,
  checkpointKey: 'association-audit',
});
assert.equal(dryAudit.backfilled, 0);
assert.equal(dryAudit.backfillCandidates >= 3, true);
assert.equal(dryAudit.repairRows.some((row) => row.reason === 'CUSTOMER_IDENTITY_AMBIGUOUS'), true);
assert.equal(dryAudit.repairRows.some((row) => (
  row.storageDomain === 'customer_todos'
  && row.recordId === 'legacy-todo-ambiguous'
  && row.reason === 'CUSTOMER_IDENTITY_AMBIGUOUS'
)), true, '重名历史待办必须报告修复失败，而不是猜测归属');
assert.equal(dryAudit.repairRows.some((row) => (
  row.storageDomain === STORAGE_KEYS.ORDERS
  && row.pathKey === 'data.orderData.customerId'
  && row.reason === 'UNREGISTERED_CUSTOMER_ASSOCIATION_PATH'
)), true);
assert.equal((auditBusinessRows[3].data as any).orderData.customerId, undefined);
assert.equal(financeValue.incomes[0].customerId, undefined);
assert.equal(auditTodoRows[0].customerId, null);

const appliedAudit = await auditHistoricalCustomerAssociationIds(auditPrisma, {
  apply: true,
  checkpointKey: 'association-audit',
});
assert.equal(appliedAudit.backfilled >= 3, true);
assert.equal((auditBusinessRows[3].data as any).orderData.customerId, 'c-1');
assert.equal(financeValue.incomes[0].customerId, 'c-1');
assert.equal(financeValue.incomes[1].customerId, undefined, '重名 legacy row 不得猜测客户');
assert.equal(auditTodoRows[0].customerId, 'c-1', '唯一匹配的历史待办必须补齐稳定 customerId');
assert.equal(auditTodoRows[1].customerId, null, '重名历史待办不得猜测 customerId');
assert.equal(auditCheckpoints.get('association-audit').completed, true);
assert.ok(
  auditAssociationLockKeys.includes('aaos_customer_association_lock:c-1'),
  '历史关联修复写入稳定 customerId 前必须取得同一客户关联锁',
);

const todoBlockersAfterAudit = await findBlockingCustomerAssociations({
  businessRecord: { findMany: async () => [] },
  leadRecord: { findMany: async () => [] },
  customerTodo: { findMany: async () => auditTodoRows },
  appStorage: { findUnique: async () => null },
} as any, 'c-1');
assert.equal(todoBlockersAfterAudit.includes('待办关联'), true, '补齐稳定 ID 后待办必须进入删除阻断扫描');

// 模拟预检后、事务开始前另一客户被改成相同名称。审计不得继续把旧的
// 唯一匹配写入稳定 ID，必须将这条记录留给人工修复。
const auditRaceName = '预检后重复名称';
const raceSourceCustomer = {
  id: 'customer-race-source', domain: STORAGE_KEYS.CUSTOMERS, recordId: 'customer-race-source',
  customerId: 'customer-race-source', updatedAt: AUDIT_AT,
  data: { id: 'customer-race-source', name: auditRaceName, company: '唯一来源公司' },
};
const raceTodo = { id: 'legacy-todo-race', customerId: null, customerName: auditRaceName, updatedAt: AUDIT_AT };
auditBusinessRows.push(raceSourceCustomer);
auditTodoRows.push(raceTodo);
beforeAuditTransaction = () => {
  auditBusinessRows.push({
    id: 'customer-race-duplicate', domain: STORAGE_KEYS.CUSTOMERS, recordId: 'customer-race-duplicate',
    customerId: 'customer-race-duplicate', updatedAt: AUDIT_AT,
    data: { id: 'customer-race-duplicate', name: auditRaceName, company: '并发改名客户' },
  });
};
const raceAudit = await auditHistoricalCustomerAssociationIds(auditPrisma, {
  apply: true,
  checkpointKey: 'association-race',
});
assert.equal(raceAudit.backfilled, 0, '事务内名称不再唯一时不得回填任何稳定 customerId');
assert.equal(raceTodo.customerId, null, '预检候选在事务内变成重名后必须保持未关联');
assert.equal(raceAudit.repairRows.some((row) => (
  row.storageDomain === 'customer_todos'
  && row.recordId === 'legacy-todo-race'
  && row.reason === 'CUSTOMER_IDENTITY_AMBIGUOUS'
)), true, '事务内重名必须标记为人工修复项');

auditCheckpoints.delete('association-conflict');
delete (auditBusinessRows[3].data as any).orderData.customerId;
forceBusinessConflict = true;
await assert.rejects(
  () => auditHistoricalCustomerAssociationIds(auditPrisma, { apply: true, checkpointKey: 'association-conflict' }),
  /并发更新/,
);
assert.equal(auditCheckpoints.has('association-conflict'), false, 'CAS 失败不得推进 checkpoint');
forceBusinessConflict = false;

const unconvertedLeadAudit = await auditHistoricalCustomerAssociationIds({
  businessRecord: {
    findMany: async () => [{
      id: 'customer-unconverted-name-match',
      domain: STORAGE_KEYS.CUSTOMERS,
      recordId: 'customer-unconverted-name-match',
      customerId: 'customer-unconverted-name-match',
      updatedAt: AUDIT_AT,
      data: {
        ...customer,
        id: 'customer-unconverted-name-match',
        name: '尚未转客户的同名线索',
      },
    }],
  },
  leadRecord: {
    findMany: async () => [{
      id: 'lead-pending-name-match',
      data: {
        id: 'lead-pending-name-match',
        name: '尚未转客户的同名线索',
        status: '新线索',
        lifecycleStatusCode: 'pending_followup',
      },
      updatedAt: AUDIT_AT,
    }],
  },
  customerTodo: { findMany: async () => [] },
  appStorage: { findUnique: async () => null },
} as any, { apply: false });
assert.equal(unconvertedLeadAudit.backfillCandidates, 0, '未转客户线索不得仅凭姓名生成客户关联回填');
assert.deepEqual(unconvertedLeadAudit.repairRows, [], '未转客户线索缺少 customerId 是正常状态');

const convertedLeadMissingReferenceAudit = await auditHistoricalCustomerAssociationIds({
  businessRecord: {
    findMany: async () => [{
      id: 'customer-converted-lead',
      domain: STORAGE_KEYS.CUSTOMERS,
      recordId: 'customer-converted-lead',
      customerId: 'customer-converted-lead',
      updatedAt: AUDIT_AT,
      data: { ...customer, id: 'customer-converted-lead', name: '已转客户线索' },
    }],
  },
  leadRecord: {
    findMany: async () => [{
      id: 'lead-converted-reference-lost',
      data: {
        id: 'lead-converted-reference-lost',
        name: '已转客户线索',
        changeHistory: [{
          changes: [{ field: 'customerId', oldValue: null, newValue: 'customer-converted-lead' }],
        }],
      },
      updatedAt: AUDIT_AT,
    }],
  },
  customerTodo: { findMany: async () => [] },
  appStorage: { findUnique: async () => null },
} as any, { apply: false });
assert.deepEqual(convertedLeadMissingReferenceAudit.repairRows, [{
  storageDomain: 'lead_records',
  pathKey: 'data.customerId',
  recordId: 'lead-converted-reference-lost',
  reason: 'CUSTOMER_REFERENCE_MISSING',
}], '转换历史已记录稳定客户 ID 时，不得忽略丢失的线索关联');

const canonicalApplicationAudit = await auditHistoricalCustomerAssociationIds({
  businessRecord: {
    findMany: async () => [
      {
        id: 'customer-application-canonical',
        domain: STORAGE_KEYS.CUSTOMERS,
        recordId: 'customer-application-canonical',
        customerId: 'customer-application-canonical',
        updatedAt: AUDIT_AT,
        data: { ...customer, id: 'customer-application-canonical', name: '规范订单客户' },
      },
      {
        id: 'application-canonical',
        domain: STORAGE_KEYS.ORDER_APPLICATIONS,
        recordId: 'application-canonical',
        customerId: 'customer-application-canonical',
        updatedAt: AUDIT_AT,
        data: {
          orderData: {
            customerId: 'customer-application-canonical',
            customerName: '规范订单客户',
          },
        },
      },
    ],
  },
  leadRecord: { findMany: async () => [] },
  customerTodo: { findMany: async () => [] },
  appStorage: { findUnique: async () => null },
} as any, { apply: false });
assert.equal(canonicalApplicationAudit.backfillCandidates, 0, '订单申请不得要求非规范 data.customerId 副本');
assert.deepEqual(canonicalApplicationAudit.repairRows, []);

const danglingReferenceAudit = await auditHistoricalCustomerAssociationIds({
  businessRecord: {
    findMany: async () => [
      {
        id: 'customer-reference-source',
        domain: STORAGE_KEYS.CUSTOMERS,
        recordId: 'customer-reference-source',
        customerId: 'customer-reference-source',
        updatedAt: AUDIT_AT,
        data: { ...customer, id: 'customer-reference-source' },
      },
      {
        id: 'refund-dangling-reference',
        domain: STORAGE_KEYS.REFUNDS,
        recordId: 'refund-dangling-reference',
        customerId: 'customer-does-not-exist',
        updatedAt: AUDIT_AT,
        data: { customerId: 'customer-does-not-exist', customerName: '历史退款客户' },
      },
    ],
  },
  leadRecord: { findMany: async () => [] },
  customerTodo: { findMany: async () => [] },
  appStorage: { findUnique: async () => null },
} as any, { apply: false });
assert.deepEqual(
  danglingReferenceAudit.repairRows.map((row) => `${row.pathKey}:${String(row.reason)}`).sort(),
  [
    'customerId:CUSTOMER_REFERENCE_NOT_FOUND',
    'data.customerId:CUSTOMER_REFERENCE_NOT_FOUND',
  ],
  '非空 customerId 也必须校验其客户是否真实存在',
);

const conflictingReferenceAudit = await auditHistoricalCustomerAssociationIds({
  businessRecord: {
    findMany: async () => [
      {
        id: 'customer-conflict-one', domain: STORAGE_KEYS.CUSTOMERS,
        recordId: 'customer-conflict-one', customerId: 'customer-conflict-one', updatedAt: AUDIT_AT,
        data: { ...customer, id: 'customer-conflict-one', name: '冲突客户一' },
      },
      {
        id: 'customer-conflict-two', domain: STORAGE_KEYS.CUSTOMERS,
        recordId: 'customer-conflict-two', customerId: 'customer-conflict-two', updatedAt: AUDIT_AT,
        data: { ...customer, id: 'customer-conflict-two', name: '冲突客户二' },
      },
      {
        id: 'order-conflicting-reference', domain: STORAGE_KEYS.ORDERS,
        recordId: 'order-conflicting-reference', customerId: 'customer-conflict-one', updatedAt: AUDIT_AT,
        data: { customerId: 'customer-conflict-two', customerName: '冲突客户一' },
      },
    ],
  },
  leadRecord: { findMany: async () => [] },
  customerTodo: { findMany: async () => [] },
  appStorage: { findUnique: async () => null },
} as any, { apply: false });
assert.deepEqual(
  conflictingReferenceAudit.repairRows.map((row) => `${row.pathKey}:${String(row.reason)}`).sort(),
  [
    'customerId:CUSTOMER_REFERENCE_CONFLICT',
    'data.customerId:CUSTOMER_REFERENCE_CONFLICT',
  ],
  '同一业务记录的稳定客户 ID 不一致时必须阻止发布',
);

const unknownDanglingPathAudit = await auditHistoricalCustomerAssociationIds({
  businessRecord: {
    findMany: async () => [{
      id: 'future-domain-dangling',
      domain: 'aaos_future_customer_business',
      recordId: 'future-domain-dangling',
      customerId: 'customer-future-ghost',
      updatedAt: AUDIT_AT,
      data: {},
    }],
  },
  leadRecord: { findMany: async () => [] },
  customerTodo: { findMany: async () => [] },
  appStorage: { findUnique: async () => null },
} as any, { apply: false });
assert.deepEqual(
  unknownDanglingPathAudit.repairRows.map((row) => `${row.pathKey}:${String(row.reason)}`),
  ['customerId:UNREGISTERED_CUSTOMER_ASSOCIATION_PATH'],
  '未知业务域即使引用不存在客户也必须 fail closed',
);

const formalOrderCommissionRows = [
  {
    id: 'customer-formal-order', domain: STORAGE_KEYS.CUSTOMERS,
    recordId: 'customer-formal-order', customerId: 'customer-formal-order', updatedAt: AUDIT_AT,
    data: { ...customer, id: 'customer-formal-order', name: '正式订单客户' },
  },
  {
    id: 'order-formal-source', domain: STORAGE_KEYS.ORDERS,
    recordId: 'order-formal-source', customerId: 'customer-formal-order', updatedAt: AUDIT_AT,
    data: { customerId: 'customer-formal-order', customerName: '正式订单客户' },
  },
  {
    id: 'commission-missing-stable-customer', domain: STORAGE_KEYS.COMMISSIONS,
    recordId: 'commission-missing-stable-customer', customerId: null, updatedAt: AUDIT_AT,
    data: {
      id: 'commission-missing-stable-customer',
      orderId: 'order-formal-source',
      customerName: '正式订单客户',
      sourceBusinessType: 'formal_order',
    },
  },
];
const formalOrderCommissionPrisma: any = {
  businessRecord: {
    findMany: async ({ where }: any = {}) => where?.domain
      ? formalOrderCommissionRows.filter((row) => row.domain === where.domain)
      : formalOrderCommissionRows,
    findUnique: async ({ where }: any) => formalOrderCommissionRows.find((row) => (
      row.domain === where.domain_recordId.domain
      && row.recordId === where.domain_recordId.recordId
    )) || null,
    updateMany: async ({ where, data }: any) => {
      const row = formalOrderCommissionRows.find((item) => item.id === where.id && item.updatedAt === where.updatedAt);
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  },
  leadRecord: { findMany: async () => [] },
  customerTodo: { findMany: async () => [] },
  appStorage: {
    findUnique: async () => null,
    upsert: async ({ create }: any) => create,
  },
  $queryRaw: async () => [],
  $transaction: async (operation: any) => operation(formalOrderCommissionPrisma),
};
const formalOrderCommissionAudit = await auditHistoricalCustomerAssociationIds(formalOrderCommissionPrisma, { apply: false });
assert.equal(formalOrderCommissionAudit.backfillCandidates, 1, '正式订单佣金应从来源订单回填唯一稳定 customerId');
assert.deepEqual(formalOrderCommissionAudit.repairRows, []);
assert.equal(hasBlockingCustomerAssociationAuditWork(formalOrderCommissionAudit), true, '待回填候选也必须阻止发布');
const appliedFormalOrderCommissionAudit = await auditHistoricalCustomerAssociationIds(
  formalOrderCommissionPrisma,
  { apply: true, checkpointKey: 'formal-order-commission-audit' },
);
assert.equal(appliedFormalOrderCommissionAudit.backfilled, 1);
assert.equal(hasBlockingCustomerAssociationAuditWork(appliedFormalOrderCommissionAudit), false, '已成功应用的候选不应使 --apply 误报失败');
assert.equal(formalOrderCommissionRows[2].customerId, 'customer-formal-order');
assert.equal('customerId' in formalOrderCommissionRows[2].data, false, 'Commission JSON 不得写入不存在的 customerId 副本');
const cleanFormalOrderCommissionAudit = await auditHistoricalCustomerAssociationIds(
  formalOrderCommissionPrisma,
  { apply: false },
);
assert.equal(hasBlockingCustomerAssociationAuditWork(cleanFormalOrderCommissionAudit), false);

const conflictingCommissionSourceAudit = await auditHistoricalCustomerAssociationIds({
  businessRecord: {
    findMany: async () => [
      {
        id: 'customer-commission-source-a', domain: STORAGE_KEYS.CUSTOMERS,
        recordId: 'customer-commission-source-a', customerId: 'customer-commission-source-a', updatedAt: AUDIT_AT,
        data: { ...customer, id: 'customer-commission-source-a', name: '佣金来源客户A' },
      },
      {
        id: 'customer-commission-data-b', domain: STORAGE_KEYS.CUSTOMERS,
        recordId: 'customer-commission-data-b', customerId: 'customer-commission-data-b', updatedAt: AUDIT_AT,
        data: { ...customer, id: 'customer-commission-data-b', name: '佣金快照客户B' },
      },
      {
        id: 'order-commission-source-a', domain: STORAGE_KEYS.ORDERS,
        recordId: 'order-commission-source-a', customerId: 'customer-commission-source-a', updatedAt: AUDIT_AT,
        data: { customerId: 'customer-commission-source-a', customerName: '佣金来源客户A' },
      },
      {
        id: 'commission-source-conflict', domain: STORAGE_KEYS.COMMISSIONS,
        recordId: 'commission-source-conflict', customerId: null, updatedAt: AUDIT_AT,
        data: {
          id: 'commission-source-conflict',
          orderId: 'order-commission-source-a',
          customerId: 'customer-commission-data-b',
        },
      },
    ],
  },
  leadRecord: { findMany: async () => [] },
  customerTodo: { findMany: async () => [] },
  appStorage: { findUnique: async () => null },
} as any, { apply: false });
assert.equal(conflictingCommissionSourceAudit.backfillCandidates, 0, '来源订单与佣金 JSON 客户冲突时不得自动回填');
assert.ok(conflictingCommissionSourceAudit.repairRows.some((row) => (
  row.recordId === 'commission-source-conflict'
  && row.pathKey === 'data.customerId'
  && row.reason === 'CUSTOMER_REFERENCE_CONFLICT'
)));

const missingFormalOrderCommissionAudit = await auditHistoricalCustomerAssociationIds({
  businessRecord: {
    findMany: async () => [{
      id: 'commission-missing-formal-order',
      domain: STORAGE_KEYS.COMMISSIONS,
      recordId: 'commission-missing-formal-order',
      customerId: null,
      updatedAt: AUDIT_AT,
      data: {
        id: 'commission-missing-formal-order',
        orderId: 'order-no-longer-exists',
        sourceBusinessType: 'formal_order',
      },
    }],
  },
  leadRecord: { findMany: async () => [] },
  customerTodo: { findMany: async () => [] },
  appStorage: { findUnique: async () => null },
} as any, { apply: false });
assert.ok(missingFormalOrderCommissionAudit.repairRows.some((row) => (
  row.recordId === 'commission-missing-formal-order'
  && row.pathKey === 'customerId'
  && row.reason === 'CUSTOMER_REFERENCE_NOT_FOUND'
)), '正式订单佣金的来源订单缺失时必须阻止发布');

const wrongExistingCommissionCustomerAudit = await auditHistoricalCustomerAssociationIds({
  businessRecord: {
    findMany: async () => [
      {
        id: 'customer-order-authority', domain: STORAGE_KEYS.CUSTOMERS,
        recordId: 'customer-order-authority', customerId: 'customer-order-authority', updatedAt: AUDIT_AT,
        data: { ...customer, id: 'customer-order-authority', name: '订单权威客户' },
      },
      {
        id: 'customer-wrong-commission', domain: STORAGE_KEYS.CUSTOMERS,
        recordId: 'customer-wrong-commission', customerId: 'customer-wrong-commission', updatedAt: AUDIT_AT,
        data: { ...customer, id: 'customer-wrong-commission', name: '错误佣金客户' },
      },
      {
        id: 'order-customer-authority', domain: STORAGE_KEYS.ORDERS,
        recordId: 'order-customer-authority', customerId: 'customer-order-authority', updatedAt: AUDIT_AT,
        data: { customerId: 'customer-order-authority' },
      },
      {
        id: 'commission-wrong-existing-customer', domain: STORAGE_KEYS.COMMISSIONS,
        recordId: 'commission-wrong-existing-customer', customerId: 'customer-wrong-commission', updatedAt: AUDIT_AT,
        data: { orderId: 'order-customer-authority', sourceBusinessType: 'formal_order' },
      },
    ],
  },
  leadRecord: { findMany: async () => [] },
  customerTodo: { findMany: async () => [] },
  appStorage: { findUnique: async () => null },
} as any, { apply: false });
assert.ok(wrongExistingCommissionCustomerAudit.repairRows.some((row) => (
  row.recordId === 'commission-wrong-existing-customer'
  && row.pathKey === 'customerId'
  && row.reason === 'CUSTOMER_REFERENCE_CONFLICT'
)), '佣金已有的有效客户 ID 也必须与来源订单交叉校验');

console.log('customer association audit tests passed');
