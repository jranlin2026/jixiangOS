import { isIntakeEligibleOrderStatus, mergeOsOrderRemark } from '../domain/orderCompletion';
import type {
  CompleteOsOrderInput,
  CompleteOsOrderResult,
  FeigePageContext,
  PageWriteResult,
  SafeReplyFillResult,
} from '../shared/contracts';
import type { BrowserChatMessage } from '../domain/contactDetection';

export type { FeigePageContext, PageWriteResult, SafeReplyFillResult } from '../shared/contracts';

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
  orderRemarkEdit: ['[data-testid="edit-order-remark"]', '.i-icon-look-note'],
  orderRemarkDialog: ['[role="dialog"][aria-label*="备注"]', '[role="dialog"]'],
  greenFlag: ['[data-flag-color="red"]', '[aria-label*="红色旗帜"]', '[title*="红色旗帜"]'],
  currentOrderFlag: ['[data-testid="current-order-flag"]', '[data-current-flag]'],
};

const exactOrderStatusPattern = /^(?:待付款|未付款|已付款|待发货|已发货|已收货|交易成功|已完成|退款中|退款成功|已退款|已关闭(?:（[^）]+）)?|已取消|取消)$/;

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

function hasOrderRemarkEntrySemantic(element: HTMLElement) {
  const textValue = element.textContent?.trim() || '';
  if (textValue === '备' || textValue === '添加备注' || textValue === '修改') return true;
  const attributes = [
    element.getAttribute('aria-label'),
    element.getAttribute('title'),
    element.getAttribute('data-testid'),
  ].map((value) => value?.trim() || '').filter(Boolean);
  return attributes.some((value) => (
    value === '订单备注'
    || /^(?:添加|新增|编辑|修改)订单?备注$/.test(value)
    || value === 'edit-order-remark'
  ));
}

function findOrderRemarkEntry(orderCard: HTMLElement) {
  const orderContainer = activeOrderContainer(orderCard);
  const trusted = uniqueMatches(orderContainer, selectors.orderRemarkEdit);
  const semantic = [...orderContainer.querySelectorAll<HTMLElement>('*')]
    .filter(hasOrderRemarkEntrySemantic);
  // 飞鸽的“备”入口有时是 button，有时只是带点击事件的 div/span。
  // 取最深层语义节点可兼容两种结构；点击子节点会冒泡到实际绑定事件的父节点。
  const semanticLeaves = semantic.filter((candidate) => !semantic.some((other) => (
    other !== candidate && candidate.contains(other)
  )));
  const candidates = [...new Set([...trusted, ...semanticLeaves])]
    .filter((element) => isVisible(element) && isEnabled(element));
  return candidates.length === 1 ? candidates[0] : null;
}

function orderNoFromElement(root: ParentNode) {
  const explicit = text(root, selectors.orderNo);
  if (explicit) return explicit;
  const standalone = [...root.querySelectorAll<HTMLElement>('*')]
    .filter(isVisible)
    .map((element) => element.textContent?.trim() || '')
    .filter((value) => /^\d{19}$/.test(value));
  const uniqueStandalone = [...new Set(standalone)];
  if (uniqueStandalone.length === 1) return uniqueStandalone[0];
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
  const visible = uniqueMatches(document, selectors.orderCard)
    .filter(isVisible)
    .filter((candidate) => {
      const ownExpanded = candidate.getAttribute('aria-expanded');
      if (ownExpanded !== null) return ownExpanded === 'true';
      const nestedExpansionControls = [...candidate.querySelectorAll<HTMLElement>('[aria-expanded]')];
      if (nestedExpansionControls.length) {
        return nestedExpansionControls.some((control) => control.getAttribute('aria-expanded') === 'true');
      }
      return true;
    });
  return visible
    .filter((candidate) => !visible.some((other) => (
      other !== candidate && candidate.contains(other)
    )))
    .sort((left, right) => {
      const position = left.compareDocumentPosition(right);
      const NodeConstructor = left.ownerDocument.defaultView?.Node;
      if (!NodeConstructor) return 0;
      if (position & NodeConstructor.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & NodeConstructor.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
}

function firstActiveOrderCard(document: Document) {
  return visibleActiveOrderCards(document)[0] || null;
}

function orderStatusFromElement(root: ParentNode) {
  const explicit = text(root, selectors.orderStatus);
  if (explicit) return explicit;
  const candidates = [...root.querySelectorAll<HTMLElement>('*')]
    .filter(isVisible)
    .map((element) => element.textContent?.trim() || '')
    .filter((value) => exactOrderStatusPattern.test(value));
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : '';
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
    ['data-flag-color', 'red'],
    ['aria-label', '红色旗帜'],
    ['title', '红色旗帜'],
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

function hasLiveGreenFlagSemantic(element: HTMLElement) {
  if (element.tagName !== 'INPUT' || element.getAttribute('type')?.toLowerCase() !== 'radio') return false;
  const label = element.closest('label');
  if (!label) return false;
  const colors = [...label.querySelectorAll('.i-icon-flag svg path[fill]')]
    .map((path) => path.getAttribute('fill')?.trim().toLowerCase() || '')
    .filter(Boolean);
  return colors.length === 1 && colors[0] === '#ff3b52';
}

function disablePlatformRemarkSignature(dialog: HTMLElement) {
  const candidates = [...dialog.querySelectorAll<HTMLElement>('label')]
    .filter((label) => (label.textContent || '').includes('自动添加备注人和时间到末尾'))
    .filter(isVisible)
    .map((label) => label.querySelector<HTMLInputElement>('input[type="checkbox"]'))
    .filter((input): input is HTMLInputElement => Boolean(input));
  if (candidates.length > 1) return false;
  const checkbox = candidates[0];
  if (!checkbox || !checkbox.checked) return true;
  checkbox.click();
  return !checkbox.checked;
}

function findUniqueGreenFlag(dialog: HTMLElement) {
  const liveFlagRadios = [...dialog.querySelectorAll<HTMLElement>('input[type="radio"]')];
  const candidates = [...new Set([...uniqueMatches(dialog, selectors.greenFlag), ...liveFlagRadios])]
    .filter((element) => isVisible(element) && isEnabled(element))
    .filter((element) => hasExactGreenSemantic(element) || hasLiveGreenFlagSemantic(element));
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
      clearInterval(poll);
      clearTimeout(timeout);
      resolve(element);
    };
    const check = () => {
      const element = lookup();
      if (element) finish(element);
    };
    const observer = new MutationObserverConstructor(check);
    // 飞鸽会直接更新 textarea.value / radio.checked，这些属性变化
    // 不一定会触发 MutationObserver，因此仍需要短间隔轮询。
    const poll = setInterval(check, 50);
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
  if (currentFlags.length === 1
    && currentFlags[0].dataset.currentFlag?.trim().toLowerCase() === 'red') return true;
  const liveGreenFlags = [...orderCard.querySelectorAll<HTMLElement>('.i-icon-flag')]
    .filter(isVisible)
    .filter((icon) => {
      const window = icon.ownerDocument.defaultView;
      const iconColor = window?.getComputedStyle(icon).color.replace(/\s/g, '').toLowerCase();
      const paths = [...icon.querySelectorAll<HTMLElement>('svg path[fill]')];
      return iconColor === 'rgb(255,59,82)'
        || paths.some((path) => path.getAttribute('fill')?.trim().toLowerCase() === '#ff3b52')
        || paths.some((path) => window?.getComputedStyle(path).fill.replace(/\s/g, '').toLowerCase() === 'rgb(255,59,82)');
    });
  return liveGreenFlags.length === 1;
}

function savedRemarkSummary(orderCard: HTMLElement) {
  return text(orderCard, selectors.orderRemarkSummary) || orderCard.textContent || '';
}

function platformRemarkSignatures(value: string) {
  return value.match(/(?:【|\[)[^【】\[\]\r\n]{1,50}\s+\d{2}-\d{2}\s+\d{2}:\d{2}(?:】|\])/g) || [];
}

function hasNewPlatformRemarkSignature(existing: string, saved: string) {
  return platformRemarkSignatures(saved).length > platformRemarkSignatures(existing).length;
}

function hasSavedRemarkValue(summary: string, remarkText: string, existing: string) {
  const requiredLines = remarkText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return requiredLines.length > 0
    && requiredLines.every((line) => summary.includes(line))
    && !hasNewPlatformRemarkSignature(existing, summary);
}

function hasSavedRemark(orderCard: HTMLElement, remarkText: string, existing: string) {
  return hasSavedRemarkValue(savedRemarkSummary(orderCard), remarkText, existing);
}

function isSelectedFlagControl(element: HTMLElement | null) {
  if (!element) return false;
  if (element.tagName === 'INPUT') {
    return (element as HTMLInputElement).checked;
  }
  return element.getAttribute('aria-checked') === 'true'
    || element.dataset.state === 'checked'
    || element.dataset.selected === 'true';
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

function activeOrderContainer(orderCard: HTMLElement) {
  return orderCard.closest<HTMLElement>('.ecom-collapse-item') || orderCard;
}

function visibleProductNodes(orderCard: HTMLElement) {
  const orderContainer = activeOrderContainer(orderCard);
  const candidates = uniqueMatches(orderContainer, [...selectors.product, '[data-btm="d5834"]'])
    .filter(isVisible);
  return candidates.filter((candidate) => !candidates.some((other) => (
    other !== candidate && candidate.contains(other)
  )));
}

function stableProductAttribute(
  productNode: HTMLElement,
  orderContainer: HTMLElement,
  attributes: string[],
) {
  const values = new Set<string>();
  let current: HTMLElement | null = productNode;
  while (current) {
    for (const attribute of attributes) {
      const value = current.getAttribute(attribute)?.trim();
      if (value) values.add(value);
    }
    if (current === orderContainer) break;
    current = current.parentElement;
  }
  return {
    value: values.size === 1 ? [...values][0] : undefined,
    conflict: values.size > 1,
  };
}

function activeOrderProductFacts(orderCard: HTMLElement) {
  const orderContainer = activeOrderContainer(orderCard);
  const productNodes = visibleProductNodes(orderCard);
  if (productNodes.length !== 1) {
    return {
      productName: '',
      platformProductId: undefined,
      platformSkuId: undefined,
      ambiguous: productNodes.length > 1,
      productIdConflict: false,
      skuIdConflict: false,
    };
  }
  const productNode = productNodes[0];
  const productId = stableProductAttribute(productNode, orderContainer, ['data-product-id', 'data-item-id']);
  const skuId = stableProductAttribute(productNode, orderContainer, ['data-sku-id']);
  return {
    productName: productNode.textContent?.trim() || '',
    platformProductId: productId.value,
    platformSkuId: skuId.value,
    ambiguous: false,
    productIdConflict: productId.conflict,
    skuIdConflict: skuId.conflict,
  };
}

function semanticLabelElements(root: HTMLElement, label: string) {
  const candidates = [root, ...root.querySelectorAll<HTMLElement>('*')]
    .filter(isVisible)
    .filter((element) => (element.textContent || '').includes(label));
  return candidates.filter((candidate) => !candidates.some((other) => (
    other !== candidate && candidate.contains(other)
  )));
}

type ParsedPlatformFact<T> =
  | { status: 'ABSENT' }
  | { status: 'INVALID' }
  | { status: 'AMBIGUOUS' }
  | { status: 'FOUND'; value: T };

function textWithNodeBoundaries(node: Node): string {
  if (node.nodeType === 3) return node.textContent || '';
  return [...node.childNodes].map(textWithNodeBoundaries).join(' ');
}

type FactContentNormalizer = (content: string) => string;

function paymentAmountContent(content: string) {
  const discountBoundary = content.indexOf('优惠');
  const primaryAmountContent = discountBoundary >= 0
    ? content.slice(0, discountBoundary)
    : content;
  return primaryAmountContent.replace(
    /([¥￥])\s*((?:\d{1,3}(?:\s*,\s*\d{3})+|\d+)(?:\s*\.\s*\d{2})?)/g,
    (_match, currency: string, amount: string) => `${currency}${amount.replace(/\s+/g, '')}`,
  );
}

function factMatchInAdjacentValue(
  labelElement: HTMLElement,
  pattern: RegExp,
  normalizeContent: FactContentNormalizer = (content) => content,
): ParsedPlatformFact<RegExpMatchArray> | null {
  let sibling: ChildNode | null = labelElement.nextSibling;
  while (sibling) {
    const content = normalizeContent(textWithNodeBoundaries(sibling));
    const matches = [...content.matchAll(pattern)];
    if (matches.length > 1) return { status: 'AMBIGUOUS' };
    if (matches.length === 1) return { status: 'FOUND', value: matches[0] };
    if (content.replace(/[\s:：-]/g, '')) return { status: 'INVALID' };
    sibling = sibling.nextSibling;
  }
  return null;
}

function factMatchNearUniqueLabel(
  orderCard: HTMLElement,
  label: string,
  pattern: RegExp,
  normalizeContent: FactContentNormalizer = (content) => content,
): ParsedPlatformFact<RegExpMatchArray> {
  const orderContainer = activeOrderContainer(orderCard);
  const labels = semanticLabelElements(orderContainer, label);
  if (!labels.length) return { status: 'ABSENT' };
  if (labels.length > 1) return { status: 'AMBIGUOUS' };

  const labelContentMatches = [...normalizeContent(textWithNodeBoundaries(labels[0])).matchAll(pattern)];
  if (!labelContentMatches.length) {
    const adjacentValue = factMatchInAdjacentValue(labels[0], pattern, normalizeContent);
    if (adjacentValue) return adjacentValue;
  }

  let current: HTMLElement | null = labels[0];
  while (current) {
    const content = normalizeContent(textWithNodeBoundaries(current));
    const matches = [...content.matchAll(pattern)];
    const contentWithoutLabel = content.replace(label, '').replace(/[\s:：-]/g, '');
    const reachedBoundary = current === orderContainer;
    if (matches.length || contentWithoutLabel || reachedBoundary) {
      if (matches.length > 1) return { status: 'AMBIGUOUS' };
      return matches.length === 1
        ? { status: 'FOUND', value: matches[0] }
        : { status: 'INVALID' };
    }
    current = current.parentElement;
  }
  return { status: 'INVALID' };
}

function paymentAmountFromOrderCard(orderCard: HTMLElement): ParsedPlatformFact<number> {
  const amountPattern = /[¥￥]\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?)(?![\d.,])/g;
  const paidAmount = factMatchNearUniqueLabel(
    orderCard,
    '实付金额',
    amountPattern,
    paymentAmountContent,
  );
  const match = paidAmount.status === 'ABSENT' && orderStatusFromElement(orderCard).startsWith('已关闭')
    ? factMatchNearUniqueLabel(orderCard, '订单金额', amountPattern, paymentAmountContent)
    : paidAmount;
  if (match.status !== 'FOUND') return match;
  const value = Number(match.value[1].replaceAll(',', ''));
  return Number.isFinite(value) ? { status: 'FOUND', value } : { status: 'INVALID' };
}

function validShanghaiPaymentTime(parts: RegExpMatchArray) {
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
    || candidate.getUTCHours() !== hour
    || candidate.getUTCMinutes() !== minute
    || candidate.getUTCSeconds() !== second) return undefined;
  return `${parts[1]}-${parts[2]}-${parts[3]}T${parts[4]}:${parts[5]}:${parts[6]}+08:00`;
}

function paymentTimeFromOrderCard(orderCard: HTMLElement): ParsedPlatformFact<string> {
  const match = factMatchNearUniqueLabel(
    orderCard,
    '付款时间',
    /(?<!\d)(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?!\d)/g,
  );
  if (match.status !== 'FOUND') return match;
  const value = validShanghaiPaymentTime(match.value);
  return value ? { status: 'FOUND', value } : { status: 'INVALID' };
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
      const shopDisplayName = '';
      const activeOrderCard = firstActiveOrderCard(document);
      const platformOrderNo = activeOrderCard ? orderNoFromElement(activeOrderCard) : '';
      const orderStatus = activeOrderCard ? orderStatusFromElement(activeOrderCard) : '';
      const productFacts = activeOrderCard
        ? activeOrderProductFacts(activeOrderCard)
        : {
          productName: '',
          platformProductId: undefined,
          platformSkuId: undefined,
          ambiguous: false,
          productIdConflict: false,
          skuIdConflict: false,
        };
      const productName = productFacts.productName;
      const paymentAmountFact = activeOrderCard
        ? paymentAmountFromOrderCard(activeOrderCard)
        : { status: 'ABSENT' as const };
      const paymentTimeFact = activeOrderCard
        ? paymentTimeFromOrderCard(activeOrderCard)
        : { status: 'ABSENT' as const };
      const messages = all(scope, selectors.message)
        .map((element) => ({ direction: direction(element), text: element.textContent?.trim() || '' }))
        .filter((message) => message.text);
      if (!customerDisplayName) diagnostics.push('未识别客户昵称');
      if (!platformOrderNo) diagnostics.push('未识别平台订单号');
      if (!orderStatus) diagnostics.push('未识别订单状态');
      if (productFacts.ambiguous) diagnostics.push('当前订单商品存在歧义');
      if (!productFacts.ambiguous && !productName.trim()) diagnostics.push('未识别平台商品名称');
      if (productFacts.productIdConflict) diagnostics.push('当前订单商品ID存在冲突');
      if (productFacts.skuIdConflict) diagnostics.push('当前订单SKU ID存在冲突');
      if (paymentAmountFact.status === 'ABSENT') diagnostics.push('未识别实付金额');
      if (paymentAmountFact.status === 'AMBIGUOUS') diagnostics.push('实付金额存在歧义');
      if (paymentAmountFact.status === 'INVALID') diagnostics.push('实付金额格式无效');
      if (paymentTimeFact.status === 'ABSENT') diagnostics.push('未识别付款时间');
      if (paymentTimeFact.status === 'AMBIGUOUS') diagnostics.push('付款时间存在歧义');
      if (paymentTimeFact.status === 'INVALID') diagnostics.push('付款时间格式无效');
      if (!messages.length) diagnostics.push('未识别会话消息');
      return {
        supported: Boolean(root),
        readyForIntake: Boolean(
          root
          && customerDisplayName.trim()
          && activeOrderCard
          && platformOrderNo.trim()
        ),
        pageUrl,
        customerDisplayName,
        shopDisplayName,
        platformOrderNo,
        orderStatus,
        platformProductId: productFacts.platformProductId,
        platformSkuId: productFacts.platformSkuId,
        productName,
        paymentAmount: paymentAmountFact.status === 'FOUND' ? paymentAmountFact.value : undefined,
        paymentAt: paymentTimeFact.status === 'FOUND' ? paymentTimeFact.value : undefined,
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
      const activeOrderCard = firstActiveOrderCard(document);
      const currentOrderNo = activeOrderCard ? orderNoFromElement(activeOrderCard) : '';
      const currentCustomer = text(first(document, selectors.root) || document, selectors.customer);
      if ((expected.expectedOrderNo && currentOrderNo && currentOrderNo !== expected.expectedOrderNo)
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
      const activeOrderCard = firstActiveOrderCard(document);
      const currentOrderNo = activeOrderCard ? orderNoFromElement(activeOrderCard) : '';
      const currentCustomer = text(first(document, selectors.root) || document, selectors.customer);
      if ((expected?.expectedOrderNo && currentOrderNo && currentOrderNo !== expected.expectedOrderNo)
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

      const orderCard = firstActiveOrderCard(document);
      if (!orderCard) {
        return {
          ok: false,
          code: 'ORDER_CARD_NOT_FOUND',
          message: '未找到已展开的订单卡',
          stage: 'CONTEXT',
        };
      }
      const initialOrderNo = orderNoFromElement(orderCard);
      if (!initialOrderNo) {
        return {
          ok: false,
          code: 'CONTEXT_NOT_VERIFIED',
          message: '当前活动订单卡的订单号无法校验，未修改订单',
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
      if (!isIntakeEligibleOrderStatus(orderStatusFromElement(orderCard))) {
        return {
          ok: false,
          code: 'ORDER_STATUS_NOT_ELIGIBLE',
          message: '当前订单状态不支持备注和红旗操作',
          stage: 'CONTEXT',
        };
      }
      const currentBoundOrderCard = () => {
        const currentActiveCard = firstActiveOrderCard(document);
        return currentActiveCard
          && currentActiveCard.isConnected
          && isVisible(currentActiveCard)
          && orderNoFromElement(currentActiveCard) === expectedOrderNo
          && currentCustomer() === expectedCustomer
          && isIntakeEligibleOrderStatus(orderStatusFromElement(currentActiveCard))
          ? currentActiveCard
          : null;
      };
      // 保存前必须仍是最初绑定的 DOM 卡片，避免飞鸽切换订单时误操作。
      // 保存后飞鸽会重绘整张订单卡，验证阶段则按客户和订单号重新获取最新卡片。
      const hasSameBoundContext = () => currentBoundOrderCard() === orderCard;

      const edit = findOrderRemarkEntry(orderCard);
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
        remarkText = mergeOsOrderRemark(existing, input.remarkLines);
      } catch (error) {
        return {
          ok: false,
          code: 'ORDER_REMARK_INVALID',
          message: error instanceof Error ? error.message : '极享OS返回的订单备注格式不正确，请刷新后重试',
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
          message: '未找到语义明确的红色旗帜，请人工确认',
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
      if (!disablePlatformRemarkSignature(dialog)) {
        return {
          ok: false,
          code: 'ORDER_REMARK_SIGNATURE_NOT_DISABLED',
          message: '无法取消飞鸽自动追加备注人和时间，未保存',
          stage: 'REMARK',
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
          message: '备注写入后红色旗帜或保存控件已变化，未保存',
          stage: !greenAfterFill ? 'GREEN_FLAG' : 'SAVE',
          remarkText,
        };
      }
      if (!hasSameBoundContext()) {
        return {
          ok: false,
          code: 'CONTEXT_CHANGED',
          message: '点击红色旗帜前当前活动订单卡已变化，未保存订单修改',
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
          message: '选择红色旗帜后保存控件已变化，未保存',
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

      let verificationContextChanged = false;
      const verified = await waitForElement(document, () => {
        const latestOrderCard = currentBoundOrderCard();
        if (!latestOrderCard) {
          verificationContextChanged = true;
          return null;
        }
        if (verificationContextChanged) return null;
        const closed = !dialog.isConnected || !isVisible(dialog);
        return closed && hasSavedRemark(latestOrderCard, remarkText, existing)
          && isGreenActive(latestOrderCard)
          ? latestOrderCard
          : null;
      });
      if (!verified) {
        const latestOrderCard = currentBoundOrderCard();
        if (!latestOrderCard) {
          return {
            ok: false,
            code: 'CONTEXT_CHANGED',
            message: '保存后当前飞鸽客户或订单已切换，未报告成功',
            stage: 'CONTEXT',
            remarkText,
          };
        }
        let savedSummary = savedRemarkSummary(latestOrderCard);
        let remarkSaved = hasSavedRemarkValue(savedSummary, remarkText, existing);
        let redFlagSaved = isGreenActive(latestOrderCard);
        if (verificationContextChanged) {
          return {
            ok: false,
            code: 'CONTEXT_CHANGED',
            message: '保存后验证期间当前飞鸽客户或订单曾发生变化，未报告成功',
            stage: 'CONTEXT',
            remarkText,
          };
        }

        // 飞鸽订单卡可能只展示被省略的备注摘要和“旗帜 + 数量”，
        // 无法从卡片本身确认完整持久化结果。此时重新打开同一订单的
        // 备注抽屉，只读取完整备注和已选红旗，然后取消关闭，不再次写入。
        const originalDialogClosed = !dialog.isConnected || !isVisible(dialog);
        let verificationDialogClosed = true;
        if (originalDialogClosed && (!remarkSaved || !redFlagSaved)) {
          const verificationEdit = findOrderRemarkEntry(latestOrderCard);
          if (verificationEdit && currentBoundOrderCard() === latestOrderCard) {
            verificationEdit.click();
            const verificationDialog = await waitForElement(document, () => findUniqueRemarkDialog(document));
            if (verificationDialog && currentBoundOrderCard()) {
              verificationDialogClosed = false;
              await waitForElement(document, () => {
                const currentVerificationCard = currentBoundOrderCard();
                if (!currentVerificationCard) {
                  verificationContextChanged = true;
                  return null;
                }
                const currentDialog = findUniqueRemarkDialog(document);
                if (!currentDialog) return null;
                const persistedEditor = first(currentDialog, selectors.orderRemark);
                const persistedRedFlag = findUniqueGreenFlag(currentDialog);
                const persistedRemark = persistedEditor ? editableValue(persistedEditor) : '';
                if (persistedRemark) {
                  savedSummary = persistedRemark;
                  remarkSaved = hasSavedRemarkValue(persistedRemark, remarkText, existing);
                } else {
                  savedSummary = savedRemarkSummary(currentVerificationCard);
                  remarkSaved = hasSavedRemarkValue(savedSummary, remarkText, existing);
                }
                redFlagSaved = isGreenActive(currentVerificationCard)
                  || isSelectedFlagControl(persistedRedFlag);
                return remarkSaved && redFlagSaved ? currentDialog : null;
              }, 5000);

              const cancel = findButtonByText(verificationDialog, ['取消']);
              if (cancel && isVisible(cancel) && isEnabled(cancel)) {
                cancel.click();
                verificationDialogClosed = Boolean(await waitForElement(document, () => (
                  !verificationDialog.isConnected || !isVisible(verificationDialog)
                    ? latestOrderCard
                    : null
                ), 500));
              }
            }
          }
        }

        if (verificationContextChanged || !currentBoundOrderCard()) {
          return {
            ok: false,
            code: 'CONTEXT_CHANGED',
            message: '保存后复核时当前飞鸽客户或订单已切换，未报告成功',
            stage: 'CONTEXT',
            remarkText,
          };
        }

        const signatureAppended = hasNewPlatformRemarkSignature(existing, savedSummary);
        if (originalDialogClosed && verificationDialogClosed
          && remarkSaved && redFlagSaved && !signatureAppended) {
          return {
            ok: true,
            remarkText,
            remarkStatus: 'SUCCEEDED',
            greenFlagStatus: 'SUCCEEDED',
          };
        }
        return {
          ok: false,
          code: 'ORDER_COMPLETION_NOT_VERIFIED',
          message: signatureAppended
            ? '飞鸽自动追加了备注人和时间，请手工删除该签名并核对红色旗帜'
            : `页面验证结果：订单备注${remarkSaved ? '已成功' : '未确认'}，红色旗帜${redFlagSaved ? '已成功' : '未确认'}`,
          stage: 'SAVE',
          remarkText,
          remarkStatus: remarkSaved ? 'SUCCEEDED' : 'FAILED',
          greenFlagStatus: redFlagSaved ? 'SUCCEEDED' : 'FAILED',
        };
      }
      const finalOrderCard = currentBoundOrderCard();
      if (!finalOrderCard
        || !hasSavedRemark(finalOrderCard, remarkText, existing)
        || !isGreenActive(finalOrderCard)) {
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
