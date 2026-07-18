import assert from 'node:assert/strict';
import { freezeCustomerSelection } from './customerBatchSelectionService';

const at = new Date('2026-07-18T00:00:00.000Z');
const customer = (id: string, ownerId = 'owner-a') => ({
  id,
  name: `客户 ${id}`,
  company: '',
  phone: '',
  owner: '销售甲',
  ownerId,
  ownerIdentityStatus: 'resolved' as const,
  customerLevel: 'L1' as const,
  lifecycleStatusCode: 'following' as const,
  totalSpent: 0,
  orderCount: 0,
  growthPath: [],
  growthRecords: [],
  activityRecords: [],
  createdAt: at.toISOString(),
  updatedAt: 'copied-json-timestamp-must-not-be-used',
});

const frozen = await freezeCustomerSelection({
  selection: { mode: 'filter_snapshot', filters: { lifecycleStatusCode: 'following' } },
  context: {
    actorId: 'actor-a',
    actorName: '批量管理员',
    readableUserIds: new Set(['owner-a', 'owner-b']),
    legacyReadableNames: new Set(),
    manageableOwnerIds: new Set(['owner-a']),
    canReadPublicPool: false,
    canReadCustomerList: true,
    grantedPermissions: new Set(),
  },
  findRecords: async () => [
    { customer: customer('c-b'), businessRecordUpdatedAt: new Date('2026-07-18T00:02:00.000Z') },
    { customer: customer('c-a'), businessRecordUpdatedAt: new Date('2026-07-18T00:01:00.000Z') },
    { customer: customer('c-outside', 'owner-b'), businessRecordUpdatedAt: new Date('2026-07-18T00:03:00.000Z') },
  ],
});

assert.deepEqual(frozen.customerIds, ['c-a', 'c-b'], '冻结集合只能包含当前可管理客户且必须排序');
assert.equal(frozen.versionManifest['c-a'], '2026-07-18T00:01:00.000Z');
assert.notEqual(frozen.versionManifest['c-a'], customer('c-a').updatedAt, '版本清单不得读取 JSON 内复制时间戳');
assert.equal(frozen.itemResults.some((item) => item.customerId === 'c-outside' && item.status === 'blocked'), false, '筛选模式不能把范围外客户冻结为可执行目标');

const explicit = await freezeCustomerSelection({
  selection: { mode: 'ids', customerIds: ['c-outside', 'c-a', 'c-missing'] },
  context: {
    actorId: 'actor-a', actorName: '部门主管',
    readableUserIds: new Set(['owner-a', 'owner-b']), legacyReadableNames: new Set(),
    // This represents a department_only data scope: owner-b is readable in
    // legacy views but is intentionally absent from the write-manage set.
    manageableOwnerIds: new Set(['owner-a']),
    canReadPublicPool: false, canReadCustomerList: true, grantedPermissions: new Set(),
  },
  findRecords: async () => [
    { customer: customer('c-a'), businessRecordUpdatedAt: at },
    { customer: customer('c-outside', 'owner-b'), businessRecordUpdatedAt: at },
  ],
});
assert.deepEqual(explicit.customerIds, ['c-a']);
assert.deepEqual(explicit.itemResults, [
  { customerId: 'c-a', status: 'ready', reason: '可执行' },
  { customerId: 'c-missing', status: 'blocked', reason: '客户不存在或无权管理' },
  { customerId: 'c-outside', status: 'blocked', reason: '客户不存在或无权管理' },
], '显式 ID 不得因可读但不可管理而扩大写入范围');

await assert.rejects(
  () => freezeCustomerSelection({
    selection: { mode: 'ids', customerIds: Array.from({ length: 10_001 }, (_, index) => `c-${index}`) },
    context: {
      actorId: 'actor-a', actorName: '批量管理员', readableUserIds: new Set(['owner-a']), legacyReadableNames: new Set(),
      manageableOwnerIds: new Set(['owner-a']), canReadPublicPool: false, canReadCustomerList: true, grantedPermissions: new Set(),
    },
    findRecords: async () => [],
  }),
  /最多处理 10,000 个客户/,
  '选择超过 10,000 条必须在冻结前失败',
);

console.log('customer batch selection tests passed');
