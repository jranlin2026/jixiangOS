import type { FeigePageContext } from '../content/douyinFeigeAdapter';
import type { DetectedContact } from '../domain/contactDetection';
import type {
  BrowserLeadProductResolutionAudit,
  BrowserProductPreviewResponse,
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
  productPreview: BrowserProductPreviewResponse | null;
  productPreviewStatus: 'IDLE' | 'LOADING' | 'READY' | 'FAILED';
  productPreviewMessage: string;
  activeProductPreview: { generation: number; requestKey: string } | null;
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
  | { type: 'START_PRODUCT_PREVIEW'; generation: number; requestKey: string }
  | {
      type: 'APPLY_PRODUCT_PREVIEW';
      generation: number;
      requestKey: string;
      preview: BrowserProductPreviewResponse;
    }
  | { type: 'FAIL_PRODUCT_PREVIEW'; generation: number; requestKey: string; message: string }
  | { type: 'RECOGNIZE_CONTEXT'; context: FeigePageContext; detectedContact: RecognizedContact }
  | {
      type: 'RECOGNIZE_ATTEMPT_CONTEXT';
      attemptId: number;
      conversationKey: string;
      context: FeigePageContext;
      detectedContact: RecognizedContact;
    }
  | {
      type: 'APPLY_RECONFIRMATION_SNAPSHOT';
      attemptId: number;
      conversationKey: string;
      context: FeigePageContext;
      detectedContact: RecognizedContact;
      preview: BrowserProductPreviewResponse;
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
    productPreview: null,
    productPreviewStatus: 'IDLE',
    productPreviewMessage: '',
    activeProductPreview: null,
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

export function productPreviewForPanel(state: CompletionPanelState): BrowserLeadProductResolutionAudit | null {
  return state.sync?.productResolution || state.productPreview?.productResolution || null;
}

function clearProductPreview(state: CompletionPanelState): CompletionPanelState {
  return {
    ...state,
    productPreview: null,
    productPreviewStatus: 'IDLE',
    productPreviewMessage: '',
    activeProductPreview: null,
  };
}

function productPreviewContextKey(context: FeigePageContext | null) {
  if (!context) return '';
  return JSON.stringify([
    context.platformOrderNo.trim(),
    context.customerDisplayName.trim(),
    context.readyForIntake,
    context.shopDisplayName?.trim() || '',
    context.platformProductId?.trim() || '',
    context.platformSkuId?.trim() || '',
    context.productName.trim(),
    context.paymentAmount ?? null,
    context.paymentAt?.trim() || '',
  ]);
}

function clearOrderResult(state: CompletionPanelState): CompletionPanelState {
  return clearProductPreview({
    ...state,
    sync: null,
    completion: null,
    remarkText: '',
    activeAttempt: null,
  });
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
  if (action.type === 'START_PRODUCT_PREVIEW') {
    return {
      ...state,
      productPreview: null,
      productPreviewStatus: 'LOADING',
      productPreviewMessage: '',
      activeProductPreview: { generation: action.generation, requestKey: action.requestKey },
    };
  }
  if (action.type === 'APPLY_PRODUCT_PREVIEW' || action.type === 'FAIL_PRODUCT_PREVIEW') {
    if (state.activeProductPreview?.generation !== action.generation
      || state.activeProductPreview.requestKey !== action.requestKey) return state;
    if (action.type === 'FAIL_PRODUCT_PREVIEW') {
      return {
        ...state,
        productPreview: null,
        productPreviewStatus: 'FAILED',
        productPreviewMessage: action.message,
        activeProductPreview: null,
      };
    }
    return {
      ...state,
      productPreview: action.preview,
      productPreviewStatus: 'READY',
      productPreviewMessage: '',
      activeProductPreview: null,
    };
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
  if (action.type === 'APPLY_RECONFIRMATION_SNAPSHOT') {
    if (!state.context
      || state.activeAttempt?.id !== action.attemptId
      || state.activeAttempt.conversationKey !== action.conversationKey
      || conversationKey(state.context) !== action.conversationKey
      || conversationKey(action.context) !== action.conversationKey) return state;
    return {
      ...state,
      productPreview: action.preview,
      productPreviewStatus: 'READY',
      productPreviewMessage: '',
      activeProductPreview: null,
      context: action.context,
      form: {
        ...state.form,
        name: action.context.customerDisplayName,
        phone: action.detectedContact?.phone || state.form.phone,
        wechat: action.detectedContact?.wechat || state.form.wechat,
        source: action.detectedContact ? 'CHAT' : state.form.source,
      },
      contactConfirmed: false,
      sync: null,
      completion: null,
      remarkText: '',
      activeAttempt: null,
    };
  }
  if (action.type === 'RECOGNIZE_CONTEXT') {
    const conversationChanged = state.context?.platformOrderNo !== action.context.platformOrderNo
      || state.context?.customerDisplayName !== action.context.customerDisplayName;
    if (conversationChanged) {
      return {
        runtimeConfig: state.runtimeConfig,
        shopBindingId: state.shopBindingId,
        productPreview: null,
        productPreviewStatus: 'IDLE',
        productPreviewMessage: '',
        activeProductPreview: null,
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
    if (productPreviewContextKey(state.context) !== productPreviewContextKey(action.context)) {
      return clearOrderResult({
        ...state,
        context: action.context,
        form: {
          ...state.form,
          name: action.context.customerDisplayName,
          phone: action.detectedContact?.phone || state.form.phone,
          wechat: action.detectedContact?.wechat || state.form.wechat,
          source: action.detectedContact ? 'CHAT' : state.form.source,
        },
        contactConfirmed: false,
      });
    }
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
