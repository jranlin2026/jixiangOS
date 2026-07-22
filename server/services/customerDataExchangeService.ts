import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer, CustomerCreateInput } from '../../src/types/customer';
import type { CustomerBatchJobSummary } from '../../src/types/customerBatch';
import {
  CUSTOMER_IMPORT_MAX_ROWS,
  type CustomerImportDestination,
  type CustomerExportRequest,
  type CustomerExportResult,
  type CustomerImportConfirmResult,
  type CustomerImportPrecheckResult,
  type CustomerImportRow,
  type CustomerImportRowResult,
  type CustomerImportTemplateOptions,
} from '../../src/types/customerDataExchange';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import {
  normalizeCustomerImportRows,
  projectCustomerExportRows,
  validateCustomerImportRows,
  type CustomerImportDirectory,
} from './customerDataExchangePolicy';

type ExchangeSelection = CustomerExportRequest['selection'];

export type CustomerExportAuditEvent = {
  actorId: string;
  actorName: string;
  reason: string;
  includeSensitive: boolean;
  customerIds: string[];
  selection: ExchangeSelection;
};

export type CustomerImportExecutionEvent = {
  token: string;
  actorId: string;
  actorName: string;
  rowsHash: string;
  totalCount: number;
  destination: CustomerImportDestination;
  rows: Array<{
    index: number;
    row: CustomerImportRowResult;
    input?: CustomerCreateInput;
    lastFollowUpRecord?: string;
  }>;
};

export type CustomerDataExchangeDependencies = {
  secret: string;
  now?: () => Date;
  loadDirectory(user: AuthenticatedUser, rows?: CustomerImportRow[]): Promise<CustomerImportDirectory>;
  enqueueImportExecution(event: CustomerImportExecutionEvent): Promise<CustomerBatchJobSummary>;
  readCustomers(selection: ExchangeSelection, user: AuthenticatedUser): Promise<Customer[]>;
  recordExportAudit(event: CustomerExportAuditEvent): Promise<void>;
  persistImportPrecheck(event: { token: string; actorId: string; rowsHash: string; expiresAt: string; totalCount: number; destination: CustomerImportDestination }): Promise<void>;
};

export class CustomerDataExchangeError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

type TokenPayload = {
  actorId: string;
  rowsHash: string;
  expiresAt: string;
  nonce: string;
};

const cleanText = (value: unknown) => String(value ?? '').trim();
const hashRows = (rows: ReturnType<typeof normalizeCustomerImportRows>, destination: CustomerImportDestination) => (
  createHash('sha256').update(JSON.stringify({ destination, rows }), 'utf8').digest('hex')
);

function encodeToken(payload: TokenPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `cx1.${body}.${signature}`;
}

function decodeToken(token: string, secret: string): TokenPayload {
  const [version, body, signature] = cleanText(token).split('.');
  if (version !== 'cx1' || !body || !signature) throw new CustomerDataExchangeError('导入预检凭证无效或已过期', 409);
  const expected = createHmac('sha256', secret).update(body).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    throw new CustomerDataExchangeError('导入预检凭证无效或已过期', 409);
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new CustomerDataExchangeError('导入预检凭证无效或已过期', 409);
  }
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
  } catch {
    throw new CustomerDataExchangeError('导入预检凭证无效或已过期', 409);
  }
}

function assertRows(rows: CustomerImportRow[]): void {
  if (!Array.isArray(rows) || !rows.length) throw new CustomerDataExchangeError('导入文件没有可处理的客户数据');
  if (rows.length > CUSTOMER_IMPORT_MAX_ROWS) {
    throw new CustomerDataExchangeError(`单次最多导入 ${CUSTOMER_IMPORT_MAX_ROWS} 条客户，请拆分文件后重试`);
  }
}

function assertPermission(user: AuthenticatedUser, key: string, message: string): void {
  if (!hasPermission(user, key, 'write')) throw new CustomerDataExchangeError(message, 403);
}

function assertImportDestinationPermission(destination: CustomerImportDestination, user: AuthenticatedUser): void {
  if (destination === 'public_pool') {
    assertPermission(user, PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL, '无权直接导入公海池');
  }
}

export function createCustomerDataExchangeService(deps: CustomerDataExchangeDependencies) {
  if (cleanText(deps.secret).length < 16) throw new Error('客户数据交换签名密钥至少需要 16 个字符');
  const now = () => deps.now?.() || new Date();

  const prepare = async (rows: CustomerImportRow[], destination: CustomerImportDestination, user: AuthenticatedUser) => {
    assertRows(rows);
    assertImportDestinationPermission(destination, user);
    const normalizedRows = normalizeCustomerImportRows(rows);
    const directory = await deps.loadDirectory(user, rows);
    const validated = validateCustomerImportRows(normalizedRows, directory, destination);
    return { normalizedRows, directory, validated };
  };

  return {
    async templateOptions(user: AuthenticatedUser): Promise<CustomerImportTemplateOptions> {
      assertPermission(user, PERMISSION_KEYS.CUSTOMER_IMPORT, '无权导入客户');
      const directory = await deps.loadDirectory(user);
      return {
        ownerNames: directory.owners.map((item) => item.name),
        lifecycleStatuses: directory.lifecycleStatuses.map((item) => item.name),
        customerLevels: directory.customerLevels.map((item) => item.label),
        leadSources: directory.leadSources.map((item) => item.label),
        tagNames: directory.tags.map((item) => item.name),
        canOverrideAttribution: directory.canOverrideAttribution,
        canImportToPublicPool: hasPermission(user, PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL, 'write'),
      };
    },

    async precheckImport(rows: CustomerImportRow[], destination: CustomerImportDestination, user: AuthenticatedUser): Promise<CustomerImportPrecheckResult> {
      assertPermission(user, PERMISSION_KEYS.CUSTOMER_IMPORT, '无权导入客户');
      const prepared = await prepare(rows, destination, user);
      const expiresAt = new Date(now().getTime() + 15 * 60_000).toISOString();
      const readyCount = prepared.validated.filter((row) => row.status === 'ready').length;
      const rowsHash = hashRows(prepared.normalizedRows, destination);
      const confirmationToken = encodeToken({ actorId: user.id, rowsHash, expiresAt, nonce: randomUUID() }, deps.secret);
      await deps.persistImportPrecheck({
        token: confirmationToken,
        actorId: user.id,
        rowsHash,
        expiresAt,
        totalCount: prepared.validated.length,
        destination,
      });
      return {
        confirmationToken,
        expiresAt,
        totalCount: prepared.validated.length,
        readyCount,
        blockedCount: prepared.validated.length - readyCount,
        rows: prepared.validated.map(({ input: _input, ...row }) => row),
      };
    },

    async confirmImport(
      request: { rows: CustomerImportRow[]; destination: CustomerImportDestination; confirmationToken: string },
      user: AuthenticatedUser,
    ): Promise<CustomerImportConfirmResult> {
      assertPermission(user, PERMISSION_KEYS.CUSTOMER_IMPORT, '无权导入客户');
      assertRows(request.rows);
      assertImportDestinationPermission(request.destination, user);
      const normalizedRows = normalizeCustomerImportRows(request.rows);
      const token = decodeToken(request.confirmationToken, deps.secret);
      if (token.actorId !== user.id) throw new CustomerDataExchangeError('导入预检凭证不属于当前用户', 403);
      if (token.rowsHash !== hashRows(normalizedRows, request.destination)) throw new CustomerDataExchangeError('导入文件或导入去向与预检内容不一致，请重新预检', 409);

      const directory = await deps.loadDirectory(user, request.rows);
      const validated = validateCustomerImportRows(normalizedRows, directory, request.destination);
      return deps.enqueueImportExecution({
        token: request.confirmationToken,
        actorId: user.id,
        actorName: user.name || user.account,
        rowsHash: token.rowsHash,
        totalCount: validated.length,
        destination: request.destination,
        rows: validated.map((row, index) => ({
          index,
          row: row.status === 'ready'
            ? { rowNumber: row.rowNumber, name: row.name, status: 'ready', reason: '可导入' }
            : { rowNumber: row.rowNumber, name: row.name, status: 'failed', reason: row.reason },
          ...(row.status === 'ready' ? { input: row.input } : {}),
          ...(row.status === 'ready' && normalizedRows[index].lastFollowUpRecord
            ? { lastFollowUpRecord: normalizedRows[index].lastFollowUpRecord }
            : {}),
        })),
      });
    },

    async exportCustomers(request: CustomerExportRequest, user: AuthenticatedUser): Promise<CustomerExportResult> {
      assertPermission(user, PERMISSION_KEYS.CUSTOMER_EXPORT, '无权导出客户');
      if (request.includeSensitive) {
        assertPermission(user, PERMISSION_KEYS.CUSTOMER_EXPORT_SENSITIVE, '无权导出客户敏感字段');
      }
      const reason = cleanText(request.reason);
      if (!reason) throw new CustomerDataExchangeError('请填写导出原因');
      const customers = await deps.readCustomers(request.selection, user);
      if (!customers.length) throw new CustomerDataExchangeError('当前选择范围没有可导出的客户');
      await deps.recordExportAudit({
        actorId: user.id,
        actorName: user.name || user.account,
        reason,
        includeSensitive: request.includeSensitive,
        customerIds: customers.map((customer) => customer.id),
        selection: request.selection,
      });
      const date = now().toISOString().slice(0, 10);
      return {
        fileName: `客户资料-${date}.xlsx`,
        includeSensitive: request.includeSensitive,
        rows: projectCustomerExportRows(customers, request.includeSensitive),
      };
    },
  };
}
