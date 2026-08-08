import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type {
  BrowserLeadSyncRecord,
  StoredLeadContactSnapshot,
} from './browserLeadIntakeService';

type BrowserLeadSyncPrisma = Pick<PrismaClient, 'browserLeadSync' | 'leadRecord'>;

const PENDING_LEASE_MS = 10 * 60 * 1000;

function record(row: any, storedContact?: StoredLeadContactSnapshot): BrowserLeadSyncRecord {
  return {
    ...row,
    status: row.status as BrowserLeadSyncRecord['status'],
    orderRemarkStatus: row.orderRemarkStatus as BrowserLeadSyncRecord['orderRemarkStatus'],
    greenFlagStatus: row.greenFlagStatus as BrowserLeadSyncRecord['greenFlagStatus'],
    ...(storedContact ? { storedContact } : {}),
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

function storedContactFromLeadRow(row: any): StoredLeadContactSnapshot {
  const data = row?.data && typeof row.data === 'object' ? row.data : {};
  return {
    nickname: String(row?.name || data.name || '').trim(),
    phone: String(row?.phone || data.phone || '').trim() || undefined,
    wechat: String(row?.wechat || data.wechat || '').trim() || undefined,
  };
}

export function createPrismaBrowserLeadSyncRepository(prisma: BrowserLeadSyncPrisma) {
  async function updateOrderRemark(
    id: string,
    operator: { id: string; name: string },
    status: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED',
    errorMessage?: string,
  ) {
    await prisma.browserLeadSync.updateMany({
      where: {
        id,
        status: 'SUCCEEDED',
        orderRemarkStatus: { not: 'SUCCEEDED' },
      },
      data: {
        orderRemarkStatus: status,
        remarkOperatorId: operator.id,
        remarkOperatorName: operator.name,
        orderRemarkError: status === 'FAILED'
          ? (errorMessage || '订单备注失败').slice(0, 1000)
          : null,
        ...(status === 'SUCCEEDED' ? { orderRemarkedAt: new Date() } : {}),
      },
    });
  }

  async function updateGreenFlag(
    id: string,
    operator: { id: string; name: string },
    status: 'NOT_ATTEMPTED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED',
    errorMessage?: string,
  ) {
    await prisma.browserLeadSync.updateMany({
      where: {
        id,
        status: 'SUCCEEDED',
        greenFlagStatus: { not: 'SUCCEEDED' },
      },
      data: {
        greenFlagStatus: status,
        remarkOperatorId: operator.id,
        remarkOperatorName: operator.name,
        greenFlagError: status === 'FAILED'
          ? (errorMessage || '绿色旗帜设置失败').slice(0, 1000)
          : null,
        ...(status === 'SUCCEEDED' ? { greenFlaggedAt: new Date() } : {}),
      },
    });
  }

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

      let createdLead = await prisma.leadRecord.findUnique({ where: { externalIntakeKey: existing.id } });
      if (!createdLead && existing.leadId) {
        createdLead = await prisma.leadRecord.findUnique({ where: { id: existing.leadId } });
      }
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
        return {
          acquired: false as const,
          record: record(reconciled, storedContactFromLeadRow(createdLead)),
        };
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
      storedContact: StoredLeadContactSnapshot;
    }) {
      const { storedContact, ...syncInput } = input;
      return record(await prisma.browserLeadSync.update({
        where: { id },
        data: { ...syncInput, status: 'SUCCEEDED', lastError: null, completedAt: new Date() },
      }), storedContact);
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
      await updateOrderRemark(id, operator, input.status, input.errorMessage);
      const current = await prisma.browserLeadSync.findUnique({ where: { id } });
      return current?.status === 'SUCCEEDED' ? record(current) : null;
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
      await updateOrderRemark(id, operator, input.orderRemarkStatus, input.errorMessage);
      await updateGreenFlag(id, operator, input.greenFlagStatus, input.errorMessage);
      const current = await prisma.browserLeadSync.findUnique({ where: { id } });
      return current?.status === 'SUCCEEDED' ? record(current) : null;
    },
  };
}

export type PrismaBrowserLeadSyncRepository = ReturnType<typeof createPrismaBrowserLeadSyncRepository>;
