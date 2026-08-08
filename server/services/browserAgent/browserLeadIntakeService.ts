import { failure, success, type ApiResponse } from '../../api/response';
import type { AuthenticatedUser } from '../../../src/types/auth';
import type { Lead } from '../../../src/types/lead';

export type BrowserLeadIntakeInput = {
  platform: 'DOUYIN';
  shopKey: string;
  platformOrderNo: string;
  contactName: string;
  contactSource: 'CHAT' | 'OFF_PLATFORM';
  contactPhone?: string;
  contactWechat?: string;
  sourceProductId?: string;
  sourceProductName?: string;
  sourcePaymentAmount?: number;
  sourcePaymentAt?: string;
};

export type BrowserLeadSyncRecord = {
  id: string;
  platform: string;
  shopKey: string;
  platformOrderNo: string;
  sourceProductName?: string | null;
  operatorId: string;
  operatorName: string;
  contactSource: 'CHAT' | 'OFF_PLATFORM';
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  orderRemarkStatus: 'NOT_ATTEMPTED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
  greenFlagStatus: 'NOT_ATTEMPTED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
  attemptCount: number;
  updatedAt?: Date;
  leadId?: string | null;
  leadName?: string | null;
  assignedTo?: string | null;
  assignedToId?: string | null;
  intakeStatus?: string | null;
  lastError?: string | null;
};

type BrowserLeadSyncRepository = {
  reserve(input: {
    platform: string;
    shopKey: string;
    platformOrderNo: string;
    sourceProductName?: string;
    operatorId: string;
    operatorName: string;
    contactSource: 'CHAT' | 'OFF_PLATFORM';
  }): Promise<{ acquired: boolean; record: BrowserLeadSyncRecord }>;
  markSucceeded(id: string, input: {
    leadId: string;
    leadName: string;
    assignedTo?: string | null;
    assignedToId?: string | null;
    intakeStatus?: string | null;
  }): Promise<BrowserLeadSyncRecord>;
  markFailed(id: string, errorMessage: string): Promise<BrowserLeadSyncRecord>;
  reportOrderRemark(
    id: string,
    operator: { id: string; name: string },
    input: { status: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED'; errorMessage?: string },
  ): Promise<BrowserLeadSyncRecord | null>;
  reportPlatformCompletion(
    id: string,
    operator: { id: string; name: string },
    input: {
      orderRemarkStatus: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
      greenFlagStatus: 'NOT_ATTEMPTED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
      errorMessage?: string;
    },
  ): Promise<BrowserLeadSyncRecord | null>;
};

type LeadCreator = (
  input: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'followUpRecords'>,
  actor: AuthenticatedUser,
) => Promise<ApiResponse<Lead | null>>;

export type BrowserLeadIntakeResult = {
  syncId: string;
  outcome: 'CREATED' | 'ALREADY_CREATED';
  lead: {
    id: string;
    name: string;
    assignedTo?: string | null;
    assignedToId?: string | null;
    intakeStatus?: string | null;
  };
  orderRemarkStatus: BrowserLeadSyncRecord['orderRemarkStatus'];
  greenFlagStatus: BrowserLeadSyncRecord['greenFlagStatus'];
};

function resultFromRecord(record: BrowserLeadSyncRecord, outcome: BrowserLeadIntakeResult['outcome']) {
  return success<BrowserLeadIntakeResult>({
    syncId: record.id,
    outcome,
    lead: {
      id: record.leadId || '',
      name: record.leadName || '',
      assignedTo: record.assignedTo,
      assignedToId: record.assignedToId,
      intakeStatus: record.intakeStatus,
    },
    orderRemarkStatus: record.orderRemarkStatus,
    greenFlagStatus: record.greenFlagStatus,
  });
}

export function createBrowserLeadIntakeService(deps: {
  repository: BrowserLeadSyncRepository;
  createLead: LeadCreator;
}) {
  return {
    async intake(input: BrowserLeadIntakeInput, actor: AuthenticatedUser) {
      if (input.platform !== 'DOUYIN') return failure<BrowserLeadIntakeResult>('当前仅支持抖音平台', 400);
      if (!String(input.shopKey || '').trim()) return failure<BrowserLeadIntakeResult>('店铺标识不能为空', 400);
      if (!String(input.platformOrderNo || '').trim()) return failure<BrowserLeadIntakeResult>('平台订单号不能为空', 400);
      if (!String(input.contactName || '').trim()) return failure<BrowserLeadIntakeResult>('客户姓名不能为空', 400);
      if (!['CHAT', 'OFF_PLATFORM'].includes(input.contactSource)) {
        return failure<BrowserLeadIntakeResult>('联系方式获取来源不正确', 400);
      }
      if (!String(input.contactPhone || '').trim() && !String(input.contactWechat || '').trim()) {
        return failure<BrowserLeadIntakeResult>('手机号或微信至少填写一项', 400);
      }
      const normalized = {
        ...input,
        shopKey: input.shopKey.trim(),
        platformOrderNo: input.platformOrderNo.trim(),
        contactName: input.contactName.trim(),
        contactPhone: input.contactPhone?.trim() || undefined,
        contactWechat: input.contactWechat?.trim() || undefined,
        sourceProductId: input.sourceProductId?.trim() || undefined,
        sourceProductName: input.sourceProductName?.trim() || undefined,
      };
      const reservation = await deps.repository.reserve({
        platform: normalized.platform,
        shopKey: normalized.shopKey,
        platformOrderNo: normalized.platformOrderNo,
        sourceProductName: normalized.sourceProductName,
        operatorId: actor.id,
        operatorName: actor.name,
        contactSource: input.contactSource,
      });
      if (!reservation.acquired) {
        if (reservation.record.status === 'SUCCEEDED' && reservation.record.leadId) {
          return resultFromRecord(reservation.record, 'ALREADY_CREATED');
        }
        return failure<BrowserLeadIntakeResult>(
          reservation.record.status === 'PENDING' ? '该订单正在入库，请勿重复操作' : '该订单上次入库失败，请稍后重试',
          409,
        );
      }

      const leadInput = {
        externalIntakeKey: reservation.record.id,
        name: normalized.contactName,
        phone: normalized.contactPhone || '',
        phones: normalized.contactPhone
          ? [{ number: normalized.contactPhone, isPrimary: true as const, label: '主手机号' as const }]
          : [],
        wechat: normalized.contactWechat,
        source: '抖音电商',
        sourceName: '飞鸽客服',
        sourceType: '公司资源' as const,
        sourcePlatformId: input.platform,
        sourcePlatformName: '抖音',
        sourceShopId: normalized.shopKey,
        platformOrderNo: normalized.platformOrderNo,
        ...(normalized.sourceProductId && normalized.sourceProductName
          ? { sourceProductId: normalized.sourceProductId, sourceProductName: normalized.sourceProductName }
          : {}),
        ...(input.sourcePaymentAmount !== undefined ? { sourcePaymentAmount: input.sourcePaymentAmount } : {}),
        ...(input.sourcePaymentAt ? { sourcePaymentAt: input.sourcePaymentAt } : {}),
        remark: `由极享AI浏览器员工从飞鸽客服录入${normalized.sourceProductName ? `；平台商品：${normalized.sourceProductName}` : ''}`,
        status: '新线索',
      } as Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'followUpRecords'>;

      let created: ApiResponse<Lead | null>;
      try {
        created = await deps.createLead(leadInput, actor);
      } catch (error) {
        const message = error instanceof Error ? error.message : '线索入库异常';
        await deps.repository.markFailed(reservation.record.id, message);
        return failure<BrowserLeadIntakeResult>(message, 500);
      }
      if (created.code !== 0 || !created.data) {
        const message = created.message || '线索入库失败';
        await deps.repository.markFailed(reservation.record.id, message);
        return failure<BrowserLeadIntakeResult>(message, created.code || 400);
      }
      const completed = await deps.repository.markSucceeded(reservation.record.id, {
        leadId: created.data.id,
        leadName: created.data.name,
        assignedTo: created.data.assignedTo,
        assignedToId: created.data.assignedToId,
        intakeStatus: created.data.intakeStatus,
      });
      return resultFromRecord(completed, 'CREATED');
    },

    async reportOrderRemark(
      syncId: string,
      input: { status: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED'; errorMessage?: string },
      actor: AuthenticatedUser,
    ) {
      if (!['SUBMITTED', 'SUCCEEDED', 'FAILED'].includes(input.status)) {
        return failure<{ syncId: string; orderRemarkStatus: BrowserLeadSyncRecord['orderRemarkStatus'] }>(
          '订单备注结果不正确',
          400,
        );
      }
      const updated = await deps.repository.reportOrderRemark(syncId, { id: actor.id, name: actor.name }, input);
      if (!updated) {
        return failure<{ syncId: string; orderRemarkStatus: BrowserLeadSyncRecord['orderRemarkStatus'] }>(
          '同步记录不存在或无权操作',
          404,
        );
      }
      return success({ syncId: updated.id, orderRemarkStatus: updated.orderRemarkStatus });
    },

    async reportPlatformCompletion(
      syncId: string,
      input: {
        orderRemarkStatus: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
        greenFlagStatus: 'NOT_ATTEMPTED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
        errorMessage?: string;
      },
      actor: AuthenticatedUser,
    ) {
      if (!['SUBMITTED', 'SUCCEEDED', 'FAILED'].includes(input.orderRemarkStatus)) {
        return failure<{
          syncId: string;
          orderRemarkStatus: BrowserLeadSyncRecord['orderRemarkStatus'];
          greenFlagStatus: BrowserLeadSyncRecord['greenFlagStatus'];
        }>('订单备注结果不正确', 400);
      }
      if (!['NOT_ATTEMPTED', 'SUBMITTED', 'SUCCEEDED', 'FAILED'].includes(input.greenFlagStatus)) {
        return failure<{
          syncId: string;
          orderRemarkStatus: BrowserLeadSyncRecord['orderRemarkStatus'];
          greenFlagStatus: BrowserLeadSyncRecord['greenFlagStatus'];
        }>('绿色旗帜结果不正确', 400);
      }
      const updated = await deps.repository.reportPlatformCompletion(
        syncId,
        { id: actor.id, name: actor.name },
        input,
      );
      if (!updated) {
        return failure<{
          syncId: string;
          orderRemarkStatus: BrowserLeadSyncRecord['orderRemarkStatus'];
          greenFlagStatus: BrowserLeadSyncRecord['greenFlagStatus'];
        }>('同步记录不存在或无权操作', 404);
      }
      return success({
        syncId: updated.id,
        orderRemarkStatus: updated.orderRemarkStatus,
        greenFlagStatus: updated.greenFlagStatus,
      });
    },
  };
}

export type BrowserLeadIntakeService = ReturnType<typeof createBrowserLeadIntakeService>;
