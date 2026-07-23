import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer, CustomerCreateInput, CustomerFilters } from '../../src/types/customer';
import type { CustomerBatchJobSummary } from '../../src/types/customerBatch';
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
import type { CustomerBatchJobHandler } from './customerBatchJobHandler';
import {
  createCustomerDataExchangeService,
  CustomerDataExchangeError,
  type CustomerDataExchangeDependencies,
  type CustomerExportAuditEvent,
  type CustomerImportExecutionEvent,
} from './customerDataExchangeService';

type CustomerReader = {
  create(input: CustomerCreateInput, user: AuthenticatedUser, execution?: CustomerCreateExecutionContext): Promise<ApiResponse<Customer | null>>;
  getById(customerId: string, user: AuthenticatedUser): Promise<ApiResponse<Customer | null>>;
  list(filters: CustomerFilters, user: AuthenticatedUser): Promise<ApiResponse<PaginatedResponse<Customer> | null>>;
};

const cleanText = (value: unknown) => String(value ?? '').trim();
const tokenHash = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex');
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const CUSTOMER_IMPORT_FACT_SCAN_PAGE_SIZE = 5_000;
const CUSTOMER_IMPORT_ENQUEUE_TRANSACTION_TIMEOUT_MS = 120_000;

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

function storedCustomerContactKeys(row: { phone: string | null; wechat: string | null }): string[] {
  const rawPhone = cleanText(row.phone);
  const digits = rawPhone.replace(/\D/g, '');
  const mainland = digits.slice(-11);
  const explicitForeign = rawPhone.startsWith('+') && !digits.startsWith('86');
  const domesticShape = /^1[3-9]\d{9}$/.test(digits) || /^(?:86|0086)1[3-9]\d{9}$/.test(digits);
  const phoneKey = !explicitForeign && domesticShape && /^1[3-9]\d{9}$/.test(mainland)
    ? `phone:+86${mainland}`
    : customerContactKeys({ phone: row.phone || '', wechat: '' })[0] || '';
  const wechat = cleanText(row.wechat).toLocaleLowerCase('zh-CN');
  return [phoneKey, wechat ? `wechat:${wechat}` : ''].filter(Boolean);
}

export async function loadExistingCustomerImportFacts(
  prisma: Pick<PrismaClient, '$queryRaw'>,
  rows: CustomerImportRow[],
): Promise<{ contactKeys: Set<string>; customerNames: Set<string> }> {
  const keys = new Set(rows.flatMap(customerContactKeys));
  const names = Array.from(new Set(rows.map((row) => cleanText(row.name).toLocaleLowerCase('zh-CN')).filter(Boolean)));
  const nameSet = new Set(names);
  if (!keys.size && !names.length) {
    return { contactKeys: new Set(), customerNames: new Set() };
  }
  const contactKeys = new Set<string>();
  const customerNames = new Set<string>();
  let cursor = '';
  while (true) {
    const found = await prisma.$queryRaw<Array<{
      recordId: string;
      phone: string | null;
      wechat: string | null;
      name: string | null;
    }>>(Prisma.sql`
      SELECT recordId,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.phone')) AS phone,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.wechat')) AS wechat,
             JSON_UNQUOTE(JSON_EXTRACT(data, '$.name')) AS name
      FROM business_records
      WHERE domain = ${STORAGE_KEYS.CUSTOMERS}
        AND recordId > ${cursor}
        AND mergedIntoId IS NULL
        AND JSON_EXTRACT(data, '$.deletedAt') IS NULL
      ORDER BY recordId ASC
      LIMIT ${CUSTOMER_IMPORT_FACT_SCAN_PAGE_SIZE}
    `);
    for (const row of found) {
      storedCustomerContactKeys(row)
        .filter((key) => keys.has(key))
        .forEach((key) => contactKeys.add(key));
      const name = cleanText(row.name).toLocaleLowerCase('zh-CN');
      if (nameSet.has(name)) customerNames.add(name);
    }
    if (found.length < CUSTOMER_IMPORT_FACT_SCAN_PAGE_SIZE) break;
    const nextCursor = cleanText(found[found.length - 1]?.recordId);
    if (!nextCursor || nextCursor <= cursor) throw new Error('客户重复检测分页游标异常');
    cursor = nextCursor;
  }
  return { contactKeys, customerNames };
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

function importJobSummary(job: any): CustomerBatchJobSummary {
  const iso = (value: unknown) => value ? new Date(value as string | Date).toISOString() : undefined;
  return {
    id: String(job.id), actorId: String(job.actorId), actorName: cleanText(job.actorName),
    handlerKey: 'customer_import', operation: 'import', status: job.status,
    selectionMode: 'file_rows', frozenCustomerCount: Number(job.frozenCustomerCount || 0),
    totalCount: Number(job.totalCount || 0), successCount: Number(job.successCount || 0),
    failedCount: Number(job.failedCount || 0), skippedCount: Number(job.skippedCount || 0),
    cancelledCount: Number(job.cancelledCount || 0), createdAt: iso(job.createdAt) || new Date().toISOString(),
    ...(iso(job.startedAt) ? { startedAt: iso(job.startedAt) } : {}),
    ...(iso(job.finishedAt) ? { finishedAt: iso(job.finishedAt) } : {}),
    ...(iso(job.cancelRequestedAt) ? { cancelRequestedAt: iso(job.cancelRequestedAt) } : {}),
    ...(iso(job.cancelledAt) ? { cancelledAt: iso(job.cancelledAt) } : {}),
  };
}

export async function enqueueCustomerImportExecution(
  prisma: PrismaClient,
  event: CustomerImportExecutionEvent,
): Promise<CustomerBatchJobSummary> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
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
      const jobs = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT *
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
      return importJobSummary(job);
    }

    if (new Date(precheck.expiresAt).getTime() <= now.getTime()) throw new CustomerDataExchangeError('导入预检凭证已过期，请重新预检', 409);

    const jobId = `import-${randomUUID()}`;
    await tx.customerBatchJob.create({
      data: {
        id: jobId,
        handlerKey: 'customer_import',
        operation: 'import',
        status: 'queued',
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
      },
    });
    const blockedRows = event.rows.filter((item) => !item.input);
    for (let offset = 0; offset < event.rows.length; offset += 500) {
      await tx.customerBatchJobItem.createMany({
        data: event.rows.slice(offset, offset + 500).map((item) => {
          const targetKey = `row:${String(item.index + 1).padStart(6, '0')}:excel:${String(item.row.rowNumber).padStart(6, '0')}`;
          const blocked = !item.input;
          return {
            id: randomUUID(), jobId, targetKey, status: blocked ? 'failed' : 'queued',
            errorCode: blocked ? 'CUSTOMER_IMPORT_PRECHECK_BLOCKED' : null,
            errorMessage: blocked ? item.row.reason : null,
            beforeSnapshot: blocked ? undefined : json({
              rowNumber: item.row.rowNumber,
              name: item.row.name,
              input: item.input,
              lastFollowUpRecord: item.lastFollowUpRecord || '',
              destination: event.destination,
            }),
            afterSnapshot: blocked ? json({ ...item.row, status: 'failed' }) : undefined,
            idempotencyKey: `${jobId}:${targetKey}`,
            retryable: false,
            attemptCount: 0,
            finishedAt: blocked ? now : undefined,
          };
        }),
      });
    }
    if (blockedRows.length) {
      await tx.customerBatchJob.update({
        where: { id: jobId },
        data: { failedCount: blockedRows.length, cursor: blockedRows.length },
      });
    }
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
    const job = await tx.customerBatchJob.findUnique({ where: { id: jobId } });
    if (!job) throw new CustomerDataExchangeError('导入任务创建失败', 500);
    return importJobSummary(job);
  }, {
    isolationLevel: 'ReadCommitted',
    timeout: CUSTOMER_IMPORT_ENQUEUE_TRANSACTION_TIMEOUT_MS,
  });
}

export function createCustomerImportBatchJobHandler(reader: CustomerReader): CustomerBatchJobHandler {
  return {
    handlerKey: 'customer_import',
    executionKind: 'itemized',
    async processItem({ tx, job, item, executionContext }, lease) {
      await lease.assertActive(tx);
      const snapshot = readStorageValue<any>(item.beforeSnapshot, null);
      if (!snapshot?.input || !['assigned', 'public_pool'].includes(snapshot.destination)) {
        throw new Error('客户导入任务参数已损坏');
      }
      if (!executionContext.user) throw new Error('当前用户不存在或已离职');
      if (!hasPermission(executionContext.user, PERMISSION_KEYS.CUSTOMER_IMPORT, 'write')) {
        throw new Error('当前用户无权导入客户');
      }
      if (
        (cleanText(snapshot.input.previousOwner) || cleanText(snapshot.input.originalSalesTransferBy))
        && !hasPermission(executionContext.user, PERMISSION_KEYS.CUSTOMER_IMPORT_ATTRIBUTION_OVERRIDE, 'write')
      ) {
        throw new Error('当前用户无权导入历史销售负责人');
      }
      const permissions = [...(executionContext.user.permissions || [])];
      if (!hasPermission(executionContext.user, PERMISSION_KEYS.CUSTOMER_CREATE, 'write')) {
        permissions.push({ module: PERMISSION_KEYS.CUSTOMER_CREATE, actions: ['read', 'write'] });
      }
      if (
        cleanText(snapshot.input.ownerId)
        && snapshot.input.ownerId !== executionContext.user.id
        && hasPermission(executionContext.user, PERMISSION_KEYS.CUSTOMER_IMPORT_ATTRIBUTION_OVERRIDE, 'write')
        && !hasPermission(executionContext.user, PERMISSION_KEYS.CUSTOMER_TRANSFER, 'write')
      ) {
        permissions.push({ module: PERMISSION_KEYS.CUSTOMER_TRANSFER, actions: ['read', 'write'] });
      }
      const executionUser = { ...executionContext.user, permissions };
      const created = await reader.create(snapshot.input, executionUser, {
        tx,
        accessContext: executionContext.access,
        batchJobId: job.id,
        requestId: `${job.id}:${item.targetKey}`,
        idempotencyKey: item.idempotencyKey,
        importDestination: snapshot.destination,
        importedLastFollowUpRecord: cleanText(snapshot.lastFollowUpRecord),
      });
      if (created.code !== 0 || !created.data) throw new Error(created.message || '客户导入失败');
      return {
        afterSnapshot: {
          rowNumber: Number(snapshot.rowNumber || 0), name: cleanText(snapshot.name),
          status: 'imported', reason: '导入成功', customerId: created.data.id,
        } as any,
      };
    },
  };
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
        loadExistingCustomerImportFacts(input.prisma, rows),
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
        attributionUsers: users,
        lifecycleStatuses: lifecycle
          .filter((item) => item.code !== 'public_pool')
          .map((item) => ({ code: item.code, name: item.name })),
        customerLevels: levels.map((item) => ({ value: item.value, label: item.label })),
        leadSources: leadSourceOptions(sources),
        tags: catalog.tags.filter((tag) => tag.isActive !== false).map((tag) => ({ id: tag.id, name: tag.name })),
        existingContactKeys: duplicateKeys.contactKeys,
        existingCustomerNames: duplicateKeys.customerNames,
      };
    },
    enqueueImportExecution: (event) => enqueueCustomerImportExecution(input.prisma, event),
    readCustomers: (selection, user) => readSelection(input.customerReader, selection, user),
    recordExportAudit: (event) => recordExportAudit(input.prisma, event),
    persistImportPrecheck: (event) => persistImportPrecheck(input.prisma, event),
  };
  return createCustomerDataExchangeService(deps);
}
