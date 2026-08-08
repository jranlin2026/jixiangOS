import type { DetectedContact } from '../domain/contactDetection';
import type { FeigePageContext, PageWriteResult, SafeReplyFillResult } from '../content/douyinFeigeAdapter';
import type { ScriptLibrary } from '../domain/scriptLibrary';

export type ExtensionConfig = {
  apiBaseUrl: string;
  shopKey: string;
};

export type AuthenticatedOperator = { id: string; name: string; role: string };

export type ApiEnvelope<T> = { code: number; data: T | null; message: string };

export type LeadIntakeResponse = {
  syncId: string;
  outcome: 'CREATED' | 'ALREADY_CREATED';
  lead: { id: string; name: string; assignedTo?: string; assignedToId?: string; intakeStatus?: string };
  orderRemarkStatus: 'NOT_ATTEMPTED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
};

export type PageCommand =
  | { type: 'READ_FEIGE_CONTEXT' }
  | { type: 'FILL_FEIGE_REPLY'; text: string }
  | {
      type: 'FILL_FEIGE_REPLY_IF_EMPTY';
      text: string;
      expectedOrderNo?: string;
      expectedCustomerDisplayName?: string;
    }
  | {
      type: 'APPEND_FEIGE_REPLY';
      text: string;
      expectedOrderNo?: string;
      expectedCustomerDisplayName?: string;
    }
  | { type: 'SAVE_ORDER_REMARK'; text: string };

export type PageCommandResult =
  | { ok: true; context: FeigePageContext; detectedContact: DetectedContact | null }
  | PageWriteResult
  | SafeReplyFillResult;

export type WorkerCommand =
  | { type: 'AUTH_STATE' }
  | { type: 'LOGIN'; config: ExtensionConfig; account: string; password: string }
  | { type: 'LOGOUT' }
  | { type: 'SAVE_CONFIG'; config: ExtensionConfig }
  | { type: 'GET_SCRIPT_LIBRARY' }
  | { type: 'SAVE_SCRIPT_LIBRARY'; library: ScriptLibrary }
  | { type: 'CREATE_LEAD_INTAKE'; input: Record<string, unknown> }
  | { type: 'REPORT_ORDER_REMARK'; syncId: string; status: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED'; errorMessage?: string };
