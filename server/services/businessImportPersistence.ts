import { Prisma, type PrismaClient } from '@prisma/client';
import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  BusinessImportBatchResult,
  BusinessImportJobExecution,
  BusinessImportJobResult,
  BusinessImportJobRow,
  BusinessImportReviewRequest,
  BusinessImportType,
} from '../../src/types/businessImport';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { BusinessImportJobLease, BusinessImportJobStore } from './businessImportExecution';
import { safeBusinessImportErrorMessage } from './businessImportError';
import { buildDataVisibilityScopeForUser } from '../../src/shared/utils/dataVisibility';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';

function read<T>(value: unknown, fallback: T): T {
  if (typeof value === 'string') { try { return JSON.parse(value) as T; } catch { return fallback; } }
  return (value ?? fallback) as T;
}
function itemResult(item: any): BusinessImportJobRow {
  const payload = read<BusinessImportJobRow>(item.payload, {} as BusinessImportJobRow);
  return {
    ...payload,
    executionStatus: item.status,
    recordId: item.recordId || undefined,
    errorMessage: item.errorMessage ? safeBusinessImportErrorMessage(item.errorMessage) : undefined,
  };
}
function job(row: any, workerId?: string): BusinessImportJobExecution {
  return {
    id: row.id, batchId: row.batchId, type: row.importType, status: row.status,
    actorId: row.actorId, actorName: row.actorName, totalCount: Number(row.totalCount),
    successCount: Number(row.successCount || 0), failedCount: Number(row.failedCount || 0),
    leaseOwner: workerId || row.leaseOwner, leaseEpoch: Number(row.leaseEpoch || 0),
    leaseExpiresAt: row.leaseExpiresAt, startedAt: row.startedAt, finishedAt: row.finishedAt,
  };
}

export function createPrismaBusinessImportJobStore(prisma: PrismaClient): BusinessImportJobStore {
  const transaction = <T>(operation: (tx: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(operation, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5_000, timeout: 20_000,
  });
  const lock = async (tx: Prisma.TransactionClient, lease: BusinessImportJobLease) => {
    const rows = await tx.$queryRaw<any[]>`
      SELECT id, batchId, status, leaseOwner, leaseEpoch, totalCount FROM business_import_jobs
      WHERE id = ${lease.id} AND leaseOwner = ${lease.leaseOwner} AND leaseEpoch = ${lease.leaseEpoch}
        AND status = 'running' LIMIT 1 FOR UPDATE`;
    return rows[0] || null;
  };
  return {
    claim: ({ workerId, jobId, now, leaseMs }) => transaction(async (tx) => {
      const constraint = jobId ? Prisma.sql`AND id = ${jobId}` : Prisma.empty;
      const rows = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT id, batchId, importType, status, actorId, actorName, totalCount, successCount, failedCount,
          leaseOwner, leaseEpoch, leaseExpiresAt, startedAt, finishedAt, createdAt
        FROM business_import_jobs
        WHERE (status = 'queued' OR (status = 'running' AND leaseExpiresAt < ${now}))
        ${constraint}
        ORDER BY createdAt ASC, id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`);
      const candidate = rows[0];
      if (!candidate) return null;
      const updated = await tx.businessImportJob.updateMany({
        where: { id: candidate.id, status: candidate.status, leaseEpoch: Number(candidate.leaseEpoch || 0) },
        data: {
          status: 'running', leaseOwner: workerId, leaseEpoch: { increment: 1 },
          leaseExpiresAt: new Date(now.getTime() + leaseMs), heartbeatAt: now, startedAt: candidate.startedAt || now,
        },
      });
      if (updated.count !== 1) return null;
      await tx.businessImportJobItem.updateMany({
        where: { jobId: candidate.id, status: 'running' },
        data: { status: 'queued' },
      });
      const claimed = await tx.businessImportJob.findUnique({ where: { id: candidate.id } });
      return claimed ? job(claimed, workerId) as BusinessImportJobLease : null;
    }),
    heartbeat: async (lease, leaseMs, now) => {
      const updated = await prisma.businessImportJob.updateMany({
        where: { id: lease.id, leaseOwner: lease.leaseOwner, leaseEpoch: lease.leaseEpoch, status: 'running' },
        data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + leaseMs) },
      });
      return updated.count === 1;
    },
    nextRow: (lease) => transaction(async (tx) => {
      const current = await lock(tx, lease);
      if (!current) return null;
      const item = await tx.businessImportJobItem.findFirst({
        where: { jobId: current.id, status: 'queued' }, orderBy: [{ rowNumber: 'asc' }, { id: 'asc' }],
      });
      if (!item) return null;
      const claimed = await tx.businessImportJobItem.updateMany({
        where: { id: item.id, jobId: current.id, status: 'queued' },
        data: { status: 'running', errorMessage: null },
      });
      if (claimed.count !== 1) return null;
      return itemResult({ ...item, status: 'running', errorMessage: null });
    }),
    markSucceeded: (lease, rowNumber, recordId) => transaction(async (tx) => {
      const current = await lock(tx, lease);
      if (!current) return false;
      const saved = await tx.businessImportJobItem.updateMany({
        where: { jobId: current.id, rowNumber, status: 'running' },
        data: { status: 'succeeded', recordId, errorMessage: null },
      });
      if (saved.count !== 1) return false;
      await tx.businessImportJob.update({ where: { id: current.id }, data: { successCount: { increment: 1 }, heartbeatAt: new Date() } });
      return true;
    }),
    markFailed: (lease, rowNumber, message) => transaction(async (tx) => {
      const current = await lock(tx, lease);
      if (!current) return false;
      const item = await tx.businessImportJobItem.findUnique({ where: { jobId_rowNumber: { jobId: current.id, rowNumber } } });
      if (!item || item.status !== 'running') return false;
      const saved = await tx.businessImportJobItem.updateMany({
        where: { id: item.id, jobId: current.id, status: 'running' },
        data: { status: 'failed', errorMessage: message.slice(0, 1_000) },
      });
      if (saved.count !== 1) return false;
      if (item.reservedNumber) {
        const createdRecord = await tx.businessRecord.findFirst({ where: {
          domain: { in: [STORAGE_KEYS.ORDER_APPLICATIONS, STORAGE_KEYS.RECOVERY_ORDERS] },
          AND: [
            { data: { path: '$.importBatchId', equals: current.batchId } },
            { data: { path: '$.importRowNumber', equals: rowNumber } },
          ],
        }, select: { id: true } });
        if (!createdRecord) {
          await tx.businessImportNumberReservation.deleteMany({ where: {
            jobId: current.id, rowNumber, normalizedNumber: item.reservedNumber,
          } });
        }
      }
      await tx.businessImportJob.update({ where: { id: current.id }, data: { failedCount: { increment: 1 }, heartbeatAt: new Date() } });
      return true;
    }),
    finalize: (lease) => transaction(async (tx) => {
      const current = await lock(tx, lease);
      if (!current) return false;
      const grouped = await tx.businessImportJobItem.groupBy({ by: ['status'], where: { jobId: current.id }, _count: { _all: true } });
      const count = (status: string) => Number(grouped.find((entry: any) => entry.status === status)?._count?._all || 0);
      if (count('queued') + count('running') > 0) return false;
      const successCount = count('succeeded');
      const failedCount = count('failed');
      const status = failedCount === 0 ? 'succeeded' : successCount > 0 ? 'partial_failed' : 'failed';
      await tx.businessImportJob.update({ where: { id: current.id }, data: {
        status, successCount, failedCount, finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, heartbeatAt: new Date(),
      } });
      await tx.businessImportBatch.update({ where: { id: current.batchId }, data: { status } });
      return true;
    }),
  };
}

export function createBusinessImportReadRepository(prisma: PrismaClient) {
  const result = (row: any): BusinessImportJobResult => ({
    id: row.id, batchId: row.batchId, type: row.importType, status: row.status,
    totalCount: row.totalCount, successCount: row.successCount, failedCount: row.failedCount,
    rows: Array.isArray(row.items)
      ? row.items.map(itemResult)
      : read<BusinessImportJobRow[]>(row.rows, []).map((item) => ({
        ...item,
        ...(item.errorMessage ? { errorMessage: safeBusinessImportErrorMessage(item.errorMessage) } : {}),
      })),
  });
  return {
    async getJob(id: string, actor: AuthenticatedUser): Promise<BusinessImportJobResult | null> {
      const row = await prisma.businessImportJob.findUnique({ where: { id }, include: { items: { orderBy: [{ rowNumber: 'asc' }, { id: 'asc' }] } } });
      return row && row.actorId === actor.id ? result(row) : null;
    },
    async getBatch(id: string, actor: AuthenticatedUser): Promise<BusinessImportBatchResult | null> {
      const row = await prisma.businessImportBatch.findUnique({ where: { id }, include: { jobs: { include: { items: { orderBy: [{ rowNumber: 'asc' }, { id: 'asc' }] } } } } });
      if (!row || row.actorId !== actor.id) return null;
      return {
        id: row.id, type: row.importType as BusinessImportType, status: row.status,
        sourceFileName: row.sourceFileName || undefined, totalCount: row.totalCount,
        readyCount: row.readyCount, warningCount: row.warningCount, blockedCount: row.blockedCount,
        createdAt: row.createdAt.toISOString(), jobs: row.jobs.map(result),
      };
    },
  };
}

export function createBusinessImportReviewSelector(prisma: PrismaClient) {
  return async (request: BusinessImportReviewRequest, actor: AuthenticatedUser) => {
    const domain = request.module === 'orders' ? STORAGE_KEYS.ORDER_APPLICATIONS : STORAGE_KEYS.RECOVERY_ORDERS;
    const scopeDomain = request.module === 'orders' ? 'orderApplications' : 'recoveryOrderApplications';
    const [users, roles, departments, rows] = await Promise.all([
      prisma.user.findMany(),
      prisma.role.findMany({ where: { isActive: true } }),
      prisma.department.findMany(),
      prisma.businessRecord.findMany({ where: {
        domain,
        ...(request.ids?.length ? { recordId: { in: request.ids } } : {}),
      } }),
    ]);
    const scope = buildDataVisibilityScopeForUser(
      actor,
      users.map(mapPrismaUser),
      roles.map(mapPrismaRole),
      departments as any,
      scopeDomain,
    );
    const visible = (data: Record<string, unknown>, idKey: string, nameKey: string): boolean => {
      if (scope.unrestricted) return true;
      const ownerId = String(data[idKey] || '').trim();
      if (ownerId) return scope.visibleUserIds.includes(ownerId);
      const ownerName = String(data[nameKey] || '').trim();
      return Boolean(ownerName && scope.visibleUserNames.includes(ownerName));
    };
    return rows.flatMap((row) => {
      const data = read<Record<string, unknown>>(row.data, {});
      const batchId = String(data.importBatchId || '');
      if (!batchId || (request.importBatchId && batchId !== request.importBatchId)) return [];
      const pendingStatus = request.module === 'orders' ? '待财务审核' : '待审核';
      if (String(data.status || '') !== pendingStatus) return [];
      if (request.module === 'orders') {
        if (!visible(data, 'applicantId', 'applicantName')) return [];
      } else if (!visible(data, 'createdBy', 'createdByName')) return [];
      return [{ id: row.recordId, module: request.module }];
    });
  };
}
