import { randomUUID } from 'node:crypto';
import type { OkrMetricService } from './okrMetricService';

type PrismaLike = any;

type OkrMetricWorkerOptions = {
  prisma: PrismaLike;
  service: Pick<OkrMetricService, 'refreshSystem'>;
  workerId?: string;
  now?: () => Date;
  pollIntervalMs?: number;
  refreshIntervalMs?: number;
  leaseMs?: number;
  batchSize?: number;
  stopTimeoutMs?: number;
  onError?: (error: unknown) => void;
};

function refreshSlot(value: Date, intervalMs: number) {
  return new Date(Math.floor(value.getTime() / intervalMs) * intervalMs).toISOString();
}

export function createOkrMetricWorker(options: OkrMetricWorkerOptions) {
  const workerId = options.workerId || `okr-metric-${process.pid}-${randomUUID()}`;
  const now = () => options.now?.() || new Date();
  const pollIntervalMs = Math.max(1_000, options.pollIntervalMs || 60_000);
  const refreshIntervalMs = Math.max(60_000, options.refreshIntervalMs || 15 * 60_000);
  const leaseMs = Math.max(5_000, options.leaseMs || 5 * 60_000);
  const batchSize = Math.max(1, Math.min(100, options.batchSize || 25));
  const stopTimeoutMs = Math.max(10, options.stopTimeoutMs || 30_000);
  let timer: ReturnType<typeof setInterval> | null = null;
  let active: Promise<{ scanned: number; succeeded: number; blocked: number }> | null = null;

  const claim = async () => options.prisma.$transaction(async (tx: PrismaLike) => {
    const claimedAt = now();
    const candidate = await tx.okrMetricBinding.findFirst({
      where: {
        nextRefreshAt: { lte: claimedAt },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: claimedAt } }],
        keyResult: { objective: { cycle: { status: 'ACTIVE' } } },
      },
      orderBy: [{ nextRefreshAt: 'asc' }, { id: 'asc' }],
    });
    if (!candidate) return null;
    const claimed = await tx.okrMetricBinding.updateMany({
      where: {
        id: candidate.id, leaseEpoch: candidate.leaseEpoch,
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: claimedAt } }],
      },
      data: {
        leaseOwner: workerId,
        leaseEpoch: { increment: 1 },
        leaseExpiresAt: new Date(claimedAt.getTime() + leaseMs),
      },
    });
    if (claimed.count !== 1) return null;
    return { ...candidate, leaseOwner: workerId, leaseEpoch: candidate.leaseEpoch + 1, claimedAt };
  });

  const settle = async (binding: any) => {
    const settledAt = now();
    await options.prisma.okrMetricBinding.updateMany({
      where: { id: binding.id, leaseOwner: workerId, leaseEpoch: binding.leaseEpoch },
      data: {
        nextRefreshAt: new Date(settledAt.getTime() + refreshIntervalMs),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
  };

  const runOnce = () => {
    if (active) return active;
    active = (async () => {
      let scanned = 0;
      let succeeded = 0;
      let blocked = 0;
      for (let index = 0; index < batchSize; index += 1) {
        const binding = await claim();
        if (!binding) break;
        scanned += 1;
        try {
          const result = await options.service.refreshSystem(binding.keyResultId, {
            refreshSlot: refreshSlot(binding.claimedAt, refreshIntervalMs),
            leaseOwner: workerId,
            leaseEpoch: binding.leaseEpoch,
          });
          if (result.code === 0) succeeded += 1;
          else blocked += 1;
        } catch (error) {
          blocked += 1;
          options.onError?.(error);
        } finally {
          await settle(binding).catch((error: unknown) => options.onError?.(error));
        }
      }
      return { scanned, succeeded, blocked };
    })().finally(() => { active = null; });
    return active;
  };

  const tick = () => { void runOnce().catch((error) => options.onError?.(error)); };

  return {
    runOnce,
    start() {
      if (timer) return;
      tick();
      timer = setInterval(tick, pollIntervalMs);
      timer.unref?.();
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = null;
      if (!active) return;
      await Promise.race([
        active.catch((error) => options.onError?.(error)),
        new Promise<void>((resolve) => setTimeout(resolve, stopTimeoutMs)),
      ]);
    },
  };
}

export type OkrMetricWorker = ReturnType<typeof createOkrMetricWorker>;
