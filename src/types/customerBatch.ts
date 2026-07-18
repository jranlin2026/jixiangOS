import type { CustomerBatchOperation as CustomerMutationBatchOperation } from '../shared/utils/permissions';
import type { CustomerFilters } from './customer';

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

export type BatchPrecheckHandlerKey = 'customer_mutation' | (string & {});

export type CustomerBatchSelection =
  | { mode: 'ids'; customerIds: string[] }
  | { mode: 'filter_snapshot'; filters: CustomerFilters };

export type CustomerBatchOperationInput =
  | { targetOwnerId: string }
  | { lifecycleStatusCode: string }
  | { mode: 'add' | 'remove'; tagIds: string[] }
  | { title: string; content?: string; dueAt: string; executionMethod: string }
  | { confirmed: true }
  | Record<string, never>;

export type CustomerBatchPrecheckItemResult = {
  customerId: string;
  status: 'ready' | 'blocked';
  reason: string;
};

/**
 * Immutable, server-built revalidation material. It is persisted with the
 * precheck, never supplied by the confirmation request, and may contain only
 * opaque IDs/config fingerprints rather than customer contact details.
 */
export type BatchPrecheckGuardManifest = {
  version: 1;
  requiredPermissionKeys: string[];
  customerGuards: Array<{
    customerId: string;
    ownerId: string;
    scopeEligible: boolean;
    businessRecordUpdatedAt: string;
  }>;
  lifecycleConfigRevision: string;
  tagCatalogRevision: string;
  command: {
    selectionMode: CustomerBatchSelection['mode'];
    input: CustomerBatchOperationInput;
    reason: string;
  };
};

export type CustomerBatchPrecheckRequest = {
  handlerKey: BatchPrecheckHandlerKey;
  operation: CustomerBatchOperation;
  selection: CustomerBatchSelection;
  input: CustomerBatchOperationInput;
  reason: string;
};

export type CustomerBatchPrecheckResult = {
  confirmationToken: string;
  expiresAt: string;
  totalCount: number;
  executionMode: 'background';
  selectionHash: string;
  inputHash: string;
  itemResults: CustomerBatchPrecheckItemResult[];
};

export type CreateCustomerBatchJobRequest = {
  precheckToken: string;
  idempotencyKey: string;
};

export type CustomerBatchJobSummary = {
  id: string;
  actorId: string;
  actorName: string;
  handlerKey: string;
  operation: CustomerBatchOperation;
  status: CustomerBatchJobStatus;
  selectionMode: CustomerBatchSelection['mode'];
  frozenCustomerCount: number;
  totalCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  cancelledCount: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  cancelRequestedAt?: string;
  cancelledAt?: string;
};

export type CustomerBatchJobItemView = {
  id: string;
  targetKey: string;
  status: CustomerBatchItemStatus;
  errorCode?: string;
  errorMessage?: string;
  retryable: boolean;
  attemptCount: number;
};

export type CustomerBatchJobResultView = {
  job: CustomerBatchJobSummary;
  items: CustomerBatchJobItemView[];
};

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
