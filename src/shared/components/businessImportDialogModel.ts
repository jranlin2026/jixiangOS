import type { BusinessImportJobResult, BusinessImportPrecheckResult } from '../../types/businessImport';

const TERMINAL_JOB_STATUSES = new Set<BusinessImportJobResult['status']>(['succeeded', 'partial_failed', 'failed']);

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
  wait?: () => Promise<void>;
  onUpdate?: (job: BusinessImportJobResult) => void;
  signal?: AbortSignal;
};

export async function pollBusinessImportJob(
  load: () => Promise<BusinessImportJobResult>,
  options: PollOptions = {},
): Promise<BusinessImportJobResult> {
  const wait = options.wait || (() => new Promise<void>((resolve) => window.setTimeout(resolve, 2_000)));
  while (true) {
    if (options.signal?.aborted) throw new DOMException('导入任务轮询已取消', 'AbortError');
    const job = await load();
    options.onUpdate?.(job);
    if (isTerminalBusinessImportJob(job.status)) return job;
    await wait();
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
