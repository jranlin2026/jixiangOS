import type { BrowserChatMessage, DetectedContact } from '../domain/contactDetection';
import type { ScriptLibrary } from '../domain/scriptLibrary';

export type FeigePageContext = {
  supported: boolean;
  pageUrl: string;
  customerDisplayName: string;
  shopDisplayName?: string;
  platformOrderNo: string;
  orderStatus: string;
  platformProductId?: string;
  platformSkuId?: string;
  productName: string;
  paymentAmount?: number;
  paymentAt?: string;
  messages: BrowserChatMessage[];
  diagnostics: string[];
};

export type PageWriteResult = { ok: true } | { ok: false; code: string; message: string };
export type SafeReplyFillResult =
  | { ok: true; filled: true }
  | { ok: true; filled: false; reason: 'NOT_EMPTY' }
  | { ok: false; code: string; message: string };

export type ExtensionConfig = {
  apiBaseUrl: string;
  shopBindingId?: string;
  /** One-release migration input. Never submit this free text to intake. */
  shopKey?: string;
};

export type BrowserRuntimeShop = {
  id: string;
  platform: string;
  shopKey: string;
  platformShopId?: string | null;
  displayName: string;
  aliases: string[];
  source: string;
  sourceName: string;
  sourceType: string;
};

export type BrowserRuntimeConfig = {
  shops: BrowserRuntimeShop[];
};

export type BrowserRuntimeSelection = BrowserRuntimeConfig & {
  selectedShopBindingId?: string;
};

export type AuthenticatedOperator = { id: string; name: string; role: string };

export type ApiEnvelope<T> = { code: number; data: T | null; message: string; errorCode?: string };

export type BrowserLeadProductResolutionAudit = {
  status: 'MATCHED';
  method?: string;
  osProductId?: string;
  osProductName?: string;
  osReferencePrice?: number;
  rawProductName?: string;
} | {
  status: 'UNMATCHED';
  rawProductName: string;
};

export type BrowserProductPreviewInput = {
  platform: 'DOUYIN';
  shopBindingId: string;
  pageShopDisplayName: string;
  platformProductId?: string;
  platformSkuId?: string;
  platformProductName?: string;
  paymentAmount?: number;
  paymentAt?: string;
};

export type BrowserProductPreviewResponse = {
  shop: BrowserRuntimeShop;
  productResolution: BrowserLeadProductResolutionAudit;
  facts: {
    platformProductId?: string;
    platformSkuId?: string;
    platformProductName?: string;
    paymentAmount?: number;
    paymentAt?: string;
  };
  priceDifference: {
    paymentAmount: number;
    osReferencePrice: number;
    amount: number;
    differs: boolean;
  } | null;
};

export type LeadIntakeResponse = {
  syncId: string;
  outcome: 'CREATED' | 'ALREADY_CREATED';
  lead: {
    id: string;
    name: string;
    assignedTo?: string | null;
    assignedToId?: string | null;
    intakeStatus?: string | null;
  };
  storedContact: { nickname: string; phone?: string; wechat?: string };
  completedAt: string;
  remarkLines: [string, string];
  productResolution: BrowserLeadProductResolutionAudit;
  shop: { id: string; shopKey: string; displayName: string };
  orderRemarkStatus: 'NOT_ATTEMPTED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
  greenFlagStatus: 'NOT_ATTEMPTED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
};

export type CompleteOsOrderInput = {
  expectedOrderNo: string;
  expectedCustomerDisplayName: string;
  remarkLines: [string, string];
};

export type CompleteOsOrderResult =
  | { ok: true; remarkText: string; remarkStatus: 'SUCCEEDED'; greenFlagStatus: 'SUCCEEDED' }
  | { ok: false; code: string; message: string; stage: 'CONTEXT' | 'REMARK' | 'GREEN_FLAG' | 'SAVE'; remarkText?: string };

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
      expectedCustomerDisplayName: string;
    }
  | { type: 'SAVE_ORDER_REMARK'; text: string }
  | { type: 'COMPLETE_FEIGE_OS_ORDER'; input: CompleteOsOrderInput };

export type PageCommandResult =
  | { ok: true; context: FeigePageContext; detectedContact: DetectedContact | null }
  | PageWriteResult
  | SafeReplyFillResult
  | CompleteOsOrderResult;

export type WorkerCommand =
  | { type: 'AUTH_STATE' }
  | { type: 'LOGIN'; config: ExtensionConfig; account: string; password: string }
  | { type: 'LOGOUT' }
  | { type: 'GET_RUNTIME_CONFIG' }
  | { type: 'PREVIEW_PRODUCT_MAPPING'; input: BrowserProductPreviewInput }
  | { type: 'SAVE_CONFIG'; config: ExtensionConfig }
  | { type: 'GET_SCRIPT_LIBRARY' }
  | { type: 'SAVE_SCRIPT_LIBRARY'; library: ScriptLibrary }
  | { type: 'CREATE_LEAD_INTAKE'; input: Record<string, unknown> }
  | {
      type: 'REPORT_PLATFORM_COMPLETION';
      syncId: string;
      orderRemarkStatus: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
      greenFlagStatus: 'NOT_ATTEMPTED' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED';
      errorMessage?: string;
    }
  | { type: 'REPORT_ORDER_REMARK'; syncId: string; status: 'SUBMITTED' | 'SUCCEEDED' | 'FAILED'; errorMessage?: string };
