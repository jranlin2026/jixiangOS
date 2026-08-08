import type { FeigePageContext } from '../content/douyinFeigeAdapter';
import type { DetectedContact } from '../domain/contactDetection';
import type {
  BrowserLeadProductResolutionAudit,
  BrowserRuntimeConfig,
  LeadIntakeResponse,
} from '../shared/contracts';
import type { OrderCompletionState } from './orderCompletionWorkflow';

export type ContactForm = {
  name: string;
  phone: string;
  wechat: string;
  source: 'CHAT' | 'OFF_PLATFORM';
};

export type CompletionPanelState = {
  runtimeConfig: BrowserRuntimeConfig | null;
  shopBindingId: string;
  context: FeigePageContext | null;
  form: ContactForm;
  contactConfirmed: boolean;
  sync: LeadIntakeResponse | null;
  completion: OrderCompletionState | null;
  remarkText: string;
  activeAttempt: { id: number; conversationKey: string } | null;
};

type RecognizedContact = Pick<DetectedContact, 'phone' | 'wechat'> | null;

export type CompletionPanelAction =
  | { type: 'APPLY_RUNTIME_CONFIG'; runtimeConfig: BrowserRuntimeConfig; selectedShopBindingId: string }
  | { type: 'SELECT_SHOP_BINDING'; shopBindingId: string }
  | { type: 'RECOGNIZE_CONTEXT'; context: FeigePageContext; detectedContact: RecognizedContact }
  | {
      type: 'RECOGNIZE_ATTEMPT_CONTEXT';
      attemptId: number;
      conversationKey: string;
      context: FeigePageContext;
      detectedContact: RecognizedContact;
    }
  | { type: 'START_ATTEMPT'; attemptId: number; conversationKey: string }
  | { type: 'SET_FORM_FIELD'; field: 'phone' | 'wechat' | 'source'; value: string }
  | { type: 'SET_CONTACT_CONFIRMED'; value: boolean }
  | {
      type: 'APPLY_COMPLETION';
      attemptId: number;
      conversationKey: string;
      completion: OrderCompletionState;
    }
  | { type: 'CLEAR_CONTEXT' }
  | { type: 'RESET' };

const emptyForm: ContactForm = { name: '', phone: '', wechat: '', source: 'CHAT' };

export function createCompletionPanelState(): CompletionPanelState {
  return {
    runtimeConfig: null,
    shopBindingId: '',
    context: null,
    form: { ...emptyForm },
    contactConfirmed: false,
    sync: null,
    completion: null,
    remarkText: '',
    activeAttempt: null,
  };
}

export function conversationKey(context: Pick<FeigePageContext, 'platformOrderNo' | 'customerDisplayName'>) {
  return JSON.stringify([context.platformOrderNo.trim(), context.customerDisplayName.trim()]);
}

export function isCompletionFormLocked(state: CompletionPanelState) {
  return Boolean(state.sync);
}

export function completionAttemptSnapshot(state: CompletionPanelState) {
  if (!state.context || !state.shopBindingId) return null;
  return {
    expectedOrderNo: state.context.platformOrderNo,
    expectedCustomerDisplayName: state.context.customerDisplayName,
    shopBindingId: state.shopBindingId,
    phone: state.form.phone.trim() || undefined,
    wechat: state.form.wechat.trim() || undefined,
    source: state.form.source,
    existingIntake: state.sync || undefined,
  };
}

function normalized(value: string) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}

export type BrowserProductPreview = BrowserLeadProductResolutionAudit | {
  status: 'CONFIG_CONFLICT';
  message: string;
};

function runtimeProductPreview(state: CompletionPanelState): BrowserProductPreview | null {
  const context = state.context;
  const runtime = state.runtimeConfig;
  if (!context || !runtime || !state.shopBindingId || runtime.productMappings === undefined) return null;
  const mappings = runtime.productMappings.filter((mapping) => (
    mapping.active && mapping.shopBindingId === state.shopBindingId
  ));
  const priorities: Array<{ method: string; matches: typeof mappings }> = [
    {
      method: 'PLATFORM_PRODUCT_ID',
      matches: context.platformProductId
        ? mappings.filter((mapping) => mapping.platformProductId === context.platformProductId)
        : [],
    },
    {
      method: 'PLATFORM_SKU_ID',
      matches: context.platformSkuId
        ? mappings.filter((mapping) => mapping.platformSkuId === context.platformSkuId)
        : [],
    },
    {
      method: 'SHOP_ALIAS',
      matches: normalized(context.productName)
        ? mappings.filter((mapping) => [mapping.platformProductName || '', ...mapping.aliases]
          .some((candidate) => normalized(candidate) === normalized(context.productName)))
        : [],
    },
  ];
  for (const priority of priorities) {
    if (!priority.matches.length) continue;
    const productIds = new Set(priority.matches.map((mapping) => mapping.osProductId));
    if (productIds.size !== 1) {
      return { status: 'CONFIG_CONFLICT', message: '当前店铺商品映射存在冲突，请联系管理员修正后重试' };
    }
    const mapping = priority.matches[0];
    const product = runtime.products?.find((item) => item.id === mapping.osProductId);
    const referencePrice = mapping.osReferencePrice ?? product?.referencePrice;
    return {
      status: 'MATCHED',
      method: priority.method,
      osProductId: mapping.osProductId,
      osProductName: mapping.osProductName || product?.name,
      ...(typeof referencePrice === 'number' && Number.isFinite(referencePrice)
        ? { osReferencePrice: referencePrice }
        : {}),
      rawProductName: context.productName,
    };
  }
  const exactProducts = (runtime.products || [])
    .filter((product) => normalized(product.name) === normalized(context.productName));
  if (exactProducts.length === 1) {
    const product = exactProducts[0];
    return {
      status: 'MATCHED',
      method: 'EXACT_OS_NAME',
      osProductId: product.id,
      osProductName: product.name,
      ...(typeof product.referencePrice === 'number' && Number.isFinite(product.referencePrice)
        ? { osReferencePrice: product.referencePrice }
        : {}),
      rawProductName: context.productName,
    };
  }
  return { status: 'UNMATCHED', rawProductName: context.productName };
}

export function productPreviewForPanel(state: CompletionPanelState): BrowserProductPreview | null {
  return state.sync?.productResolution || runtimeProductPreview(state);
}

function clearOrderResult(state: CompletionPanelState): CompletionPanelState {
  return {
    ...state,
    sync: null,
    completion: null,
    remarkText: '',
    activeAttempt: null,
  };
}

function synchronizedIntake(completion: OrderCompletionState) {
  if (!completion.intakeResult) return null;
  return {
    ...completion.intakeResult,
    orderRemarkStatus: completion.orderRemarkStatus === 'IN_PROGRESS'
      ? completion.intakeResult.orderRemarkStatus
      : completion.orderRemarkStatus,
    greenFlagStatus: completion.greenFlagStatus === 'IN_PROGRESS'
      ? completion.intakeResult.greenFlagStatus
      : completion.greenFlagStatus,
  };
}

export function completionPanelReducer(
  state: CompletionPanelState,
  action: CompletionPanelAction,
): CompletionPanelState {
  if (action.type === 'RESET') return createCompletionPanelState();
  if (action.type === 'CLEAR_CONTEXT') return {
    ...createCompletionPanelState(),
    runtimeConfig: state.runtimeConfig,
    shopBindingId: state.shopBindingId,
    form: { ...emptyForm },
  };
  if (action.type === 'APPLY_RUNTIME_CONFIG') {
    const selectedShopBindingId = action.runtimeConfig.shops.some((shop) => shop.id === action.selectedShopBindingId)
      ? action.selectedShopBindingId
      : '';
    const next = {
      ...state,
      runtimeConfig: action.runtimeConfig,
      shopBindingId: selectedShopBindingId,
    };
    return selectedShopBindingId === state.shopBindingId ? next : clearOrderResult(next);
  }
  if (action.type === 'SELECT_SHOP_BINDING') {
    const shopBindingId = state.runtimeConfig?.shops.some((shop) => shop.id === action.shopBindingId)
      ? action.shopBindingId
      : '';
    if (shopBindingId === state.shopBindingId) return state;
    return clearOrderResult({ ...state, shopBindingId });
  }
  if (action.type === 'RECOGNIZE_ATTEMPT_CONTEXT') {
    if (!state.context
      || state.activeAttempt?.id !== action.attemptId
      || state.activeAttempt.conversationKey !== action.conversationKey
      || conversationKey(state.context) !== action.conversationKey) return state;
    return completionPanelReducer(state, {
      type: 'RECOGNIZE_CONTEXT',
      context: action.context,
      detectedContact: action.detectedContact,
    });
  }
  if (action.type === 'RECOGNIZE_CONTEXT') {
    const conversationChanged = state.context?.platformOrderNo !== action.context.platformOrderNo
      || state.context?.customerDisplayName !== action.context.customerDisplayName;
    if (conversationChanged) {
      return {
        runtimeConfig: state.runtimeConfig,
        shopBindingId: state.shopBindingId,
        context: action.context,
        form: {
          name: action.context.customerDisplayName,
          phone: action.detectedContact?.phone || '',
          wechat: action.detectedContact?.wechat || '',
          source: action.detectedContact ? 'CHAT' : 'OFF_PLATFORM',
        },
        contactConfirmed: false,
        sync: null,
        completion: null,
        remarkText: '',
        activeAttempt: null,
      };
    }
    if (state.sync) return { ...state, context: action.context };
    return {
      ...state,
      context: action.context,
      form: {
        ...state.form,
        name: action.context.customerDisplayName,
        phone: action.detectedContact?.phone || state.form.phone,
        wechat: action.detectedContact?.wechat || state.form.wechat,
        source: action.detectedContact ? 'CHAT' : state.form.source,
      },
    };
  }
  if (action.type === 'START_ATTEMPT') {
    if (!state.context || conversationKey(state.context) !== action.conversationKey) return state;
    return { ...state, activeAttempt: { id: action.attemptId, conversationKey: action.conversationKey } };
  }
  if (action.type === 'APPLY_COMPLETION') {
    if (!state.context
      || state.activeAttempt?.id !== action.attemptId
      || state.activeAttempt.conversationKey !== action.conversationKey
      || conversationKey(state.context) !== action.conversationKey) return state;
    const nextSync = synchronizedIntake(action.completion);
    return {
      ...state,
      completion: action.completion,
      sync: nextSync || state.sync,
      remarkText: action.completion.remarkText || state.remarkText,
    };
  }
  if (state.sync) return state;
  if (action.type === 'SET_CONTACT_CONFIRMED') {
    return { ...state, contactConfirmed: action.value };
  }
  if (action.field === 'source') {
    return {
      ...state,
      form: { ...state.form, source: action.value as ContactForm['source'] },
      contactConfirmed: false,
    };
  }
  return {
    ...state,
    form: { ...state.form, [action.field]: action.value },
    contactConfirmed: false,
  };
}
