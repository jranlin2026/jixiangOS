import type { BusinessImportJobResult, BusinessImportPrecheckResult } from '../../types/businessImport';

const TERMINAL_JOB_STATUSES = new Set<BusinessImportJobResult['status']>(['succeeded', 'partial_failed', 'failed']);

export type BusinessImportStorageIdentity = { tenantId: string; userId: string };
export type StoredBusinessImportJob = { id: string; batchId?: string; completedNotified: boolean };
export type BusinessImportStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function businessImportJobStorageKey(
  type: 'orders' | 'recovery_orders',
  identity: BusinessImportStorageIdentity,
): string {
  const tenantId = String(identity.tenantId || '').trim();
  const userId = String(identity.userId || '').trim();
  if (!tenantId || !userId) throw new Error('导入任务存储身份无效');
  return `jixiangos_business_import_job:${encodeURIComponent(tenantId)}:${encodeURIComponent(userId)}:${type}`;
}

export function readStoredBusinessImportJob(
  storage: BusinessImportStorage,
  key: string,
): StoredBusinessImportJob | null {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredBusinessImportJob>;
    const id = String(parsed.id || '').trim();
    return id ? { id, ...(parsed.batchId ? { batchId: String(parsed.batchId) } : {}), completedNotified: parsed.completedNotified === true } : null;
  } catch {
    return null;
  }
}

export function writeStoredBusinessImportJob(
  storage: BusinessImportStorage,
  key: string,
  record: StoredBusinessImportJob,
): boolean {
  try {
    storage.setItem(key, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredBusinessImportJob(storage: BusinessImportStorage, key: string): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function acceptQueuedBusinessImportJob(input: {
  job: BusinessImportJobResult;
  storage: BusinessImportStorage;
  storageKey: string;
  onJob: (job: BusinessImportJobResult) => void;
}): string {
  input.onJob(input.job);
  const stored = writeStoredBusinessImportJob(input.storage, input.storageKey, {
    id: input.job.id,
    batchId: input.job.batchId,
    completedNotified: false,
  });
  return stored ? '' : '任务已创建，但浏览器未能保存恢复标识；请保持当前窗口打开以查看进度。';
}

export class BusinessImportJobUnavailableError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

export class BusinessImportJobRetryableError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

export function businessImportJobResultFromResponse(response: {
  code: number;
  data: BusinessImportJobResult;
  message: string;
}): BusinessImportJobResult {
  if ([403, 404, 410].includes(response.code)) {
    throw new BusinessImportJobUnavailableError(response.code, response.message || '导入任务已失效');
  }
  if (response.code === -1 || (response.code >= 500 && response.code <= 599)) {
    throw new BusinessImportJobRetryableError(response.code, response.message || '读取导入任务进度失败');
  }
  if (response.code !== 0 || !response.data) throw new Error(response.message || '读取导入任务进度失败');
  return response.data;
}

export function createBusinessImportSingleFlight<Args extends unknown[], Result>(
  task: (...args: Args) => Promise<Result>,
): (...args: Args) => Promise<Result> {
  let pending: Promise<Result> | null = null;
  return (...args: Args) => {
    if (pending) return pending;
    pending = task(...args).finally(() => { pending = null; });
    return pending;
  };
}

export function isTerminalBusinessImportJob(status: BusinessImportJobResult['status']): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}

type PollOptions = {
  wait?: (signal?: AbortSignal, delayMs?: number) => Promise<void>;
  onUpdate?: (job: BusinessImportJobResult) => void;
  signal?: AbortSignal;
};

function abortError(): DOMException {
  return new DOMException('导入任务轮询已取消', 'AbortError');
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function abortableDelay(signal?: AbortSignal, delayMs = 2_000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function loadBusinessImportJobResult(
  request: (signal?: AbortSignal) => Promise<{ code: number; data: BusinessImportJobResult; message: string }>,
  signal?: AbortSignal,
): Promise<BusinessImportJobResult> {
  let response: { code: number; data: BusinessImportJobResult; message: string };
  try {
    response = await request(signal);
  } catch (error) {
    assertNotAborted(signal);
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new BusinessImportJobRetryableError(-1, error instanceof Error ? error.message : '网络连接失败');
  }
  assertNotAborted(signal);
  return businessImportJobResultFromResponse(response);
}

export async function pollBusinessImportJob(
  load: (signal?: AbortSignal) => Promise<BusinessImportJobResult>,
  options: PollOptions = {},
): Promise<BusinessImportJobResult> {
  const wait = options.wait || abortableDelay;
  let transientRetryCount = 0;
  while (true) {
    assertNotAborted(options.signal);
    let job: BusinessImportJobResult;
    try {
      job = await load(options.signal);
    } catch (error) {
      assertNotAborted(options.signal);
      if (!(error instanceof BusinessImportJobRetryableError)) throw error;
      const retryDelayMs = Math.min(30_000, 500 * (2 ** transientRetryCount));
      transientRetryCount += 1;
      await wait(options.signal, retryDelayMs);
      assertNotAborted(options.signal);
      continue;
    }
    assertNotAborted(options.signal);
    transientRetryCount = 0;
    options.onUpdate?.(job);
    assertNotAborted(options.signal);
    if (isTerminalBusinessImportJob(job.status)) return job;
    await wait(options.signal, 2_000);
    assertNotAborted(options.signal);
  }
}

export async function runBusinessImportJobPolling(input: {
  load: (signal?: AbortSignal) => Promise<BusinessImportJobResult>;
  signal?: AbortSignal;
  wait?: (signal?: AbortSignal, delayMs?: number) => Promise<void>;
  storage?: BusinessImportStorage;
  storageKey?: string;
  stored?: StoredBusinessImportJob | null;
  onUpdate: (job: BusinessImportJobResult) => void;
  onCompleted?: (job: BusinessImportJobResult) => void;
  onUnavailable?: () => void;
}): Promise<BusinessImportJobResult | null> {
  try {
    const terminal = await pollBusinessImportJob(input.load, {
      signal: input.signal,
      wait: input.wait,
      onUpdate: input.onUpdate,
    });
    assertNotAborted(input.signal);
    if (!input.stored?.completedNotified) {
      if (input.storage && input.storageKey) {
        writeStoredBusinessImportJob(input.storage, input.storageKey, { id: terminal.id, batchId: terminal.batchId, completedNotified: true });
      }
      input.onCompleted?.(terminal);
    }
    return terminal;
  } catch (error) {
    assertNotAborted(input.signal);
    if (error instanceof BusinessImportJobUnavailableError) {
      if (input.storage && input.storageKey) clearStoredBusinessImportJob(input.storage, input.storageKey);
      input.onUnavailable?.();
      return null;
    }
    throw error;
  }
}

export function getBusinessImportConfirmDisabledReason(
  precheck: BusinessImportPrecheckResult | null,
  submitting = false,
): string {
  if (submitting) return '导入任务正在提交';
  if (!precheck) return '请先完成导入预检';
  if (precheck.blockedCount || precheck.rows.some((row) => row.status === 'blocked')) {
    return '请先修正所有被阻止的行并重新预检';
  }
  if (!precheck.totalCount || !precheck.readyCount) return '没有可导入的数据';
  return '';
}
