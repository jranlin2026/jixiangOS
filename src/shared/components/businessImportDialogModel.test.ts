import assert from 'node:assert/strict';
import {
  acceptQueuedBusinessImportJob,
  businessImportJobStorageKey,
  createBusinessImportSingleFlight,
  getBusinessImportConfirmDisabledReason,
  readStoredBusinessImportJob,
  runBusinessImportJobPolling,
  BusinessImportJobUnavailableError,
  pollBusinessImportJob,
  writeStoredBusinessImportJob,
} from './businessImportDialogModel';
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

const abortController = new AbortController();
let resolveAbortedFetch!: (job: BusinessImportJobResult) => void;
let abortedUpdates = 0;
let receivedSignal: AbortSignal | undefined;
const abortedPoll = pollBusinessImportJob(
  async (signal) => {
    receivedSignal = signal;
    return new Promise<BusinessImportJobResult>((resolve) => { resolveAbortedFetch = resolve; });
  },
  { signal: abortController.signal, onUpdate: () => { abortedUpdates += 1; } },
);
await Promise.resolve();
assert.equal(receivedSignal, abortController.signal, 'the fetch seam must receive the active AbortSignal');
abortController.abort();
resolveAbortedFetch(status('succeeded'));
await assert.rejects(abortedPoll, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
assert.equal(abortedUpdates, 0, 'a response resolved after close must not update dialog state');

function countAbortListeners(signal: AbortSignal, counter: { active: number; added: number; removed: number }): void {
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  Object.defineProperty(signal, 'addEventListener', {
    configurable: true,
    value: ((type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean) => {
      if (type === 'abort') {
        counter.active += 1;
        counter.added += 1;
      }
      add(type, listener, options);
    }) satisfies AbortSignal['addEventListener'],
  });
  Object.defineProperty(signal, 'removeEventListener', {
    configurable: true,
    value: ((type: string, listener: EventListenerOrEventListenerObject, options?: EventListenerOptions | boolean) => {
      if (type === 'abort') {
        counter.active -= 1;
        counter.removed += 1;
      }
      remove(type, listener, options);
    }) satisfies AbortSignal['removeEventListener'],
  });
}

const timeoutListeners = { active: 0, added: 0, removed: 0 };
const timeoutController = new AbortController();
countAbortListeners(timeoutController.signal, timeoutListeners);
const nativeSetTimeout = globalThis.setTimeout;
try {
  globalThis.setTimeout = (((handler: TimerHandler) => {
    queueMicrotask(() => { if (typeof handler === 'function') handler(); });
    return 1;
  }) as unknown) as typeof globalThis.setTimeout;
  let timeoutLoads = 0;
  await pollBusinessImportJob(async () => status(++timeoutLoads > 20 ? 'succeeded' : 'running'), {
    signal: timeoutController.signal,
  });
} finally {
  globalThis.setTimeout = nativeSetTimeout;
}
assert.equal(timeoutListeners.added, 20);
assert.equal(timeoutListeners.removed, 20, 'resolved delays must explicitly remove abort listeners');
assert.equal(timeoutListeners.active, 0, 'repeated resolved delays must retain no abort listeners');

const abortedDelayListeners = { active: 0, added: 0, removed: 0 };
for (let index = 0; index < 100; index += 1) {
  const controller = new AbortController();
  countAbortListeners(controller.signal, abortedDelayListeners);
  const polling = pollBusinessImportJob(async () => status('running'), { signal: controller.signal });
  await Promise.resolve();
  controller.abort();
  await assert.rejects(polling, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
}
assert.equal(abortedDelayListeners.added, 100);
assert.equal(abortedDelayListeners.removed, 100, 'aborted delays must explicitly remove abort listeners');
assert.equal(abortedDelayListeners.active, 0, 'repeated aborted delays must retain no abort listeners');

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

let downloadCalls = 0;
let releaseDownload!: () => void;
const oneTimeDownload = createBusinessImportSingleFlight(async () => {
  downloadCalls += 1;
  await new Promise<void>((resolve) => { releaseDownload = resolve; });
});
const firstDownload = oneTimeDownload();
const doubleClickDownload = oneTimeDownload();
assert.equal(downloadCalls, 1);
releaseDownload();
await Promise.all([firstDownload, doubleClickDownload]);
assert.equal(downloadCalls, 1, 'double-clicking download must trigger one workbook generation');

const tenantAUser1 = businessImportJobStorageKey('orders', { tenantId: 'tenant-a', userId: 'user-1' });
const tenantAUser2 = businessImportJobStorageKey('orders', { tenantId: 'tenant-a', userId: 'user-2' });
const tenantBUser1 = businessImportJobStorageKey('orders', { tenantId: 'tenant-b', userId: 'user-1' });
const recoveryKey = businessImportJobStorageKey('recovery_orders', { tenantId: 'tenant-a', userId: 'user-1' });
assert.equal(new Set([tenantAUser1, tenantAUser2, tenantBUser1, recoveryKey]).size, 4);

const values = new Map<string, string>();
const storage = {
  getItem: (key: string) => values.get(key) || null,
  setItem: (key: string, value: string) => { values.set(key, value); },
  removeItem: (key: string) => { values.delete(key); },
};
assert.equal(writeStoredBusinessImportJob(storage, tenantAUser1, { id: 'job-1', completedNotified: false }), true);
assert.deepEqual(readStoredBusinessImportJob(storage, tenantAUser1), { id: 'job-1', completedNotified: false });
assert.equal(readStoredBusinessImportJob(storage, tenantAUser2), null, 'one user must never resume another user\'s job');

const acceptOrder: string[] = [];
const warning = acceptQueuedBusinessImportJob({
  job: status('queued'),
  storage: { ...storage, setItem: () => { acceptOrder.push('storage'); throw new Error('quota'); } },
  storageKey: tenantAUser1,
  onJob: () => { acceptOrder.push('job'); },
});
assert.deepEqual(acceptOrder, ['job', 'storage']);
assert.match(warning, /任务已创建.*未能保存恢复标识/);

writeStoredBusinessImportJob(storage, tenantAUser1, { id: 'missing-job', completedNotified: false });
let unavailableCalls = 0;
const missing = await runBusinessImportJobPolling({
  load: async () => { throw new BusinessImportJobUnavailableError(404, '任务不存在'); },
  storage,
  storageKey: tenantAUser1,
  stored: { id: 'missing-job', completedNotified: false },
  onUpdate: () => { throw new Error('missing job must not update'); },
  onUnavailable: () => { unavailableCalls += 1; },
  wait: async () => undefined,
});
assert.equal(missing, null);
assert.equal(unavailableCalls, 1);
assert.equal(readStoredBusinessImportJob(storage, tenantAUser1), null);

writeStoredBusinessImportJob(storage, tenantAUser1, { id: 'done-job', completedNotified: true });
let repeatedCompletionCalls = 0;
const reopened = await runBusinessImportJobPolling({
  load: async () => ({ ...status('succeeded'), id: 'done-job' }),
  storage,
  storageKey: tenantAUser1,
  stored: { id: 'done-job', completedNotified: true },
  onUpdate: () => undefined,
  onCompleted: () => { repeatedCompletionCalls += 1; },
  wait: async () => undefined,
});
assert.equal(reopened?.status, 'succeeded');
assert.equal(repeatedCompletionCalls, 0, 'reopening a completed job must not repeat completion callbacks');

writeStoredBusinessImportJob(storage, tenantAUser1, { id: 'new-session-job', completedNotified: false });
const staleController = new AbortController();
let rejectStaleLoad!: (error: Error) => void;
let staleUnavailableCalls = 0;
const staleRun = runBusinessImportJobPolling({
  load: async () => new Promise<BusinessImportJobResult>((_resolve, reject) => { rejectStaleLoad = reject; }),
  signal: staleController.signal,
  storage,
  storageKey: tenantAUser1,
  stored: { id: 'old-session-job', completedNotified: false },
  onUpdate: () => undefined,
  onUnavailable: () => { staleUnavailableCalls += 1; },
});
await Promise.resolve();
staleController.abort();
rejectStaleLoad(new BusinessImportJobUnavailableError(404, 'old job missing'));
await assert.rejects(staleRun, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
assert.equal(staleUnavailableCalls, 0);
assert.deepEqual(readStoredBusinessImportJob(storage, tenantAUser1), { id: 'new-session-job', completedNotified: false });

const storageFreeUpdates: string[] = [];
let storageFreeLoads = 0;
let storageFreeCompletions = 0;
const storageFreeTerminal = await runBusinessImportJobPolling({
  load: async () => status(++storageFreeLoads === 1 ? 'running' : 'succeeded'),
  onUpdate: (next) => { storageFreeUpdates.push(next.status); },
  onCompleted: () => { storageFreeCompletions += 1; },
  wait: async () => undefined,
});
assert.equal(storageFreeTerminal?.status, 'succeeded');
assert.deepEqual(storageFreeUpdates, ['running', 'succeeded']);
assert.equal(storageFreeCompletions, 1, 'storage availability must not gate terminal callbacks');
