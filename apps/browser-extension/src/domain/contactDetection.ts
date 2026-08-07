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
const wechatPattern = /微信(?:号)?\s*(?:是|[:：])?\s*([a-zA-Z][-_a-zA-Z0-9]{5,19})/i;

export function detectContact(messages: BrowserChatMessage[]): DetectedContact | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.direction !== 'INBOUND') continue;
    const phone = message.text.match(phonePattern)?.[1]?.replace(/[\s-]/g, '');
    const wechat = message.text.match(wechatPattern)?.[1];
    if (phone || wechat) return { ...(phone ? { phone } : {}), ...(wechat ? { wechat } : {}), source: 'CHAT', messageIndex: index };
  }
  return null;
}
