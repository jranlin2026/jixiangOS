import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer, CustomerCreateInput, CustomerFilters } from '../../src/types/customer';
import type { CustomerExportSelection, CustomerImportDestination, CustomerImportRow } from '../../src/types/customerDataExchange';
import type { ApiResponse, PaginatedResponse } from '../../src/api/types';
import type { CustomerCreateExecutionContext } from './customerListService';
import type { CustomerLevelConfig, LeadSourceConfig, LifecycleStatusConfig } from '../../src/types/settings';
import {
  CUSTOMER_LEVELS,
  DEFAULT_LEAD_SOURCE_CONFIGS,
  DEFAULT_LIFECYCLE_STATUS_CONFIGS,
  STORAGE_KEYS,
} from '../../src/shared/utils/constants';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { loadCustomerAccessContext } from './customerAccessPolicy';
import { loadCustomerTagCatalog } from './customerTagService';
import { customerContactKeys } from './customerDataExchangePolicy';
import { ContactIdentityConflictError } from './contactIdentityService';
import {
  createCustomerDataExchangeService,
  CustomerDataExchangeError,
  type CustomerDataExchangeDependencies,
  type CustomerExportAuditEvent,
} from './customerDataExchangeService';

type CustomerReader = {
  create(input: CustomerCreateInput, user: AuthenticatedUser, execution?: CustomerCreateExecutionContext): Promise<ApiResponse<Customer | null>>;
  getById(customerId: string, user: AuthenticatedUser): Promise<ApiResponse<Customer | null>>;
  list(filters: CustomerFilters, user: AuthenticatedUser): Promise<ApiResponse<PaginatedResponse<Customer> | null>>;
};

const cleanText = (value: unknown) => String(value ?? '').trim();
const tokenHash = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function importResultFromItem(item: { targetKey: string; afterSnapshot: unknown; errorMessage?: string | null }) {
  const snapshot = readStorageValue<any>(item.afterSnapshot, {});
  const match = /^row:(\d+)$/.exec(item.targetKey);
  return {
    index: Math.max(0, Number(match?.[1] || 1) - 1),
    row: {
      rowNumber: Number(snapshot.rowNumber || 0),
      name: cleanText(snapshot.name),
      status: snapshot.status === 'imported' ? 'imported' as const : 'failed' as const,
      reason: cleanText(snapshot.reason) || item.errorMessage || (snapshot.status === 'imported' ? '导入成功' : '导入失败'),
      ...(cleanText(snapshot.customerId) ? { customerId: cleanText(snapshot.customerId) } : {}),
    },
  };
}

function readStorageValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return fallback; }
  }
  return value as T;
}

function leadSourceOptions(configs: LeadSourceConfig[]) {
  const active = configs.filter((item) => item.isActive !== false);
  const parents = active.filter((item) => !item.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
  return parents.flatMap((parent) => {
    const children = active.filter((item) => item.parentId === parent.id).sort((a, b) => a.sortOrder - b.sortOrder);
    return children.length
      ? [
          { value: parent.name, label: parent.name },
          ...children.map((child) => ({ value: parent.name, label: `${parent.name}-${child.name}`, sourceName: child.name })),
        ]
      : [{ value: parent.name, label: parent.name }];
  });
}

async function existingContactKeys(prisma: PrismaClient, rows: CustomerImportRow[]): Promise<Set<string>> {
  const keys = Array.from(new Set(rows.flatMap(customerContactKeys)));
  const phones = keys.filter((key) => key.startsWith('phone:')).map((key) => key.slice(6));
  const wechats = keys.filter((key) => key.startsWith('wechat:')).map((key) => key.slice(7));
  if (!phones.length && !wechats.length) return new Set();
  const phoneClause = phones.length
    ? Prisma.sql`JSON_UNQUOTE(JSON_EXTRACT(data, '$.phone')) IN (${Prisma.join(phones)})`
    : Prisma.sql`FALSE`;
  const wechatClause = wechats.length
    ? Prisma.sql`LOWER(JSON_UNQUOTE(JSON_EXTRACT(data, '$.wechat'))) IN (${Prisma.join(wechats)})`
    : Prisma.sql`FALSE`;
  const found = await prisma.$queryRaw<Array<{ phone: string | null; wechat: string | null }>>(Prisma.sql`
    SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.phone')) AS phone,
           LOWER(JSON_UNQUOTE(JSON_EXTRACT(data, '$.wechat'))) AS wechat
    FROM business_records
    WHERE domain = ${STORAGE_KEYS.CUSTOMERS}
      AND mergedIntoId IS NULL
      AND JSON_EXTRACT(data, '$.deletedAt') IS NULL
      AND (${phoneClause} OR ${wechatClause})
  `);
  return new Set(found.flatMap((row) => [
    row.phone ? `phone:${row.phone}` : '',
    row.wechat ? `wechat:${row.wechat}` : '',
  ]).filter(Boolean));
}

async function readSelection(reader: CustomerReader, selection: CustomerExportSelection, user: AuthenticatedUser): Promise<Customer[]> {
  if (selection.mode === 'ids') {
    const ids = Array.from(new Set(selection.customerIds.map(cleanText).filter(Boolean)));
    if (!ids.length) return [];
    if (ids.length > 10_000) throw new CustomerDataExchangeError('单次最多导出 10,000 个客户');
    const result: Customer[] = [];
    for (let offset = 0; offset < ids.length; offset += 50) {
      const chunk = await Promise.all(ids.slice(offset, offset + 50).map((id) => reader.getById(id, user)));
      chunk.forEach((response) => { if (response.code === 0 && response.data) result.push(response.data); });
    }
    return result;
  }
  const result: Customer[] = [];
  let page = 1;
  while (page <= 100) {
    const response = await reader.list({ ...selection.filters, page, pageSize: 100 }, user);
    if (response.code !== 0 || !response.data) throw new Error(response.message || '读取客户数据失败');
    result.push(...response.data.items);
    if (page >= response.data.pagination.totalPages) break;
    if (result.length >= 10_000) throw new CustomerDataExchangeError('单次最多导出 10,000 个客户，请缩小筛选范围');
    page += 1;
  }
  return result;
}

async function recordExportAudit(prisma: PrismaClient, event: CustomerExportAuditEvent): Promise<void> {
  const batchJobId = `export-${randomUUID()}`;
  const inputHash = createHash('sha256').update(JSON.stringify({
    selection: event.selection,
    includeSensitive: event.includeSensitive,
    reason: event.reason,
  })).digest('hex');
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.customerBatchJob.create({
      data: {
        id: batchJobId,
        handlerKey: 'customer_export',
        operation: 'export',
        status: 'succeeded',
        selectionMode: event.selection.mode,
        selectedCustomerIds: event.customerIds,
        filterSnapshot: event.selection.mode === 'filter_snapshot' ? event.selection.filters as any : undefined,
        input: { includeSensitive: event.includeSensitive },
        inputHash,
        idempotencyFingerprint: inputHash,
        reason: event.reason,
        idempotencyKey: randomUUID(),
        actorId: event.actorId,
        actorName: event.actorName,
        frozenCustomerCount: event.customerIds.length,
        totalCount: event.customerIds.length,
        successCount: event.customerIds.length,
        startedAt: now,
        finishedAt: now,
      },
    });
    for (let offset = 0; offset < event.customerIds.length; offset += 500) {
      await tx.customerAuditEvent.createMany({
        data: event.customerIds.slice(offset, offset + 500).map((customerId) => ({
          id: randomUUID(),
          customerId,
          batchJobId,
          operation: 'export_customer',
          actorId: event.actorId,
          actorName: event.actorName,
          reason: event.reason,
          inputHash,
          result: 'succeeded',
        })),
      });
    }
  });
}

async function persistImportPrecheck(
  prisma: PrismaClient,
  event: { token: string; actorId: string; rowsHash: string; expiresAt: string; totalCount: number; destination: CustomerImportDestination },
): Promise<void> {
  await prisma.customerBatchPrecheck.create({
    data: {
      id: `import-precheck-${randomUUID()}`,
      actorId: event.actorId,
      handlerKey: 'customer_import',
      operation: 'import',
      status: 'ready',
      tokenHash: tokenHash(event.token),
      selectionHash: event.rowsHash,
      inputHash: event.rowsHash,
      guardManifest: json({ kind: 'customer_import', totalCount: event.totalCount, destination: event.destination }),
      normalizedRowsHash: event.rowsHash,
      customerVersionManifest: json({}),
      selectedCustomerIds: json([]),
      expiresAt: new Date(event.expiresAt),
    },
  });
}

async function beginImportExecution(
  prisma: PrismaClient,
  event: { token: string; actorId: string; actorName: string; rowsHash: string; totalCount: number; destination: CustomerImportDestination },
): Promise<{
  jobId: string;
  leaseOwner: string;
  terminal: boolean;
  completedRows: Array<{ index: number; row: { rowNumber: number; name: string; status: 'ready' | 'blocked' | 'imported' | 'failed'; reason: string; customerId?: string } }>;
}> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const leaseOwner = `import-run-${randomUUID()}`;
    const leaseExpiresAt = new Date(now.getTime() + 2 * 60_000);
    const rows = await tx.$queryRaw<Array<{
      id: string;
      actorId: string;
      normalizedRowsHash: string | null;
      expiresAt: Date;
      consumedAt: Date | null;
      consumedResultId: string | null;
      guardManifest: unknown;
    }>>(Prisma.sql`
      SELECT id, actorId, normalizedRowsHash, expiresAt, consumedAt, consumedResultId, guardManifest
      FROM customer_batch_prechecks
      WHERE tokenHash = ${tokenHash(event.token)}
        AND handlerKey = 'customer_import'
        AND operation = 'import'
      LIMIT 1
      FOR UPDATE
    `);
    const precheck = rows[0];
    if (!precheck || precheck.actorId !== event.actorId || precheck.normalizedRowsHash !== event.rowsHash) {
      throw new CustomerDataExchangeError('导入预检凭证无效或与当前文件不一致', 409);
    }
    const manifest = readStorageValue<{ totalCount?: number; destination?: CustomerImportDestination }>(precheck.guardManifest, {});
    if (Number(manifest.totalCount) !== event.totalCount) throw new CustomerDataExchangeError('导入预检行数已变化，请重新预检', 409);
    if (manifest.destination !== event.destination) throw new CustomerDataExchangeError('导入去向已变化，请重新预检', 409);

    if (precheck.consumedAt) {
      if (!precheck.consumedResultId) throw new CustomerDataExchangeError('导入批次记录已损坏，请联系管理员', 409);
      const jobs = await tx.$queryRaw<Array<{
        id: string;
        actorId: string;
        status: string;
        inputHash: string;
        leaseExpiresAt: Date | null;
      }>>(Prisma.sql`
        SELECT id, actorId, status, inputHash, leaseExpiresAt
        FROM customer_batch_jobs
        WHERE id = ${precheck.consumedResultId}
          AND handlerKey = 'customer_import'
          AND operation = 'import'
        LIMIT 1
        FOR UPDATE
      `);
      const job = jobs[0];
      if (!job || job.actorId !== event.actorId || job.inputHash !== event.rowsHash) {
        throw new CustomerDataExchangeError('导入批次与预检内容不一致，请联系管理员', 409);
      }
      const items = await tx.customerBatchJobItem.findMany({ where: { jobId: job.id }, orderBy: { targetKey: 'asc' } });
      const completedRows = items.map(importResultFromItem);
      if (['succeeded', 'partial_failed', 'failed'].includes(job.status)) {
        if (completedRows.length !== event.totalCount) throw new CustomerDataExchangeError('导入批次结果不完整，请联系管理员', 409);
        return { jobId: job.id, leaseOwner: '', terminal: true, completedRows };
      }
      if (job.status !== 'running') throw new CustomerDataExchangeError('导入批次状态不允许继续处理，请查看批量任务', 409);
      if (job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() > now.getTime()) {
        throw new CustomerDataExchangeError('该导入批次正在处理中，请勿重复提交', 409);
      }
      const claimed = await tx.customerBatchJob.updateMany({
        where: { id: job.id, status: 'running' },
        data: {
          leaseOwner,
          leaseEpoch: { increment: 1 },
          leaseExpiresAt,
          heartbeatAt: now,
          attemptCount: { increment: 1 },
        },
      });
      if (claimed.count !== 1) throw new CustomerDataExchangeError('导入批次正在被其他请求恢复，请稍后重试', 409);
      return { jobId: job.id, leaseOwner, terminal: false, completedRows };
    }

    if (new Date(precheck.expiresAt).getTime() <= now.getTime()) throw new CustomerDataExchangeError('导入预检凭证已过期，请重新预检', 409);

    const jobId = `import-${randomUUID()}`;
    await tx.customerBatchJob.create({
      data: {
        id: jobId,
        handlerKey: 'customer_import',
        operation: 'import',
        status: 'running',
        selectionMode: 'file_rows',
        selectedCustomerIds: json([]),
        input: json({ rowsHash: event.rowsHash, destination: event.destination }),
        inputHash: event.rowsHash,
        idempotencyFingerprint: event.rowsHash,
        reason: '批量导入客户',
        idempotencyKey: precheck.id,
        actorId: event.actorId,
        actorName: event.actorName,
        frozenCustomerCount: event.totalCount,
        totalCount: event.totalCount,
        leaseOwner,
        leaseEpoch: 1,
        leaseExpiresAt,
        heartbeatAt: now,
        attemptCount: 1,
        startedAt: now,
      },
    });
    await tx.customerBatchPrecheck.update({
      where: { id: precheck.id },
      data: {
        status: 'consumed',
        consumedAt: now,
        consumedResultType: 'customer_batch_job',
        consumedResultId: jobId,
        consumedIdempotencyKey: precheck.id,
      },
    });
    return { jobId, leaseOwner, terminal: false, completedRows: [] };
  }, { isolationLevel: 'ReadCommitted' });
}

async function processImportRow(
  prisma: PrismaClient,
  reader: CustomerReader,
  event: {
    jobId: string;
    leaseOwner: string;
    index: number;
    row: { rowNumber: number; name: string; status: string; reason: string; customerId?: string };
    input?: CustomerCreateInput;
    lastFollowUpRecord?: string;
    destination: CustomerImportDestination;
    user: AuthenticatedUser;
  },
): Promise<{ rowNumber: number; name: string; status: 'ready' | 'blocked' | 'imported' | 'failed'; reason: string; customerId?: string }> {
  const persist = async (tx: Prisma.TransactionClient, result: typeof event.row) => {
    const at = new Date();
    const targetKey = `row:${String(event.index + 1).padStart(6, '0')}`;
    await tx.customerBatchJobItem.create({
      data: {
        id: randomUUID(),
        jobId: event.jobId,
        targetKey,
        status: result.status === 'imported' ? 'succeeded' : 'failed',
        errorCode: result.status === 'imported' ? null : 'CUSTOMER_IMPORT_ROW_FAILED',
        errorMessage: result.status === 'imported' ? null : result.reason,
        afterSnapshot: json(result),
        idempotencyKey: `${event.jobId}:${targetKey}`,
        attemptCount: 1,
        retryable: false,
        startedAt: at,
        finishedAt: at,
      },
    });
    const progressed = await tx.customerBatchJob.updateMany({
      where: { id: event.jobId, handlerKey: 'customer_import', operation: 'import', status: 'running', leaseOwner: event.leaseOwner },
      data: {
        ...(result.status === 'imported' ? { successCount: { increment: 1 } } : { failedCount: { increment: 1 } }),
        cursor: { increment: 1 },
        heartbeatAt: at,
        leaseExpiresAt: new Date(at.getTime() + 2 * 60_000),
      },
    });
    if (progressed.count !== 1) throw new CustomerDataExchangeError('客户导入批次租约已失效，请重新确认以恢复处理', 409);
    return result as { rowNumber: number; name: string; status: 'ready' | 'blocked' | 'imported' | 'failed'; reason: string; customerId?: string };
  };

  const run = () => prisma.$transaction(async (tx) => {
    const jobs = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM customer_batch_jobs
      WHERE id = ${event.jobId}
        AND handlerKey = 'customer_import'
        AND operation = 'import'
        AND status = 'running'
        AND leaseOwner = ${event.leaseOwner}
      LIMIT 1
      FOR UPDATE
    `);
    if (!jobs[0]) throw new CustomerDataExchangeError('客户导入批次租约已失效，请重新确认以恢复处理', 409);
    let result = event.row;
    if (event.input) {
      const created = await reader.create(event.input, event.user, {
        tx,
        batchJobId: event.jobId,
        requestId: `${event.jobId}:row:${event.index + 1}`,
        idempotencyKey: `${event.jobId}:row:${event.index + 1}`,
        importDestination: event.destination,
        importedLastFollowUpRecord: event.lastFollowUpRecord,
      });
      result = created.code === 0 && created.data
        ? { rowNumber: event.row.rowNumber, name: event.row.name, status: 'imported', reason: '导入成功', customerId: created.data.id }
        : { rowNumber: event.row.rowNumber, name: event.row.name, status: 'failed', reason: created.message || '导入失败' };
    }
    return persist(tx, result);
  }, { isolationLevel: 'ReadCommitted' });

  try {
    return await run();
  } catch (error) {
    if (error instanceof CustomerDataExchangeError) throw error;
    const targetKey = `row:${String(event.index + 1).padStart(6, '0')}`;
    const existing = await prisma.customerBatchJobItem.findFirst({ where: { jobId: event.jobId, targetKey } });
    if (existing) return importResultFromItem(existing).row;
    const failure = {
      rowNumber: event.row.rowNumber,
      name: event.row.name,
      status: 'failed' as const,
      reason: error instanceof ContactIdentityConflictError
        ? error.safePayload.message
        : '客户写入失败，请重新确认以恢复处理',
    };
    return prisma.$transaction(async (tx) => {
      const jobs = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM customer_batch_jobs
        WHERE id = ${event.jobId} AND status = 'running' AND leaseOwner = ${event.leaseOwner}
        LIMIT 1 FOR UPDATE
      `);
      if (!jobs[0]) throw new CustomerDataExchangeError('客户导入批次租约已失效，请重新确认以恢复处理', 409);
      return persist(tx, failure);
    }, { isolationLevel: 'ReadCommitted' });
  }
}

async function finalizeImportExecution(
  prisma: PrismaClient,
  event: { jobId: string; leaseOwner: string; rowsHash: string; rows: Array<{ rowNumber: number; name: string; status: string; reason: string; customerId?: string }> },
): Promise<void> {
  const successCount = event.rows.filter((row) => row.status === 'imported').length;
  const failedCount = event.rows.length - successCount;
  const status = failedCount === 0 ? 'succeeded' : successCount > 0 ? 'partial_failed' : 'failed';
  const finishedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const itemCount = await tx.customerBatchJobItem.count({ where: { jobId: event.jobId } });
    if (itemCount !== event.rows.length) throw new CustomerDataExchangeError('客户导入批次尚未处理完成，请重新确认以恢复处理', 409);
    const updated = await tx.customerBatchJob.updateMany({
      where: {
        id: event.jobId,
        handlerKey: 'customer_import',
        operation: 'import',
        status: 'running',
        inputHash: event.rowsHash,
        leaseOwner: event.leaseOwner,
      },
      data: { status, successCount, failedCount, cursor: event.rows.length, finishedAt, leaseOwner: null, leaseExpiresAt: null },
    });
    if (updated.count !== 1) throw new CustomerDataExchangeError('客户导入批次状态已变化，请查看批量任务', 409);
  }, { isolationLevel: 'ReadCommitted' });
}

export function createPrismaCustomerDataExchangeService(input: {
  prisma: PrismaClient;
  customerReader: CustomerReader;
  secret: string;
}) {
  const deps: CustomerDataExchangeDependencies = {
    secret: input.secret,
    async loadDirectory(user, rows = []) {
      const canOverrideAttribution = hasPermission(user, PERMISSION_KEYS.CUSTOMER_IMPORT_ATTRIBUTION_OVERRIDE, 'write');
      const [context, users, storageRows, catalog, duplicateKeys] = await Promise.all([
        loadCustomerAccessContext(input.prisma, user),
        input.prisma.user.findMany({
          where: { isActive: true, employmentStatus: 'active' },
          select: { id: true, name: true },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        }),
        input.prisma.appStorage.findMany({
          where: { key: { in: [STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS, STORAGE_KEYS.CUSTOMER_LEVEL_CONFIGS, STORAGE_KEYS.LEAD_SOURCE_CONFIGS] } },
          select: { key: true, value: true },
        }),
        loadCustomerTagCatalog(input.prisma, false),
        existingContactKeys(input.prisma, rows),
      ]);
      const storage = new Map(storageRows.map((row) => [row.key, row.value]));
      const lifecycle = readStorageValue<LifecycleStatusConfig[]>(storage.get(STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS), DEFAULT_LIFECYCLE_STATUS_CONFIGS)
        .filter((item) => item.isActive !== false)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const levels = readStorageValue<CustomerLevelConfig[]>(storage.get(STORAGE_KEYS.CUSTOMER_LEVEL_CONFIGS), CUSTOMER_LEVELS.map((item, index) => ({
        id: item.value, value: item.value, label: item.label, color: item.color, isActive: true, sortOrder: index, createdAt: '', updatedAt: '',
      })))
        .filter((item) => item.isActive !== false)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const sources = readStorageValue<LeadSourceConfig[]>(storage.get(STORAGE_KEYS.LEAD_SOURCE_CONFIGS), DEFAULT_LEAD_SOURCE_CONFIGS);
      const allowedOwnerIds = canOverrideAttribution ? context.manageableOwnerIds : new Set([user.id]);
      return {
        currentOwnerId: user.id,
        currentOwnerName: user.name || user.account,
        canOverrideAttribution,
        owners: users.filter((candidate) => allowedOwnerIds.has(candidate.id)),
        lifecycleStatuses: lifecycle
          .filter((item) => item.code !== 'public_pool')
          .map((item) => ({ code: item.code, name: item.name })),
        customerLevels: levels.map((item) => ({ value: item.value, label: item.label })),
        leadSources: leadSourceOptions(sources),
        tags: catalog.tags.filter((tag) => tag.isActive !== false).map((tag) => ({ id: tag.id, name: tag.name })),
        existingContactKeys: duplicateKeys,
      };
    },
    processImportRow: (event) => processImportRow(input.prisma, input.customerReader, event),
    readCustomers: (selection, user) => readSelection(input.customerReader, selection, user),
    recordExportAudit: (event) => recordExportAudit(input.prisma, event),
    persistImportPrecheck: (event) => persistImportPrecheck(input.prisma, event),
    beginImportExecution: (event) => beginImportExecution(input.prisma, event),
    finalizeImportExecution: (event) => finalizeImportExecution(input.prisma, event),
  };
  return createCustomerDataExchangeService(deps);
}
