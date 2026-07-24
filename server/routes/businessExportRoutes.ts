import { Router, type RequestHandler } from 'express';
import { failure } from '../api/response';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { BusinessExportModule, BusinessExportRequest, BusinessExportResult } from '../../src/types/businessExport';

type ExportService = {
  export(input: BusinessExportRequest, actor: NonNullable<AuthenticatedRequest['currentUser']>): Promise<{ code: number; data: BusinessExportResult | null; message: string }>;
};

export function createBusinessExportRouter(deps: { service: ExportService; requireAuthenticated: RequestHandler }) {
  const router = Router();
  router.post('/:module', deps.requireAuthenticated, async (request: AuthenticatedRequest, response) => {
    const module = request.params.module as BusinessExportModule;
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => !['reason', 'filters', 'columnMode', 'columnIds'].includes(key))) {
      response.status(400).json(failure('导出请求包含不允许的字段', 400));
      return;
    }
    if (!request.currentUser) {
      response.status(401).json(failure('Unauthorized', 401));
      return;
    }
    try {
      const result = await deps.service.export({ module, reason: body.reason, filters: body.filters, columnMode: body.columnMode, columnIds: body.columnIds }, request.currentUser);
      response.status(result.code === 0 ? 200 : result.code >= 400 && result.code < 500 ? result.code : 500).json(result);
    } catch {
      response.status(500).json(failure('业务导出服务暂时不可用', 500));
    }
  });
  return router;
}
