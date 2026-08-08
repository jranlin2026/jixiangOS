import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createDouyinFeigeAdapter } from './douyinFeigeAdapter';

const dom = new JSDOM(`<!doctype html><html><body>
  <section data-jx-feige-conversation>
    <div data-jx-customer-name>张先生</div>
    <div data-jx-order-no>DY-20260808-001</div>
    <div data-jx-order-status>已付款</div>
    <div data-jx-product-name>AI口播智能体</div>
    <div data-jx-message data-direction="OUTBOUND">老师您好，请留下联系方式。</div>
    <div data-jx-message data-direction="INBOUND">我姓张，13800138000</div>
    <textarea data-jx-reply-input></textarea>
    <textarea data-jx-order-remark></textarea>
    <button data-jx-order-remark-save>保存备注</button>
  </section>
</body></html>`, { url: 'https://im.jinritemai.com/chat' });

const adapter = createDouyinFeigeAdapter(dom.window.document, dom.window.location.href);
const context = adapter.readContext();
assert.equal(context.supported, true);
assert.equal(context.customerDisplayName, '张先生');
assert.equal(context.platformOrderNo, 'DY-20260808-001');
assert.equal(context.orderStatus, '已付款');
assert.equal(context.productName, 'AI口播智能体');
assert.deepEqual(context.messages.map((message) => message.direction), ['OUTBOUND', 'INBOUND']);

assert.deepEqual(adapter.fillReply('已收到，我们尽快联系您。'), { ok: true });
assert.equal((dom.window.document.querySelector('[data-jx-reply-input]') as HTMLTextAreaElement).value, '已收到，我们尽快联系您。');
const guardedReply = dom.window.document.querySelector('[data-jx-reply-input]') as HTMLTextAreaElement;
guardedReply.value = '';
assert.deepEqual(adapter.fillReplyIfEmpty('错误会话话术', {
  expectedOrderNo: 'DY-OTHER', expectedCustomerDisplayName: '李先生',
}), { ok: false, code: 'CONTEXT_CHANGED', message: '当前飞鸽会话已切换，未填入话术' });
assert.equal(guardedReply.value, '');

let remarkSaved = false;
dom.window.document.querySelector('[data-jx-order-remark-save]')?.addEventListener('click', () => { remarkSaved = true; });
assert.deepEqual(adapter.fillOrderRemark('【极享OS已录入】张先生 138****8000'), { ok: true });
assert.equal((dom.window.document.querySelector('[data-jx-order-remark]') as HTMLTextAreaElement).value, '【极享OS已录入】张先生 138****8000');
assert.equal(remarkSaved, true, '订单备注只有点击保存后才能报告成功');

const realFeigeDom = new JSDOM(`<!doctype html><html><body>
  <main id="workspace-chat">
    <div id="topbar-left-info"><span>TK小学生</span><span>添加备注</span></div>
    <div data-id="message-in"><div class="leaveMessage messageNotMe"><pre><span>1117</span></pre></div></div>
    <div data-id="message-out"><div class="leaveMessage messageIsMe"><pre><span>1</span></pre></div></div>
    <textarea data-qa-id="qa-send-message-textarea" placeholder="发送给 TK小学生，使用Enter 发送消息"></textarea>
  </main>
  <section role="tabpanel">
    <div><div><div>N哥IP口播智能体</div></div><div>￥1299.00</div></div>
    <button>邀请下单</button>
  </section>
</body></html>`, { url: 'https://im.jinritemai.com/pc_seller_v2/main/workspace' });

const realAdapter = createDouyinFeigeAdapter(realFeigeDom.window.document, realFeigeDom.window.location.href);
const realContext = realAdapter.readContext();
assert.equal(realContext.supported, true);
assert.equal(realContext.customerDisplayName, 'TK小学生');
assert.equal(realContext.orderStatus, '');
assert.ok(realContext.diagnostics.includes('未识别订单状态'));
assert.equal(realContext.productName, 'N哥IP口播智能体');
assert.deepEqual(realContext.messages, [
  { direction: 'INBOUND', text: '1117' },
  { direction: 'OUTBOUND', text: '1' },
]);
assert.deepEqual(realAdapter.fillReply('测试话术'), { ok: true });
assert.equal(
  (realFeigeDom.window.document.querySelector('[data-qa-id="qa-send-message-textarea"]') as HTMLTextAreaElement).value,
  '测试话术',
);
const reply = realFeigeDom.window.document.querySelector('[data-qa-id="qa-send-message-textarea"]') as HTMLTextAreaElement;
reply.value = '客服正在输入';
assert.deepEqual(realAdapter.fillReplyIfEmpty('系统推荐'), { ok: true, filled: false, reason: 'NOT_EMPTY' });
assert.equal(reply.value, '客服正在输入');
reply.value = '';
assert.deepEqual(realAdapter.fillReplyIfEmpty('系统推荐'), { ok: true, filled: true });
assert.equal(reply.value, '系统推荐');

reply.value = '已有内容';
assert.deepEqual(realAdapter.appendReply('新话术', undefined as never), {
  ok: false, code: 'CONTEXT_NOT_VERIFIED', message: '未识别客户昵称，未追加话术',
});
assert.equal(reply.value, '已有内容');

assert.deepEqual(realAdapter.appendReply('新话术', {
  expectedCustomerDisplayName: 'TK小学生',
}), { ok: true });
assert.equal(reply.value, '已有内容\n新话术');

reply.value = '已有内容\n';
assert.deepEqual(realAdapter.appendReply('新话术', {
  expectedCustomerDisplayName: 'TK小学生',
}), { ok: true });
assert.equal(reply.value, '已有内容\n新话术');

console.log('douyin feige page adapter: ok');
