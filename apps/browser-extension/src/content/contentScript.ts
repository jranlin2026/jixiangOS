import { detectContact } from '../domain/contactDetection';
import type { PageCommand } from '../shared/contracts';
import { createDouyinFeigeAdapter } from './douyinFeigeAdapter';

chrome.runtime.onMessage.addListener((message: PageCommand, _sender, sendResponse) => {
  const adapter = createDouyinFeigeAdapter(document, location.href);
  if (message.type === 'READ_FEIGE_CONTEXT') {
    const context = adapter.readContext();
    sendResponse({ ok: true, context, detectedContact: detectContact(context.messages) });
    return;
  }
  if (message.type === 'FILL_FEIGE_REPLY') {
    sendResponse(adapter.fillReply(String(message.text || '')));
    return;
  }
  if (message.type === 'FILL_FEIGE_REPLY_IF_EMPTY') {
    sendResponse(adapter.fillReplyIfEmpty(String(message.text || '')));
    return;
  }
  if (message.type === 'SAVE_ORDER_REMARK') {
    sendResponse(adapter.fillOrderRemark(String(message.text || '')));
  }
});
