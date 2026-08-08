import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type {
  BrowserLeadSyncRecord,
  StoredLeadContactSnapshot,
} from './browserLeadIntakeService';

type BrowserLeadSyncPrisma = Pick<PrismaClient, 'browserLeadSync' | 'leadRecord' | '$transaction'>;

const PENDING_LEASE_MS = 10 * 60 * 1000;

function auditDecimal(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number') return value.toString();
  if (typeof value === 'object' && typeof (value as { toString?: unknown }).toString === 'function') {
    return (value as { toString(): string }).toString();
  }
  throw new Error('浏览器线索同步付款金额格式无效');
}

function record(row: any, storedContact?: StoredLeadContactSnapshot): BrowserLeadSyncRecord {
  const { sourcePaymentAmount, ...rest } = row;
  const contact = storedContact || storedContactFromSyncRow(row);
  return {
    ...rest,
    ...(sourcePaymentAmount === undefined ? {} : { sourcePaymentAmount: auditDecimal(sourcePaymentAmount) }),
    status: row.status as BrowserLeadSyncRecord['status'],
    orderRemarkStatus: row.orderRemarkStatus as BrowserLeadSyncRecord['orderRemarkStatus'],
    greenFlagStatus: row.greenFlagStatus as BrowserLeadSyncRecord['greenFlagStatus'],
    ...(contact ? { storedContact: contact } : {}),
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

function storedContactFromSyncRow(row: any): StoredLeadContactSnapshot | undefined {
  const contact = {
    nickname: String(row?.contactNickname || '').trim(),
    phone: String(row?.contactPhone || '').trim() || undefined,
    wechat: String(row?.contactWechat || '').trim() || undefined,
  };
  return contact.nickname && (contact.phone || contact.wechat) ? contact : undefined;
}

function storedContactData(storedContact: StoredLeadContactSnapshot) {
  return {
    contactNickname: storedContact.nickname.trim(),
    contactPhone: storedContact.phone?.trim() || null,
    contactWechat: storedContact.wechat?.trim() || null,
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
      shopBindingId?: string;
      shopDisplayName?: string;
      platformProductId?: string;
      platformSkuId?: string;
      sourceProductName?: string;
      matchedProductId?: string;
      matchedProductName?: string;
      productMatchMethod?: string;
      sourcePaymentAmount?: string | number;
      sourcePaymentAt?: Date;
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

      const persistedContact = storedContactFromSyncRow(existing);
      if (existing.status === 'SUCCEEDED' && persistedContact) {
        return { acquired: false as const, record: record(existing, persistedContact) };
      }

      let createdLead = await prisma.leadRecord.findUnique({ where: { externalIntakeKey: existing.id } });
      if (!createdLead && existing.leadId) {
        createdLead = await prisma.leadRecord.findUnique({ where: { id: existing.leadId } });
      }
      if (createdLead) {
        const leadSnapshot = storedContactFromLeadRow(createdLead);
        if (existing.status === 'SUCCEEDED') {
          await prisma.browserLeadSync.updateMany({
            where: {
              id: existing.id,
              contactNickname: null,
              contactPhone: null,
              contactWechat: null,
            },
            data: storedContactData(leadSnapshot),
          });
          const reconciled = await prisma.browserLeadSync.findUnique({ where: { id: existing.id } });
          if (!reconciled) throw new Error('浏览器线索同步联系人快照回填后未找到');
          return {
            acquired: false as const,
            record: record(reconciled),
          };
        }
        const lead = leadFromRow(createdLead);
        const reconciled = await prisma.$transaction(async (transaction) => {
          await transaction.browserLeadSync.updateMany({
            where: { id: existing.id, completedAt: null },
            data: {
              completedAt: new Date(),
              ...storedContactData(leadSnapshot),
              assignedTo: String(lead.assignedTo || '').trim() || null,
              assignedToId: lead.assignedToId,
            },
          });
          await transaction.browserLeadSync.updateMany({
            where: { id: existing.id, contactNickname: null },
            data: storedContactData(leadSnapshot),
          });
          return transaction.browserLeadSync.update({
            where: { id: existing.id },
            data: {
              leadId: lead.leadId,
              leadName: lead.leadName,
              intakeStatus: lead.intakeStatus,
              status: 'SUCCEEDED',
              lastError: null,
            },
          });
        });
        return {
          acquired: false as const,
          record: record(reconciled),
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
          platform: input.platform,
          shopKey: input.shopKey,
          platformOrderNo: input.platformOrderNo,
          shopBindingId: input.shopBindingId ?? null,
          shopDisplayName: input.shopDisplayName ?? null,
          platformProductId: input.platformProductId ?? null,
          platformSkuId: input.platformSkuId ?? null,
          sourceProductName: input.sourceProductName ?? null,
          matchedProductId: input.matchedProductId ?? null,
          matchedProductName: input.matchedProductName ?? null,
          productMatchMethod: input.productMatchMethod ?? null,
          sourcePaymentAmount: input.sourcePaymentAmount ?? null,
          sourcePaymentAt: input.sourcePaymentAt ?? null,
          operatorId: input.operatorId,
          operatorName: input.operatorName,
          contactSource: input.contactSource,
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
      const {
        storedContact,
        assignedTo,
        assignedToId,
        ...syncInput
      } = input;
      const current = await prisma.$transaction(async (transaction) => {
        await transaction.browserLeadSync.updateMany({
          where: { id, completedAt: null },
          data: {
            completedAt: new Date(),
            ...storedContactData(storedContact),
            assignedTo: assignedTo?.trim() || null,
            assignedToId: assignedToId || null,
          },
        });
        await transaction.browserLeadSync.updateMany({
          where: { id, contactNickname: null },
          data: storedContactData(storedContact),
        });
        return transaction.browserLeadSync.update({
          where: { id },
          data: { ...syncInput, status: 'SUCCEEDED', lastError: null },
        });
      });
      return record(current);
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
