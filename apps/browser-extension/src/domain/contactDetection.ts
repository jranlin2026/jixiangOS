export type BrowserChatMessage = {
  direction: 'INBOUND' | 'OUTBOUND' | 'SYSTEM';
  text: string;
};

export type DetectedContact = {
  phone?: string;
  wechat?: string;
  source: 'CHAT';
  messageIndex: number;
};

const phonePattern = /(?<!\d)(?:\+?86[\s-]?)?(1[3-9](?:[\s-]?\d){9})(?!\d)/;
const wechatPattern = /微信(?:号)?\s*(?:是|为|[:：])?\s*([a-zA-Z][-_a-zA-Z0-9]{5,19})/i;
const standaloneWechatPattern = /^[a-zA-Z][-_a-zA-Z0-9]{5,19}$/;
const standaloneWechatLabelPattern = /^(?:我的)?微信(?:号)?(?:是|为)?[：:]?$/;

function standaloneWechatPair(
  messages: BrowserChatMessage[],
  index: number,
): { wechat: string; messageIndex: number } | null {
  const current = messages[index];
  if (current.direction !== 'INBOUND') return null;
  const currentText = current.text.trim();
  if (!standaloneWechatLabelPattern.test(currentText)) return null;
  for (const neighborIndex of [index - 1, index + 1]) {
    const neighbor = messages[neighborIndex];
    const candidate = neighbor?.text.trim() || '';
    if (neighbor?.direction === 'INBOUND' && standaloneWechatPattern.test(candidate)) {
      return { wechat: candidate, messageIndex: neighborIndex };
    }
  }

  return null;
}

export function detectContact(messages: BrowserChatMessage[]): DetectedContact | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.direction !== 'INBOUND') continue;
    const phone = message.text.match(phonePattern)?.[1]?.replace(/[\s-]/g, '');
    const wechat = message.text.match(wechatPattern)?.[1];
    if (phone || wechat) return { ...(phone ? { phone } : {}), ...(wechat ? { wechat } : {}), source: 'CHAT', messageIndex: index };
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const pair = standaloneWechatPair(messages, index);
    if (pair) return { ...pair, source: 'CHAT' };
  }
  return null;
}
