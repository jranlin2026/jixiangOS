import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { BrowserLeadSyncRecord } from './browserLeadIntakeService';

type BrowserLeadSyncPrisma = Pick<PrismaClient, 'browserLeadSync'>;

function record(row: any): BrowserLeadSyncRecord {
  return {
    ...row,
    status: row.status as BrowserLeadSyncRecord['status'],
    orderRemarkStatus: row.orderRemarkStatus as BrowserLeadSyncRecord['orderRemarkStatus'],
  };
}

function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
}

export function createPrismaBrowserLeadSyncRepository(prisma: BrowserLeadSyncPrisma) {
  return {
    async reserve(input: {
      platform: string;
      shopKey: string;
      platformOrderNo: string;
      operatorId: string;
      operatorName: string;
      contactSource: 'CHAT' | 'OFF_PLATFORM';
    }) {
      try {
        const created = await prisma.browserLeadSync.create({
          data: {
            id: `browser-lead-sync-${randomUUID()}`,
            ...input,
            status: 'PENDING',
            orderRemarkStatus: 'NOT_ATTEMPTED',
            attemptCount: 1,
          },
        });
        return { acquired: true as const, record: record(created) };
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
      }

      const existing = await prisma.browserLeadSync.findUnique({
        where: {
          platform_shopKey_platformOrderNo: {
            platform: input.platform,
            shopKey: input.shopKey,
            platformOrderNo: input.platformOrderNo,
          },
        },
      });
      if (!existing) throw new Error('浏览器线索同步保留记录未找到');
      if (existing.status !== 'FAILED') return { acquired: false as const, record: record(existing) };

      const claimed = await prisma.browserLeadSync.updateMany({
        where: { id: existing.id, status: 'FAILED' },
        data: {
          status: 'PENDING',
          lastError: null,
          operatorId: input.operatorId,
          operatorName: input.operatorName,
          attemptCount: { increment: 1 },
        },
      });
      const refreshed = await prisma.browserLeadSync.findUnique({ where: { id: existing.id } });
      if (!refreshed) throw new Error('浏览器线索同步重试记录未找到');
      return { acquired: claimed.count === 1, record: record(refreshed) };
    },

    async markSucceeded(id: string, input: {
      leadId: string;
      leadName: string;
      assignedTo?: string | null;
      assignedToId?: string | null;
      intakeStatus?: string | null;
    }) {
      return record(await prisma.browserLeadSync.update({
        where: { id },
        data: { ...input, status: 'SUCCEEDED', lastError: null, completedAt: new Date() },
      }));
    },

    async markFailed(id: string, errorMessage: string) {
      return record(await prisma.browserLeadSync.update({
        where: { id },
        data: { status: 'FAILED', lastError: errorMessage.slice(0, 1000) },
      }));
    },

    async reportOrderRemark(
      id: string,
      operator: { id: string; name: string },
      input: { status: 'SUCCEEDED' | 'FAILED'; errorMessage?: string },
    ) {
      const existing = await prisma.browserLeadSync.findUnique({ where: { id } });
      if (!existing) return null;
      return record(await prisma.browserLeadSync.update({
        where: { id },
        data: {
          orderRemarkStatus: input.status,
          remarkOperatorId: operator.id,
          remarkOperatorName: operator.name,
          orderRemarkError: input.status === 'FAILED' ? (input.errorMessage || '订单备注失败').slice(0, 1000) : null,
          orderRemarkedAt: input.status === 'SUCCEEDED' ? new Date() : null,
        },
      }));
    },
  };
}

export type PrismaBrowserLeadSyncRepository = ReturnType<typeof createPrismaBrowserLeadSyncRepository>;
