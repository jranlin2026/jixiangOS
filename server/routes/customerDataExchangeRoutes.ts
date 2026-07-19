import { Router, type RequestHandler } from 'express';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { CustomerExportRequest, CustomerImportDestination, CustomerImportRow } from '../../src/types/customerDataExchange';
import type { AuthenticatedRequest } from '../middleware/auth';
import { failure, success } from '../api/response';
import { CustomerDataExchangeError } from '../services/customerDataExchangeService';

type CustomerDataExchangeRouteService = {
  templateOptions(user: AuthenticatedUser): Promise<unknown>;
  precheckImport(rows: CustomerImportRow[], destination: CustomerImportDestination, user: AuthenticatedUser): Promise<unknown>;
  confirmImport(input: { rows: CustomerImportRow[]; destination: CustomerImportDestination; confirmationToken: string }, user: AuthenticatedUser): Promise<unknown>;
  exportCustomers(input: CustomerExportRequest, user: AuthenticatedUser): Promise<unknown>;
};

export type CustomerDataExchangeRouterDependencies = {
  service: CustomerDataExchangeRouteService;
  requireImport: RequestHandler;
  requireExport: RequestHandler;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CustomerDataExchangeError('客户数据交换请求无效');
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: string[]): Record<string, unknown> {
  const raw = object(value);
  const actual = Object.keys(raw);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    throw new CustomerDataExchangeError('客户数据交换请求包含不允许的字段');
  }
  return raw;
}

function currentUser(request: AuthenticatedRequest): AuthenticatedUser {
  if (!request.currentUser) throw new CustomerDataExchangeError('当前登录状态已失效', 401);
  return request.currentUser;
}

function parseRows(value: unknown): CustomerImportRow[] {
  if (!Array.isArray(value)) throw new CustomerDataExchangeError('导入客户数据格式无效');
  return value.map((candidate, index) => {
    const row = object(candidate);
    return {
      rowNumber: Number(row.rowNumber || index + 2),
      name: String(row.name || ''),
      phone: String(row.phone || ''),
      wechat: String(row.wechat || ''),
      company: String(row.company || ''),
      ownerName: String(row.ownerName || ''),
      lifecycleStatus: String(row.lifecycleStatus || ''),
      customerLevel: String(row.customerLevel || ''),
      leadSource: String(row.leadSource || ''),
      industry: String(row.industry || ''),
      city: String(row.city || ''),
      tagNames: String(row.tagNames || ''),
      remark: String(row.remark || ''),
    };
  });
}

function parseDestination(value: unknown): CustomerImportDestination {
  if (value === 'assigned' || value === 'public_pool') return value;
  throw new CustomerDataExchangeError('客户导入去向无效');
}

function parseSelection(value: unknown): CustomerExportRequest['selection'] {
  const raw = object(value);
  if (raw.mode === 'ids') {
    const exactRaw = exact(value, ['mode', 'customerIds']);
    if (!Array.isArray(exactRaw.customerIds)) throw new CustomerDataExchangeError('导出客户选择无效');
    return { mode: 'ids', customerIds: exactRaw.customerIds.map((id) => String(id || '').trim()).filter(Boolean) };
  }
  if (raw.mode === 'filter_snapshot') {
    const exactRaw = exact(value, ['mode', 'filters']);
    return { mode: 'filter_snapshot', filters: object(exactRaw.filters) };
  }
  throw new CustomerDataExchangeError('导出客户选择无效');
}

function sendError(response: any, error: unknown): void {
  const status = error instanceof CustomerDataExchangeError ? error.status : 500;
  const message = error instanceof Error ? error.message : '客户数据交换失败';
  response.status(status).json(failure(status === 500 ? '客户数据交换服务暂时不可用' : message, status));
}

export function createCustomerDataExchangeRouter(deps: CustomerDataExchangeRouterDependencies) {
  const router = Router();
  router.get('/template-options', deps.requireImport, async (request: AuthenticatedRequest, response) => {
    try { response.json(success(await deps.service.templateOptions(currentUser(request)))); } catch (error) { sendError(response, error); }
  });
  router.post('/import/precheck', deps.requireImport, async (request: AuthenticatedRequest, response) => {
    try {
      const raw = exact(request.body, ['rows', 'destination']);
      response.json(success(await deps.service.precheckImport(parseRows(raw.rows), parseDestination(raw.destination), currentUser(request))));
    } catch (error) { sendError(response, error); }
  });
  router.post('/import/confirm', deps.requireImport, async (request: AuthenticatedRequest, response) => {
    try {
      const raw = exact(request.body, ['rows', 'destination', 'confirmationToken']);
      response.status(201).json(success(await deps.service.confirmImport({
        rows: parseRows(raw.rows),
        destination: parseDestination(raw.destination),
        confirmationToken: String(raw.confirmationToken || ''),
      }, currentUser(request))));
    } catch (error) { sendError(response, error); }
  });
  router.post('/export', deps.requireExport, async (request: AuthenticatedRequest, response) => {
    try {
      const raw = exact(request.body, ['selection', 'includeSensitive', 'reason']);
      if (typeof raw.includeSensitive !== 'boolean') throw new CustomerDataExchangeError('导出敏感字段参数无效');
      response.json(success(await deps.service.exportCustomers({
        selection: parseSelection(raw.selection),
        includeSensitive: raw.includeSensitive,
        reason: String(raw.reason || ''),
      }, currentUser(request))));
    } catch (error) { sendError(response, error); }
  });
  return router;
}
