import assert from 'node:assert/strict';
import type { AuthenticatedUser } from '../../src/types/auth';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { createCustomerDataExchangeService } from './customerDataExchangeService';

const user: AuthenticatedUser = {
  id: 'u1',
  name: '销售甲',
  account: 'sales-a',
  email: '',
  phone: '',
  role: '销售',
  roleId: 'r1',
  isActive: true,
  permissions: [
    { module: PERMISSION_KEYS.CUSTOMER_IMPORT, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.CUSTOMER_EXPORT, actions: ['read', 'write'] },
  ],
};

const exportAudit: unknown[] = [];
const persistedTokens = new Set<string>();
const queuedEvents: any[] = [];
const queuedJob = {
  id: 'import-job-1', actorId: 'u1', actorName: '销售甲', handlerKey: 'customer_import', operation: 'import' as const,
  status: 'queued' as const, selectionMode: 'file_rows' as const, frozenCustomerCount: 1, totalCount: 1,
  successCount: 0, failedCount: 0, skippedCount: 0, cancelledCount: 0, createdAt: '2026-07-19T10:00:00.000Z',
};
const service = createCustomerDataExchangeService({
  secret: 'test-customer-exchange-secret',
  now: () => new Date('2026-07-19T10:00:00.000Z'),
  loadDirectory: async () => ({
    currentOwnerId: 'u1',
    currentOwnerName: '销售甲',
    canOverrideAttribution: false,
    owners: [{ id: 'u1', name: '销售甲' }],
    lifecycleStatuses: [{ code: 'following', name: '跟进中' }],
    customerLevels: [{ value: 'L1', label: 'L1-潜客' }],
    leadSources: [{ value: '官网', label: '官网' }],
    tags: [],
    existingContactKeys: new Set(),
  }),
  enqueueImportExecution: async (event) => { queuedEvents.push(event); return queuedJob; },
  readCustomers: async () => [{
    id: 'c1', name: '张三', phone: '+8613800000000', wechat: 'wx-a', company: '示例公司', owner: '销售甲', ownerId: 'u1',
    customerLevel: 'L1', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
  }],
  recordExportAudit: async (event) => { exportAudit.push(event); },
  persistImportPrecheck: async (event) => { persistedTokens.add(event.token); },
});

const importRows = [{
  rowNumber: 2,
  name: '张三',
  phone: '13800000000',
  wechat: '',
  company: '示例公司',
  ownerName: '',
  lifecycleStatus: '跟进中',
  customerLevel: 'L1-潜客',
  leadSource: '官网',
  industry: '',
  city: '',
  tagNames: '',
  lastFollowUpRecord: '已确认报价，等待客户回复',
  remark: '',
}];

const fiveThousandRows = Array.from({ length: 5_000 }, (_, index) => ({
  ...importRows[0],
  rowNumber: index + 2,
  name: `客户${index + 1}`,
  phone: `13${String(index).padStart(9, '0')}`,
}));
const maxRowsPrecheck = await service.precheckImport(fiveThousandRows, 'assigned', user);
assert.equal(maxRowsPrecheck.totalCount, 5_000, '单次应允许预检 5000 条客户');
await assert.rejects(
  () => service.precheckImport([
    ...fiveThousandRows,
    { ...importRows[0], rowNumber: 5_002, name: '超出上限', phone: '13999999999' },
  ], 'assigned', user),
  /单次最多导入 5000 条客户/,
);

const precheck = await service.precheckImport(importRows, 'assigned', user);
assert.equal(precheck.readyCount, 1);
assert.match(precheck.confirmationToken, /^cx1\./);

const confirmed = await service.confirmImport({ rows: importRows, destination: 'assigned', confirmationToken: precheck.confirmationToken }, user);
assert.equal(confirmed.successCount, 0);
assert.equal(confirmed.status, 'queued');
assert.equal(queuedEvents.length, 1);
assert.equal(queuedEvents[0].rows[0].lastFollowUpRecord, '已确认报价，等待客户回复');
assert.notEqual(queuedEvents[0].rows[0].input.remark, '已确认报价，等待客户回复');

const replayed = await service.confirmImport({ rows: importRows, destination: 'assigned', confirmationToken: precheck.confirmationToken }, user);
assert.deepEqual(replayed, confirmed);
assert.equal(queuedEvents.length, 2, '幂等消费由持久化排队适配器处理');

await assert.rejects(
  () => service.confirmImport({ rows: [{ ...importRows[0], name: '被篡改' }], destination: 'assigned', confirmationToken: precheck.confirmationToken }, user),
  /预检内容不一致/,
);

await assert.rejects(
  () => service.precheckImport([{ ...importRows[0], ownerName: '', lifecycleStatus: '' }], 'public_pool', user),
  /无权直接导入公海池/,
);

const publicPoolUser: AuthenticatedUser = {
  ...user,
  permissions: [
    ...(user.permissions || []),
    { module: PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL, actions: ['read', 'write'] },
  ],
};
const publicPoolRows = [{ ...importRows[0], ownerName: '', lifecycleStatus: '' }];
const publicPoolPrecheck = await service.precheckImport(publicPoolRows, 'public_pool', publicPoolUser);
assert.equal(publicPoolPrecheck.readyCount, 1);
await assert.rejects(
  () => service.confirmImport({ rows: publicPoolRows, destination: 'assigned', confirmationToken: publicPoolPrecheck.confirmationToken }, publicPoolUser),
  /预检内容不一致/,
);
const publicPoolConfirmed = await service.confirmImport({
  rows: publicPoolRows,
  destination: 'public_pool',
  confirmationToken: publicPoolPrecheck.confirmationToken,
}, publicPoolUser);
assert.equal(publicPoolConfirmed.status, 'queued');
assert.equal(queuedEvents[queuedEvents.length - 1].rows[0].input.ownerId, undefined);
assert.equal(queuedEvents[queuedEvents.length - 1].rows[0].input.name, '张三');
assert.equal(queuedEvents[queuedEvents.length - 1].rows[0].input.ownerIdentityStatus, 'public_pool');
assert.equal(queuedEvents[queuedEvents.length - 1].rows[0].input.lifecycleStatusCode, 'public_pool');
assert.equal(queuedEvents[queuedEvents.length - 1].destination, 'public_pool');
assert.equal(queuedEvents[queuedEvents.length - 1].rows[0].lastFollowUpRecord, '已确认报价，等待客户回复');

const exported = await service.exportCustomers({
  selection: { mode: 'ids', customerIds: ['c1'] },
  includeSensitive: false,
  reason: '备份客户资料',
}, user);
assert.equal(exported.rows.length, 1);
assert.equal(Object.prototype.hasOwnProperty.call(exported.rows[0], '手机号'), false);
assert.equal(exportAudit.length, 1);

await assert.rejects(
  () => service.exportCustomers({
    selection: { mode: 'ids', customerIds: ['c1'] },
    includeSensitive: true,
    reason: '导出联系方式',
  }, user),
  /无权导出客户敏感字段/,
);

console.log('customer data exchange service: ok');
