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
function json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
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
      SELECT * FROM business_import_jobs
      WHERE id = ${lease.id} AND leaseOwner = ${lease.leaseOwner} AND leaseEpoch = ${lease.leaseEpoch}
        AND status = 'running' LIMIT 1 FOR UPDATE`;
    return rows[0] || null;
  };
  return {
    claim: ({ workerId, jobId, now, leaseMs }) => transaction(async (tx) => {
      const constraint = jobId ? Prisma.sql`AND id = ${jobId}` : Prisma.empty;
      const rows = await tx.$queryRaw<any[]>(Prisma.sql`
        SELECT * FROM business_import_jobs
        WHERE (status = 'queued' OR (status = 'running' AND leaseExpiresAt < ${now}))
        ${constraint}
        ORDER BY createdAt ASC, id ASC LIMIT 1 FOR UPDATE SKIP LOCKED`);
      const candidate = rows[0];
      if (!candidate) return null;
      const executionRows = read<BusinessImportJobRow[]>(candidate.rows, []).map((row) => (
        row.executionStatus === 'running' ? { ...row, executionStatus: 'queued' as const } : row
      ));
      const updated = await tx.businessImportJob.updateMany({
        where: { id: candidate.id, status: candidate.status, leaseEpoch: Number(candidate.leaseEpoch || 0) },
        data: {
          status: 'running', leaseOwner: workerId, leaseEpoch: { increment: 1 }, rows: json(executionRows),
          leaseExpiresAt: new Date(now.getTime() + leaseMs), heartbeatAt: now, startedAt: candidate.startedAt || now,
        },
      });
      if (updated.count !== 1) return null;
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
      const rows = read<BusinessImportJobRow[]>(current.rows, []);
      const index = rows.findIndex((row) => row.status !== 'blocked' && (row.executionStatus || 'queued') === 'queued');
      if (index < 0) return null;
      rows[index] = { ...rows[index], executionStatus: 'running', errorMessage: undefined };
      await tx.businessImportJob.update({ where: { id: current.id }, data: { rows: json(rows), heartbeatAt: new Date() } });
      return rows[index];
    }),
    markSucceeded: (lease, rowNumber, recordId) => transaction(async (tx) => {
      const current = await lock(tx, lease);
      if (!current) return false;
      const rows = read<BusinessImportJobRow[]>(current.rows, []);
      const index = rows.findIndex((row) => row.rowNumber === rowNumber && row.executionStatus === 'running');
      if (index < 0) return false;
      rows[index] = { ...rows[index], executionStatus: 'succeeded', recordId, errorMessage: undefined };
      await tx.businessImportJob.update({ where: { id: current.id }, data: { rows: json(rows), successCount: { increment: 1 }, heartbeatAt: new Date() } });
      return true;
    }),
    markFailed: (lease, rowNumber, message) => transaction(async (tx) => {
      const current = await lock(tx, lease);
      if (!current) return false;
      const rows = read<BusinessImportJobRow[]>(current.rows, []);
      const index = rows.findIndex((row) => row.rowNumber === rowNumber && row.executionStatus === 'running');
      if (index < 0) return false;
      rows[index] = { ...rows[index], executionStatus: 'failed', errorMessage: message.slice(0, 1_000) };
      await tx.businessImportJob.update({ where: { id: current.id }, data: { rows: json(rows), failedCount: { increment: 1 }, heartbeatAt: new Date() } });
      return true;
    }),
    finalize: (lease) => transaction(async (tx) => {
      const current = await lock(tx, lease);
      if (!current) return false;
      const rows = read<BusinessImportJobRow[]>(current.rows, []);
      if (rows.some((row) => ['queued', 'running'].includes(row.executionStatus || 'queued'))) return false;
      const successCount = rows.filter((row) => row.executionStatus === 'succeeded').length;
      const failedCount = rows.filter((row) => row.executionStatus === 'failed' || row.status === 'blocked').length;
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
    rows: read<BusinessImportJobRow[]>(row.rows, []).map((item) => ({
      ...item,
      ...(item.errorMessage ? { errorMessage: safeBusinessImportErrorMessage(item.errorMessage) } : {}),
    })),
  });
  return {
    async getJob(id: string, actor: AuthenticatedUser): Promise<BusinessImportJobResult | null> {
      const row = await prisma.businessImportJob.findUnique({ where: { id } });
      return row && row.actorId === actor.id ? result(row) : null;
    },
    async getBatch(id: string, actor: AuthenticatedUser): Promise<BusinessImportBatchResult | null> {
      const row = await prisma.businessImportBatch.findUnique({ where: { id }, include: { jobs: true } });
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
