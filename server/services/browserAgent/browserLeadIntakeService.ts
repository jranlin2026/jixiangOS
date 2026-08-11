import { failure, success, type ApiResponse } from '../../api/response';
import type { AuthenticatedUser } from '../../../src/types/auth';
import type { Lead } from '../../../src/types/lead';
import { normalizePhoneForComparison } from '../../../src/shared/utils/phoneNumber';
import {
  browserPaymentAmountInCents,
  browserPaymentAtDate,
  type BrowserCatalogErrorCode,
  type BrowserCatalogService,
} from './browserCatalogService';
import { buildBrowserOrderRemark } from './browserOrderRemark';

export type ExistingLeadState = 'ACTIVE' | 'RECYCLED' | 'MISSING';

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
  orderRemarkError?: string | null;
  greenFlagError?: string | null;
  orderRemarkedAt?: Date | null;
  greenFlaggedAt?: Date | null;
  attemptCount: number;
  attemptToken: string | null;
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
  }): Promise<{
    acquired: boolean;
    record: BrowserLeadSyncRecord;
    existingLeadState?: ExistingLeadState;
  }>;
  markSucceeded(id: string, attemptToken: string, input: {
    leadId: string;
    leadName: string;
    assignedTo?: string | null;
    assignedToId?: string | null;
    intakeStatus?: string | null;
    storedContact: StoredLeadContactSnapshot;
  }): Promise<BrowserLeadSyncRecord>;
  markFailed(id: string, attemptToken: string, errorMessage: string): Promise<BrowserLeadSyncRecord>;
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
  completedAt: string;
  remarkLines: [string, string];
  shop: {
    id: string;
    shopKey: string;
    displayName: string;
  };
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
  errorCode?: BrowserCatalogErrorCode | BrowserLeadIntakeErrorCode;
};

export type BrowserLeadIntakeErrorCode =
  | 'LEAD_IN_RECYCLE_BIN'
  | 'LEAD_SYNC_RECORD_ORPHANED'
  | 'ORDER_CONTACT_CONFLICT';

function intakeFailure(
  message: string,
  errorCode: BrowserLeadIntakeErrorCode,
): BrowserLeadIntakeResponse {
  return { code: 409, data: null, message, errorCode };
}

function normalizedContactSnapshot(input: { name?: unknown; phone?: unknown; wechat?: unknown }) {
  return {
    nickname: String(input.name || '').trim(),
    phone: String(input.phone || '').trim() || undefined,
    wechat: String(input.wechat || '').trim() || undefined,
  } satisfies StoredLeadContactSnapshot;
}

function contactConflictLabels(
  submitted: { contactName: string; contactPhone?: string; contactWechat?: string },
  stored?: StoredLeadContactSnapshot,
) {
  const labels: string[] = [];
  if (!stored || stored.nickname.trim() !== submitted.contactName.trim()) labels.push('昵称不一致');
  if (submitted.contactPhone) {
    const submittedPhone = normalizePhoneForComparison(submitted.contactPhone);
    const storedPhone = normalizePhoneForComparison(stored?.phone);
    if (!submittedPhone || !storedPhone || submittedPhone !== storedPhone) labels.push('手机号不一致');
  }
  if (submitted.contactWechat) {
    const submittedWechat = submitted.contactWechat.trim().toLocaleLowerCase('zh-CN');
    const storedWechat = stored?.wechat?.trim().toLocaleLowerCase('zh-CN') || '';
    if (!submittedWechat || !storedWechat || submittedWechat !== storedWechat) labels.push('微信号不一致');
  }
  return labels;
}

function strictContactConflictLabels(
  submitted: { contactName: string; contactPhone?: string; contactWechat?: string },
  stored?: StoredLeadContactSnapshot,
) {
  const labels: string[] = [];
  if (!stored || stored.nickname.trim() !== submitted.contactName.trim()) labels.push('昵称不一致');
  if (normalizePhoneForComparison(stored?.phone) !== normalizePhoneForComparison(submitted.contactPhone)) {
    labels.push('手机号不一致');
  }
  const submittedWechat = submitted.contactWechat?.trim().toLocaleLowerCase('zh-CN') || '';
  const storedWechat = stored?.wechat?.trim().toLocaleLowerCase('zh-CN') || '';
  if (storedWechat !== submittedWechat) labels.push('微信号不一致');
  return labels;
}

function resultFromRecord(record: BrowserLeadSyncRecord, outcome: BrowserLeadIntakeResult['outcome']) {
  if (!record.storedContact?.nickname
    || (!record.storedContact.phone && !record.storedContact.wechat)) {
    return failure<BrowserLeadIntakeResult>(
      '已入库线索的客户资料无法完整读取，请先在极享OS核对后重试',
      409,
    );
  }
  if (!record.completedAt || Number.isNaN(record.completedAt.getTime())) {
    return failure<BrowserLeadIntakeResult>(
      '已入库线索的首次成功时间无法读取，请先在极享OS核对后重试',
      409,
    );
  }
  if (!record.shopBindingId || !record.shopKey || !record.shopDisplayName) {
    return failure<BrowserLeadIntakeResult>(
      '已入库线索的店铺快照无法完整读取，请先在极享OS核对后重试',
      409,
    );
  }
  const completedAt = record.completedAt.toISOString();
  let remarkLines: [string, string];
  try {
    remarkLines = buildBrowserOrderRemark({
      ...record.storedContact,
      assignedTo: record.assignedTo,
      operatorName: record.operatorName,
      completedAt: record.completedAt,
    });
  } catch (error) {
    return failure<BrowserLeadIntakeResult>(
      error instanceof Error ? error.message : '已入库线索的订单备注资料无法安全读取，请先在极享OS核对后重试',
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
    completedAt,
    remarkLines,
    shop: {
      id: record.shopBindingId,
      shopKey: record.shopKey,
      displayName: record.shopDisplayName,
    },
    productResolution: productResolutionFromRecord(record),
    orderRemarkStatus: record.orderRemarkStatus,
    greenFlagStatus: record.greenFlagStatus,
  });
}

function resultAfterLeaseLoss(record: BrowserLeadSyncRecord) {
  if (record.status === 'SUCCEEDED' && record.leadId) {
    return resultFromRecord(record, 'ALREADY_CREATED');
  }
  return failure<BrowserLeadIntakeResult>(
    record.status === 'PENDING'
      ? '该订单已由新的入库任务接管，请勿重复操作'
      : '本次入库任务已失去执行权，请稍后重试',
    409,
  );
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
      const platformProductName = String(input.platformProductName || '').trim();
      const hasPaymentAmount = input.paymentAmount !== undefined && input.paymentAmount !== null;
      const paymentCents = hasPaymentAmount ? browserPaymentAmountInCents(input.paymentAmount) : null;
      if (hasPaymentAmount && paymentCents === null) {
        return failure<BrowserLeadIntakeResult>('实付金额必须为非负数且最多两位小数', 400);
      }
      const paymentAt = String(input.paymentAt || '').trim();
      const paymentAtDate = paymentAt ? browserPaymentAtDate(paymentAt) : null;
      if (paymentAt && !paymentAtDate) {
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
        platformProductName: platformProductName || undefined,
        paymentAmount: paymentCents !== null ? paymentCents / 100 : undefined,
        paymentAt: paymentAt || undefined,
      };
      const catalogResolution = await deps.catalog.resolveForIntake({
        platform: normalized.platform,
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
        ...(normalized.platformProductName ? { sourceProductName: normalized.platformProductName } : {}),
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
        if (reservation.existingLeadState === 'RECYCLED') {
          return intakeFailure(
            '该订单已录入极享OS，但原线索已在业务回收站。请先恢复原线索，或由管理员彻底清理该订单的同步记录后再重试；本次不会修改飞鸽订单。',
            'LEAD_IN_RECYCLE_BIN',
          );
        }
        if (reservation.existingLeadState === 'MISSING' && reservation.record.status === 'SUCCEEDED') {
          return intakeFailure(
            '该订单的历史同步状态正在重新校验，请稍后重试；本次不会修改飞鸽订单。',
            'LEAD_SYNC_RECORD_ORPHANED',
          );
        }
        if (reservation.record.status === 'SUCCEEDED' && reservation.record.leadId) {
          const existingResult = resultFromRecord(reservation.record, 'ALREADY_CREATED');
          if (existingResult.code !== 0) return existingResult;
          const differences = contactConflictLabels(normalized, reservation.record.storedContact);
          if (differences.length) {
            return intakeFailure(
              `该订单已录入极享OS，但本次提交资料存在冲突（${differences.join('、')}）。请先在极享OS核对并统一资料后重试；本次不会修改飞鸽订单。`,
              'ORDER_CONTACT_CONFLICT',
            );
          }
          return existingResult;
        }
        return failure<BrowserLeadIntakeResult>(
          reservation.record.status === 'PENDING' ? '该订单正在入库，请勿重复操作' : '该订单上次入库失败，请稍后重试',
          409,
        );
      }

      const reserved = reservation.record;
      const attemptToken = reserved.attemptToken;
      if (!attemptToken) {
        return failure<BrowserLeadIntakeResult>('入库任务租约缺失，请稍后重试', 500);
      }
      if (reservation.existingLeadState === 'MISSING' && reserved.storedContact) {
        const differences = strictContactConflictLabels(normalized, reserved.storedContact);
        if (differences.length) {
          const message = `该订单的原线索已不存在，但本次提交资料存在冲突（${differences.join('、')}）。请先核对当前飞鸽会话和订单后重试；本次不会修改飞鸽订单。`;
          const failedRecord = await deps.repository.markFailed(reserved.id, attemptToken, message);
          if (failedRecord.status !== 'FAILED' || failedRecord.attemptToken !== attemptToken) {
            return resultAfterLeaseLoss(failedRecord);
          }
          return intakeFailure(message, 'ORDER_CONTACT_CONFLICT');
        }
      }
      const reservedProduct = productResolutionFromRecord(reserved);
      const reservedPaymentAmount = paymentAmountFromRecord(reserved);
      const reservedPaymentAt = reserved.sourcePaymentAt?.toISOString();
      const reservedShopDisplayName = reserved.shopDisplayName || binding.displayName;
      const rawProductName = reserved.sourceProductName || '未识别';
      const leadInput = {
        externalIntakeKey: reserved.id,
        name: normalized.contactName,
        douyinNickname: normalized.contactName,
        phone: normalized.contactPhone || '',
        phones: normalized.contactPhone
          ? [{ number: normalized.contactPhone, isPrimary: true as const, label: '主手机号' as const }]
          : [],
        wechat: normalized.contactWechat,
        source: binding.source,
        sourceName: binding.sourceName,
        sourceType: binding.sourceType,
        sourcePlatformId: binding.businessPlatformId || binding.platform,
        sourcePlatformName: binding.businessPlatformName || '抖音',
        sourceShopId: binding.businessShopId || reserved.shopKey,
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
        const failedRecord = await deps.repository.markFailed(reservation.record.id, attemptToken, message);
        if (failedRecord.status !== 'FAILED' || failedRecord.attemptToken !== attemptToken) {
          return resultAfterLeaseLoss(failedRecord);
        }
        return failure<BrowserLeadIntakeResult>(message, 500);
      }
      if (created.code !== 0 || !created.data) {
        const message = created.message || '线索入库失败';
        const failedRecord = await deps.repository.markFailed(reservation.record.id, attemptToken, message);
        if (failedRecord.status !== 'FAILED' || failedRecord.attemptToken !== attemptToken) {
          return resultAfterLeaseLoss(failedRecord);
        }
        return failure<BrowserLeadIntakeResult>(message, created.code || 400);
      }
      const completed = await deps.repository.markSucceeded(reservation.record.id, attemptToken, {
        leadId: created.data.id,
        leadName: created.data.name,
        assignedTo: created.data.assignedTo,
        assignedToId: created.data.assignedToId,
        intakeStatus: created.data.intakeStatus,
        storedContact: normalizedContactSnapshot(created.data),
      });
      if (completed.status !== 'SUCCEEDED' || completed.attemptToken !== attemptToken) {
        return resultAfterLeaseLoss(completed);
      }
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
        }>('红色旗帜结果不正确', 400);
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
