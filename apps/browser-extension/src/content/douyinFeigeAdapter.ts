import type { BrowserChatMessage } from '../domain/contactDetection';

export type FeigePageContext = {
  supported: boolean;
  pageUrl: string;
  customerDisplayName: string;
  platformOrderNo: string;
  orderStatus: string;
  productName: string;
  messages: BrowserChatMessage[];
  diagnostics: string[];
};

export type PageWriteResult = { ok: true } | { ok: false; code: string; message: string };
export type SafeReplyFillResult =
  | { ok: true; filled: true }
  | { ok: true; filled: false; reason: 'NOT_EMPTY' }
  | { ok: false; code: string; message: string };

const selectors = {
  root: ['[data-jx-feige-conversation]', '#workspace-chat', '[data-testid="conversation-panel"]', '[class*="conversation"]'],
  customer: ['[data-jx-customer-name]', '#topbar-left-info span', '[data-testid="conversation-customer-name"]', '[class*="customer-name"]'],
  orderNo: ['[data-jx-order-no]', '[data-testid="order-no"]', '[data-order-no]'],
  orderStatus: ['[data-jx-order-status]', '[data-testid="order-status"]'],
  product: ['[data-jx-product-name]', '[data-testid="product-name"]', '[class*="product-name"]'],
  message: ['[data-jx-message]', '.leaveMessage', '[data-testid="message-item"]', '[data-message-direction]'],
  reply: ['[data-jx-reply-input]', '[data-qa-id="qa-send-message-textarea"]', 'textarea[placeholder*="消息"]', '[contenteditable="true"][role="textbox"]'],
  orderRemark: ['[data-jx-order-remark]', '[data-testid="order-remark-input"]', 'textarea[placeholder*="订单备注"]'],
  orderRemarkSave: ['[data-jx-order-remark-save]', '[data-testid="order-remark-save"]', 'button[aria-label*="保存备注"]'],
};

function first(root: ParentNode, candidates: string[]): HTMLElement | null {
  for (const selector of candidates) {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) return element;
  }
  return null;
}

function all(root: ParentNode, candidates: string[]): HTMLElement[] {
  for (const selector of candidates) {
    const elements = [...root.querySelectorAll<HTMLElement>(selector)];
    if (elements.length) return elements;
  }
  return [];
}

function text(root: ParentNode, candidates: string[]) {
  return first(root, candidates)?.textContent?.trim() || '';
}

function direction(element: HTMLElement): BrowserChatMessage['direction'] {
  const explicit = String(element.dataset.direction || element.dataset.messageDirection || '').toUpperCase();
  if (explicit === 'INBOUND' || explicit === 'OUTBOUND' || explicit === 'SYSTEM') return explicit;
  const classes = element.className.toString().toLowerCase();
  if (classes.includes('messageisme')) return 'OUTBOUND';
  if (classes.includes('messagenotme')) return 'INBOUND';
  if (/(self|outbound|seller|service)/.test(classes)) return 'OUTBOUND';
  if (/(customer|buyer|inbound)/.test(classes)) return 'INBOUND';
  return 'SYSTEM';
}

function consultationProductName(document: Document) {
  const explicit = text(document, selectors.product);
  if (explicit) return explicit;
  const inviteButton = [...document.querySelectorAll<HTMLElement>('button')]
    .find((element) => element.textContent?.trim() === '邀请下单');
  if (!inviteButton) return '';
  let panel: HTMLElement | null = inviteButton.parentElement;
  while (panel && !/￥\s*\d/.test(panel.textContent || '')) panel = panel.parentElement;
  if (!panel) return '';
  const candidates = [...panel.querySelectorAll<HTMLElement>('div,span')]
    .map((element) => element.textContent?.trim() || '')
    .filter((value) => value.length >= 2 && value.length <= 80)
    .filter((value) => !/[￥¥]/.test(value))
    .filter((value) => !/^(详情|已售\d*|邀请下单|规格属性|商品视频|商品评价)$/.test(value));
  return candidates.sort((left, right) => left.length - right.length)[0] || '';
}

function setEditableValue(element: HTMLElement, value: string): PageWriteResult {
  if (element instanceof element.ownerDocument.defaultView!.HTMLTextAreaElement
    || element instanceof element.ownerDocument.defaultView!.HTMLInputElement) {
    element.value = value;
  } else if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
    element.textContent = value;
  } else {
    return { ok: false, code: 'UNSUPPORTED_EDITOR', message: '页面输入框类型暂不支持' };
  }
  const EventConstructor = element.ownerDocument.defaultView?.Event || Event;
  element.dispatchEvent(new EventConstructor('input', { bubbles: true }));
  element.dispatchEvent(new EventConstructor('change', { bubbles: true }));
  return { ok: true };
}

function editableValue(element: HTMLElement) {
  if (element instanceof element.ownerDocument.defaultView!.HTMLTextAreaElement
    || element instanceof element.ownerDocument.defaultView!.HTMLInputElement) return element.value;
  return element.textContent || '';
}

export function createDouyinFeigeAdapter(document: Document, pageUrl: string) {
  return {
    readContext(): FeigePageContext {
      const root = first(document, selectors.root);
      const diagnostics: string[] = [];
      if (!root) diagnostics.push('未找到飞鸽会话区域');
      const scope: ParentNode = root || document;
      const customerDisplayName = text(scope, selectors.customer);
      const platformOrderNo = text(document, selectors.orderNo);
      const orderStatus = text(document, selectors.orderStatus);
      const productName = consultationProductName(document);
      const messages = all(scope, selectors.message)
        .map((element) => ({ direction: direction(element), text: element.textContent?.trim() || '' }))
        .filter((message) => message.text);
      if (!customerDisplayName) diagnostics.push('未识别客户昵称');
      if (!platformOrderNo) diagnostics.push('未识别平台订单号');
      if (!orderStatus) diagnostics.push('未识别订单状态');
      if (!messages.length) diagnostics.push('未识别会话消息');
      return {
        supported: Boolean(root),
        pageUrl,
        customerDisplayName,
        platformOrderNo,
        orderStatus,
        productName,
        messages,
        diagnostics,
      };
    },

    fillReply(value: string): PageWriteResult {
      const editor = first(document, selectors.reply);
      return editor
        ? setEditableValue(editor, value)
        : { ok: false, code: 'REPLY_EDITOR_NOT_FOUND', message: '未找到飞鸽回复输入框' };
    },

    fillReplyIfEmpty(value: string): SafeReplyFillResult {
      const editor = first(document, selectors.reply);
      if (!editor) return { ok: false, code: 'REPLY_EDITOR_NOT_FOUND', message: '未找到飞鸽回复输入框' };
      if (editableValue(editor).trim()) return { ok: true, filled: false, reason: 'NOT_EMPTY' };
      const result = setEditableValue(editor, value);
      return result.ok ? { ok: true, filled: true } : result;
    },

    fillOrderRemark(value: string): PageWriteResult {
      const editor = first(document, selectors.orderRemark);
      if (!editor) return { ok: false, code: 'ORDER_REMARK_NOT_FOUND', message: '当前页面未找到订单备注输入框' };
      const filled = setEditableValue(editor, value);
      if (!filled.ok) return filled;
      const save = first(document, selectors.orderRemarkSave);
      if (!save) return { ok: false, code: 'ORDER_REMARK_SAVE_NOT_FOUND', message: '备注已填入，但未找到保存按钮，请人工确认' };
      save.click();
      // Clicking is only a submission attempt. The side panel deliberately keeps
      // this in SUBMITTED until a calibrated platform success signal is observed.
      return { ok: true };
    },
  };
}

export type DouyinFeigeAdapter = ReturnType<typeof createDouyinFeigeAdapter>;
