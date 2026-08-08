import { failure, success, type ApiResponse } from '../../api/response';
import type { AuthenticatedUser } from '../../../src/types/auth';
import type { Lead } from '../../../src/types/lead';
import type { BrowserCatalogErrorCode, BrowserCatalogService } from './browserCatalogService';

export type BrowserLeadIntakeInput = {
  platform: 'DOUYIN';
  shopBindingId: string;
  pageShopDisplayName?: string;
  platformOrderNo: string;
  contactName: string;
  contactSource: 'CHAT' | 'OFF_PLATFORM';
  contactPhone?: string;
  contactWechat?: string;
  platformProductId?: string;
  platformSkuId?: string;
  platformProductName?: string;
  paymentAmount?: number;
  paymentAt?: string;
};

export type BrowserLeadSyncRecord = {
  id: string;
  platform: string;
  shopKey: string;
  platformOrderNo: string;
  shopBindingId?: string | null;
  shopDisplayName?: string | null;
  platformProductId?: string | null;
  platformSkuId?: string | null;
  sourceProductName?: string | null;
  matchedProductId?: string | null;
  matchedProductName?: string | null;
  productMatchMethod?: string | null;
  sourcePaymentAmount?: string | null;
  sourcePaymentAt?: Date | null;
  operatorId: string;
  operatorName: string;
  contactSource: 'CHAT' | 'OFF_PLATFORM';
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  orderRemarkStatus: 'NOT_ATTEMPTED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
  greenFlagStatus: 'NOT_ATTEMPTED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
  attemptCount: number;
  completedAt?: Date | null;
  updatedAt?: Date;
  leadId?: string | null;
  leadName?: string | null;
  assignedTo?: string | null;
  assignedToId?: string | null;
  intakeStatus?: string | null;
  lastError?: string | null;
  storedContact?: StoredLeadContactSnapshot;
};

export type StoredLeadContactSnapshot = {
  nickname: string;
  phone?: string;
  wechat?: string;
};

type BrowserLeadSyncRepository = {
  reserve(input: {
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
  }): Promise<{ acquired: boolean; record: BrowserLeadSyncRecord }>;
  markSucceeded(id: string, input: {
    leadId: string;
    leadName: string;
    assignedTo?: string | null;
    assignedToId?: string | null;
    intakeStatus?: string | null;
    storedContact: StoredLeadContactSnapshot;
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
  storedContact: StoredLeadContactSnapshot;
  productResolution: BrowserLeadProductResolutionAudit;
  orderRemarkStatus: BrowserLeadSyncRecord['orderRemarkStatus'];
  greenFlagStatus: BrowserLeadSyncRecord['greenFlagStatus'];
};

export type BrowserLeadProductResolutionAudit = {
  status: 'MATCHED';
  method?: string;
  osProductId?: string;
  osProductName?: string;
  rawProductName?: string;
} | {
  status: 'UNMATCHED';
  rawProductName: string;
};

export type BrowserLeadIntakeResponse = ApiResponse<BrowserLeadIntakeResult | null> & {
  errorCode?: BrowserCatalogErrorCode;
};

function normalizedContactSnapshot(input: { name?: unknown; phone?: unknown; wechat?: unknown }) {
  return {
    nickname: String(input.name || '').trim(),
    phone: String(input.phone || '').trim() || undefined,
    wechat: String(input.wechat || '').trim() || undefined,
  } satisfies StoredLeadContactSnapshot;
}

function resultFromRecord(record: BrowserLeadSyncRecord, outcome: BrowserLeadIntakeResult['outcome']) {
  if (!record.storedContact?.nickname
    || (!record.storedContact.phone && !record.storedContact.wechat)) {
    return failure<BrowserLeadIntakeResult>(
      '已入库线索的客户资料无法完整读取，请先在极享OS核对后重试',
      409,
    );
  }
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
    storedContact: record.storedContact,
    productResolution: productResolutionFromRecord(record),
    orderRemarkStatus: record.orderRemarkStatus,
    greenFlagStatus: record.greenFlagStatus,
  });
}

function productResolutionFromRecord(record: BrowserLeadSyncRecord): BrowserLeadProductResolutionAudit {
  if (record.matchedProductId || record.matchedProductName) {
    return {
      status: 'MATCHED',
      ...(record.productMatchMethod ? { method: record.productMatchMethod } : {}),
      ...(record.matchedProductId ? { osProductId: record.matchedProductId } : {}),
      ...(record.matchedProductName ? { osProductName: record.matchedProductName } : {}),
      ...(record.sourceProductName ? { rawProductName: record.sourceProductName } : {}),
    };
  }
  return { status: 'UNMATCHED', rawProductName: record.sourceProductName || '' };
}

function paymentAmountFromRecord(record: BrowserLeadSyncRecord) {
  if (record.sourcePaymentAmount === null || record.sourcePaymentAmount === undefined) return undefined;
  const amount = Number(record.sourcePaymentAmount);
  if (!Number.isFinite(amount)) throw new Error('浏览器线索同步实付快照格式无效');
  return amount;
}

export function createBrowserLeadIntakeService(deps: {
  repository: BrowserLeadSyncRepository;
  catalog: Pick<BrowserCatalogService, 'resolveForIntake'>;
  createLead: LeadCreator;
}) {
  return {
    async intake(input: BrowserLeadIntakeInput, actor: AuthenticatedUser): Promise<BrowserLeadIntakeResponse> {
      if (input.platform !== 'DOUYIN') return failure<BrowserLeadIntakeResult>('当前仅支持抖音平台', 400);
      if (!String(input.shopBindingId || '').trim()) return failure<BrowserLeadIntakeResult>('店铺绑定不能为空', 400);
      if (!String(input.platformOrderNo || '').trim()) return failure<BrowserLeadIntakeResult>('平台订单号不能为空', 400);
      if (!String(input.contactName || '').trim()) return failure<BrowserLeadIntakeResult>('客户姓名不能为空', 400);
      if (!['CHAT', 'OFF_PLATFORM'].includes(input.contactSource)) {
        return failure<BrowserLeadIntakeResult>('联系方式获取来源不正确', 400);
      }
      if (!String(input.contactPhone || '').trim() && !String(input.contactWechat || '').trim()) {
        return failure<BrowserLeadIntakeResult>('手机号或微信至少填写一项', 400);
      }
      if (input.paymentAmount !== undefined
        && (typeof input.paymentAmount !== 'number' || !Number.isFinite(input.paymentAmount))) {
        return failure<BrowserLeadIntakeResult>('实付金额格式不正确', 400);
      }
      const paymentAt = String(input.paymentAt || '').trim() || undefined;
      const paymentAtDate = paymentAt ? new Date(paymentAt) : undefined;
      if (paymentAtDate && Number.isNaN(paymentAtDate.getTime())) {
        return failure<BrowserLeadIntakeResult>('付款时间格式不正确', 400);
      }
      const normalized = {
        ...input,
        shopBindingId: input.shopBindingId.trim(),
        pageShopDisplayName: input.pageShopDisplayName?.trim() || undefined,
        platformOrderNo: input.platformOrderNo.trim(),
        contactName: input.contactName.trim(),
        contactPhone: input.contactPhone?.trim() || undefined,
        contactWechat: input.contactWechat?.trim() || undefined,
        platformProductId: input.platformProductId?.trim() || undefined,
        platformSkuId: input.platformSkuId?.trim() || undefined,
        platformProductName: input.platformProductName?.trim() || undefined,
        paymentAt,
      };
      const catalogResolution = await deps.catalog.resolveForIntake({
        shopBindingId: normalized.shopBindingId,
        pageShopDisplayName: normalized.pageShopDisplayName,
        facts: {
          platformProductId: normalized.platformProductId,
          platformSkuId: normalized.platformSkuId,
          platformProductName: normalized.platformProductName,
          paymentAmount: normalized.paymentAmount,
        },
      });
      if (catalogResolution.code !== 0 || !catalogResolution.data) {
        return {
          code: catalogResolution.code || 500,
          data: null,
          message: catalogResolution.message || '店铺与商品配置解析失败',
          ...(catalogResolution.errorCode ? { errorCode: catalogResolution.errorCode } : {}),
        };
      }
      const { binding, resolution } = catalogResolution.data;
      const reservation = await deps.repository.reserve({
        platform: normalized.platform,
        shopKey: binding.shopKey,
        platformOrderNo: normalized.platformOrderNo,
        shopBindingId: binding.id,
        shopDisplayName: binding.displayName,
        platformProductId: normalized.platformProductId,
        platformSkuId: normalized.platformSkuId,
        sourceProductName: normalized.platformProductName,
        ...(resolution.status === 'MATCHED' ? {
          matchedProductId: resolution.osProductId,
          matchedProductName: resolution.osProductName,
          productMatchMethod: resolution.method,
        } : {}),
        ...(normalized.paymentAmount !== undefined ? { sourcePaymentAmount: normalized.paymentAmount } : {}),
        ...(paymentAtDate ? { sourcePaymentAt: paymentAtDate } : {}),
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

      const reserved = reservation.record;
      const reservedProduct = productResolutionFromRecord(reserved);
      const reservedPaymentAmount = paymentAmountFromRecord(reserved);
      const reservedPaymentAt = reserved.sourcePaymentAt?.toISOString();
      const reservedShopDisplayName = reserved.shopDisplayName || binding.displayName;
      const rawProductName = reserved.sourceProductName || '未识别';
      const leadInput = {
        externalIntakeKey: reserved.id,
        name: normalized.contactName,
        phone: normalized.contactPhone || '',
        phones: normalized.contactPhone
          ? [{ number: normalized.contactPhone, isPrimary: true as const, label: '主手机号' as const }]
          : [],
        wechat: normalized.contactWechat,
        source: binding.source,
        sourceName: binding.sourceName,
        sourceType: binding.sourceType,
        sourcePlatformId: 'DOUYIN',
        sourcePlatformName: '抖音',
        sourceShopId: reserved.shopKey,
        sourceShopName: reservedShopDisplayName,
        platformOrderNo: reserved.platformOrderNo,
        ...(reservedProduct.status === 'MATCHED' && reservedProduct.osProductId && reservedProduct.osProductName ? {
          sourceProductId: reservedProduct.osProductId,
          sourceProductName: reservedProduct.osProductName,
        } : {}),
        ...(reservedPaymentAmount !== undefined ? { sourcePaymentAmount: reservedPaymentAmount } : {}),
        ...(reservedPaymentAt ? { sourcePaymentAt: reservedPaymentAt } : {}),
        remark: reservedProduct.status === 'MATCHED' && reservedProduct.osProductName
          ? `由极享AI浏览器员工从飞鸽客服录入；店铺：${reservedShopDisplayName}；平台商品：${rawProductName}；匹配OS产品：${reservedProduct.osProductName}`
          : `由极享AI浏览器员工从飞鸽客服录入；店铺：${reservedShopDisplayName}；平台商品待匹配：${rawProductName}`,
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
        storedContact: normalizedContactSnapshot(created.data),
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
