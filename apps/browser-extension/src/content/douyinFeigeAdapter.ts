import type { BrowserChatMessage } from '../domain/contactDetection';
import { isPaidOrderStatus, mergeOsOrderRemark } from '../domain/orderCompletion';
import type { CompleteOsOrderInput, CompleteOsOrderResult } from '../shared/contracts';

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
  orderRemark: [
    '[data-jx-order-remark]',
    '[data-testid="order-remark-input"]',
    'textarea[placeholder*="订单备注"]',
    'textarea[placeholder^="请输入备注信息"]',
  ],
  orderRemarkSave: ['[data-jx-order-remark-save]', '[data-testid="order-remark-save"]', 'button[aria-label*="保存备注"]'],
  orderCard: [
    '[data-testid="order-card"]',
    '[class*="order-card"]',
    '[class*="orderItem"]',
    '[role="button"][aria-expanded="true"]',
  ],
  orderRemarkSummary: ['[data-testid="order-remark-summary"]', '[class*="remark-content"]'],
  orderRemarkEdit: ['[data-testid="edit-order-remark"]'],
  orderRemarkDialog: ['[role="dialog"][aria-label*="备注"]', '[role="dialog"]'],
  greenFlag: ['[data-flag-color="green"]', '[aria-label*="绿色旗帜"]', '[title*="绿色旗帜"]'],
  currentOrderFlag: ['[data-testid="current-order-flag"]', '[data-current-flag]'],
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

function findButtonByText(root: ParentNode, labels: string[]): HTMLElement | null {
  return [...root.querySelectorAll<HTMLElement>('button,[role="button"]')]
    .find((element) => labels.includes(element.textContent?.trim() || '')) || null;
}

function orderNoFromElement(root: ParentNode) {
  const explicit = text(root, selectors.orderNo);
  if (explicit) return explicit;
  const candidates = [...String(root.textContent || '').matchAll(/(?:^|\D)(\d{19})(?!\d)/g)]
    .map((match) => match[1]);
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : '';
}

function isVisible(element: HTMLElement | null): element is HTMLElement {
  if (!element) return false;
  let current: HTMLElement | null = element;
  while (current) {
    if (current.hidden || current.getAttribute('aria-hidden') === 'true') return false;
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (style?.display === 'none' || style?.visibility === 'hidden') return false;
    current = current.parentElement;
  }
  return true;
}

function visibleActiveOrderCards(document: Document) {
  const visible = uniqueMatches(document, selectors.orderCard).filter(isVisible);
  return visible.filter((candidate) => !visible.some((other) => (
    other !== candidate && candidate.contains(other)
  )));
}

function uniqueActiveOrderCard(document: Document) {
  const cards = visibleActiveOrderCards(document);
  return cards.length === 1 ? cards[0] : null;
}

function orderStatusFromElement(root: ParentNode) {
  return text(root, selectors.orderStatus);
}

function isEnabled(element: HTMLElement) {
  return !element.hasAttribute('disabled')
    && element.getAttribute('aria-disabled') !== 'true'
    && element.dataset.disabled !== 'true';
}

function uniqueMatches(root: ParentNode, candidates: string[]) {
  const matches = candidates.flatMap((selector) => [...root.querySelectorAll<HTMLElement>(selector)]);
  return [...new Set(matches)];
}

function hasExactGreenSemantic(element: HTMLElement) {
  const semantics = [
    ['data-flag-color', 'green'],
    ['aria-label', '绿色旗帜'],
    ['title', '绿色旗帜'],
  ] as const;
  let exactMatch = false;
  for (const [attribute, expected] of semantics) {
    const value = element.getAttribute(attribute);
    if (value === null) continue;
    if (value.trim().toLowerCase() !== expected.toLowerCase()) return false;
    exactMatch = true;
  }
  return exactMatch;
}

function findUniqueGreenFlag(dialog: HTMLElement) {
  const candidates = uniqueMatches(dialog, selectors.greenFlag)
    .filter((element) => isVisible(element) && isEnabled(element) && hasExactGreenSemantic(element));
  return candidates.length === 1 ? candidates[0] : null;
}

function findUniqueSave(dialog: HTMLElement) {
  const semantic = uniqueMatches(dialog, selectors.orderRemarkSave);
  const byText = [...dialog.querySelectorAll<HTMLElement>('button,[role="button"]')]
    .filter((element) => ['保存', '确定'].includes(element.textContent?.trim() || ''));
  const candidates = [...new Set([...semantic, ...byText])]
    .filter((element) => isVisible(element) && isEnabled(element));
  return candidates.length === 1 ? candidates[0] : null;
}

function closestSemanticRemarkContainer(editor: HTMLElement) {
  let current = editor.parentElement;
  while (current && current !== editor.ownerDocument.body) {
    const content = current.textContent || '';
    const hasCancel = Boolean(findButtonByText(current, ['取消']));
    if (content.includes('订单备注') && content.includes('订单标记') && hasCancel) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function visibleRemarkDialogs(document: Document) {
  const roleDialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
    .filter(isVisible)
    .filter((dialog) => {
      const label = dialog.getAttribute('aria-label')?.trim() || '';
      const hasRemarkSemantics = label.includes('备注') || (dialog.textContent || '').includes('订单标记');
      return hasRemarkSemantics && Boolean(first(dialog, selectors.orderRemark));
    });
  const semanticDrawers = all(document, selectors.orderRemark)
    .filter(isVisible)
    .map(closestSemanticRemarkContainer)
    .filter((element): element is HTMLElement => Boolean(element));
  return [...new Set([...roleDialogs, ...semanticDrawers])];
}

function findUniqueRemarkDialog(document: Document) {
  const dialogs = visibleRemarkDialogs(document);
  return dialogs.length === 1 ? dialogs[0] : null;
}

async function waitForElement(
  document: Document,
  lookup: () => HTMLElement | null,
  timeoutMs = 1500,
): Promise<HTMLElement | null> {
  const existing = lookup();
  if (existing) return existing;
  const MutationObserverConstructor = document.defaultView?.MutationObserver;
  if (!MutationObserverConstructor) return null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (element: HTMLElement | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timeout);
      resolve(element);
    };
    const observer = new MutationObserverConstructor(() => {
      const element = lookup();
      if (element) finish(element);
    });
    const timeout = setTimeout(() => finish(null), timeoutMs);
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
}

function isGreenActive(orderCard: HTMLElement) {
  const currentFlags = uniqueMatches(orderCard, selectors.currentOrderFlag).filter(isVisible);
  return currentFlags.length === 1
    && currentFlags[0].dataset.currentFlag?.trim().toLowerCase() === 'green';
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
      const activeOrderCard = uniqueActiveOrderCard(document);
      const platformOrderNo = activeOrderCard ? orderNoFromElement(activeOrderCard) : '';
      const orderStatus = activeOrderCard ? orderStatusFromElement(activeOrderCard) : '';
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

    appendReply(value: string, expected: {
      expectedOrderNo?: string;
      expectedCustomerDisplayName: string;
    }): PageWriteResult {
      if (!expected?.expectedCustomerDisplayName.trim()) {
        return { ok: false, code: 'CONTEXT_NOT_VERIFIED', message: '未识别客户昵称，未追加话术' };
      }
      const currentOrderNo = text(document, selectors.orderNo);
      const currentCustomer = text(first(document, selectors.root) || document, selectors.customer);
      if ((expected.expectedOrderNo && currentOrderNo !== expected.expectedOrderNo)
        || currentCustomer !== expected.expectedCustomerDisplayName) {
        return { ok: false, code: 'CONTEXT_CHANGED', message: '当前飞鸽会话已切换，未填入话术' };
      }
      const editor = first(document, selectors.reply);
      if (!editor) return { ok: false, code: 'REPLY_EDITOR_NOT_FOUND', message: '未找到飞鸽回复输入框' };
      const current = editableValue(editor);
      return setEditableValue(editor, current
        ? `${current}${current.endsWith('\n') ? '' : '\n'}${value}`
        : value);
    },

    fillReplyIfEmpty(value: string, expected?: {
      expectedOrderNo?: string;
      expectedCustomerDisplayName?: string;
    }): SafeReplyFillResult {
      const currentOrderNo = text(document, selectors.orderNo);
      const currentCustomer = text(first(document, selectors.root) || document, selectors.customer);
      if ((expected?.expectedOrderNo && currentOrderNo !== expected.expectedOrderNo)
        || (expected?.expectedCustomerDisplayName && currentCustomer !== expected.expectedCustomerDisplayName)) {
        return { ok: false, code: 'CONTEXT_CHANGED', message: '当前飞鸽会话已切换，未填入话术' };
      }
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

    async completeOsOrder(input: CompleteOsOrderInput): Promise<CompleteOsOrderResult> {
      const expectedOrderNo = input.expectedOrderNo.trim();
      const expectedCustomer = input.expectedCustomerDisplayName.trim();
      const currentCustomer = () => text(first(document, selectors.root) || document, selectors.customer);
      if (!expectedOrderNo || !expectedCustomer || !currentCustomer()) {
        return {
          ok: false,
          code: 'CONTEXT_NOT_VERIFIED',
          message: '当前订单号或客户昵称无法校验，未修改订单',
          stage: 'CONTEXT',
        };
      }

      const activeCards = visibleActiveOrderCards(document);
      if (activeCards.length !== 1) {
        return {
          ok: false,
          code: activeCards.length ? 'ACTIVE_ORDER_CARD_AMBIGUOUS' : 'ORDER_CARD_NOT_FOUND',
          message: activeCards.length
            ? '当前存在多张可见活动订单卡，未修改订单'
            : '未找到唯一可见活动订单卡',
          stage: 'CONTEXT',
        };
      }
      const orderCard = activeCards[0];
      const initialOrderNo = orderNoFromElement(orderCard);
      const initialOrderStatus = orderStatusFromElement(orderCard);
      if (!initialOrderNo || !initialOrderStatus) {
        return {
          ok: false,
          code: 'CONTEXT_NOT_VERIFIED',
          message: '当前活动订单卡的订单号或订单状态无法校验，未修改订单',
          stage: 'CONTEXT',
        };
      }
      if (initialOrderNo !== expectedOrderNo || currentCustomer() !== expectedCustomer) {
        return {
          ok: false,
          code: 'CONTEXT_CHANGED',
          message: '当前飞鸽客户或订单已切换，未修改订单',
          stage: 'CONTEXT',
        };
      }
      if (!isPaidOrderStatus(initialOrderStatus)) {
        return {
          ok: false,
          code: 'ORDER_STATUS_NOT_PAID',
          message: '当前活动订单不是已付款有效订单，未修改订单',
          stage: 'CONTEXT',
        };
      }

      const hasSameBoundContext = () => {
        const currentActiveCard = uniqueActiveOrderCard(document);
        return currentActiveCard === orderCard
          && orderCard.isConnected
          && isVisible(orderCard)
          && orderNoFromElement(orderCard) === expectedOrderNo
          && isPaidOrderStatus(orderStatusFromElement(orderCard))
          && currentCustomer() === expectedCustomer;
      };

      const edit = first(orderCard, selectors.orderRemarkEdit)
        || findButtonByText(orderCard, ['添加备注', '修改']);
      if (!edit) {
        return {
          ok: false,
          code: 'ORDER_REMARK_EDIT_NOT_FOUND',
          message: '未找到订单备注编辑入口',
          stage: 'REMARK',
        };
      }
      if (!hasSameBoundContext()) {
        return {
          ok: false,
          code: 'CONTEXT_CHANGED',
          message: '点击备注前当前活动订单卡已变化，未修改订单',
          stage: 'CONTEXT',
        };
      }
      edit.click();

      const dialog = await waitForElement(document, () => findUniqueRemarkDialog(document));
      if (!dialog) {
        return {
          ok: false,
          code: 'ORDER_REMARK_DIALOG_NOT_FOUND',
          message: '备注弹窗未打开，未修改订单',
          stage: 'REMARK',
        };
      }

      if (!hasSameBoundContext()) {
        return {
          ok: false,
          code: 'CONTEXT_CHANGED',
          message: '打开备注弹窗后当前飞鸽客户或订单已切换',
          stage: 'CONTEXT',
        };
      }

      const editor = first(dialog, selectors.orderRemark);
      if (!editor) {
        return {
          ok: false,
          code: 'ORDER_REMARK_NOT_FOUND',
          message: '备注弹窗中未找到备注输入框',
          stage: 'REMARK',
        };
      }
      const existing = editableValue(editor) || text(orderCard, selectors.orderRemarkSummary);
      let remarkText: string;
      try {
        remarkText = mergeOsOrderRemark(existing, {
          nickname: expectedCustomer,
          phone: input.phone,
          wechat: input.wechat,
        });
      } catch (error) {
        return {
          ok: false,
          code: 'ORDER_REMARK_INVALID',
          message: error instanceof Error ? error.message : '订单备注内容无效',
          stage: 'REMARK',
        };
      }

      const greenFlag = findUniqueGreenFlag(dialog);
      const save = findUniqueSave(dialog);
      if (!save) {
        return {
          ok: false,
          code: 'ORDER_REMARK_SAVE_NOT_FOUND',
          message: '未找到备注保存按钮，请人工确认',
          stage: 'SAVE',
          remarkText,
        };
      }
      if (!greenFlag) {
        return {
          ok: false,
          code: 'GREEN_FLAG_NOT_FOUND',
          message: '未找到语义明确的绿色旗帜，请人工确认',
          stage: 'GREEN_FLAG',
          remarkText,
        };
      }

      if (!hasSameBoundContext()) {
        return {
          ok: false,
          code: 'CONTEXT_CHANGED',
          message: '当前飞鸽客户或订单已切换，未修改订单',
          stage: 'CONTEXT',
          remarkText,
        };
      }
      const filled = setEditableValue(editor, remarkText);
      if (!filled.ok) {
        return { ...filled, stage: 'REMARK', remarkText };
      }
      if (!hasSameBoundContext()) {
        return {
          ok: false,
          code: 'CONTEXT_CHANGED',
          message: '当前飞鸽客户或订单已切换，未提交订单修改',
          stage: 'CONTEXT',
          remarkText,
        };
      }
      const dialogAfterFill = findUniqueRemarkDialog(document);
      const greenAfterFill = dialogAfterFill ? findUniqueGreenFlag(dialogAfterFill) : null;
      const saveAfterFill = dialogAfterFill ? findUniqueSave(dialogAfterFill) : null;
      if (!greenAfterFill || !saveAfterFill) {
        return {
          ok: false,
          code: 'ORDER_CONTROLS_CHANGED',
          message: '备注写入后绿色旗帜或保存控件已变化，未保存',
          stage: !greenAfterFill ? 'GREEN_FLAG' : 'SAVE',
          remarkText,
        };
      }
      if (!hasSameBoundContext()) {
        return {
          ok: false,
          code: 'CONTEXT_CHANGED',
          message: '点击绿色旗帜前当前活动订单卡已变化，未保存订单修改',
          stage: 'CONTEXT',
          remarkText,
        };
      }
      greenAfterFill.click();
      if (!hasSameBoundContext()) {
        return {
          ok: false,
          code: 'CONTEXT_CHANGED',
          message: '当前飞鸽客户或订单已切换，未保存订单修改',
          stage: 'CONTEXT',
          remarkText,
        };
      }
      const dialogAfterGreen = findUniqueRemarkDialog(document);
      const saveAfterGreen = dialogAfterGreen ? findUniqueSave(dialogAfterGreen) : null;
      if (!saveAfterGreen) {
        return {
          ok: false,
          code: 'ORDER_REMARK_SAVE_CHANGED',
          message: '选择绿色旗帜后保存控件已变化，未保存',
          stage: 'SAVE',
          remarkText,
        };
      }
      if (!hasSameBoundContext()) {
        return {
          ok: false,
          code: 'CONTEXT_CHANGED',
          message: '点击保存前当前活动订单卡已变化，未保存订单修改',
          stage: 'CONTEXT',
          remarkText,
        };
      }
      saveAfterGreen.click();

      if (!hasSameBoundContext()) {
        return {
          ok: false,
          code: 'CONTEXT_CHANGED',
          message: '保存后当前飞鸽客户或订单已切换，未报告成功',
          stage: 'CONTEXT',
          remarkText,
        };
      }

      const verified = await waitForElement(document, () => {
        if (!hasSameBoundContext()) return null;
        const summary = text(orderCard, selectors.orderRemarkSummary);
        const closed = !dialog.isConnected || !isVisible(dialog);
        return closed && summary.replace(/\r\n/g, '\n') === remarkText.replace(/\r\n/g, '\n').trim()
          && isGreenActive(orderCard)
          ? orderCard
          : null;
      });
      if (!verified) {
        return {
          ok: false,
          code: 'ORDER_COMPLETION_NOT_VERIFIED',
          message: '订单备注或绿色旗帜未完成页面验证',
          stage: 'SAVE',
          remarkText,
        };
      }
      if (!hasSameBoundContext()) {
        return {
          ok: false,
          code: 'CONTEXT_CHANGED',
          message: '完成页面验证后当前飞鸽客户或订单已切换，未报告成功',
          stage: 'CONTEXT',
          remarkText,
        };
      }
      return {
        ok: true,
        remarkText,
        remarkStatus: 'SUCCEEDED',
        greenFlagStatus: 'SUCCEEDED',
      };
    },
  };
}

export type DouyinFeigeAdapter = ReturnType<typeof createDouyinFeigeAdapter>;
