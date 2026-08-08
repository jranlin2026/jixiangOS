import type { FeigePageContext } from '../content/douyinFeigeAdapter';
import type { DetectedContact } from '../domain/contactDetection';
import type { LeadIntakeResponse } from '../shared/contracts';
import type { OrderCompletionState } from './orderCompletionWorkflow';

export type ContactForm = {
  name: string;
  phone: string;
  wechat: string;
  source: 'CHAT' | 'OFF_PLATFORM';
};

export type CompletionPanelState = {
  context: FeigePageContext | null;
  form: ContactForm;
  contactConfirmed: boolean;
  sync: LeadIntakeResponse | null;
  completion: OrderCompletionState | null;
  remarkText: string;
};

type RecognizedContact = Pick<DetectedContact, 'phone' | 'wechat'> | null;

export type CompletionPanelAction =
  | { type: 'RECOGNIZE_CONTEXT'; context: FeigePageContext; detectedContact: RecognizedContact }
  | { type: 'SET_FORM_FIELD'; field: 'phone' | 'wechat' | 'source'; value: string }
  | { type: 'SET_CONTACT_CONFIRMED'; value: boolean }
  | { type: 'APPLY_COMPLETION'; completion: OrderCompletionState }
  | { type: 'CLEAR_CONTEXT' }
  | { type: 'RESET' };

const emptyForm: ContactForm = { name: '', phone: '', wechat: '', source: 'CHAT' };

export function createCompletionPanelState(): CompletionPanelState {
  return {
    context: null,
    form: { ...emptyForm },
    contactConfirmed: false,
    sync: null,
    completion: null,
    remarkText: '',
  };
}

export function isCompletionFormLocked(state: CompletionPanelState) {
  return Boolean(state.sync);
}

export function completionAttemptSnapshot(state: CompletionPanelState) {
  if (!state.context) return null;
  return {
    expectedOrderNo: state.context.platformOrderNo,
    expectedCustomerDisplayName: state.context.customerDisplayName,
    phone: state.form.phone.trim() || undefined,
    wechat: state.form.wechat.trim() || undefined,
    source: state.form.source,
    existingIntake: state.sync || undefined,
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
  if (action.type === 'CLEAR_CONTEXT') return { ...createCompletionPanelState(), form: { ...emptyForm } };
  if (action.type === 'RECOGNIZE_CONTEXT') {
    const conversationChanged = state.context?.platformOrderNo !== action.context.platformOrderNo
      || state.context?.customerDisplayName !== action.context.customerDisplayName;
    if (conversationChanged) {
      return {
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
  if (action.type === 'APPLY_COMPLETION') {
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
