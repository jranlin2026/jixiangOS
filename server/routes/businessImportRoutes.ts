import { Router, type RequestHandler } from 'express';
import type {
  BusinessImportConfirmRequest,
  BusinessImportRequest,
  BusinessImportRow,
  BusinessImportType,
} from '../../src/types/businessImport';
import type { AuthenticatedRequest } from '../middleware/auth';
import { failure, success } from '../api/response';
import { BusinessImportError } from '../services/businessImportService';

type BusinessImportRouteService = {
  templateOptions(type: BusinessImportType, user: NonNullable<AuthenticatedRequest['currentUser']>): Promise<unknown>;
  precheck(input: BusinessImportRequest, user: NonNullable<AuthenticatedRequest['currentUser']>): Promise<unknown>;
  confirm(input: BusinessImportConfirmRequest, user: NonNullable<AuthenticatedRequest['currentUser']>): Promise<unknown>;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BusinessImportError('业务导入请求无效');
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: string[]): Record<string, unknown> {
  const raw = object(value);
  if (Object.keys(raw).length !== keys.length || Object.keys(raw).some((key) => !keys.includes(key))) throw new BusinessImportError('业务导入请求包含不允许的字段');
  return raw;
}

function rows(value: unknown): BusinessImportRow[] {
  if (!Array.isArray(value)) throw new BusinessImportError('导入数据格式无效');
  return value.map((candidate, index) => {
    const input = object(candidate);
    return {
      rowNumber: Number(input.rowNumber || index + 2),
      customerName: String(input.customerName || ''), customerPhone: String(input.customerPhone || ''), customerWechat: String(input.customerWechat || ''),
      productName: String(input.productName || ''), orderType: String(input.orderType || ''), paymentChannel: String(input.paymentChannel || ''),
      paymentAmount: String(input.paymentAmount || ''), paidAt: String(input.paidAt || ''), paymentOrderNo: String(input.paymentOrderNo || ''), salesUserName: String(input.salesUserName || ''), creatorName: String(input.creatorName || ''), notes: String(input.notes || ''),
      originalProduct: String(input.originalProduct || ''), sourcePlatform: String(input.sourcePlatform || ''), sourceShop: String(input.sourceShop || ''),
      originalAmount: String(input.originalAmount || ''), recoveryAmount: String(input.recoveryAmount || ''), recoveryAt: String(input.recoveryAt || ''), paymentAt: String(input.paymentAt || ''), recoveryUserName: String(input.recoveryUserName || ''), assistUserName: String(input.assistUserName || ''),
      thirdPartyOrderNo: String(input.thirdPartyOrderNo || ''), remark: String(input.remark || ''),
    } as BusinessImportRow;
  });
}

function user(request: AuthenticatedRequest) {
  if (!request.currentUser) throw new BusinessImportError('当前登录状态已失效', 401);
  return request.currentUser;
}

function sendError(response: any, error: unknown): void {
  const status = error instanceof BusinessImportError ? error.status : 500;
  response.status(status).json(failure(error instanceof Error && status < 500 ? error.message : '业务导入服务暂时不可用', status));
}

function mount(type: BusinessImportType, access: RequestHandler, service: BusinessImportRouteService) {
  const router = Router();
  router.get('/template-options', access, async (request: AuthenticatedRequest, response) => {
    try { response.json(success(await service.templateOptions(type, user(request)))); } catch (error) { sendError(response, error); }
  });
  router.post('/precheck', access, async (request: AuthenticatedRequest, response) => {
    try { response.json(success(await service.precheck({ type, rows: rows(exact(request.body, ['rows']).rows) }, user(request)))); } catch (error) { sendError(response, error); }
  });
  router.post('/confirm', access, async (request: AuthenticatedRequest, response) => {
    try {
      const body = exact(request.body, ['rows', 'confirmationToken', 'fileName']);
      response.status(201).json(success(await service.confirm({ type, rows: rows(body.rows), confirmationToken: String(body.confirmationToken || ''), fileName: String(body.fileName || '') }, user(request))));
    } catch (error) { sendError(response, error); }
  });
  return router;
}

export function createBusinessImportRouter(deps: { service: BusinessImportRouteService; requireOrderImport: RequestHandler; requireRecoveryImport: RequestHandler }) {
  const router = Router();
  router.use('/orders', mount('orders', deps.requireOrderImport, deps.service));
  router.use('/recovery-orders', mount('recovery_orders', deps.requireRecoveryImport, deps.service));
  return router;
}
