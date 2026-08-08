import type { FeigePageContext } from '../content/douyinFeigeAdapter';
import { isPaidOrderStatus } from '../domain/orderCompletion';
import { normalizePhoneForComparison } from '../../../../src/shared/utils/phoneNumber';
import type {
  ApiEnvelope,
  CompleteOsOrderInput,
  CompleteOsOrderResult,
  LeadIntakeResponse,
} from '../shared/contracts';

export type OrderCompletionStage =
  | 'READY'
  | 'INTAKING'
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
};

export type OrderCompletionInput = {
  expectedOrderNo: string;
  expectedCustomerDisplayName: string;
  phone?: string;
  wechat?: string;
  intakeInput: Record<string, unknown>;
  existingIntake?: LeadIntakeResponse;
};

type ReportInput = {
  syncId: string;
  orderRemarkStatus: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
  greenFlagStatus: LeadIntakeResponse['greenFlagStatus'];
  errorMessage?: string;
};

export type OrderCompletionDependencies = {
  readContext(): Promise<Pick<FeigePageContext, 'supported' | 'platformOrderNo' | 'customerDisplayName' | 'orderStatus'>>;
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
      const report = await reportCompletion(deps, {
        syncId: input.existingIntake.syncId,
        orderRemarkStatus: 'SUCCEEDED',
        greenFlagStatus: 'SUCCEEDED',
      });
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

  const stopForContext = async (message: string) => {
    if (!input.existingIntake) return emit(deps, { ...initial, message });
    const report = await reportCompletion(deps, {
      syncId: input.existingIntake.syncId,
      orderRemarkStatus: 'FAILED',
      greenFlagStatus: 'NOT_ATTEMPTED',
      errorMessage: message,
    });
    return emit(deps, {
      ...initial,
      stage: 'PLATFORM_FAILED',
      orderRemarkStatus: report.data?.orderRemarkStatus || input.existingIntake.orderRemarkStatus,
      greenFlagStatus: report.data?.greenFlagStatus || input.existingIntake.greenFlagStatus,
      message: report.code === 0 ? message : `${message}；${report.message}`,
    });
  };

  let current: Pick<FeigePageContext, 'supported' | 'platformOrderNo' | 'customerDisplayName' | 'orderStatus'>;
  try {
    current = await deps.readContext();
  } catch (error) {
    return stopForContext(errorMessage(error, '无法核对当前飞鸽客户和订单'));
  }
  if (!current.supported
    || current.platformOrderNo.trim() !== input.expectedOrderNo.trim()
    || current.customerDisplayName.trim() !== input.expectedCustomerDisplayName.trim()) {
    return stopForContext('当前飞鸽客户或订单已切换，请刷新识别并重新确认客户资料');
  }
  if (!isPaidOrderStatus(current.orderStatus)) {
    return stopForContext('请先确认当前订单为已付款有效订单');
  }

  let intakeResult = input.existingIntake;
  if (!intakeResult) {
    emit(deps, { ...initial, stage: 'INTAKING', osStatus: 'IN_PROGRESS' });
    let intake: ApiEnvelope<LeadIntakeResponse>;
    try {
      intake = await deps.intake(input.intakeInput);
    } catch (error) {
      return emit(deps, {
        ...initial,
        osStatus: 'FAILED',
        message: errorMessage(error, '线索入库失败'),
      });
    }
    if (intake.code !== 0 || !intake.data) {
      return emit(deps, {
        ...initial,
        osStatus: 'FAILED',
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
    const report = await reportCompletion(deps, {
      syncId: intakeResult.syncId,
      orderRemarkStatus: 'FAILED',
      greenFlagStatus: 'NOT_ATTEMPTED',
      errorMessage: reconciliationMessage,
    });
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
  emit(deps, {
    ...osCompleted,
    stage: 'PLATFORM_COMPLETING',
    orderRemarkStatus: 'IN_PROGRESS',
    greenFlagStatus: 'IN_PROGRESS',
    remarkText,
  });

  let pageResult: CompleteOsOrderResult;
  try {
    pageResult = await deps.completePage({
      expectedOrderNo: input.expectedOrderNo,
      expectedCustomerDisplayName: input.expectedCustomerDisplayName,
      remarkLines: intakeResult.remarkLines,
    });
  } catch (error) {
    const message = errorMessage(error, '订单备注和绿色旗帜处理失败');
    const report = await reportCompletion(deps, {
      syncId: intakeResult.syncId,
      orderRemarkStatus: 'FAILED',
      greenFlagStatus: 'NOT_ATTEMPTED',
      errorMessage: message,
    });
    return emit(deps, {
      ...osCompleted,
      stage: 'PLATFORM_FAILED',
      orderRemarkStatus: report.data?.orderRemarkStatus || 'FAILED',
      greenFlagStatus: report.data?.greenFlagStatus || 'NOT_ATTEMPTED',
      remarkText,
      message: report.code === 0 ? message : `${message}；${report.message}`,
    });
  }
  if (!pageResult.ok) {
    const failedStatuses = failedPageStatuses(pageResult.stage);
    const report = await reportCompletion(deps, {
      syncId: intakeResult.syncId,
      ...failedStatuses,
      errorMessage: pageResult.message,
    });
    return emit(deps, {
      ...osCompleted,
      stage: 'PLATFORM_FAILED',
      orderRemarkStatus: report.data?.orderRemarkStatus || failedStatuses.orderRemarkStatus,
      greenFlagStatus: report.data?.greenFlagStatus || failedStatuses.greenFlagStatus,
      remarkText: pageResult.remarkText || remarkText,
      message: report.code === 0 ? pageResult.message : `${pageResult.message}；${report.message}`,
    });
  }

  const report = await reportCompletion(deps, {
    syncId: intakeResult.syncId,
    orderRemarkStatus: pageResult.remarkStatus,
    greenFlagStatus: pageResult.greenFlagStatus,
  });
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
