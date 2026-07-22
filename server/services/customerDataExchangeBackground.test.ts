import assert from 'node:assert/strict';
import { createCustomerDataExchangeService } from './customerDataExchangeService';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';

const user = {
  id: 'u1', name: '销售甲', account: 'sales-a', email: '', phone: '', role: '销售', roleId: 'r1', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_IMPORT, actions: ['read', 'write'] }],
} as any;
const rows = Array.from({ length: 2_000 }, (_, index) => ({
  rowNumber: index + 2,
  name: `客户${index}`,
  phone: '',
  wechat: `wx-${index}`,
  company: '',
  ownerName: '',
  lifecycleStatus: '',
  customerLevel: '',
  leadSource: '',
  industry: '',
  city: '',
  tagNames: '',
  lastFollowUpRecord: index === 0 ? '历史跟进' : '',
  remark: index === 0 ? '客户备注' : '',
}));

let queuedRows: any[] = [];
const service = createCustomerDataExchangeService({
  secret: 'test-customer-exchange-secret',
  loadDirectory: async () => ({
    currentOwnerId: 'u1', currentOwnerName: '销售甲', canOverrideAttribution: false,
    owners: [{ id: 'u1', name: '销售甲' }], lifecycleStatuses: [], customerLevels: [], leadSources: [], tags: [],
    existingContactKeys: new Set(), existingCustomerNames: new Set(),
  }),
  enqueueImportExecution: async (event: any) => {
    queuedRows = event.rows;
    return {
      id: 'import-job-1', actorId: 'u1', actorName: '销售甲', handlerKey: 'customer_import', operation: 'import', status: 'queued',
      selectionMode: 'file_rows', frozenCustomerCount: event.rows.length, totalCount: event.rows.length,
      successCount: 0, failedCount: 0, skippedCount: 0, cancelledCount: 0, createdAt: '2026-07-22T00:00:00.000Z',
    };
  },
  readCustomers: async () => [],
  recordExportAudit: async () => undefined,
  persistImportPrecheck: async () => undefined,
} as any);

const precheck = await service.precheckImport(rows, 'assigned', user);
const startedAt = Date.now();
const job = await service.confirmImport({ rows, destination: 'assigned', confirmationToken: precheck.confirmationToken }, user);
const elapsedMs = Date.now() - startedAt;

assert.equal(job.id, 'import-job-1');
assert.equal(job.status, 'queued');
assert.equal(queuedRows.length, 2_000);
assert.equal(queuedRows[0].lastFollowUpRecord, '历史跟进');
assert.equal(queuedRows[0].input.remark, '客户备注');
assert.ok(elapsedMs < 1_000, `确认导入应快速创建后台任务，实际 ${elapsedMs}ms`);

console.log('customer data exchange background enqueue: ok');
