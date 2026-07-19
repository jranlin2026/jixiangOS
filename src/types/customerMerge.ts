export const CUSTOMER_MERGE_FIELDS = [
  'name',
  'phone',
  'wechat',
  'company',
  'customerLevel',
  'industry',
  'city',
  'leadSource',
  'remark',
  'ownerId',
  'lifecycleStatusCode',
] as const;

export type CustomerMergeField = typeof CUSTOMER_MERGE_FIELDS[number];
export type CustomerMergeStatus = 'open' | 'merged' | 'dismissed' | 'blocked';
export type CustomerMergeConfidence = 'high' | 'possible' | 'manual';

export const CUSTOMER_MERGE_HANDLER_KEY = 'customer_merge' as const;
export const CUSTOMER_MERGE_UNDO_HANDLER_KEY = 'customer_merge_undo' as const;

export interface CustomerMergeFieldDecision {
  sourceCustomerId: string;
}

export interface CustomerMergeTagDecision {
  selectedTagIds: string[];
  singleGroupSelections?: Record<string, string>;
}

export interface CustomerMergePrecheckInput {
  mainCustomerId: string;
  secondaryCustomerIds: string[];
  fieldDecisions: Partial<Record<CustomerMergeField, CustomerMergeFieldDecision>>;
  tagDecision: CustomerMergeTagDecision;
  reason: string;
}

export interface CustomerMergeExecutionInput extends CustomerMergePrecheckInput {
  precheckToken: string;
  idempotencyKey: string;
}

export interface CustomerMergeConflict {
  code: string;
  message: string;
  recordType?: string;
  recordId?: string;
}

export interface CustomerMergePrecheckResult {
  executable: boolean;
  precheckToken?: string;
  expiresAt?: string;
  conflicts: CustomerMergeConflict[];
  associationCounts: Record<string, number>;
  requiredDecisions: CustomerMergeField[];
}

export interface CustomerMergeLedgerView {
  id: string;
  mainCustomerId: string;
  secondaryCustomerIds: string[];
  status: 'merged' | 'undone';
  mergedAt: string;
  undoDeadlineAt: string;
  reason: string;
  actor: { id: string; name: string };
  undoneAt?: string;
  undoneBy?: { id: string; name: string };
  lastUndoBlockedAt?: string;
  undoConflicts?: Array<Pick<CustomerMergeConflict, 'code' | 'message' | 'recordType'>>;
}

export interface CustomerMergeUndoPrecheckResult {
  executable: boolean;
  conflicts: CustomerMergeConflict[];
  undoDeadlineAt: string;
  precheckToken?: string;
  expiresAt?: string;
}

export interface CustomerMergeUndoExecutionInput {
  ledgerId: string;
  precheckToken: string;
  idempotencyKey: string;
}

export interface MergedCustomerRedirect {
  merged: true;
  canonicalCustomerId: string;
  mergeLedgerId: string;
}

export function isCustomerMergeExecutionInput(value: unknown): value is CustomerMergeExecutionInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Partial<CustomerMergeExecutionInput>;
  return Boolean(
    typeof input.mainCustomerId === 'string'
    && Array.isArray(input.secondaryCustomerIds)
    && input.secondaryCustomerIds.length > 0
    && typeof input.reason === 'string'
    && input.reason.trim().length > 0
    && typeof input.precheckToken === 'string'
    && input.precheckToken.length > 0
    && typeof input.idempotencyKey === 'string'
    && input.idempotencyKey.length > 0
    && input.fieldDecisions
    && input.tagDecision
    && Array.isArray(input.tagDecision.selectedTagIds),
  );
}
