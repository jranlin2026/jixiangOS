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

const completionDom = new JSDOM(`<!doctype html><html><body>
  <main data-jx-feige-conversation>
    <span data-jx-customer-name>悠然一刻</span>
  </main>
  <section data-testid="order-card">
    <span data-testid="order-no">6925095897028853458</span>
    <button data-testid="edit-order-remark">修改</button>
    <div data-testid="order-remark-summary">#入EC\n#销售：小王</div>
    <span data-testid="current-order-flag" data-current-flag="red"></span>
  </section>
  <div role="dialog" aria-label="添加备注" hidden>
    <div>订单标记</div>
    <button aria-label="绿色旗帜" data-flag-color="green"></button>
    <textarea data-testid="order-remark-input"></textarea>
    <button data-testid="order-remark-save">保存</button>
  </div>
</body></html>`, { url: 'https://im.jinritemai.com/pc_seller_v2/main/workspace' });
const completionDocument = completionDom.window.document;
const completionDialog = completionDocument.querySelector('[role="dialog"]') as HTMLElement;
const completionSummary = completionDocument.querySelector('[data-testid="order-remark-summary"]') as HTMLElement;
const completionInput = completionDocument.querySelector('[data-testid="order-remark-input"]') as HTMLTextAreaElement;
const completionFlag = completionDocument.querySelector('[data-testid="current-order-flag"]') as HTMLElement;
let selectedFlag = '';
let completionSaveClicks = 0;
completionDocument.querySelector('[data-testid="edit-order-remark"]')?.addEventListener('click', () => {
  completionDialog.hidden = false;
  completionInput.value = completionSummary.textContent || '';
});
completionDocument.querySelector('[data-flag-color="green"]')?.addEventListener('click', () => {
  selectedFlag = 'green';
});
completionDocument.querySelector('[data-testid="order-remark-save"]')?.addEventListener('click', () => {
  completionSaveClicks += 1;
  completionSummary.textContent = completionInput.value;
  completionFlag.dataset.currentFlag = 'green';
  completionDialog.hidden = true;
});

const completionAdapter = createDouyinFeigeAdapter(completionDocument, completionDom.window.location.href);
const completionResult = await completionAdapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  phone: '13826459812',
});
assert.deepEqual(completionResult, {
  ok: true,
  remarkText: '#入EC\n#销售：小王\n#悠然一刻/13826459812\n#入OS',
  remarkStatus: 'SUCCEEDED',
  greenFlagStatus: 'SUCCEEDED',
});
assert.equal(selectedFlag, 'green');

const saveClicksBeforeMismatch = completionSaveClicks;
const mismatchedOrderResult = await completionAdapter.completeOsOrder({
  expectedOrderNo: '6925095897028853459',
  expectedCustomerDisplayName: '悠然一刻',
  phone: '13826459812',
});
assert.equal(mismatchedOrderResult.ok, false);
assert.equal(mismatchedOrderResult.ok ? '' : mismatchedOrderResult.code, 'CONTEXT_CHANGED');
assert.equal(completionSaveClicks, saveClicksBeforeMismatch, '订单号不匹配时不得点击保存');

function createIncompleteCompletionFixture(options: { green: boolean; save: boolean }) {
  const fixture = new JSDOM(`<!doctype html><html><body>
    <main data-jx-feige-conversation><span data-jx-customer-name>悠然一刻</span></main>
    <section data-testid="order-card">
      <span data-testid="order-no">6925095897028853458</span>
      <button data-testid="edit-order-remark">修改</button>
      <div data-testid="order-remark-summary">#入EC\n#销售：小王</div>
      <span data-testid="current-order-flag" data-current-flag="red"></span>
    </section>
    <div role="dialog" aria-label="添加备注" hidden>
      <div>订单标记</div>
      ${options.green ? '<button aria-label="绿色旗帜" data-flag-color="green"></button>' : '<button aria-label="红色旗帜" data-flag-color="red"></button>'}
      <textarea data-testid="order-remark-input"></textarea>
      ${options.save ? '<button data-testid="order-remark-save">保存</button>' : '<button>取消</button>'}
    </div>
  </body></html>`, { url: 'https://im.jinritemai.com/pc_seller_v2/main/workspace' });
  const fixtureDocument = fixture.window.document;
  const dialog = fixtureDocument.querySelector('[role="dialog"]') as HTMLElement;
  const summary = fixtureDocument.querySelector('[data-testid="order-remark-summary"]') as HTMLElement;
  const input = fixtureDocument.querySelector('[data-testid="order-remark-input"]') as HTMLTextAreaElement;
  let saveClicks = 0;
  let greenClicks = 0;
  fixtureDocument.querySelector('[data-testid="edit-order-remark"]')?.addEventListener('click', () => {
    dialog.hidden = false;
    input.value = summary.textContent || '';
  });
  fixtureDocument.querySelector('[data-flag-color="green"]')?.addEventListener('click', () => { greenClicks += 1; });
  fixtureDocument.querySelector('[data-testid="order-remark-save"]')?.addEventListener('click', () => { saveClicks += 1; });
  return {
    adapter: createDouyinFeigeAdapter(fixtureDocument, fixture.window.location.href),
    dialog,
    input,
    getSaveClicks: () => saveClicks,
    getGreenClicks: () => greenClicks,
  };
}

const missingGreenFixture = createIncompleteCompletionFixture({ green: false, save: true });
const missingGreenResult = await missingGreenFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  phone: '13826459812',
});
assert.equal(missingGreenResult.ok, false);
assert.equal(missingGreenResult.ok ? '' : missingGreenResult.code, 'GREEN_FLAG_NOT_FOUND');
assert.equal(missingGreenFixture.getSaveClicks(), 0, '缺少语义绿旗时不得点击保存');
assert.equal(missingGreenFixture.input.value, '#入EC\n#销售：小王', '缺少语义绿旗时不得改写备注');
assert.equal(missingGreenFixture.dialog.hidden, false, '校验失败后应保持弹窗打开');

const missingSaveFixture = createIncompleteCompletionFixture({ green: true, save: false });
const missingSaveResult = await missingSaveFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  phone: '13826459812',
});
assert.equal(missingSaveResult.ok, false);
assert.equal(missingSaveResult.ok ? '' : missingSaveResult.code, 'ORDER_REMARK_SAVE_NOT_FOUND');
assert.equal(missingSaveFixture.getSaveClicks(), 0, '缺少保存按钮时不得提交');
assert.equal(missingSaveFixture.getGreenClicks(), 0, '缺少保存按钮时不得切换旗帜');
assert.equal(missingSaveFixture.input.value, '#入EC\n#销售：小王', '缺少保存按钮时不得改写备注');
assert.equal(missingSaveFixture.dialog.hidden, false, '校验失败后应保持弹窗打开');

console.log('douyin feige page adapter: ok');
