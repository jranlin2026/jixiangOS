import type {
  SchedulerCursorState,
  SchedulerFailureSummary,
  SchedulerLease,
  SchedulerRunCompletion,
  SchedulerRunRecord,
  WorkbenchSchedulerStore,
} from './workbenchScheduler';
import { normalizeSchedulerCursors } from './workbenchScheduler';

type PrismaLike = any;

function mapLease(row: any): SchedulerLease {
  return {
    leaseKey: String(row.leaseKey), ownerToken: row.ownerToken ? String(row.ownerToken) : null,
    leaseEpoch: Number(row.leaseEpoch), expiresAt: new Date(row.expiresAt),
  };
}

function cursorState(value: unknown): SchedulerCursorState | null {
  const cursors = normalizeSchedulerCursors(value);
  return Object.keys(cursors).length ? cursors : null;
}

function assertPersistableCursors(value: SchedulerCursorState | null): SchedulerCursorState | null {
  if (!value) return null;
  const normalized = normalizeSchedulerCursors(value);
  const entries = Object.entries(value);
  if (entries.length !== Object.keys(normalized).length
    || entries.some(([module, cursor]) => normalized[module as keyof SchedulerCursorState] !== cursor)) {
    throw new Error('INVALID_SCHEDULER_CURSOR_STATE');
  }
  return normalized;
}

function failureSummary(value: unknown): SchedulerFailureSummary[] {
  return Array.isArray(value) ? value.slice(0, 10) as SchedulerFailureSummary[] : [];
}

function mapRun(row: any): SchedulerRunRecord {
  return {
    id: String(row.id), leaseKey: String(row.leaseKey), ownerToken: String(row.ownerToken),
    leaseEpoch: Number(row.leaseEpoch), jobType: row.jobType,
    businessDate: row.businessDate ? String(row.businessDate) : null, status: row.status,
    startedAt: new Date(row.startedAt), finishedAt: row.finishedAt ? new Date(row.finishedAt) : null,
    successCount: Number(row.successCount || 0), skippedCount: Number(row.skippedCount || 0),
    failedCount: Number(row.failedCount || 0), failureSummary: failureSummary(row.failureSummary),
    cursors: cursorState(row.cursors),
  };
}

async function lockedCurrentLease(
  tx: PrismaLike,
  input: { leaseKey: string; ownerToken: string; leaseEpoch: number },
): Promise<any | null> {
  const rows = await tx.$queryRawUnsafe(
    'SELECT `leaseKey`, `ownerToken`, `leaseEpoch`, `expiresAt`, CURRENT_TIMESTAMP(3) AS `databaseNow` FROM `workbench_scheduler_leases` WHERE `leaseKey` = ? AND `ownerToken` = ? AND `leaseEpoch` = ? AND `expiresAt` > CURRENT_TIMESTAMP(3) FOR UPDATE',
    input.leaseKey, input.ownerToken, input.leaseEpoch,
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function readOwnedLease(
  tx: PrismaLike,
  input: { leaseKey: string; ownerToken: string; leaseEpoch?: number },
): Promise<SchedulerLease | null> {
  const epochClause = input.leaseEpoch === undefined ? '' : ' AND `leaseEpoch` = ?';
  const values = input.leaseEpoch === undefined
    ? [input.leaseKey, input.ownerToken]
    : [input.leaseKey, input.ownerToken, input.leaseEpoch];
  const rows = await tx.$queryRawUnsafe(
    `SELECT \`leaseKey\`, \`ownerToken\`, \`leaseEpoch\`, \`expiresAt\` FROM \`workbench_scheduler_leases\` WHERE \`leaseKey\` = ? AND \`ownerToken\` = ?${epochClause}`,
    ...values,
  );
  return Array.isArray(rows) && rows[0] ? mapLease(rows[0]) : null;
}

async function readCurrentOwnedLease(
  client: PrismaLike,
  input: { leaseKey: string; ownerToken: string; leaseEpoch: number },
): Promise<SchedulerLease | null> {
  const rows = await client.$queryRawUnsafe(
    'SELECT `leaseKey`, `ownerToken`, `leaseEpoch`, `expiresAt` FROM `workbench_scheduler_leases` WHERE `leaseKey` = ? AND `ownerToken` = ? AND `leaseEpoch` = ? AND `expiresAt` > CURRENT_TIMESTAMP(3)',
    input.leaseKey, input.ownerToken, input.leaseEpoch,
  );
  return Array.isArray(rows) && rows[0] ? mapLease(rows[0]) : null;
}

export function createPrismaSchedulerStore(prisma: PrismaLike): WorkbenchSchedulerStore {
  return {
    async acquireLease(input) {
      return prisma.$transaction(async (tx: PrismaLike) => {
        await tx.$executeRawUnsafe(
          'INSERT IGNORE INTO `workbench_scheduler_leases` (`leaseKey`, `leaseEpoch`, `ownerToken`, `expiresAt`, `createdAt`, `updatedAt`) VALUES (?, 0, NULL, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))',
          input.leaseKey,
        );
        const claimed = await tx.$executeRawUnsafe(
          'UPDATE `workbench_scheduler_leases` SET `ownerToken` = ?, `leaseEpoch` = `leaseEpoch` + 1, `expiresAt` = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? MICROSECOND), `updatedAt` = CURRENT_TIMESTAMP(3) WHERE `leaseKey` = ? AND `expiresAt` <= CURRENT_TIMESTAMP(3)',
          input.ownerToken, input.leaseMs * 1_000, input.leaseKey,
        );
        if (Number(claimed) !== 1) return null;
        return readOwnedLease(tx, input);
      });
    },

    async renewLease(input) {
      if (!input.ownerToken) return null;
      return prisma.$transaction(async (tx: PrismaLike) => {
        const renewed = await tx.$executeRawUnsafe(
          'UPDATE `workbench_scheduler_leases` SET `expiresAt` = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? MICROSECOND), `updatedAt` = CURRENT_TIMESTAMP(3) WHERE `leaseKey` = ? AND `ownerToken` = ? AND `leaseEpoch` = ? AND `expiresAt` > CURRENT_TIMESTAMP(3)',
          input.leaseMs * 1_000, input.leaseKey, input.ownerToken, input.leaseEpoch,
        );
        if (Number(renewed) !== 1) return null;
        return readOwnedLease(tx, { ...input, ownerToken: input.ownerToken! });
      });
    },

    async validateLease(input) {
      return readCurrentOwnedLease(prisma, input);
    },

    async beginRun(input) {
      return prisma.$transaction(async (tx: PrismaLike) => {
        const lease = await lockedCurrentLease(tx, input);
        if (!lease) return null;
        const databaseNow = new Date(lease.databaseNow);
        await tx.workbenchSchedulerRun.updateMany({
          where: { leaseKey: input.leaseKey, status: 'RUNNING', leaseEpoch: { lt: input.leaseEpoch } },
          data: {
            status: 'ABANDONED', finishedAt: databaseNow, failedCount: 1,
            failureSummary: [{ code: 'LEASE_EXPIRED' }],
          },
        });
        const row = await tx.workbenchSchedulerRun.create({
          data: {
            ...input, startedAt: databaseNow, status: 'RUNNING', successCount: 0,
            skippedCount: 0, failedCount: 0, failureSummary: [], cursors: undefined,
          },
        });
        return mapRun(row);
      });
    },

    async finishRun(input: SchedulerRunCompletion) {
      const cursors = assertPersistableCursors(input.cursors);
      return prisma.$transaction(async (tx: PrismaLike) => {
        const run = await tx.workbenchSchedulerRun.findFirst({
          where: {
            id: input.runId, ownerToken: input.ownerToken,
            leaseEpoch: input.leaseEpoch, status: 'RUNNING',
          },
        });
        if (!run) return false;
        const lease = await lockedCurrentLease(tx, {
          leaseKey: run.leaseKey, ownerToken: input.ownerToken, leaseEpoch: input.leaseEpoch,
        });
        if (!lease) return false;
        const updated = await tx.workbenchSchedulerRun.updateMany({
          where: {
            id: input.runId, ownerToken: input.ownerToken,
            leaseEpoch: input.leaseEpoch, status: 'RUNNING',
          },
          data: {
            status: input.status, finishedAt: new Date(lease.databaseNow),
            successCount: input.successCount, skippedCount: input.skippedCount,
            failedCount: input.failedCount, failureSummary: failureSummary(input.failureSummary),
            cursors: cursors || undefined,
          },
        });
        return updated.count === 1;
      });
    },

    async releaseLease(input) {
      const released = await prisma.$executeRawUnsafe(
        'UPDATE `workbench_scheduler_leases` SET `ownerToken` = NULL, `expiresAt` = CURRENT_TIMESTAMP(3), `updatedAt` = CURRENT_TIMESTAMP(3) WHERE `leaseKey` = ? AND `ownerToken` = ? AND `leaseEpoch` = ? AND `expiresAt` > CURRENT_TIMESTAMP(3)',
        input.leaseKey, input.ownerToken, input.leaseEpoch,
      );
      return Number(released) === 1;
    },

    async loadLatestCursors(leaseKey, jobType) {
      const row = await prisma.workbenchSchedulerRun.findFirst({
        where: { leaseKey, jobType, status: { in: ['SUCCEEDED', 'PARTIAL'] } },
        orderBy: [{ leaseEpoch: 'desc' }, { id: 'desc' }],
      });
      return cursorState(row?.cursors) || undefined;
    },
  };
}
