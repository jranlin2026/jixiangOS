import { Router, type RequestHandler } from 'express';
import type {
  BusinessImportConfirmRequest,
  BusinessImportRequest,
  BusinessImportRow,
  BusinessImportType,
  BusinessImportReviewRequest,
} from '../../src/types/businessImport';
import { BUSINESS_IMPORT_MAX_ROW_NUMBER } from '../../src/types/businessImport';
import type { AuthenticatedRequest } from '../middleware/auth';
import { failure, success } from '../api/response';
import { BusinessImportError } from '../services/businessImportService';
import { BusinessImportReviewError } from '../services/businessImportReviewService';

type BusinessImportRouteService = {
  templateOptions(type: BusinessImportType, user: NonNullable<AuthenticatedRequest['currentUser']>): Promise<unknown>;
  precheck(input: BusinessImportRequest, user: NonNullable<AuthenticatedRequest['currentUser']>): Promise<unknown>;
  confirm(input: BusinessImportConfirmRequest, user: NonNullable<AuthenticatedRequest['currentUser']>): Promise<unknown>;
};

type BusinessImportReadService = {
  getJob(id: string, user: NonNullable<AuthenticatedRequest['currentUser']>): Promise<unknown | null>;
  getBatch(id: string, user: NonNullable<AuthenticatedRequest['currentUser']>): Promise<unknown | null>;
};

type BusinessImportReviewService = {
  review(input: BusinessImportReviewRequest, user: NonNullable<AuthenticatedRequest['currentUser']>): Promise<unknown>;
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

function allowed(value: unknown, keys: string[]): Record<string, unknown> {
  const raw = object(value);
  if (Object.keys(raw).some((key) => !keys.includes(key))) throw new BusinessImportError('业务导入请求包含不允许的字段');
  return raw;
}

const COMMON_ROW_KEYS = ['rowNumber', 'customerName', 'customerPhone', 'customerWechat', 'paymentChannel', 'paymentOrderNo', 'creatorName', 'thirdPartyOrderNo', 'remark'] as const;
const ORDER_ROW_KEYS = [
  ...COMMON_ROW_KEYS, 'productName', 'orderType', 'paymentAmount', 'paidAt', 'salesUserName', 'notes',
  'paymentProofFileName', 'dealEvidenceFileNames', 'paymentProofAttachmentIds', 'dealEvidenceAttachmentIds',
] as const;
const RECOVERY_ROW_KEYS = [
  ...COMMON_ROW_KEYS, 'originalProduct', 'sourcePlatform', 'sourceShop', 'originalAmount', 'recoveryAmount', 'recoveryAt',
  'paymentAt', 'recoveryUserName', 'assistUserName', 'recoveryEvidenceFileNames', 'recoveryEvidenceAttachmentIds',
] as const;

function optionalIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new BusinessImportError('导入图片上传结果无效');
  return value.map((item) => item.trim());
}

function rows(type: BusinessImportType, value: unknown): BusinessImportRow[] {
  if (!Array.isArray(value)) throw new BusinessImportError('导入数据格式无效');
  const parsed = value.map((candidate, index) => {
    const input = allowed(candidate, type === 'orders' ? [...ORDER_ROW_KEYS] : [...RECOVERY_ROW_KEYS]);
    const common = {
      rowNumber: input.rowNumber === undefined || input.rowNumber === null || input.rowNumber === '' ? index + 2 : Number(input.rowNumber),
      customerName: String(input.customerName || ''), customerPhone: String(input.customerPhone || ''), customerWechat: String(input.customerWechat || ''),
      paymentChannel: String(input.paymentChannel || ''), paymentOrderNo: String(input.paymentOrderNo || ''), creatorName: String(input.creatorName || ''),
      thirdPartyOrderNo: String(input.thirdPartyOrderNo || ''), remark: String(input.remark || ''),
    };
    return type === 'orders' ? {
      ...common, productName: String(input.productName || ''), orderType: String(input.orderType || ''),
      paymentAmount: String(input.paymentAmount || ''), paidAt: String(input.paidAt || ''),
      salesUserName: String(input.salesUserName || ''), notes: String(input.notes || ''),
      paymentProofFileName: String(input.paymentProofFileName || ''), dealEvidenceFileNames: String(input.dealEvidenceFileNames || ''),
      paymentProofAttachmentIds: optionalIds(input.paymentProofAttachmentIds), dealEvidenceAttachmentIds: optionalIds(input.dealEvidenceAttachmentIds),
    } : {
      ...common, originalProduct: String(input.originalProduct || ''), sourcePlatform: String(input.sourcePlatform || ''), sourceShop: String(input.sourceShop || ''),
      originalAmount: String(input.originalAmount || ''), recoveryAmount: String(input.recoveryAmount || ''), recoveryAt: String(input.recoveryAt || ''),
      paymentAt: String(input.paymentAt || ''), recoveryUserName: String(input.recoveryUserName || ''), assistUserName: String(input.assistUserName || ''),
      recoveryEvidenceFileNames: String(input.recoveryEvidenceFileNames || ''), recoveryEvidenceAttachmentIds: optionalIds(input.recoveryEvidenceAttachmentIds),
    } as BusinessImportRow;
  });
  if (parsed.some((row) => !Number.isSafeInteger(row.rowNumber) || row.rowNumber < 2 || row.rowNumber > BUSINESS_IMPORT_MAX_ROW_NUMBER)) {
    throw new BusinessImportError(`导入数据 rowNumber 行号必须是 2 到 ${BUSINESS_IMPORT_MAX_ROW_NUMBER} 之间的整数`);
  }
  if (new Set(parsed.map((row) => row.rowNumber)).size !== parsed.length) {
    throw new BusinessImportError('导入数据 rowNumber 行号不能重复');
  }
  return parsed;
}

function user(request: AuthenticatedRequest) {
  if (!request.currentUser) throw new BusinessImportError('当前登录状态已失效', 401);
  return request.currentUser;
}

function sendError(response: any, error: unknown): void {
  const status = error instanceof BusinessImportError || error instanceof BusinessImportReviewError ? error.status : 500;
  response.status(status).json(failure(error instanceof Error && status < 500 ? error.message : '业务导入服务暂时不可用', status));
}

function mount(type: BusinessImportType, access: RequestHandler, service: BusinessImportRouteService) {
  const router = Router();
  router.get('/template-options', access, async (request: AuthenticatedRequest, response) => {
    try { response.json(success(await service.templateOptions(type, user(request)))); } catch (error) { sendError(response, error); }
  });
  router.post('/precheck', access, async (request: AuthenticatedRequest, response) => {
    try { response.json(success(await service.precheck({ type, rows: rows(type, exact(request.body, ['rows']).rows) }, user(request)))); } catch (error) { sendError(response, error); }
  });
  router.post('/confirm', access, async (request: AuthenticatedRequest, response) => {
    try {
      const body = allowed(request.body, ['rows', 'confirmationToken', 'fileName', 'mode']);
      if (!['rows', 'confirmationToken', 'fileName'].every((key) => key in body)) throw new BusinessImportError('业务导入请求无效');
      if (body.mode !== undefined && body.mode !== 'eligible_only') throw new BusinessImportError('业务导入模式无效');
      response.status(201).json(success(await service.confirm({
        type,
        rows: rows(type, body.rows),
        confirmationToken: String(body.confirmationToken || ''),
        fileName: String(body.fileName || ''),
        ...(body.mode === 'eligible_only' ? { mode: 'eligible_only' as const } : {}),
      }, user(request))));
    } catch (error) { sendError(response, error); }
  });
  return router;
}

export function createBusinessImportRouter(deps: {
  service: BusinessImportRouteService;
  readService?: BusinessImportReadService;
  reviewService?: BusinessImportReviewService;
  requireOrderImport: RequestHandler;
  requireRecoveryImport: RequestHandler;
  requireAuthenticated?: RequestHandler;
}) {
  const router = Router();
  if (deps.readService && deps.requireAuthenticated) {
    router.get('/jobs/:id', deps.requireAuthenticated, async (request: AuthenticatedRequest, response) => {
      try {
        const result = await deps.readService!.getJob(String(request.params.id || ''), user(request));
        if (!result) return response.status(404).json(failure('导入任务不存在', 404));
        response.json(success(result));
      } catch (error) { sendError(response, error); }
    });
    router.get('/batches/:id', deps.requireAuthenticated, async (request: AuthenticatedRequest, response) => {
      try {
        const result = await deps.readService!.getBatch(String(request.params.id || ''), user(request));
        if (!result) return response.status(404).json(failure('导入批次不存在', 404));
        response.json(success(result));
      } catch (error) { sendError(response, error); }
    });
  }
  if (deps.reviewService && deps.requireAuthenticated) {
    router.post('/reviews', deps.requireAuthenticated, async (request: AuthenticatedRequest, response) => {
      try {
        const body = allowed(request.body, ['module', 'action', 'ids', 'importBatchId', 'reason']);
        response.json(success(await deps.reviewService!.review({
          module: String(body.module || '') as BusinessImportType,
          action: String(body.action || '') as BusinessImportReviewRequest['action'],
          ids: Array.isArray(body.ids) ? body.ids.map(String) : undefined,
          importBatchId: body.importBatchId === undefined ? undefined : String(body.importBatchId),
          reason: body.reason === undefined ? undefined : String(body.reason),
        }, user(request))));
      } catch (error) { sendError(response, error); }
    });
  }
  router.use('/orders', mount('orders', deps.requireOrderImport, deps.service));
  router.use('/recovery-orders', mount('recovery_orders', deps.requireRecoveryImport, deps.service));
  return router;
}
