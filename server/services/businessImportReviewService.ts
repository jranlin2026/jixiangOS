import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  BusinessImportReviewRequest,
  BusinessImportReviewResult,
  BusinessImportType,
} from '../../src/types/businessImport';
import { safeBusinessImportReviewException } from './businessImportError';

type SelectedRecord = { id: string; module: BusinessImportType };
type CommandResult = { code: number; message?: string; data?: unknown };
type OrderCommands = {
  approve(id: string, actor: AuthenticatedUser): Promise<CommandResult>;
  returnApplication(id: string, reason: string, actor: AuthenticatedUser): Promise<CommandResult>;
  reject(id: string, reason: string, actor: AuthenticatedUser): Promise<CommandResult>;
};
type RecoveryCommands = {
  approve(id: string, actor: AuthenticatedUser): Promise<CommandResult>;
  returnForChanges(id: string, reason: string, actor: AuthenticatedUser): Promise<CommandResult>;
  reject(id: string, reason: string, actor: AuthenticatedUser): Promise<CommandResult>;
};

export class BusinessImportReviewError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function createBusinessImportReviewService(deps: {
  selectImportedRecords(request: BusinessImportReviewRequest, actor: AuthenticatedUser): Promise<SelectedRecord[]>;
  orderApplications: OrderCommands;
  recoveryOrders: RecoveryCommands;
}) {
  return {
    async review(request: BusinessImportReviewRequest, actor: AuthenticatedUser): Promise<BusinessImportReviewResult> {
      if (!request || !['orders', 'recovery_orders'].includes(request.module)) throw new BusinessImportReviewError('导入审核模块无效');
      if (!['approve', 'return', 'reject'].includes(request.action)) throw new BusinessImportReviewError('导入审核操作无效');
      const ids = Array.from(new Set((request.ids || []).map((id) => String(id || '').trim()).filter(Boolean)));
      const batchId = String(request.importBatchId || '').trim();
      if ((ids.length ? 1 : 0) + (batchId ? 1 : 0) !== 1) throw new BusinessImportReviewError('ids 与 importBatchId 必须且只能提供一项');
      const reason = String(request.reason || '').trim();
      if (request.action !== 'approve' && !reason) throw new BusinessImportReviewError('reason is required for return or reject');
      const selected = await deps.selectImportedRecords({ ...request, ids: ids.length ? ids : undefined, importBatchId: batchId || undefined }, actor);
      const results = [];
      const selectedById = new Map(selected.map((record) => [record.id, record]));
      const reviewTargets: Array<SelectedRecord | { id: string; missing: true }> = ids.length
        ? ids.map((id) => selectedById.get(id) || { id, missing: true as const })
        : selected;
      for (const record of reviewTargets) {
        if ('missing' in record) {
          results.push({ id: record.id, success: false, code: 404, message: '导入审核记录不存在或不属于当前模块' });
          continue;
        }
        try {
          let response: CommandResult;
          if (record.module === 'orders') {
            response = request.action === 'approve'
              ? await deps.orderApplications.approve(record.id, actor)
              : request.action === 'return'
                ? await deps.orderApplications.returnApplication(record.id, reason, actor)
                : await deps.orderApplications.reject(record.id, reason, actor);
          } else {
            response = request.action === 'approve'
              ? await deps.recoveryOrders.approve(record.id, actor)
              : request.action === 'return'
                ? await deps.recoveryOrders.returnForChanges(record.id, reason, actor)
                : await deps.recoveryOrders.reject(record.id, reason, actor);
          }
          results.push({ id: record.id, success: response.code === 0, code: response.code, message: response.message || (response.code === 0 ? '操作成功' : '操作失败') });
        } catch {
          results.push({ id: record.id, success: false, code: 500, message: safeBusinessImportReviewException() });
        }
      }
      return {
        totalCount: results.length,
        successCount: results.filter((item) => item.success).length,
        failedCount: results.filter((item) => !item.success).length,
        results,
      };
    },
  };
}
