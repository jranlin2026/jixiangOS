import { Router, type RequestHandler } from 'express';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { CustomerMergeExecutionInput, CustomerMergePrecheckInput, CustomerMergeUndoExecutionInput } from '../../src/types/customerMerge';
import type { AuthenticatedRequest } from '../middleware/auth';
import type { CustomerAccessContext } from '../services/customerAccessPolicy';
import {
  BatchPrecheckAuthorizationError,
  BatchPrecheckConflictError,
  BatchPrecheckValidationError,
} from '../services/customerBatchPrecheckService';
import { failure, success } from '../api/response';

type MergeService = {
  listDuplicateCandidates(context: CustomerAccessContext): Promise<unknown>;
  createDuplicateCandidate(ids: string[], context: CustomerAccessContext): Promise<unknown>;
  listHistory(context: CustomerAccessContext): Promise<unknown>;
  getHistory(id: string, context: CustomerAccessContext): Promise<unknown | null>;
  precheck(input: CustomerMergePrecheckInput, context: CustomerAccessContext): Promise<unknown>;
  execute(input: CustomerMergeExecutionInput, context: CustomerAccessContext): Promise<unknown>;
  undoPrecheck(id: string, context: CustomerAccessContext): Promise<unknown>;
  undo(input: CustomerMergeUndoExecutionInput, context: CustomerAccessContext): Promise<unknown>;
};

export type CustomerMergeRouterDependencies = {
  service: MergeService;
  loadCurrentAccess(user: AuthenticatedUser): Promise<CustomerAccessContext>;
  requireMerge: RequestHandler;
  requireUndo: RequestHandler;
};

function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BatchPrecheckValidationError('客户合并请求无效');
  return value as Record<string, any>;
}

function exact(value: unknown, keys: string[]): Record<string, any> {
  const raw = record(value);
  if (Object.keys(raw).length !== keys.length || Object.keys(raw).some((key) => !keys.includes(key))) {
    throw new BatchPrecheckValidationError('客户合并请求包含不允许的字段');
  }
  return raw;
}

function precheckFrom(raw: Record<string, any>): CustomerMergePrecheckInput {
  if (typeof raw.mainCustomerId !== 'string' || !Array.isArray(raw.secondaryCustomerIds)
    || !raw.fieldDecisions || typeof raw.fieldDecisions !== 'object'
    || !raw.tagDecision || !Array.isArray(raw.tagDecision.selectedTagIds)
    || typeof raw.reason !== 'string') throw new BatchPrecheckValidationError('客户合并参数无效');
  return {
    mainCustomerId: raw.mainCustomerId.trim(),
    secondaryCustomerIds: raw.secondaryCustomerIds.map((id: unknown) => String(id || '').trim()),
    fieldDecisions: raw.fieldDecisions,
    tagDecision: raw.tagDecision,
    reason: raw.reason.trim(),
  };
}

export function parseCustomerMergePrecheck(value: unknown): CustomerMergePrecheckInput {
  return precheckFrom(exact(value, ['mainCustomerId', 'secondaryCustomerIds', 'fieldDecisions', 'tagDecision', 'reason']));
}

export function parseCustomerMergeConfirmation(value: unknown): CustomerMergeExecutionInput {
  const raw = exact(value, ['mainCustomerId', 'secondaryCustomerIds', 'fieldDecisions', 'tagDecision', 'reason', 'precheckToken', 'idempotencyKey']);
  const base = precheckFrom(raw);
  const precheckToken = String(raw.precheckToken || '').trim();
  const idempotencyKey = String(raw.idempotencyKey || '').trim();
  if (!precheckToken || !idempotencyKey) throw new BatchPrecheckValidationError('客户合并确认参数无效');
  return { ...base, precheckToken, idempotencyKey };
}

function id(value: unknown): string {
  const result = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(result)) throw new BatchPrecheckValidationError('合并记录 ID 无效');
  return result;
}

async function access(request: AuthenticatedRequest, loader: CustomerMergeRouterDependencies['loadCurrentAccess']) {
  if (!request.currentUser) throw new BatchPrecheckAuthorizationError('当前登录状态已失效');
  return loader(request.currentUser);
}

function sendError(response: any, error: unknown) {
  const known = error instanceof BatchPrecheckValidationError
    ? 400 : error instanceof BatchPrecheckAuthorizationError
      ? 403 : error instanceof BatchPrecheckConflictError
        ? 409 : /MERGE_REQUIRES|字段|标签|原因/.test(String((error as Error)?.message || '')) ? 422 : 500;
  const message = known === 500 ? '客户合并服务暂时不可用' : String((error as Error)?.message || '客户合并失败');
  response.status(known).json(failure(message, known));
}

export function createCustomerMergeRouter(deps: CustomerMergeRouterDependencies) {
  const router = Router();
  const wrap = (permission: RequestHandler, handler: (request: AuthenticatedRequest, response: any, context: CustomerAccessContext) => Promise<void>) => [
    permission,
    async (request: AuthenticatedRequest, response: any) => {
      try { await handler(request, response, await access(request, deps.loadCurrentAccess)); } catch (error) { sendError(response, error); }
    },
  ] as const;

  router.get('/customer-duplicates', ...wrap(deps.requireMerge, async (_request, response, context) => {
    response.json(success(await deps.service.listDuplicateCandidates(context)));
  }));
  router.post('/customer-duplicates/manual', ...wrap(deps.requireMerge, async (request, response, context) => {
    const raw = exact(request.body, ['customerIds']);
    if (!Array.isArray(raw.customerIds)) throw new BatchPrecheckValidationError('客户选择无效');
    response.status(201).json(success(await deps.service.createDuplicateCandidate(raw.customerIds.map(String), context)));
  }));
  router.get('/customer-merges', ...wrap(deps.requireMerge, async (_request, response, context) => {
    response.json(success(await deps.service.listHistory(context)));
  }));
  router.post('/customer-merges/precheck', ...wrap(deps.requireMerge, async (request, response, context) => {
    response.json(success(await deps.service.precheck(parseCustomerMergePrecheck(request.body), context)));
  }));
  router.post('/customer-merges', ...wrap(deps.requireMerge, async (request, response, context) => {
    response.status(201).json(success(await deps.service.execute(parseCustomerMergeConfirmation(request.body), context)));
  }));
  router.get('/customer-merges/:id', ...wrap(deps.requireMerge, async (request, response, context) => {
    const result = await deps.service.getHistory(id(request.params.id), context);
    if (!result) { response.status(404).json(failure('合并记录不存在', 404)); return; }
    response.json(success(result));
  }));
  router.post('/customer-merges/:id/undo-precheck', ...wrap(deps.requireUndo, async (request, response, context) => {
    exact(request.body || {}, []);
    response.json(success(await deps.service.undoPrecheck(id(request.params.id), context)));
  }));
  router.post('/customer-merges/:id/undo', ...wrap(deps.requireUndo, async (request, response, context) => {
    const raw = exact(request.body, ['precheckToken', 'idempotencyKey']);
    response.json(success(await deps.service.undo({ ledgerId: id(request.params.id), precheckToken: String(raw.precheckToken || ''), idempotencyKey: String(raw.idempotencyKey || '') }, context)));
  }));
  return router;
}
