import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import {
  CUSTOMER_ASSOCIATION_DOMAIN_ORDER,
  CUSTOMER_ASSOCIATION_DEFINITIONS,
  auditHistoricalCustomerAssociationIds,
  discoverCustomerAssociationDomains,
  findBlockingCustomerAssociations,
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
const auditCheckpoints = new Map<string, any>();
let forceBusinessConflict = false;
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
  customerTodo: { findMany: async () => [] },
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
      auditCheckpoints.set(where.key, auditCheckpoints.has(where.key) ? update.value : create.value);
      return { key: where.key, value: auditCheckpoints.get(where.key) };
    },
  },
  $transaction: async (operation: any) => operation(auditPrisma),
};

const dryAudit = await auditHistoricalCustomerAssociationIds(auditPrisma, {
  apply: false,
  checkpointKey: 'association-audit',
});
assert.equal(dryAudit.backfilled, 0);
assert.equal(dryAudit.backfillCandidates >= 2, true);
assert.equal(dryAudit.repairRows.some((row) => row.reason === 'CUSTOMER_IDENTITY_AMBIGUOUS'), true);
assert.equal(dryAudit.repairRows.some((row) => (
  row.storageDomain === STORAGE_KEYS.ORDERS
  && row.pathKey === 'data.orderData.customerId'
  && row.reason === 'UNREGISTERED_CUSTOMER_ASSOCIATION_PATH'
)), true);
assert.equal((auditBusinessRows[3].data as any).orderData.customerId, undefined);
assert.equal(financeValue.incomes[0].customerId, undefined);

const appliedAudit = await auditHistoricalCustomerAssociationIds(auditPrisma, {
  apply: true,
  checkpointKey: 'association-audit',
});
assert.equal(appliedAudit.backfilled >= 2, true);
assert.equal((auditBusinessRows[3].data as any).orderData.customerId, 'c-1');
assert.equal(financeValue.incomes[0].customerId, 'c-1');
assert.equal(financeValue.incomes[1].customerId, undefined, '重名 legacy row 不得猜测客户');
assert.equal(auditCheckpoints.get('association-audit').completed, true);

auditCheckpoints.delete('association-conflict');
delete (auditBusinessRows[3].data as any).orderData.customerId;
forceBusinessConflict = true;
await assert.rejects(
  () => auditHistoricalCustomerAssociationIds(auditPrisma, { apply: true, checkpointKey: 'association-conflict' }),
  /并发更新/,
);
assert.equal(auditCheckpoints.has('association-conflict'), false, 'CAS 失败不得推进 checkpoint');
forceBusinessConflict = false;

console.log('customer association audit tests passed');
