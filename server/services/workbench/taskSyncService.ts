import type { EmployeeTask } from '../../../src/types/enterpriseBrain';
import { transitionTaskStatus } from '../../../src/domain/workbench/taskLifecycle';
import type { WorkbenchRepository } from './workbenchRepository';
import type {
  DesiredEmployeeTask,
  ReconcileContext,
  ReconcileResult,
  WorkbenchSourceAdapter,
} from './sourceAdapter';
import { TaskSyncInvariantError } from './sourceAdapter';

export { TaskSyncInvariantError } from './sourceAdapter';

export type TaskSyncService = {
  syncDesiredTask(desired: DesiredEmployeeTask | null, sourceKey: string): Promise<EmployeeTask | null>;
  reconcileAdapters(adapters: WorkbenchSourceAdapter[], context: ReconcileContext): Promise<ReconcileResult>;
};

type Dependencies = {
  repository: WorkbenchRepository;
};

const MAX_RECONCILE_LIMIT = 1_000;
const countFields = ['scanned', 'created', 'updated', 'canceled', 'unchanged', 'failed'] as const;

function emptyReconcileResult(): ReconcileResult {
  return { scanned: 0, created: 0, updated: 0, canceled: 0, unchanged: 0, failed: 0, errors: [] };
}

function safeReconcileError(
  module: WorkbenchSourceAdapter['module'],
  sourceKey?: string,
): ReconcileResult['errors'][number] {
  const normalizedSourceKey = String(sourceKey || '').trim();
  const safeSourceKey = normalizedSourceKey.length <= 180
    && /^[A-Za-z0-9:_-]+$/.test(normalizedSourceKey)
    && !/(?:password|token|secret|authorization|cookie)/i.test(normalizedSourceKey)
    ? normalizedSourceKey
    : '';
  return {
    module,
    ...(safeSourceKey ? { sourceKey: safeSourceKey } : {}),
    message: `${module} 来源对账失败`,
  };
}

function normalizedCount(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.trunc(value), Number.MAX_SAFE_INTEGER);
}

function normalizedContext(context: ReconcileContext): ReconcileContext {
  if (context.limit === undefined) return { ...context };
  const rawLimit = Number.isFinite(context.limit) ? Math.trunc(context.limit) : 1;
  return { ...context, limit: Math.min(Math.max(rawLimit, 1), MAX_RECONCILE_LIMIT) };
}

function isolatedContext(
  context: ReconcileContext,
  nowTime: number,
  module: WorkbenchSourceAdapter['module'],
): ReconcileContext {
  return {
    ...context,
    now: new Date(nowTime),
    cursor: context.cursors?.[module] ?? context.cursor,
    ...(context.sourceKeys ? { sourceKeys: [...context.sourceKeys] } : {}),
    ...(context.cursors ? { cursors: { ...context.cursors } } : {}),
  };
}

function abortError(signal?: AbortSignal): Error {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error('对账已中止');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

function sourceCanCancel(status: EmployeeTask['status']): boolean {
  try {
    return transitionTaskStatus(status, 'CANCEL') === 'CANCELED';
  } catch {
    return false;
  }
}

async function reconcileWithAbort(
  adapter: WorkbenchSourceAdapter,
  context: ReconcileContext,
): Promise<ReconcileResult> {
  throwIfAborted(context.signal);
  if (!context.signal) return adapter.reconcile(context);
  const signal = context.signal;
  return new Promise<ReconcileResult>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    adapter.reconcile(context).then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort);
    });
  });
}

export function createTaskSyncService(deps: Dependencies): TaskSyncService {
  return {
    async syncDesiredTask(desired, sourceKey) {
      if (desired && desired.sourceKey !== sourceKey) {
        throw new TaskSyncInvariantError('desired.sourceKey 必须与 sourceKey 参数一致');
      }
      if (desired) return deps.repository.createFromDesired(desired);
      const existing = await deps.repository.findBySourceKey(sourceKey);
      return existing && sourceCanCancel(existing.status)
        ? deps.repository.cancelFromSource(existing.id)
        : existing;
    },
    async reconcileAdapters(adapters, context) {
      const seenModules = new Set<string>();
      for (const adapter of adapters) {
        if (seenModules.has(adapter.module)) {
          throw new TaskSyncInvariantError(`对账适配器模块 ${adapter.module} 重复`);
        }
        seenModules.add(adapter.module);
      }
      const aggregate = emptyReconcileResult();
      const input = normalizedContext(context);
      const nowTime = input.now.getTime();
      for (const adapter of adapters) {
        throwIfAborted(input.signal);
        try {
          const result = await reconcileWithAbort(adapter, isolatedContext(input, nowTime, adapter.module));
          countFields.forEach((field) => {
            aggregate[field] = Math.min(
              aggregate[field] + normalizedCount(result[field]),
              Number.MAX_SAFE_INTEGER,
            );
          });
          result.errors.forEach((error) => {
            aggregate.errors.push(safeReconcileError(adapter.module, error.sourceKey));
          });
          const nextCursor = result.nextCursors?.[adapter.module];
          if (nextCursor) {
            aggregate.nextCursors ||= {};
            aggregate.nextCursors[adapter.module] = nextCursor;
          }
        } catch (error) {
          if (input.signal?.aborted) throw error;
          aggregate.failed = Math.min(aggregate.failed + 1, Number.MAX_SAFE_INTEGER);
          aggregate.errors.push(safeReconcileError(adapter.module));
        }
      }
      return aggregate;
    },
  };
}
