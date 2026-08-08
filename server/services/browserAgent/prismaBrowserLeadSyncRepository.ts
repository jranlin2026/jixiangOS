import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { BrowserLeadSyncRecord } from './browserLeadIntakeService';

type BrowserLeadSyncPrisma = Pick<PrismaClient, 'browserLeadSync' | 'leadRecord'>;

const PENDING_LEASE_MS = 10 * 60 * 1000;

function record(row: any): BrowserLeadSyncRecord {
  return {
    ...row,
    status: row.status as BrowserLeadSyncRecord['status'],
    orderRemarkStatus: row.orderRemarkStatus as BrowserLeadSyncRecord['orderRemarkStatus'],
    greenFlagStatus: row.greenFlagStatus as BrowserLeadSyncRecord['greenFlagStatus'],
  };
}

function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === 'P2002');
}

function leadFromRow(row: any) {
  const data = row?.data && typeof row.data === 'object' ? row.data : {};
  return {
    leadId: row.id,
    leadName: String(data.name || row.name || ''),
    assignedTo: data.assignedTo || row.assignedTo || null,
    assignedToId: data.assignedToId || null,
    intakeStatus: data.intakeStatus || null,
  };
}

export function createPrismaBrowserLeadSyncRepository(prisma: BrowserLeadSyncPrisma) {
  return {
    async reserve(input: {
      platform: string;
      shopKey: string;
      platformOrderNo: string;
      sourceProductName?: string;
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
            greenFlagStatus: 'NOT_ATTEMPTED',
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

      const createdLead = await prisma.leadRecord.findUnique({ where: { externalIntakeKey: existing.id } });
      if (createdLead) {
        const reconciled = await prisma.browserLeadSync.update({
          where: { id: existing.id },
          data: {
            ...leadFromRow(createdLead),
            status: 'SUCCEEDED',
            lastError: null,
            completedAt: new Date(),
          },
        });
        return { acquired: false as const, record: record(reconciled) };
      }

      const stalePending = existing.status === 'PENDING'
        && existing.updatedAt.getTime() <= Date.now() - PENDING_LEASE_MS;
      if (existing.status !== 'FAILED' && !stalePending) {
        return { acquired: false as const, record: record(existing) };
      }

      const claimed = await prisma.browserLeadSync.updateMany({
        where: {
          id: existing.id,
          status: existing.status,
          ...(stalePending ? { updatedAt: { lte: new Date(Date.now() - PENDING_LEASE_MS) } } : {}),
        },
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
      input: { status: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED'; errorMessage?: string },
    ) {
      const existing = await prisma.browserLeadSync.findUnique({ where: { id } });
      if (!existing || existing.status !== 'SUCCEEDED') return null;
      return record(await prisma.browserLeadSync.update({
        where: { id },
        data: {
          orderRemarkStatus: input.status,
          remarkOperatorId: operator.id,
          remarkOperatorName: operator.name,
          orderRemarkError: input.status === 'FAILED' ? (input.errorMessage || '订单备注失败').slice(0, 1000) : null,
          orderRemarkedAt: input.status === 'SUCCEEDED'
            ? existing.orderRemarkedAt || new Date()
            : existing.orderRemarkedAt,
        },
      }));
    },

    async reportPlatformCompletion(
      id: string,
      operator: { id: string; name: string },
      input: {
        orderRemarkStatus: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
        greenFlagStatus: 'NOT_ATTEMPTED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
        errorMessage?: string;
      },
    ) {
      const existing = await prisma.browserLeadSync.findUnique({ where: { id } });
      if (!existing || existing.status !== 'SUCCEEDED') return null;
      const errorMessage = input.errorMessage?.slice(0, 1000);
      return record(await prisma.browserLeadSync.update({
        where: { id },
        data: {
          orderRemarkStatus: input.orderRemarkStatus,
          greenFlagStatus: input.greenFlagStatus,
          remarkOperatorId: operator.id,
          remarkOperatorName: operator.name,
          orderRemarkError: input.orderRemarkStatus === 'FAILED'
            ? errorMessage || '订单备注失败'
            : null,
          greenFlagError: input.greenFlagStatus === 'FAILED'
            ? errorMessage || '绿色旗帜设置失败'
            : null,
          orderRemarkedAt: input.orderRemarkStatus === 'SUCCEEDED'
            ? existing.orderRemarkedAt || new Date()
            : existing.orderRemarkedAt,
          greenFlaggedAt: input.greenFlagStatus === 'SUCCEEDED'
            ? existing.greenFlaggedAt || new Date()
            : existing.greenFlaggedAt,
        },
      }));
    },
  };
}

export type PrismaBrowserLeadSyncRepository = ReturnType<typeof createPrismaBrowserLeadSyncRepository>;
