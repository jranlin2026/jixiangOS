import type { Prisma } from '@prisma/client';
import type { Role } from '../../src/types/role';
import type { Customer } from '../../src/types/customer';
import type { CustomerAccessContext } from './customerAccessPolicy';
import type {
  CustomerAtomicCommand,
  CustomerAtomicCommandContext,
  CustomerAtomicCommandResult,
} from './customerCommandService';
import { sha256Json } from './customerBatchPrecheckService';

export type CustomerBatchJobExecutionRecord = {
  id: string;
  actorId: string;
  actorName: string;
  handlerKey: string;
  operation: string;
  input: unknown;
  inputHash: string;
  reason: string;
};

export type CustomerBatchJobExecutionItem = {
  id: string;
  jobId: string;
  targetKey: string;
  idempotencyKey: string;
  expectedUpdatedAt?: Date | string | null;
};

export type CustomerBatchExecutionContext = {
  access: CustomerAccessContext;
  actor: { id: string; name: string };
  roles: Role[];
};

export type ProcessBatchItemInput = {
  tx: Prisma.TransactionClient | any;
  job: CustomerBatchJobExecutionRecord;
  item: CustomerBatchJobExecutionItem;
  executionContext: CustomerBatchExecutionContext;
};

export type ProcessBatchItemResult = {
  beforeHash?: string;
  afterHash?: string;
  beforeSnapshot?: Customer;
  afterSnapshot?: Customer;
};

export type ProcessBatchJobInput = {
  tx: Prisma.TransactionClient | any;
  job: CustomerBatchJobExecutionRecord;
  executionContext: CustomerBatchExecutionContext;
};

export type ProcessBatchJobResult = { result?: unknown };
export type FinalizeBatchJobInput = { job: CustomerBatchJobExecutionRecord };

export interface CustomerBatchLeaseContext {
  readonly jobId: string;
  readonly workerId: string;
  readonly leaseEpoch: number;
  assertActive(tx?: Prisma.TransactionClient): Promise<void>;
  heartbeat(): Promise<void>;
  cancellationRequested(): Promise<boolean>;
}

export interface CustomerBatchJobHandler {
  readonly handlerKey: string;
  readonly executionKind: 'itemized' | 'aggregate';
  processItem?(input: ProcessBatchItemInput, lease: CustomerBatchLeaseContext): Promise<ProcessBatchItemResult>;
  processAggregate?(input: ProcessBatchJobInput, lease: CustomerBatchLeaseContext): Promise<ProcessBatchJobResult>;
  finalize?(input: FinalizeBatchJobInput, lease: CustomerBatchLeaseContext): Promise<void>;
}

export class CustomerBatchJobHandlerRegistry {
  private readonly byKey = new Map<string, CustomerBatchJobHandler>();

  constructor(handlers: readonly CustomerBatchJobHandler[]) {
    for (const handler of handlers) {
      const key = String(handler?.handlerKey || '').trim();
      if (!key) throw new Error('批量任务处理器 key 无效');
      if (this.byKey.has(key)) throw new Error(`重复的批量任务处理器：${key}`);
      if (handler.executionKind === 'itemized' && typeof handler.processItem !== 'function') {
        throw new Error(`itemized 处理器 ${key} 必须实现 processItem`);
      }
      if (handler.executionKind === 'aggregate' && typeof handler.processAggregate !== 'function') {
        throw new Error(`aggregate 处理器 ${key} 必须实现 processAggregate`);
      }
      if (handler.executionKind !== 'itemized' && handler.executionKind !== 'aggregate') {
        throw new Error(`批量任务处理器 ${key} 的 executionKind 无效`);
      }
      this.byKey.set(key, handler);
    }
  }

  get(handlerKey: string): CustomerBatchJobHandler {
    const key = String(handlerKey || '').trim();
    const handler = this.byKey.get(key);
    if (!handler) throw new Error(`未注册的批量任务处理器：${key}`);
    return handler;
  }
}

function object(value: unknown): Record<string, unknown> {
  const decoded = typeof value === 'string' ? (() => {
    try { return JSON.parse(value); } catch { return null; }
  })() : value;
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new Error('批量任务参数已损坏');
  }
  return decoded as Record<string, unknown>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function customerIdFromTarget(targetKey: string): string {
  const match = /^customer:([A-Za-z0-9][A-Za-z0-9._:-]{0,79})$/.exec(String(targetKey || '').trim());
  if (!match) throw new Error('批量任务目标无效');
  return match[1];
}

export function buildCustomerMutationCommand(
  job: Pick<CustomerBatchJobExecutionRecord, 'operation' | 'input' | 'reason'>,
  targetKey: string,
): CustomerAtomicCommand {
  const input = object(job.input);
  const customerId = customerIdFromTarget(targetKey);
  const reason = text(job.reason);
  if (!reason) throw new Error('批量任务参数已损坏');
  if (job.operation === 'transfer') {
    const targetOwnerId = text(input.targetOwnerId);
    if (!targetOwnerId) throw new Error('批量任务参数已损坏');
    return { action: 'transfer', customerId, targetOwnerId, reason };
  }
  if (job.operation === 'release_to_pool') return { action: 'release_to_pool', customerId, reason };
  if (job.operation === 'set_progress') {
    const lifecycleStatusCode = text(input.lifecycleStatusCode);
    if (!lifecycleStatusCode) throw new Error('批量任务参数已损坏');
    return { action: 'set_progress', customerId, lifecycleStatusCode, reason };
  }
  if (job.operation === 'update_tags') {
    const mode = input.mode === 'add' || input.mode === 'remove' ? input.mode : null;
    const tagIds = Array.isArray(input.tagIds)
      ? Array.from(new Set(input.tagIds.map(text).filter(Boolean))).sort()
      : [];
    if (!mode || !tagIds.length) throw new Error('批量任务参数已损坏');
    return { action: 'update_tags', customerId, mode, tagIds, reason };
  }
  if (job.operation === 'add_todo') {
    const title = text(input.title);
    const content = text(input.content);
    const dueAt = text(input.dueAt);
    const executionMethod = text(input.executionMethod);
    if (!title || !dueAt || !executionMethod) throw new Error('批量任务参数已损坏');
    return { action: 'add_todo', customerId, title, content, dueAt, executionMethod, reason };
  }
  if (job.operation === 'soft_delete') {
    if (input.confirmed !== true) throw new Error('批量任务参数已损坏');
    return { action: 'soft_delete', customerId, confirmed: true, reason };
  }
  throw new Error('批量任务操作无效');
}

export type TransactionalCustomerAtomicCommandService = {
  execute(command: CustomerAtomicCommand, context: CustomerAtomicCommandContext): Promise<CustomerAtomicCommandResult>;
};

export function createCustomerMutationBatchJobHandler(options: {
  atomicService: TransactionalCustomerAtomicCommandService;
}): CustomerBatchJobHandler {
  return {
    handlerKey: 'customer_mutation',
    executionKind: 'itemized',
    async processItem(input, lease) {
      await lease.assertActive(input.tx);
      const persistedInput = object(input.job.input);
      if (
        !/^[a-f0-9]{64}$/.test(String(input.job.inputHash || ''))
        || sha256Json({ input: persistedInput, reason: input.job.reason }) !== input.job.inputHash
      ) {
        throw new Error('批量任务参数已损坏');
      }
      const command = buildCustomerMutationCommand({ ...input.job, input: persistedInput }, input.item.targetKey);
      const result = await options.atomicService.execute(command, {
        tx: input.tx,
        access: input.executionContext.access,
        actor: input.executionContext.actor,
        roles: input.executionContext.roles,
        idempotencyKey: input.item.idempotencyKey,
        requestId: `${input.job.id}:${input.item.id}`,
        batchJobId: input.job.id,
        expectedUpdatedAt: input.item.expectedUpdatedAt
          ? new Date(input.item.expectedUpdatedAt).toISOString()
          : undefined,
      });
      return {
        beforeSnapshot: result.beforeSnapshot,
        afterSnapshot: result.afterSnapshot,
        beforeHash: sha256Json(result.beforeSnapshot),
        afterHash: sha256Json(result.afterSnapshot),
      };
    },
  };
}
