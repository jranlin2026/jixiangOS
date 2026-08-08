import type { FeigePageContext } from '../content/douyinFeigeAdapter';
import { buildOsRemarkLines } from '../domain/orderCompletion';
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

export type OrderCompletionInput = CompleteOsOrderInput & {
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
  readContext(): Promise<Pick<FeigePageContext, 'supported' | 'platformOrderNo' | 'customerDisplayName'>>;
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

  let current: Pick<FeigePageContext, 'supported' | 'platformOrderNo' | 'customerDisplayName'>;
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

  let remarkText = '';
  try {
    remarkText = buildOsRemarkLines({
      nickname: input.expectedCustomerDisplayName,
      phone: input.phone,
      wechat: input.wechat,
    }).join('\n');
  } catch (error) {
    const message = errorMessage(error, '订单备注内容无效');
    await reportCompletion(deps, {
      syncId: intakeResult.syncId,
      orderRemarkStatus: 'FAILED',
      greenFlagStatus: 'NOT_ATTEMPTED',
      errorMessage: message,
    });
    return emit(deps, {
      ...osCompleted,
      stage: 'PLATFORM_FAILED',
      orderRemarkStatus: 'FAILED',
      greenFlagStatus: 'NOT_ATTEMPTED',
      message,
    });
  }
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
      phone: input.phone,
      wechat: input.wechat,
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
    const report = await reportCompletion(deps, {
      syncId: intakeResult.syncId,
      orderRemarkStatus: 'FAILED',
      greenFlagStatus: 'NOT_ATTEMPTED',
      errorMessage: pageResult.message,
    });
    return emit(deps, {
      ...osCompleted,
      stage: 'PLATFORM_FAILED',
      orderRemarkStatus: report.data?.orderRemarkStatus || 'FAILED',
      greenFlagStatus: report.data?.greenFlagStatus || 'NOT_ATTEMPTED',
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
