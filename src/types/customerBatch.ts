import type { CustomerBatchOperation as CustomerMutationBatchOperation } from '../shared/utils/permissions';

/**
 * Batch-capable customer mutations share the same operation vocabulary as the
 * permission model, preventing a UI-only action from drifting from the server.
 */
export type CustomerBatchOperation = CustomerMutationBatchOperation;

export type CustomerBatchJobStatus =
  | 'queued'
  | 'running'
  | 'cancel_requested'
  | 'cancelled'
  | 'succeeded'
  | 'partial_failed'
  | 'failed';

export type CustomerBatchItemStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type CustomerBatchPrecheckStatus = 'issued' | 'consumed' | 'expired' | 'invalidated';

/** A first-stage mutation item always points at one opaque customer ID. */
export function customerMutationTargetKey(customerId: string): string {
  const normalizedCustomerId = String(customerId || '').trim();
  if (!normalizedCustomerId) throw new Error('客户 ID 不能为空');
  return `customer:${normalizedCustomerId}`;
}

/**
 * The item key is both deterministic and bounded by the corresponding MySQL
 * VARCHAR(191) column: job ids are 64 characters and target keys are 120.
 */
export function deriveCustomerBatchItemIdempotencyKey(jobId: string, targetKey: string): string {
  const normalizedJobId = String(jobId || '').trim();
  const normalizedTargetKey = String(targetKey || '').trim();
  if (!normalizedJobId) throw new Error('任务 ID 不能为空');
  if (!normalizedTargetKey) throw new Error('targetKey 不能为空');
  const key = `${normalizedJobId}:${normalizedTargetKey}`;
  if (key.length > 191) throw new Error('任务明细幂等键超过 191 个字符');
  return key;
}
