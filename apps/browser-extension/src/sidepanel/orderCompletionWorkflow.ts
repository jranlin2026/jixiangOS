import type { FeigePageContext } from '../content/douyinFeigeAdapter';
import { isPaidOrderStatus } from '../domain/orderCompletion';
import { normalizePhoneForComparison } from '../../../../src/shared/utils/phoneNumber';
import type {
  ApiEnvelope,
  BrowserProductPreviewInput,
  BrowserProductPreviewResponse,
  BrowserRuntimeShop,
  CompleteOsOrderInput,
  CompleteOsOrderResult,
  LeadIntakeResponse,
} from '../shared/contracts';
import { hasRequiredOrderFacts } from '../shared/contracts';

export type OrderCompletionStage =
  | 'READY'
  | 'ABORTED'
  | 'INTAKING'
  | 'OS_FAILED'
  | 'OS_COMPLETED'
  | 'PLATFORM_COMPLETING'
  | 'PLATFORM_FAILED'
  | 'COMPLETED';

export type OsCompletionStatus = 'NOT_ATTEMPTED' | 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED';
export type PlatformCompletionStatus = LeadIntakeResponse['orderRemarkStatus'] | 'IN_PROGRESS';

export type PlatformCompletionReport = {
  syncId: string;
  orderRemarkStatus: LeadIntakeResponse['orderRemarkStatus'];
  greenFlagStatus: LeadIntakeResponse['greenFlagStatus'];
};

export type OrderCompletionState = {
  stage: OrderCompletionStage;
  osStatus: OsCompletionStatus;
  orderRemarkStatus: PlatformCompletionStatus;
  greenFlagStatus: PlatformCompletionStatus;
  intakeResult?: LeadIntakeResponse;
  remarkText?: string;
  message?: string;
  errorCode?: string;
};

export type OrderCompletionInput = {
  expectedOrderNo: string;
  expectedCustomerDisplayName: string;
  phone?: string;
  wechat?: string;
  intakeInput: Record<string, unknown>;
  existingIntake?: LeadIntakeResponse;
  shop?: BrowserRuntimeShop;
  pageShopDisplayName?: string;
  displayedPreview?: BrowserProductPreviewResponse;
};

type ReportInput = {
  syncId: string;
  orderRemarkStatus: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
  greenFlagStatus: LeadIntakeResponse['greenFlagStatus'];
  errorMessage?: string;
};

export type OrderCompletionDependencies = {
  isAttemptActive?(): boolean;
  readContext(): Promise<FeigePageContext>;
  preview(input: BrowserProductPreviewInput): Promise<ApiEnvelope<BrowserProductPreviewResponse>>;
  intake(input: Record<string, unknown>): Promise<ApiEnvelope<LeadIntakeResponse>>;
  completePage(input: CompleteOsOrderInput): Promise<CompleteOsOrderResult>;
  report(input: ReportInput): Promise<ApiEnvelope<PlatformCompletionReport>>;
  onState?(state: OrderCompletionState): void;
};

function emit(deps: OrderCompletionDependencies, state: OrderCompletionState) {
  deps.onState?.(state);
  return state;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function normalizedShopName(value: string) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}

function normalizedFactText(value: unknown) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function paymentTime(value: unknown) {
  const timestamp = new Date(String(value || '')).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function previewMatchesDisplayed(
  displayed: BrowserProductPreviewResponse | undefined,
  latest: BrowserProductPreviewResponse,
) {
  if (!displayed || displayed.shop.id !== latest.shop.id) return false;
  const displayedFacts = displayed.facts;
  const latestFacts = latest.facts;
  if (normalizedFactText(displayedFacts.platformProductId) !== normalizedFactText(latestFacts.platformProductId)
    || normalizedFactText(displayedFacts.platformSkuId) !== normalizedFactText(latestFacts.platformSkuId)
    || normalizedFactText(displayedFacts.platformProductName) !== normalizedFactText(latestFacts.platformProductName)
    || displayedFacts.paymentAmount !== latestFacts.paymentAmount
    || paymentTime(displayedFacts.paymentAt) !== paymentTime(latestFacts.paymentAt)) return false;
  return JSON.stringify(displayed.productResolution) === JSON.stringify(latest.productResolution)
    && JSON.stringify(displayed.priceDifference) === JSON.stringify(latest.priceDifference);
}

type ReadyFeigePageContext = FeigePageContext & {
  readyForIntake: true;
  productName: string;
  paymentAmount: number;
  paymentAt: string;
};

function latestIntakeInput(input: OrderCompletionInput, current: ReadyFeigePageContext) {
  const {
    pageShopDisplayName: _cachedPageShop,
    platformOrderNo: _cachedOrderNo,
    contactName: _cachedContactName,
    platformProductId: _cachedProductId,
    platformSkuId: _cachedSkuId,
    platformProductName: _cachedProductName,
    paymentAmount: _cachedPaymentAmount,
    paymentAt: _cachedPaymentAt,
    ...stableInput
  } = input.intakeInput;
  return {
    ...stableInput,
    ...(input.shop ? { shopBindingId: input.shop.id } : {}),
    pageShopDisplayName: String(current.shopDisplayName || '').trim(),
    platformOrderNo: current.platformOrderNo.trim(),
    contactName: current.customerDisplayName.trim(),
    platformProductId: current.platformProductId?.trim() || undefined,
    platformSkuId: current.platformSkuId?.trim() || undefined,
    platformProductName: current.productName.trim(),
    paymentAmount: current.paymentAmount,
    paymentAt: current.paymentAt.trim(),
  };
}

export function pageShopMatchesBinding(pageShopDisplayName: string | undefined, shop: BrowserRuntimeShop) {
  const pageName = normalizedShopName(pageShopDisplayName || '');
  if (!pageName) return true;
  return [shop.displayName, ...shop.aliases]
    .some((candidate) => normalizedShopName(candidate) === pageName);
}

function duplicateContactMismatch(
  input: OrderCompletionInput,
  intake: LeadIntakeResponse,
  shouldReconcileStoredContact = intake.outcome === 'ALREADY_CREATED',
) {
  if (!shouldReconcileStoredContact) return '';
  const snapshot = intake.storedContact;
  const nickname = input.expectedCustomerDisplayName.trim();
  const phone = input.phone?.trim() || '';
  const wechat = input.wechat?.trim() || '';
  const storedPhone = snapshot?.phone?.trim() || '';
  const storedWechat = snapshot?.wechat?.trim() || '';
  const chosenContactMatches = phone
    ? Boolean(storedPhone)
      && Boolean(normalizePhoneForComparison(phone))
      && normalizePhoneForComparison(storedPhone) === normalizePhoneForComparison(phone)
    : Boolean(wechat)
      && Boolean(storedWechat)
      && storedWechat.toLowerCase() === wechat.toLowerCase();
  if (snapshot?.nickname?.trim() === nickname && chosenContactMatches) return '';
  const contactLabel = phone ? '手机号' : '微信号';
  return `极享OS已有资料与本次提交不一致（抖音昵称或用于订单备注的${contactLabel}不一致），请先在极享OS核对并统一资料后重试；未操作飞鸽订单`;
}

function failedPageStatuses(stage: Extract<CompleteOsOrderResult, { ok: false }>['stage']): Pick<
  ReportInput,
  'orderRemarkStatus' | 'greenFlagStatus'
> {
  if (stage === 'GREEN_FLAG') {
    return { orderRemarkStatus: 'FAILED', greenFlagStatus: 'FAILED' };
  }
  if (stage === 'SAVE') {
    return { orderRemarkStatus: 'FAILED', greenFlagStatus: 'FAILED' };
  }
  return { orderRemarkStatus: 'FAILED', greenFlagStatus: 'NOT_ATTEMPTED' };
}

async function reportCompletion(deps: OrderCompletionDependencies, input: ReportInput) {
  try {
    return await deps.report(input);
  } catch (error) {
    return {
      code: 503,
      data: null,
      message: errorMessage(error, '平台完成结果上报失败'),
    } satisfies ApiEnvelope<PlatformCompletionReport>;
  }
}

export async function runOrderCompletion(
  input: OrderCompletionInput,
  deps: OrderCompletionDependencies,
): Promise<OrderCompletionState> {
  const initial: OrderCompletionState = {
    stage: 'READY',
    osStatus: input.existingIntake ? 'SUCCEEDED' : 'NOT_ATTEMPTED',
    orderRemarkStatus: input.existingIntake?.orderRemarkStatus || 'NOT_ATTEMPTED',
    greenFlagStatus: input.existingIntake?.greenFlagStatus || 'NOT_ATTEMPTED',
    intakeResult: input.existingIntake,
  };
  const isAttemptActive = deps.isAttemptActive || (() => true);
  const aborted = (): OrderCompletionState => ({ ...initial, stage: 'ABORTED', message: '操作已取消' });
  const guardedReport = async (reportInput: ReportInput) => {
    if (!isAttemptActive()) return null;
    const result = await reportCompletion(deps, reportInput);
    return isAttemptActive() ? result : null;
  };
  if (!isAttemptActive()) return aborted();
  emit(deps, initial);

  if (input.existingIntake) {
    const reconciliationMessage = duplicateContactMismatch(input, input.existingIntake, true);
    if (reconciliationMessage) {
      return emit(deps, {
        ...initial,
        stage: 'PLATFORM_FAILED',
        message: reconciliationMessage,
      });
    }
    if (input.existingIntake.orderRemarkStatus === 'SUCCEEDED'
      && input.existingIntake.greenFlagStatus === 'SUCCEEDED') {
      const osCompleted: OrderCompletionState = {
        ...initial,
        stage: 'OS_COMPLETED',
      };
      emit(deps, osCompleted);
      emit(deps, { ...osCompleted, stage: 'PLATFORM_COMPLETING' });
      const report = await guardedReport({
        syncId: input.existingIntake.syncId,
        orderRemarkStatus: 'SUCCEEDED',
        greenFlagStatus: 'SUCCEEDED',
      });
      if (!report) return aborted();
      if (report.code !== 0 || !report.data) {
        return emit(deps, {
          ...osCompleted,
          stage: 'PLATFORM_FAILED',
          message: report.message || '平台完成结果上报失败',
        });
      }
      return emit(deps, {
        ...osCompleted,
        stage: report.data.orderRemarkStatus === 'SUCCEEDED' && report.data.greenFlagStatus === 'SUCCEEDED'
          ? 'COMPLETED'
          : 'PLATFORM_FAILED',
        orderRemarkStatus: report.data.orderRemarkStatus,
        greenFlagStatus: report.data.greenFlagStatus,
      });
    }
  }

  const stopForContext = (message: string, errorCode?: string) => emit(deps, {
    ...initial,
    ...(input.existingIntake
      ? { stage: 'PLATFORM_FAILED' as const }
      : errorCode
        ? { stage: 'OS_FAILED' as const, osStatus: 'FAILED' as const }
        : {}),
    ...(errorCode ? { errorCode } : {}),
    message,
  });

  let current: FeigePageContext;
  if (!isAttemptActive()) return aborted();
  try {
    current = await deps.readContext();
  } catch (error) {
    if (!isAttemptActive()) return aborted();
    return stopForContext(errorMessage(error, '无法核对当前飞鸽客户和订单'));
  }
  if (!isAttemptActive()) return aborted();
  if (!current.supported
    || current.platformOrderNo.trim() !== input.expectedOrderNo.trim()
    || current.customerDisplayName.trim() !== input.expectedCustomerDisplayName.trim()) {
    return stopForContext('当前飞鸽客户或订单已切换，请刷新识别并重新确认客户资料');
  }
  if (!isPaidOrderStatus(current.orderStatus)) {
    return stopForContext('请先确认当前订单为已付款有效订单');
  }
  if (!hasRequiredOrderFacts(current)) {
    return stopForContext(
      '当前订单的平台商品名称、实付金额或付款时间未完整唯一识别，请等待订单加载完成后刷新识别',
      'ORDER_FACTS_UNAVAILABLE',
    );
  }
  if (input.shop && !current.shopDisplayName?.trim()) {
    return stopForContext(
      '当前页面店铺未识别或存在歧义，请刷新飞鸽页面并重新识别后重试',
      'SHOP_CONTEXT_UNAVAILABLE',
    );
  }
  if (input.shop && !pageShopMatchesBinding(current.shopDisplayName, input.shop)) {
    return stopForContext(
      '当前页面店铺与已选店铺绑定不一致，请切换店铺或刷新识别后重试',
      'SHOP_CONTEXT_MISMATCH',
    );
  }

  let latestPreview: BrowserProductPreviewResponse | undefined;
  if (input.shop) {
    if (!isAttemptActive()) return aborted();
    let preview: ApiEnvelope<BrowserProductPreviewResponse>;
    try {
      preview = await deps.preview({
        platform: 'DOUYIN',
        shopBindingId: input.shop.id,
        pageShopDisplayName: String(current.shopDisplayName || '').trim(),
        platformProductId: current.platformProductId?.trim() || undefined,
        platformSkuId: current.platformSkuId?.trim() || undefined,
        platformProductName: current.productName.trim(),
        paymentAmount: current.paymentAmount,
        paymentAt: current.paymentAt.trim(),
      });
    } catch (error) {
      if (!isAttemptActive()) return aborted();
      return stopForContext(errorMessage(error, '商品匹配预览失败'), 'PRODUCT_PREVIEW_FAILED');
    }
    if (!isAttemptActive()) return aborted();
    if (preview.code !== 0 || !preview.data) {
      return stopForContext(preview.message || '商品匹配预览失败', preview.errorCode || 'PRODUCT_PREVIEW_FAILED');
    }
    latestPreview = preview.data;
    if (!input.existingIntake && !previewMatchesDisplayed(input.displayedPreview, latestPreview)) {
      return stopForContext('订单信息已变化，请确认后重试', 'ORDER_FACTS_CHANGED');
    }
  }

  let intakeResult = input.existingIntake;
  if (!intakeResult) {
    if (!isAttemptActive()) return aborted();
    emit(deps, { ...initial, stage: 'INTAKING', osStatus: 'IN_PROGRESS' });
    let intake: ApiEnvelope<LeadIntakeResponse>;
    try {
      intake = await deps.intake(latestIntakeInput(input, current));
    } catch (error) {
      if (!isAttemptActive()) return aborted();
      return emit(deps, {
        ...initial,
        stage: 'OS_FAILED',
        osStatus: 'FAILED',
        message: errorMessage(error, '线索入库失败'),
      });
    }
    if (!isAttemptActive()) return aborted();
    if (intake.code !== 0 || !intake.data) {
      return emit(deps, {
        ...initial,
        stage: 'OS_FAILED',
        osStatus: 'FAILED',
        ...(intake.errorCode ? { errorCode: intake.errorCode } : {}),
        message: intake.message || '线索入库失败',
      });
    }
    intakeResult = intake.data;
  }

  const osCompleted: OrderCompletionState = {
    stage: 'OS_COMPLETED',
    osStatus: 'SUCCEEDED',
    orderRemarkStatus: intakeResult.orderRemarkStatus,
    greenFlagStatus: intakeResult.greenFlagStatus,
    intakeResult,
  };
  emit(deps, osCompleted);

  const reconciliationMessage = duplicateContactMismatch(input, intakeResult);
  if (reconciliationMessage) {
    const report = await guardedReport({
      syncId: intakeResult.syncId,
      orderRemarkStatus: 'FAILED',
      greenFlagStatus: 'NOT_ATTEMPTED',
      errorMessage: reconciliationMessage,
    });
    if (!report) return aborted();
    return emit(deps, {
      ...osCompleted,
      stage: 'PLATFORM_FAILED',
      orderRemarkStatus: report.data?.orderRemarkStatus || 'FAILED',
      greenFlagStatus: report.data?.greenFlagStatus || 'NOT_ATTEMPTED',
      message: report.code === 0
        ? reconciliationMessage
        : `${reconciliationMessage}；${report.message}`,
    });
  }

  const remarkText = intakeResult.remarkLines.join('\n');
  if (!isAttemptActive()) return aborted();
  emit(deps, {
    ...osCompleted,
    stage: 'PLATFORM_COMPLETING',
    orderRemarkStatus: 'IN_PROGRESS',
    greenFlagStatus: 'IN_PROGRESS',
    remarkText,
  });

  let pageResult: CompleteOsOrderResult;
  if (!isAttemptActive()) return aborted();
  try {
    pageResult = await deps.completePage({
      expectedOrderNo: input.expectedOrderNo,
      expectedCustomerDisplayName: input.expectedCustomerDisplayName,
      remarkLines: intakeResult.remarkLines,
    });
  } catch (error) {
    if (!isAttemptActive()) return aborted();
    const message = errorMessage(error, '订单备注和绿色旗帜处理失败');
    const report = await guardedReport({
      syncId: intakeResult.syncId,
      orderRemarkStatus: 'FAILED',
      greenFlagStatus: 'NOT_ATTEMPTED',
      errorMessage: message,
    });
    if (!report) return aborted();
    return emit(deps, {
      ...osCompleted,
      stage: 'PLATFORM_FAILED',
      orderRemarkStatus: report.data?.orderRemarkStatus || 'FAILED',
      greenFlagStatus: report.data?.greenFlagStatus || 'NOT_ATTEMPTED',
      remarkText,
      message: report.code === 0 ? message : `${message}；${report.message}`,
    });
  }
  if (!isAttemptActive()) return aborted();
  if (!pageResult.ok) {
    const failedStatuses = failedPageStatuses(pageResult.stage);
    const report = await guardedReport({
      syncId: intakeResult.syncId,
      ...failedStatuses,
      errorMessage: pageResult.message,
    });
    if (!report) return aborted();
    return emit(deps, {
      ...osCompleted,
      stage: 'PLATFORM_FAILED',
      orderRemarkStatus: report.data?.orderRemarkStatus || failedStatuses.orderRemarkStatus,
      greenFlagStatus: report.data?.greenFlagStatus || failedStatuses.greenFlagStatus,
      remarkText: pageResult.remarkText || remarkText,
      message: report.code === 0 ? pageResult.message : `${pageResult.message}；${report.message}`,
    });
  }

  const report = await guardedReport({
    syncId: intakeResult.syncId,
    orderRemarkStatus: pageResult.remarkStatus,
    greenFlagStatus: pageResult.greenFlagStatus,
  });
  if (!report) return aborted();
  if (report.code !== 0 || !report.data) {
    return emit(deps, {
      ...osCompleted,
      stage: 'PLATFORM_FAILED',
      orderRemarkStatus: pageResult.remarkStatus,
      greenFlagStatus: pageResult.greenFlagStatus,
      remarkText: pageResult.remarkText,
      message: report.message || '平台完成结果上报失败',
    });
  }
  return emit(deps, {
    ...osCompleted,
    stage: report.data.orderRemarkStatus === 'SUCCEEDED' && report.data.greenFlagStatus === 'SUCCEEDED'
      ? 'COMPLETED'
      : 'PLATFORM_FAILED',
    orderRemarkStatus: report.data.orderRemarkStatus,
    greenFlagStatus: report.data.greenFlagStatus,
    remarkText: pageResult.remarkText,
  });
}
