import assert from 'node:assert/strict';
import {
  CUSTOMER_MERGE_FIELDS,
  isCustomerMergeExecutionInput,
} from '../../src/types/customerMerge';
import {
  buildCustomerMergeInputHash,
  buildCustomerMergeUndoInputHash,
  buildLockOrder,
  createCustomerMergeService,
  requiredFieldDecisions,
  validateMergeSelection,
} from './customerMergeService';

assert.deepEqual(CUSTOMER_MERGE_FIELDS, [
  'name', 'phone', 'wechat', 'email', 'company', 'customerLevel', 'industry', 'city',
  'leadSource', 'sourceType', 'sourceName', 'sourceAccount', 'remark', 'ownerId', 'lifecycleStatusCode',
]);
assert.equal(isCustomerMergeExecutionInput({ mainCustomerId: 'c1' }), false);
assert.equal(isCustomerMergeExecutionInput({
  mainCustomerId: 'c1',
  secondaryCustomerIds: ['c2'],
  reason: '同一客户重复录入',
  precheckToken: 'token',
  idempotencyKey: 'merge-click-1',
  fieldDecisions: {},
  tagDecision: { selectedTagIds: [] },
}), true);

assert.throws(() => validateMergeSelection('c1', ['c1']), /MERGE_REQUIRES_TWO_TO_TEN_CUSTOMERS/);
assert.throws(
  () => validateMergeSelection('c1', Array.from({ length: 10 }, (_, index) => `c${index + 2}`)),
  /MERGE_REQUIRES_TWO_TO_TEN_CUSTOMERS/,
);
assert.deepEqual(requiredFieldDecisions({ name: ['甲', '乙'], phone: ['13800000000'] }), ['name']);
const commonDecision = { fieldDecisions: {}, tagDecision: { selectedTagIds: [] }, reason: '同一客户' };
assert.notEqual(
  buildCustomerMergeInputHash({ mainCustomerId: 'c1', secondaryCustomerIds: ['c2'], ...commonDecision }),
  buildCustomerMergeInputHash({ mainCustomerId: 'c2', secondaryCustomerIds: ['c1'], ...commonDecision }),
);
assert.equal(buildCustomerMergeUndoInputHash(' ledger-1 '), buildCustomerMergeUndoInputHash('ledger-1'));
assert.deepEqual(
  buildLockOrder('c9', ['c3', 'c7'], ['i9', 'i2'], ['l7', 'l1'], ['orders', 'customer_todos']),
  ['customer:c3', 'customer:c7', 'customer:c9', 'identity:i2', 'identity:i9', 'identity_link:l1', 'identity_link:l7', 'domain:orders', 'domain:customer_todos'],
);
assert.deepEqual(
  buildLockOrder('c3', ['c9', 'c7'], ['i2', 'i9'], ['l1', 'l7'], ['orders', 'customer_todos']),
  buildLockOrder('c9', ['c3', 'c7'], ['i9', 'i2'], ['l7', 'l1'], ['orders', 'customer_todos']),
);

const selectedCustomers = [
  { id: 'c1', name: '客户甲', company: '同一公司', phone: '13800138000', owner: '销售甲', ownerId: 'u1', ownerIdentityStatus: 'resolved', customerLevel: 'L1', lifecycleStatusCode: 'following', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], manualTagIds: [], createdAt: '2026-07-18T00:00:00Z', updatedAt: '2026-07-18T00:00:00Z', recordRevision: 0 },
  { id: 'c2', name: '客户乙', company: '同一公司', phone: '13800138000', owner: '销售甲', ownerId: 'u1', ownerIdentityStatus: 'resolved', customerLevel: 'L1', lifecycleStatusCode: 'following', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], manualTagIds: [], createdAt: '2026-07-18T00:00:00Z', updatedAt: '2026-07-18T00:00:00Z', recordRevision: 0 },
];
const precheckRows: any[] = [];
const duplicateGroups: any[] = [];
const mergePrisma = {
  businessRecord: {
    async findMany() {
      return selectedCustomers.map((customer) => ({
        id: `aaos_customers:${customer.id}`, domain: 'aaos_customers', recordId: customer.id,
        customerId: customer.id, data: customer, recordRevision: 0, updatedAt: new Date(customer.updatedAt),
      }));
    },
  },
  leadRecord: { async findMany() { return []; } },
  customerTodo: { async findMany() { return []; } },
  appStorage: { async findUnique() { return null; } },
  customerDuplicateGroup: {
    async upsert(args: any) { const row = { ...args.create, createdAt: new Date(), resolvedAt: null, mergeLedgerId: null }; duplicateGroups.push(row); return row; },
    async findUnique() { return null; },
    async findMany() { return duplicateGroups; },
  },
};
const tokenStore = {
  async transaction(operation: any) { return operation({}); },
  async create(row: any) { precheckRows.push(row); },
  async lockByToken() { return null; },
  async update() {},
};
const mergeContext = {
  actorId: 'u1', actorName: '销售甲', readableUserIds: new Set(['u1']), legacyReadableNames: new Set(['销售甲']),
  manageableOwnerIds: new Set(['u1']), canReadPublicPool: false, canReadCustomerList: true,
  grantedPermissions: new Set(['客户/合并客户']),
};
const mergeService = createCustomerMergeService(mergePrisma as any, {
  tokenStore: tokenStore as any,
  now: () => new Date('2026-07-18T00:00:00.000Z'),
  createToken: () => 'merge-precheck-token',
  createId: () => 'merge-precheck-id',
});
const unresolvedPrecheck = await mergeService.precheck({
  mainCustomerId: 'c1', secondaryCustomerIds: ['c2'], fieldDecisions: {},
  tagDecision: { selectedTagIds: [] }, reason: '同一手机号重复录入',
}, mergeContext);
assert.equal(unresolvedPrecheck.executable, false);
assert.deepEqual(unresolvedPrecheck.requiredDecisions, ['name']);
const readyPrecheck = await mergeService.precheck({
  mainCustomerId: 'c1', secondaryCustomerIds: ['c2'], fieldDecisions: { name: { sourceCustomerId: 'c1' } },
  tagDecision: { selectedTagIds: [] }, reason: '同一手机号重复录入',
}, mergeContext);
assert.equal(readyPrecheck.executable, true);
assert.equal(readyPrecheck.precheckToken, 'merge-precheck-token');
assert.equal(precheckRows.length, 1, '只有可执行预检可以签发一次性令牌');

console.log('customer merge contracts: ok');
