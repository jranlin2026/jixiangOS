import type {
  BusinessImportReviewAction,
  BusinessImportReviewRequest,
  BusinessImportReviewResult,
  BusinessImportType,
} from '../../types/businessImport';

export type BusinessImportReviewSelection =
  | { mode: 'ids'; ids: string[] }
  | { mode: 'batch'; importBatchId: string };

type PendingReviewRecord = {
  importBatchId?: string;
  status?: string;
};

export function isImportedPendingReviewRecord(
  record: PendingReviewRecord,
  module: BusinessImportType,
): boolean {
  if (!String(record.importBatchId || '').trim()) return false;
  return module === 'orders'
    ? record.status === '待财务审核'
    : record.status === '待审核';
}

export function toggleImportedReviewId(
  selection: BusinessImportReviewSelection,
  id: string,
): BusinessImportReviewSelection {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) return selection;
  const ids = selection.mode === 'ids' ? selection.ids : [];
  return ids.includes(normalizedId)
    ? { mode: 'ids', ids: ids.filter((selectedId) => selectedId !== normalizedId) }
    : { mode: 'ids', ids: [...ids, normalizedId] };
}

export function selectAllImportedReviewBatch(importBatchId: string): BusinessImportReviewSelection {
  return { mode: 'batch', importBatchId: String(importBatchId || '').trim() };
}

export function buildBusinessImportReviewRequest(
  module: BusinessImportType,
  action: BusinessImportReviewAction,
  selection: BusinessImportReviewSelection,
  reason: string,
): BusinessImportReviewRequest {
  const normalizedReason = String(reason || '').trim();
  if (action !== 'approve' && !normalizedReason) {
    throw new Error(action === 'return' ? '请填写退回原因' : '请填写驳回原因');
  }
  const request: BusinessImportReviewRequest = {
    module,
    action,
    ...(selection.mode === 'batch'
      ? { importBatchId: String(selection.importBatchId || '').trim() }
      : { ids: Array.from(new Set(selection.ids.map((id) => String(id || '').trim()).filter(Boolean))) }),
    ...(normalizedReason ? { reason: normalizedReason } : {}),
  };
  if (selection.mode === 'batch' ? !request.importBatchId : !request.ids?.length) {
    throw new Error('请选择待审核的导入记录');
  }
  return request;
}

export function failedBusinessImportReviewSelection(
  result: BusinessImportReviewResult,
): BusinessImportReviewSelection {
  return {
    mode: 'ids',
    ids: result.results.filter((item) => !item.success).map((item) => item.id),
  };
}

export function createBusinessImportReviewSingleFlight<T>(
  run: () => Promise<T>,
): () => Promise<T> {
  let active: Promise<T> | null = null;
  return () => {
    if (active) return active;
    active = run().finally(() => { active = null; });
    return active;
  };
}
