import type { DetectedContact } from '../domain/contactDetection';
import type { FeigePageContext, PageWriteResult } from '../content/douyinFeigeAdapter';

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
  | { type: 'SAVE_ORDER_REMARK'; text: string };

export type PageCommandResult =
  | { ok: true; context: FeigePageContext; detectedContact: DetectedContact | null }
  | PageWriteResult;

export type WorkerCommand =
  | { type: 'AUTH_STATE' }
  | { type: 'LOGIN'; config: ExtensionConfig; account: string; password: string }
  | { type: 'LOGOUT' }
  | { type: 'SAVE_CONFIG'; config: ExtensionConfig }
  | { type: 'CREATE_LEAD_INTAKE'; input: Record<string, unknown> }
  | { type: 'REPORT_ORDER_REMARK'; syncId: string; status: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED'; errorMessage?: string };
