import { Router, type RequestHandler } from 'express';
import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  CreateCustomerBatchJobRequest,
  CustomerBatchJobItemView,
  CustomerBatchJobResultView,
  CustomerBatchJobSummary,
  CustomerBatchPrecheckRequest,
  CustomerBatchPrecheckResult,
} from '../../src/types/customerBatch';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { CustomerAccessContext } from '../services/customerAccessPolicy';
import {
  BatchPrecheckAuthorizationError,
  BatchPrecheckConflictError,
  BatchPrecheckValidationError,
} from '../services/customerBatchPrecheckService';
import {
  CUSTOMER_BATCH_HANDLER_KEY,
  normalizeCustomerBatchPrecheckRequest,
} from '../services/customerBatchService';
import { failure, success } from '../api/response';

type CustomerBatchRouteService = {
  precheckCustomerBatch(input: CustomerBatchPrecheckRequest, context: CustomerAccessContext): Promise<CustomerBatchPrecheckResult>;
  createCustomerBatchJob(input: CreateCustomerBatchJobRequest, context: CustomerAccessContext): Promise<CustomerBatchJobSummary>;
  getCustomerBatchJob(id: string, context: CustomerAccessContext): Promise<CustomerBatchJobSummary | null>;
  listCustomerBatchJobs(context: CustomerAccessContext): Promise<CustomerBatchJobSummary[]>;
  listCustomerBatchJobItems(id: string, context: CustomerAccessContext): Promise<CustomerBatchJobItemView[]>;
  getCustomerBatchJobResult(id: string, context: CustomerAccessContext): Promise<CustomerBatchJobResultView | null>;
  requestCustomerBatchCancellation(id: string, context: CustomerAccessContext): Promise<CustomerBatchJobSummary>;
};

export type CustomerBatchRouterDependencies = {
  service: CustomerBatchRouteService;
  /** Always reload role/scope from the server directory; never use browser claims. */
  loadCurrentAccess(currentUser: AuthenticatedUser): Promise<CustomerAccessContext>;
  requireManage: RequestHandler;
  /** CUSTOMER_BATCH_AUDIT_READ or CUSTOMER_BATCH_MANAGE. */
  requireRead: RequestHandler;
  /** Authentication only; creator-vs-operator cancellation is checked by the service against current scope. */
  requireAuthenticated: RequestHandler;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function requireExactKeys(value: unknown, allowedKeys: readonly string[], message: string): Record<string, unknown> {
  const raw = record(value);
  if (!raw) throw new BatchPrecheckValidationError(message);
  const keys = Object.keys(raw);
  if (keys.length !== allowedKeys.length || keys.some((key) => !allowedKeys.includes(key))) {
    throw new BatchPrecheckValidationError(message);
  }
  return raw;
}

/**
 * The browser may only supply its operation command. Handler identity, counts,
 * hashes, version data and guard data are intentionally server-owned.
 */
export function parseCustomerBatchBrowserPrecheckRequest(value: unknown): CustomerBatchPrecheckRequest {
  const raw = requireExactKeys(
    value,
    ['operation', 'selection', 'input', 'reason'],
    '批量预检请求包含不允许的字段',
  );
  return normalizeCustomerBatchPrecheckRequest({
    handlerKey: CUSTOMER_BATCH_HANDLER_KEY,
    operation: raw.operation,
    selection: raw.selection,
    input: raw.input,
    reason: raw.reason,
  });
}

/** Confirmation is token-only; the persisted precheck owns every other fact. */
export function parseCustomerBatchJobConfirmation(value: unknown): CreateCustomerBatchJobRequest {
  const raw = requireExactKeys(
    value,
    ['precheckToken', 'idempotencyKey'],
    '批量任务创建请求包含不允许的字段',
  );
  const precheckToken = typeof raw.precheckToken === 'string' ? raw.precheckToken.trim() : '';
  const idempotencyKey = typeof raw.idempotencyKey === 'string' ? raw.idempotencyKey.trim() : '';
  if (!precheckToken || !idempotencyKey) throw new BatchPrecheckValidationError('批量任务确认参数无效');
  return { precheckToken, idempotencyKey };
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value) || typeof value !== 'string') throw new BatchPrecheckValidationError('批量任务 ID 无效');
  const id = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) throw new BatchPrecheckValidationError('批量任务 ID 无效');
  return id;
}

function parseEmptyCancelBody(value: unknown): void {
  if (value === undefined) return;
  const raw = record(value);
  if (!raw || Object.keys(raw).length) throw new BatchPrecheckValidationError('取消任务请求不允许携带参数');
}

function statusForError(error: unknown): number {
  if (error instanceof BatchPrecheckValidationError) return 400;
  if (error instanceof BatchPrecheckAuthorizationError) return 403;
  if (error instanceof BatchPrecheckConflictError) return 409;
  const statusCode = Number((error as { statusCode?: unknown } | null)?.statusCode);
  return [400, 401, 403, 404, 409].includes(statusCode) ? statusCode : 500;
}

function messageForError(error: unknown, status: number): string {
  if (
    error instanceof BatchPrecheckValidationError
    || error instanceof BatchPrecheckAuthorizationError
    || error instanceof BatchPrecheckConflictError
  ) return error.message;
  if (status >= 400 && status < 500 && error instanceof Error) return error.message || '批量客户操作失败';
  return '批量客户操作服务暂时不可用';
}

function sendError(response: Parameters<RequestHandler>[1], error: unknown): void {
  const status = statusForError(error);
  response.status(status).json(failure(messageForError(error, status), status));
}

async function currentAccess(
  request: AuthenticatedRequest,
  loadCurrentAccess: CustomerBatchRouterDependencies['loadCurrentAccess'],
): Promise<CustomerAccessContext> {
  if (!request.currentUser) throw new BatchPrecheckConflictError('当前登录状态已失效');
  return loadCurrentAccess(request.currentUser);
}

export function createCustomerBatchRouter(deps: CustomerBatchRouterDependencies) {
  const router = Router();

  router.post('/precheck', deps.requireManage, async (request: AuthenticatedRequest, response) => {
    try {
      const input = parseCustomerBatchBrowserPrecheckRequest(request.body);
      const context = await currentAccess(request, deps.loadCurrentAccess);
      response.status(200).json(success(await deps.service.precheckCustomerBatch(input, context)));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/', deps.requireManage, async (request: AuthenticatedRequest, response) => {
    try {
      const input = parseCustomerBatchJobConfirmation(request.body);
      const context = await currentAccess(request, deps.loadCurrentAccess);
      response.status(201).json(success(await deps.service.createCustomerBatchJob(input, context)));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get('/', deps.requireRead, async (request: AuthenticatedRequest, response) => {
    try {
      const context = await currentAccess(request, deps.loadCurrentAccess);
      response.status(200).json(success(await deps.service.listCustomerBatchJobs(context)));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get('/:id/items', deps.requireRead, async (request: AuthenticatedRequest, response) => {
    try {
      const context = await currentAccess(request, deps.loadCurrentAccess);
      response.status(200).json(success(await deps.service.listCustomerBatchJobItems(routeParam(request.params.id), context)));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get('/:id/result', deps.requireRead, async (request: AuthenticatedRequest, response) => {
    try {
      const context = await currentAccess(request, deps.loadCurrentAccess);
      const result = await deps.service.getCustomerBatchJobResult(routeParam(request.params.id), context);
      if (!result) {
        response.status(404).json(failure('批量任务不存在', 404));
        return;
      }
      response.status(200).json(success(result));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.get('/:id', deps.requireRead, async (request: AuthenticatedRequest, response) => {
    try {
      const context = await currentAccess(request, deps.loadCurrentAccess);
      const job = await deps.service.getCustomerBatchJob(routeParam(request.params.id), context);
      if (!job) {
        response.status(404).json(failure('批量任务不存在', 404));
        return;
      }
      response.status(200).json(success(job));
    } catch (error) {
      sendError(response, error);
    }
  });

  router.post('/:id/cancel', deps.requireAuthenticated, async (request: AuthenticatedRequest, response) => {
    try {
      parseEmptyCancelBody(request.body);
      const context = await currentAccess(request, deps.loadCurrentAccess);
      response.status(200).json(success(await deps.service.requestCustomerBatchCancellation(routeParam(request.params.id), context)));
    } catch (error) {
      sendError(response, error);
    }
  });

  return router;
}
