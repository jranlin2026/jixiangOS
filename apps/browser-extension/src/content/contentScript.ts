import { detectContact } from '../domain/contactDetection';
import type { PageCommand } from '../shared/contracts';
import { createDouyinFeigeAdapter } from './douyinFeigeAdapter';

chrome.runtime.onMessage.addListener((message: PageCommand, _sender, sendResponse) => {
  const adapter = createDouyinFeigeAdapter(document, location.href);
  if (message.type === 'COMPLETE_FEIGE_OS_ORDER') {
    void adapter.completeOsOrder(message.input)
      .then(sendResponse)
      .catch((error) => sendResponse({
        ok: false,
        code: 'ORDER_COMPLETION_FAILED',
        message: error instanceof Error ? error.message : '订单备注与红旗处理失败',
        stage: 'SAVE',
      }));
    return true;
  }
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
    sendResponse(adapter.fillReplyIfEmpty(String(message.text || ''), {
      expectedOrderNo: message.expectedOrderNo,
      expectedCustomerDisplayName: message.expectedCustomerDisplayName,
    }));
    return;
  }
  if (message.type === 'APPEND_FEIGE_REPLY') {
    sendResponse(adapter.appendReply(String(message.text || ''), {
      expectedOrderNo: message.expectedOrderNo,
      expectedCustomerDisplayName: message.expectedCustomerDisplayName,
    }));
    return;
  }
  if (message.type === 'SAVE_ORDER_REMARK') {
    sendResponse(adapter.fillOrderRemark(String(message.text || '')));
  }
});
