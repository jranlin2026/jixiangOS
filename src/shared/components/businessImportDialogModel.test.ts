import assert from 'node:assert/strict';
import { createBusinessImportSingleFlight, getBusinessImportConfirmDisabledReason, pollBusinessImportJob } from './businessImportDialogModel';
import type { BusinessImportJobResult, BusinessImportPrecheckResult } from '../../types/businessImport';

const result = (overrides: Partial<BusinessImportPrecheckResult> = {}): BusinessImportPrecheckResult => ({
  confirmationToken: 'token',
  expiresAt: '2026-07-24T08:00:00.000Z',
  totalCount: 1,
  readyCount: 1,
  warningCount: 0,
  blockedCount: 0,
  rows: [{ rowNumber: 2, status: 'ready', reason: '可导入' }],
  ...overrides,
});

assert.equal(getBusinessImportConfirmDisabledReason(null), '请先完成导入预检');
assert.equal(getBusinessImportConfirmDisabledReason(result({ totalCount: 0, readyCount: 0, rows: [] })), '没有可导入的数据');
assert.equal(getBusinessImportConfirmDisabledReason(result({ blockedCount: 1, rows: [{ rowNumber: 2, status: 'blocked', reason: '客户姓名不能为空' }] })), '请先修正所有被阻止的行并重新预检');
assert.equal(getBusinessImportConfirmDisabledReason(result({ readyCount: 0, blockedCount: 1, rows: [{ rowNumber: 2, status: 'blocked', reason: '客户姓名不能为空' }] })), '请先修正所有被阻止的行并重新预检');
assert.equal(getBusinessImportConfirmDisabledReason(result({ warningCount: 1, rows: [{ rowNumber: 2, status: 'warning', reason: '将创建临时客户' }] })), '');
assert.equal(getBusinessImportConfirmDisabledReason(result(), true), '导入任务正在提交');

const status = (value: BusinessImportJobResult['status']): BusinessImportJobResult => ({
  id: 'job-1', type: 'orders', status: value, totalCount: 2,
});
const seen: string[] = [];
const succeeded = await pollBusinessImportJob(
  async () => status(seen.length ? 'succeeded' : 'running'),
  { wait: async () => { seen.push('wait'); }, onUpdate: (job) => seen.push(job.status) },
);
assert.equal(succeeded.status, 'succeeded');
assert.deepEqual(seen, ['running', 'wait', 'succeeded']);

let partialFetches = 0;
const partial = await pollBusinessImportJob(async () => {
  partialFetches += 1;
  return status('partial_failed');
}, { wait: async () => { throw new Error('terminal job must not wait'); } });
assert.equal(partial.status, 'partial_failed');
assert.equal(partialFetches, 1);

let confirmCalls = 0;
let releaseConfirm!: () => void;
const oneTimeConfirm = createBusinessImportSingleFlight(async () => {
  confirmCalls += 1;
  await new Promise<void>((resolve) => { releaseConfirm = resolve; });
  return 'job-1';
});
const firstConfirm = oneTimeConfirm();
const doubleClickConfirm = oneTimeConfirm();
assert.equal(confirmCalls, 1);
assert.equal(firstConfirm, doubleClickConfirm);
releaseConfirm();
assert.equal(await doubleClickConfirm, 'job-1');
