import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createDouyinFeigeAdapter } from './douyinFeigeAdapter';

const backendRemarkLines: [string, string] = [
  '#悠然一刻/手机号：13826459812/微信号：wx_user88（对接：销售小王）',
  '#入OS（2026-08-08 21:00）',
];

const dom = new JSDOM(`<!doctype html><html><body>
  <section data-jx-feige-conversation>
    <div data-jx-customer-name>张先生</div>
    <section data-testid="order-card">
      <div data-jx-order-no>DY-20260808-001</div>
      <div data-jx-order-status>已付款</div>
      <div data-jx-product-name>AI口播智能体</div>
    </section>
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
assert.equal(context.readyForIntake, true, '昵称和唯一订单号齐全即可入OS，金额和付款时间不阻断');
assert.ok(context.diagnostics.includes('未识别实付金额'));
assert.ok(context.diagnostics.includes('未识别付款时间'));
assert.equal(context.customerDisplayName, '张先生');
assert.equal(context.platformOrderNo, 'DY-20260808-001');
assert.equal(context.orderStatus, '已付款');
assert.equal(context.productName, 'AI口播智能体');
assert.deepEqual(context.messages.map((message) => message.direction), ['OUTBOUND', 'INBOUND']);

const realOrderFactsDom = new JSDOM(`<!doctype html><html><body>
  <main data-jx-feige-conversation>
    <span data-jx-customer-name>海盗船长</span>
  </main>
  <div data-testid="shop-name">极享智能体</div>
  <div role="button" aria-expanded="true" data-testid="order-card">
    <span data-jx-order-status>已发货</span>
    <span data-jx-order-no>6955070819967571696</span>
    <span data-btm="d5834" data-product-id="DY-TAOJIN-100">淘金AI 多模态创作智能体 读书卡</span>
    <div>实付金额 <strong>¥299.00</strong></div>
    <div>付款时间 <strong>2026/08/08 19:34:20 (抖音月付)</strong></div>
  </div>
</body></html>`, { url: 'https://im.jinritemai.com/pc_seller_v2/main/workspace' });
const realOrderFacts = createDouyinFeigeAdapter(
  realOrderFactsDom.window.document,
  realOrderFactsDom.window.location.href,
).readContext();
assert.equal(realOrderFacts.shopDisplayName, '', '店铺只使用人工绑定，不再读取页面店铺名称');
assert.equal(realOrderFacts.productName, '淘金AI 多模态创作智能体 读书卡');
assert.equal(realOrderFacts.platformProductId, 'DY-TAOJIN-100');
assert.equal(realOrderFacts.platformSkuId, undefined);
assert.equal(realOrderFacts.paymentAmount, 299, '实付金额必须保留平台展示事实');
assert.equal(realOrderFacts.paymentAt, '2026-08-08T19:34:20+08:00');
assert.equal(realOrderFacts.readyForIntake, true, '昵称和唯一订单号齐全即可入库');

const ancestorProductIdentityDom = new JSDOM(`<!doctype html><html><body>
  <main data-jx-feige-conversation><span data-jx-customer-name>海盗船长</span></main>
  <section data-testid="order-card">
    <span data-jx-order-status>已付款</span><span data-jx-order-no>ORDER-ANCESTOR-ID</span>
    <div data-item-id="ITEM-100" data-sku-id="SKU-RED">
      <span data-btm="d5834">淘金AI 红色读书卡</span>
    </div>
  </section>
</body></html>`, { url: 'https://im.jinritemai.com/pc_seller_v2/main/workspace' });
const ancestorProductIdentity = createDouyinFeigeAdapter(
  ancestorProductIdentityDom.window.document,
  ancestorProductIdentityDom.window.location.href,
).readContext();
assert.equal(ancestorProductIdentity.platformProductId, 'ITEM-100', '商品 ID 可从当前商品节点的稳定属性祖先读取');
assert.equal(ancestorProductIdentity.platformSkuId, 'SKU-RED', 'SKU 只从当前商品节点或祖先读取');

const siblingPaymentFacts = readOrderFactsFixture(`
  <section data-testid="order-card">
    <span data-jx-order-status>已付款</span><span data-jx-order-no>ORDER-SIBLING-PAYMENT</span>
    <span data-btm="d5834">淘金AI</span>
    <div><span>实付金额</span><strong>¥299.00</strong></div>
    <div><span>付款时间</span><strong>2026/08/08 19:34:20 (抖音月付)</strong></div>
  </section>
`);
assert.equal(siblingPaymentFacts.paymentAmount, 299, '实付值是语义标签的同级节点时仍必须读取');
assert.equal(siblingPaymentFacts.paymentAt, '2026-08-08T19:34:20+08:00', '付款时间是标签同级节点时仍必须读取');
assert.equal(siblingPaymentFacts.shopDisplayName, '', '飞鸽页面店铺名不再参与识别');
assert.equal(siblingPaymentFacts.readyForIntake, true, '订单事实完整时不应因页面店铺名缺失而阻止人工绑定入库');

const paidAmountWithDiscount = readOrderFactsFixture(`
  <section data-testid="order-card">
    <span data-jx-order-status>已发货</span><span data-jx-order-no>ORDER-PAID-WITH-DISCOUNT</span>
    <span data-btm="d5834">极享口播智能体 读书卡</span>
    <div class="payment-row">
      <span>实付金额</span><strong>¥999.00</strong>
      <span>优惠</span><del>¥300.00</del>
    </div>
    <div><span>付款时间</span><strong>2026/08/09 12:22:46 (支付宝)</strong></div>
  </section>
`);
assert.equal(paidAmountWithDiscount.paymentAmount, 999, '实付金额同行展示优惠金额时，应读取紧邻实付标签的金额');
assert.equal(paidAmountWithDiscount.paymentAt, '2026-08-09T12:22:46+08:00');

const ambiguousPaymentRows = readOrderFactsFixture(`
  <section data-testid="order-card">
    <span data-jx-order-status>已付款</span><span data-jx-order-no>ORDER-AMBIGUOUS-PAYMENT-ROWS</span>
    <span data-btm="d5834">淘金AI</span>
    <div><span>实付金额</span><strong>¥299.00</strong></div>
    <div><span>实付金额</span><strong>¥399.00</strong></div>
    <div><span>付款时间</span><strong>2026/08/08 19:34:20</strong></div>
    <div><span>付款时间</span><strong>2026/08/08 20:34:20</strong></div>
  </section>
`);
assert.equal(ambiguousPaymentRows.paymentAmount, undefined, '多个实付语义行时必须失败关闭');
assert.ok(ambiguousPaymentRows.diagnostics.includes('实付金额存在歧义'));
assert.equal(ambiguousPaymentRows.paymentAt, undefined, '多个付款时间语义行时必须失败关闭');
assert.ok(ambiguousPaymentRows.diagnostics.includes('付款时间存在歧义'));
assert.equal(ambiguousPaymentRows.readyForIntake, true, '付款信息歧义只影响可选快照，不阻断入OS');

const conflictingProductIdentity = readOrderFactsFixture(`
  <section data-testid="order-card">
    <span data-jx-order-status>已付款</span><span data-jx-order-no>ORDER-CONFLICTING-PRODUCT-ID</span>
    <div data-item-id="ITEM-ANCESTOR" data-sku-id="SKU-ANCESTOR">
      <span data-btm="d5834" data-product-id="PRODUCT-NODE" data-sku-id="SKU-NODE">淘金AI</span>
    </div>
  </section>
`);
assert.equal(conflictingProductIdentity.platformProductId, undefined, '商品节点与祖先的稳定商品 ID 冲突时不得选首值');
assert.ok(conflictingProductIdentity.diagnostics.includes('当前订单商品ID存在冲突'));
assert.equal(conflictingProductIdentity.platformSkuId, undefined, '商品节点与祖先的 SKU ID 冲突时不得选首值');
assert.ok(conflictingProductIdentity.diagnostics.includes('当前订单SKU ID存在冲突'));
assert.equal(conflictingProductIdentity.readyForIntake, true, '商品身份冲突时不猜测商品，但仍允许客户入OS');

function readOrderFactsFixture(orderMarkup: string, pageMarkup = '') {
  const fixture = new JSDOM(`<!doctype html><html><body>
    <main data-jx-feige-conversation><span data-jx-customer-name>顾客昵称</span></main>
    ${pageMarkup}
    ${orderMarkup}
  </body></html>`, { url: 'https://im.jinritemai.com/pc_seller_v2/main/workspace' });
  return createDouyinFeigeAdapter(fixture.window.document, fixture.window.location.href).readContext();
}

const ambiguousPaymentAmount = readOrderFactsFixture(`
  <section data-testid="order-card">
    <span data-jx-order-status>已付款</span><span data-jx-order-no>ORDER-MULTI-AMOUNT</span>
    <span data-btm="d5834">淘金AI</span>
    <div>实付金额 <strong>¥299.00</strong><del>¥399.00</del></div>
  </section>
`);
assert.equal(ambiguousPaymentAmount.paymentAmount, undefined, '实付标签附近多个金额时必须拒绝猜测');
assert.ok(ambiguousPaymentAmount.diagnostics.includes('实付金额存在歧义'));

const ambiguousPaymentTime = readOrderFactsFixture(`
  <section data-testid="order-card">
    <span data-jx-order-status>已付款</span><span data-jx-order-no>ORDER-MULTI-TIME</span>
    <span data-btm="d5834">淘金AI</span>
    <div>付款时间 <strong>2026/08/08 19:34:20</strong><del>2026/08/08 19:35:20</del></div>
  </section>
`);
assert.equal(ambiguousPaymentTime.paymentAt, undefined, '付款标签附近多个时间时必须拒绝猜测');
assert.ok(ambiguousPaymentTime.diagnostics.includes('付款时间存在歧义'));

const invalidPaymentFacts = readOrderFactsFixture(`
  <section data-testid="order-card">
    <span data-jx-order-status>已付款</span><span data-jx-order-no>ORDER-INVALID-PAYMENT</span>
    <span data-btm="d5834">淘金AI</span>
    <div>实付金额 <strong>299.00</strong></div>
    <div>付款时间 <strong>2026/02/30 19:34:20</strong></div>
  </section>
`);
assert.equal(invalidPaymentFacts.paymentAmount, undefined, '无人民币符号的数字不得当作实付金额');
assert.ok(invalidPaymentFacts.diagnostics.includes('实付金额格式无效'));
assert.equal(invalidPaymentFacts.paymentAt, undefined, '无效日历日期不得转换为付款时间');
assert.ok(invalidPaymentFacts.diagnostics.includes('付款时间格式无效'));
assert.equal(invalidPaymentFacts.readyForIntake, true);

const missingProductName = readOrderFactsFixture(`
  <section data-testid="order-card">
    <span data-jx-order-status>已付款</span><span data-jx-order-no>ORDER-MISSING-PRODUCT</span>
    <div>实付金额 <strong>¥0.00</strong></div>
    <div>付款时间 <strong>2026/08/08 19:34:20</strong></div>
  </section>
`);
assert.equal(missingProductName.readyForIntake, true, '未识别商品不应阻断客户入OS');
assert.ok(missingProductName.diagnostics.includes('未识别平台商品名称'));
assert.equal(missingProductName.paymentAmount, 0, '实付为0是有效平台事实');

const latestOrderFacts = readOrderFactsFixture(`
  <section data-testid="order-card">
    <span data-jx-order-status>已付款</span><span data-jx-order-no>ORDER-A</span>
    <span data-btm="d5834" data-product-id="PRODUCT-A">商品A</span>
    <div>实付金额 <strong>¥299.00</strong></div>
    <div>付款时间 <strong>2026/08/08 19:34:20</strong></div>
  </section>
  <section data-testid="order-card">
    <span data-jx-order-status>已付款</span><span data-jx-order-no>ORDER-B</span>
    <span data-btm="d5834" data-product-id="PRODUCT-B">商品B</span>
    <div>实付金额 <strong>¥399.00</strong></div>
    <div>付款时间 <strong>2026/08/08 20:34:20</strong></div>
  </section>
`, '<div data-testid="shop-name">极享智能体</div><div data-jx-product-name>文档外的商品</div>');
assert.equal(latestOrderFacts.platformOrderNo, 'ORDER-A', '多张展开订单卡应按页面顺序识别第一张订单');
assert.equal(latestOrderFacts.orderStatus, '已付款');
assert.equal(latestOrderFacts.productName, '商品A', '商品必须来自页面顺序中的第一张展开订单卡');
assert.equal(latestOrderFacts.platformProductId, 'PRODUCT-A');
assert.equal(latestOrderFacts.platformSkuId, undefined);
assert.equal(latestOrderFacts.paymentAmount, 299);
assert.equal(latestOrderFacts.paymentAt, '2026-08-08T19:34:20+08:00');
assert.equal(latestOrderFacts.diagnostics.includes('当前存在多张可见活动订单卡'), false);

const expandedLatestOrderFacts = readOrderFactsFixture(`
  <section data-testid="order-card">
    <span data-jx-order-status>已发货</span><span data-jx-order-no>ORDER-LATEST</span>
    <span data-btm="d5834">最新展开订单</span>
    <div>实付金额 <strong>¥299.00</strong></div>
    <div>付款时间 <strong>2026/08/09 19:07:02</strong></div>
  </section>
  <section data-testid="order-card">
    <span data-jx-order-status>已关闭（售后完成）</span><span data-jx-order-no>ORDER-COLLAPSED</span>
  </section>
`);
assert.equal(
  expandedLatestOrderFacts.platformOrderNo,
  'ORDER-LATEST',
  '其他折叠订单缺少付款时间时，应选择唯一带付款时间的展开最新订单',
);
assert.equal(expandedLatestOrderFacts.productName, '最新展开订单');
assert.equal(expandedLatestOrderFacts.paymentAmount, 299);

function createMultipleExpandedOrdersFixture() {
  const fixture = new JSDOM(`<!doctype html><html><body>
    <main data-jx-feige-conversation><span data-jx-customer-name>多订单客户</span></main>
    <div class="ecom-collapse-item ecom-collapse-item-active" data-order-position="1">
      <div role="button" aria-expanded="true" class="ecom-collapse-header">
        <span data-testid="order-status">已发货</span><span data-testid="order-no">ORDER-FIRST</span>
      </div>
      <span data-btm="d5834">第一张展开订单</span>
      <div>实付金额 <strong>¥299.00</strong></div>
      <div>付款时间 <strong>2026/08/08 19:07:02</strong></div>
    </div>
    <div class="ecom-collapse-item" data-order-position="2">
      <div role="button" aria-expanded="false" class="ecom-collapse-header">
        <span data-testid="order-status">已关闭</span><span data-testid="order-no">ORDER-SECOND</span>
      </div>
    </div>
    <div class="ecom-collapse-item ecom-collapse-item-active" data-order-position="3">
      <div role="button" aria-expanded="true" class="ecom-collapse-header">
        <span data-testid="order-status">已付款</span><span data-testid="order-no">ORDER-THIRD</span>
      </div>
      <span data-btm="d5834">第三张展开订单</span>
      <div>实付金额 <strong>¥999.00</strong></div>
      <div>付款时间 <strong>2026/08/09 19:07:02</strong></div>
    </div>
  </body></html>`, { url: 'https://im.jinritemai.com/pc_seller_v2/main/workspace' });
  const fixtureDocument = fixture.window.document;
  return {
    adapter: createDouyinFeigeAdapter(fixtureDocument, fixture.window.location.href),
    collapseFirstOrder() {
      const firstCard = fixtureDocument.querySelector('[data-order-position="1"]') as HTMLElement;
      firstCard.classList.remove('ecom-collapse-item-active');
      firstCard.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
    },
  };
}

const multipleExpandedOrdersFixture = createMultipleExpandedOrdersFixture();
const firstExpandedOrderContext = multipleExpandedOrdersFixture.adapter.readContext();
assert.equal(
  firstExpandedOrderContext.platformOrderNo,
  'ORDER-FIRST',
  '多张订单展开时，应按页面顺序读取第一张展开订单卡，而不是付款时间最新的订单',
);
assert.equal(firstExpandedOrderContext.productName, '第一张展开订单');
assert.equal(firstExpandedOrderContext.paymentAmount, 299);
multipleExpandedOrdersFixture.collapseFirstOrder();
const nextExpandedOrderContext = multipleExpandedOrdersFixture.adapter.readContext();
assert.equal(
  nextExpandedOrderContext.platformOrderNo,
  'ORDER-THIRD',
  '第一张订单折叠后，应读取页面顺序中的下一张展开订单卡',
);
assert.equal(nextExpandedOrderContext.productName, '第三张展开订单');
assert.equal(nextExpandedOrderContext.paymentAmount, 999);

const unprovenShop = readOrderFactsFixture(`
  <section data-testid="order-card">
    <span data-jx-order-status>已付款</span><span data-jx-order-no>ORDER-NO-SHOP</span>
    <span data-btm="d5834">商品品牌</span>
  </section>
`, '<div data-testid="operator-name">客服小王</div>');
assert.equal(unprovenShop.shopDisplayName, '', '客户、商品和客服姓名都不能充当店铺名');
assert.equal(unprovenShop.diagnostics.includes('未识别页面店铺'), false, '页面店铺不再属于识别诊断');

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
assert.equal(realContext.productName, '', '没有唯一活动订单卡时，推荐商品不得填入订单商品事实');
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

const staleDocumentContextDom = new JSDOM(`<!doctype html><html><body>
  <main data-jx-feige-conversation><span data-jx-customer-name>悠然一刻</span></main>
  <aside>
    <span data-jx-order-no>STALE-ORDER</span>
    <span data-jx-order-status>已付款</span>
  </aside>
  <section data-testid="order-card" hidden>
    <span data-testid="order-no">COLLAPSED-ORDER</span>
    <span data-testid="order-status">已付款</span>
  </section>
  <section data-testid="order-card">
    <span data-testid="order-no">ACTIVE-ORDER</span>
    <span data-testid="order-status">待付款</span>
  </section>
</body></html>`, { url: 'https://im.jinritemai.com/pc_seller_v2/main/workspace' });
const staleDocumentContext = createDouyinFeigeAdapter(
  staleDocumentContextDom.window.document,
  staleDocumentContextDom.window.location.href,
).readContext();
assert.equal(staleDocumentContext.platformOrderNo, 'ACTIVE-ORDER', '订单号必须来自唯一可见活动订单卡');
assert.equal(staleDocumentContext.orderStatus, '待付款', '订单状态必须与订单号来自同一张卡');

const ambiguousContextDom = new JSDOM(`<!doctype html><html><body>
  <main data-jx-feige-conversation><span data-jx-customer-name>悠然一刻</span></main>
  <section data-testid="order-card"><span data-testid="order-no">ORDER-A</span><span data-testid="order-status">已付款</span></section>
  <section data-testid="order-card"><span data-testid="order-no">ORDER-B</span><span data-testid="order-status">已付款</span></section>
</body></html>`, { url: 'https://im.jinritemai.com/pc_seller_v2/main/workspace' });
const ambiguousContext = createDouyinFeigeAdapter(
  ambiguousContextDom.window.document,
  ambiguousContextDom.window.location.href,
).readContext();
assert.equal(ambiguousContext.platformOrderNo, 'ORDER-A', '多张展开订单卡时应读取页面顺序中的第一张');
assert.equal(ambiguousContext.orderStatus, '已付款', '订单状态必须来自同一张首个展开订单卡');

function createUnsafeOrderBindingFixture(cards: string, staleDocumentMarkup = '') {
  const fixture = new JSDOM(`<!doctype html><html><body>
    <main data-jx-feige-conversation><span data-jx-customer-name>悠然一刻</span></main>
    ${staleDocumentMarkup}
    ${cards}
    <div role="dialog" aria-label="添加备注" hidden>
      <div>订单标记</div>
      <button aria-label="红色旗帜" data-flag-color="red"></button>
      <textarea data-testid="order-remark-input"></textarea>
      <button data-testid="order-remark-save">保存</button>
    </div>
  </body></html>`, { url: 'https://im.jinritemai.com/pc_seller_v2/main/workspace' });
  const document = fixture.window.document;
  const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
  const input = document.querySelector('[data-testid="order-remark-input"]') as HTMLTextAreaElement;
  let editClicks = 0;
  let greenClicks = 0;
  let saveClicks = 0;
  document.querySelectorAll('[data-testid="edit-order-remark"]').forEach((edit) => {
    edit.addEventListener('click', () => {
      editClicks += 1;
      const card = edit.closest('[data-testid="order-card"]') as HTMLElement;
      input.value = (card.querySelector('[data-testid="order-remark-summary"]') as HTMLElement).textContent || '';
      dialog.hidden = false;
    });
  });
  document.querySelector('[data-flag-color="red"]')?.addEventListener('click', () => { greenClicks += 1; });
  document.querySelector('[data-testid="order-remark-save"]')?.addEventListener('click', () => { saveClicks += 1; });
  return {
    adapter: createDouyinFeigeAdapter(document, fixture.window.location.href),
    getEditClicks: () => editClicks,
    getGreenClicks: () => greenClicks,
    getSaveClicks: () => saveClicks,
  };
}

const collapsedStaleFixture = createUnsafeOrderBindingFixture(`
  <section data-testid="order-card" hidden>
    <span data-testid="order-no">STALE-ORDER</span><span data-testid="order-status">已付款</span>
    <button data-testid="edit-order-remark">修改</button><div data-testid="order-remark-summary">旧备注</div>
    <span data-current-flag="red"></span>
  </section>
  <section data-testid="order-card">
    <span data-testid="order-no">ACTIVE-ORDER</span><span data-testid="order-status">待付款</span>
    <button data-testid="edit-order-remark">修改</button><div data-testid="order-remark-summary">当前备注</div>
    <span data-current-flag="red"></span>
  </section>
`, '<span data-jx-order-no>STALE-ORDER</span><span data-jx-order-status>已付款</span>');
const collapsedStaleResult = await collapsedStaleFixture.adapter.completeOsOrder({
  expectedOrderNo: 'STALE-ORDER',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(collapsedStaleResult.ok, false, '文档旧值和折叠卡片不得通过活动订单校验');
assert.equal(collapsedStaleFixture.getEditClicks(), 0, '折叠或非当前订单的编辑入口不得点击');
assert.equal(collapsedStaleFixture.getGreenClicks(), 0);
assert.equal(collapsedStaleFixture.getSaveClicks(), 0);

const ambiguousCardsFixture = createUnsafeOrderBindingFixture(`
  <section data-testid="order-card">
    <span data-testid="order-no">ORDER-A</span><span data-testid="order-status">已付款</span>
    <button data-testid="edit-order-remark">修改</button><div data-testid="order-remark-summary">A</div><span data-current-flag="red"></span>
  </section>
  <section data-testid="order-card">
    <span data-testid="order-no">ORDER-B</span><span data-testid="order-status">已付款</span>
    <button data-testid="edit-order-remark">修改</button><div data-testid="order-remark-summary">B</div><span data-current-flag="red"></span>
  </section>
`);
const ambiguousCardsResult = await ambiguousCardsFixture.adapter.completeOsOrder({
  expectedOrderNo: 'ORDER-A',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(ambiguousCardsResult.ok, false, '平台未返回保存结果时仍不得误报整体成功');
assert.equal(ambiguousCardsFixture.getEditClicks(), 1, '多张展开订单卡时只操作页面顺序中的第一张');
assert.equal(ambiguousCardsFixture.getGreenClicks(), 1);
assert.equal(ambiguousCardsFixture.getSaveClicks(), 1);

const nestedAmbiguousCardsFixture = createUnsafeOrderBindingFixture(`
  <section data-testid="order-card">
    <section data-testid="order-card">
      <span data-testid="order-no">6925095897028853458</span><span data-testid="order-status">已付款</span>
      <button data-testid="edit-order-remark">修改</button><div data-testid="order-remark-summary">A</div><span data-current-flag="red"></span>
    </section>
    <section data-testid="order-card">
      <span data-testid="order-no">6925095897028853459</span><span data-testid="order-status">已付款</span>
      <button data-testid="edit-order-remark">修改</button><div data-testid="order-remark-summary">B</div><span data-current-flag="red"></span>
    </section>
  </section>
`);
const nestedAmbiguousContext = nestedAmbiguousCardsFixture.adapter.readContext();
assert.equal(nestedAmbiguousContext.platformOrderNo, '6925095897028853458', '嵌套订单包装仍按页面顺序读取第一张展开子订单卡');
assert.equal(nestedAmbiguousContext.orderStatus, '已付款');
const nestedAmbiguousCardsResult = await nestedAmbiguousCardsFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(nestedAmbiguousCardsResult.ok, false, '平台未返回保存结果时仍不得误报整体成功');
assert.equal(nestedAmbiguousCardsFixture.getEditClicks(), 1, '嵌套多订单卡只操作第一张展开子订单卡');
assert.equal(nestedAmbiguousCardsFixture.getGreenClicks(), 1);
assert.equal(nestedAmbiguousCardsFixture.getSaveClicks(), 1);

const mixedSemanticCardsFixture = createUnsafeOrderBindingFixture(`
  <section data-testid="order-card">
    <span data-testid="order-no">ORDER-A</span><span data-testid="order-status">已付款</span>
    <button data-testid="edit-order-remark">修改</button><div data-testid="order-remark-summary">A</div><span data-current-flag="red"></span>
  </section>
  <section role="button" aria-expanded="true">
    <span data-testid="order-no">ORDER-B</span><span data-testid="order-status">已付款</span>
    <button>修改</button><div data-testid="order-remark-summary">B</div><span data-current-flag="red"></span>
  </section>
`);
const mixedSemanticCardsResult = await mixedSemanticCardsFixture.adapter.completeOsOrder({
  expectedOrderNo: 'ORDER-A',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(mixedSemanticCardsResult.ok, false, '平台未返回保存结果时仍不得误报整体成功');
assert.equal(mixedSemanticCardsFixture.getEditClicks(), 1, '不同语义订单卡并存时仍按DOM顺序操作第一张');
assert.equal(mixedSemanticCardsFixture.getGreenClicks(), 1);
assert.equal(mixedSemanticCardsFixture.getSaveClicks(), 1);

const completionDom = new JSDOM(`<!doctype html><html><body>
  <main data-jx-feige-conversation>
    <span data-jx-customer-name>悠然一刻</span>
  </main>
  <section data-testid="order-card">
    <span data-testid="order-no">6925095897028853458</span>
    <span data-testid="order-status">已付款</span>
    <button data-testid="edit-order-remark">修改</button>
    <div data-testid="order-remark-summary">#入EC\n#销售：小王</div>
    <span data-testid="current-order-flag" data-current-flag="red"></span>
  </section>
  <div role="dialog" aria-label="添加备注" hidden>
    <div>订单标记</div>
    <button aria-label="红色旗帜" data-flag-color="red"></button>
    <textarea data-testid="order-remark-input"></textarea>
    <label><input data-testid="remark-signature" type="checkbox" checked />自动添加备注人和时间到末尾</label>
    <button data-testid="order-remark-save">保存</button>
  </div>
</body></html>`, { url: 'https://im.jinritemai.com/pc_seller_v2/main/workspace' });
const completionDocument = completionDom.window.document;
const completionDialog = completionDocument.querySelector('[role="dialog"]') as HTMLElement;
const completionSummary = completionDocument.querySelector('[data-testid="order-remark-summary"]') as HTMLElement;
const completionInput = completionDocument.querySelector('[data-testid="order-remark-input"]') as HTMLTextAreaElement;
const completionFlag = completionDocument.querySelector('[data-testid="current-order-flag"]') as HTMLElement;
const completionSignature = completionDocument.querySelector('[data-testid="remark-signature"]') as HTMLInputElement;
let selectedFlag = '';
let completionSaveClicks = 0;
completionDocument.querySelector('[data-testid="edit-order-remark"]')?.addEventListener('click', () => {
  completionDialog.hidden = false;
  completionInput.value = completionSummary.textContent || '';
});
completionDocument.querySelector('[data-flag-color="red"]')?.addEventListener('click', () => {
  selectedFlag = 'red';
});
completionDocument.querySelector('[data-testid="order-remark-save"]')?.addEventListener('click', () => {
  completionSaveClicks += 1;
  completionSummary.textContent = completionInput.value;
  completionFlag.dataset.currentFlag = 'red';
  completionDialog.hidden = true;
});

const completionAdapter = createDouyinFeigeAdapter(completionDocument, completionDom.window.location.href);
const completionResult = await completionAdapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.deepEqual(completionResult, {
  ok: true,
  remarkText: `#入EC\n#销售：小王\n${backendRemarkLines.join('\n')}`,
  remarkStatus: 'SUCCEEDED',
  greenFlagStatus: 'SUCCEEDED',
});
assert.equal(selectedFlag, 'red');
assert.equal(completionSignature.checked, false, '插件保存前必须取消飞鸽自动追加备注人和时间');

const repeatedCompletionResult = await completionAdapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.deepEqual(repeatedCompletionResult, completionResult, '重复执行应返回同一份幂等备注');
assert.equal(completionSummary.textContent, `#入EC\n#销售：小王\n${backendRemarkLines.join('\n')}`);
assert.equal(completionSummary.textContent?.split('\n').filter((line) => line === backendRemarkLines[0]).length, 1);
assert.equal(completionSummary.textContent?.split('\n').filter((line) => line === backendRemarkLines[1]).length, 1);

const saveClicksBeforeMismatch = completionSaveClicks;
const mismatchedOrderResult = await completionAdapter.completeOsOrder({
  expectedOrderNo: '6925095897028853459',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(mismatchedOrderResult.ok, false);
assert.equal(mismatchedOrderResult.ok ? '' : mismatchedOrderResult.code, 'CONTEXT_CHANGED');
assert.equal(completionSaveClicks, saveClicksBeforeMismatch, '订单号不匹配时不得点击保存');

function createIncompleteCompletionFixture(options: { green: boolean; save: boolean }) {
  const fixture = new JSDOM(`<!doctype html><html><body>
    <main data-jx-feige-conversation><span data-jx-customer-name>悠然一刻</span></main>
    <section data-testid="order-card">
      <span data-testid="order-no">6925095897028853458</span>
      <span data-testid="order-status">已付款</span>
      <button data-testid="edit-order-remark">修改</button>
      <div data-testid="order-remark-summary">#入EC\n#销售：小王</div>
      <span data-testid="current-order-flag" data-current-flag="red"></span>
    </section>
    <div role="dialog" aria-label="添加备注" hidden>
      <div>订单标记</div>
      ${options.green ? '<button aria-label="红色旗帜" data-flag-color="red"></button>' : '<button aria-label="橙色旗帜" data-flag-color="orange"></button>'}
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
  fixtureDocument.querySelector('[data-flag-color="red"]')?.addEventListener('click', () => { greenClicks += 1; });
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
  remarkLines: backendRemarkLines,
});
assert.equal(missingGreenResult.ok, false);
assert.equal(missingGreenResult.ok ? '' : missingGreenResult.code, 'GREEN_FLAG_NOT_FOUND');
assert.equal(missingGreenFixture.getSaveClicks(), 0, '缺少语义红旗时不得点击保存');
assert.equal(missingGreenFixture.input.value, '#入EC\n#销售：小王', '缺少语义红旗时不得改写备注');
assert.equal(missingGreenFixture.dialog.hidden, false, '校验失败后应保持弹窗打开');

const missingSaveFixture = createIncompleteCompletionFixture({ green: true, save: false });
const missingSaveResult = await missingSaveFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(missingSaveResult.ok, false);
assert.equal(missingSaveResult.ok ? '' : missingSaveResult.code, 'ORDER_REMARK_SAVE_NOT_FOUND');
assert.equal(missingSaveFixture.getSaveClicks(), 0, '缺少保存按钮时不得提交');
assert.equal(missingSaveFixture.getGreenClicks(), 0, '缺少保存按钮时不得切换旗帜');
assert.equal(missingSaveFixture.input.value, '#入EC\n#销售：小王', '缺少保存按钮时不得改写备注');
assert.equal(missingSaveFixture.dialog.hidden, false, '校验失败后应保持弹窗打开');

function createGuardBoundaryFixture(options: {
  onInput?: (document: Document) => void;
  onChange?: (document: Document) => void;
  onGreenClick?: (document: Document) => void;
  onSaveClick?: (document: Document) => void;
  savedRemark?: (remarkText: string) => string;
  greenMarkup?: string;
  savedCurrentFlag?: string;
  beforeRemarkDialog?: string;
  remarkDialogAriaLabel?: string | null;
  afterRemarkDialog?: string;
  existingRemark?: string;
  keepDialogVisibleAfterSave?: boolean;
  removeEditorAfterSave?: boolean;
} = {}) {
  const fixture = new JSDOM(`<!doctype html><html><body>
    <main data-jx-feige-conversation><span data-jx-customer-name>悠然一刻</span></main>
    <section data-testid="order-card">
      <span data-testid="order-no">6925095897028853458</span>
      <span data-testid="order-status">已付款</span>
      <button data-testid="edit-order-remark">修改</button>
      <div data-testid="order-remark-summary">${options.existingRemark ?? '#入EC\n#销售：小王'}</div>
      <span data-testid="current-order-flag" data-current-flag="red"></span>
    </section>
    ${options.beforeRemarkDialog ?? ''}
    <div role="dialog" data-test-remark-dialog ${options.remarkDialogAriaLabel === null ? '' : `aria-label="${options.remarkDialogAriaLabel ?? '添加备注'}"`} hidden>
      <div>订单标记</div>
      ${options.greenMarkup ?? '<button data-test-green-control aria-label="红色旗帜" data-flag-color="red"></button>'}
      <textarea data-testid="order-remark-input"></textarea>
      <button data-testid="order-remark-save">保存</button>
    </div>
    ${options.afterRemarkDialog ?? ''}
  </body></html>`, { url: 'https://im.jinritemai.com/pc_seller_v2/main/workspace' });
  const fixtureDocument = fixture.window.document;
  const dialog = fixtureDocument.querySelector('[data-test-remark-dialog]') as HTMLElement;
  const summary = fixtureDocument.querySelector('[data-testid="order-remark-summary"]') as HTMLElement;
  const input = fixtureDocument.querySelector('[data-testid="order-remark-input"]') as HTMLTextAreaElement;
  const currentFlag = fixtureDocument.querySelector('[data-testid="current-order-flag"]') as HTMLElement;
  let greenClicks = 0;
  let saveClicks = 0;
  fixtureDocument.querySelector('[data-testid="edit-order-remark"]')?.addEventListener('click', () => {
    dialog.hidden = false;
    input.value = summary.textContent || '';
  });
  input.addEventListener('input', () => options.onInput?.(fixtureDocument));
  input.addEventListener('change', () => options.onChange?.(fixtureDocument));
  fixtureDocument.querySelectorAll('[data-test-green-control]').forEach((element) => {
    element.addEventListener('click', () => {
      greenClicks += 1;
      options.onGreenClick?.(fixtureDocument);
    });
  });
  fixtureDocument.querySelector('[data-testid="order-remark-save"]')?.addEventListener('click', () => {
    saveClicks += 1;
    summary.textContent = options.savedRemark?.(input.value) ?? input.value;
    currentFlag.dataset.currentFlag = options.savedCurrentFlag ?? 'red';
    if (options.removeEditorAfterSave) input.remove();
    if (!options.keepDialogVisibleAfterSave) dialog.hidden = true;
    options.onSaveClick?.(fixtureDocument);
  });
  return {
    adapter: createDouyinFeigeAdapter(fixtureDocument, fixture.window.location.href),
    input,
    getGreenClicks: () => greenClicks,
    getSaveClicks: () => saveClicks,
  };
}

const inputContextSwitchFixture = createGuardBoundaryFixture({
  onInput(document) {
    const customer = document.querySelector('[data-jx-customer-name]') as HTMLElement;
    customer.textContent = '已切换客户';
  },
});
const inputContextSwitchResult = await inputContextSwitchFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(inputContextSwitchResult.ok, false);
assert.equal(inputContextSwitchResult.ok ? '' : inputContextSwitchResult.code, 'CONTEXT_CHANGED');
assert.equal(inputContextSwitchFixture.getGreenClicks(), 0, '备注写入期间上下文切换后不得点击红旗');
assert.equal(inputContextSwitchFixture.getSaveClicks(), 0, '备注写入期间上下文切换后不得保存');

const changeContextSwitchFixture = createGuardBoundaryFixture({
  onChange(document) {
    const orderNo = document.querySelector('[data-testid="order-no"]') as HTMLElement;
    orderNo.textContent = '6925095897028853998';
  },
});
const changeContextSwitchResult = await changeContextSwitchFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(changeContextSwitchResult.ok, false);
assert.equal(changeContextSwitchResult.ok ? '' : changeContextSwitchResult.code, 'CONTEXT_CHANGED');
assert.equal(changeContextSwitchFixture.getGreenClicks(), 0, '`change` 事件切换订单后不得点击红旗');
assert.equal(changeContextSwitchFixture.getSaveClicks(), 0, '`change` 事件切换订单后不得保存');

const replacedCardFixture = createGuardBoundaryFixture({
  onInput(document) {
    const card = document.querySelector('[data-testid="order-card"]') as HTMLElement;
    card.replaceWith(card.cloneNode(true));
  },
});
const replacedCardResult = await replacedCardFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(replacedCardResult.ok, false, '内容相同的新卡片也不得替代本次操作已绑定的 DOM 卡片');
assert.equal(replacedCardFixture.getGreenClicks(), 0, '已绑定卡片被替换后不得点击红旗');
assert.equal(replacedCardFixture.getSaveClicks(), 0, '已绑定卡片被替换后不得保存');

const greenContextSwitchFixture = createGuardBoundaryFixture({
  onGreenClick(document) {
    const orderNo = document.querySelector('[data-testid="order-no"]') as HTMLElement;
    orderNo.textContent = '6925095897028853999';
  },
});
const greenContextSwitchResult = await greenContextSwitchFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(greenContextSwitchResult.ok, false);
assert.equal(greenContextSwitchResult.ok ? '' : greenContextSwitchResult.code, 'CONTEXT_CHANGED');
assert.equal(greenContextSwitchFixture.getGreenClicks(), 1, '上下文是在红旗点击事件中切换');
assert.equal(greenContextSwitchFixture.getSaveClicks(), 0, '红旗点击期间上下文切换后不得保存');

const saveContextSwitchFixture = createGuardBoundaryFixture({
  onSaveClick(document) {
    const customer = document.querySelector('[data-jx-customer-name]') as HTMLElement;
    customer.textContent = '保存时已切换';
  },
});
const saveContextSwitchResult = await saveContextSwitchFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(saveContextSwitchResult.ok, false);
assert.equal(saveContextSwitchResult.ok ? '' : saveContextSwitchResult.code, 'CONTEXT_CHANGED');
assert.equal(saveContextSwitchFixture.getSaveClicks(), 1, '上下文是在保存事件中切换');

const finalBoundarySwitchFixture = createGuardBoundaryFixture({
  onSaveClick(document) {
    document.defaultView?.queueMicrotask(() => {
      const customer = document.querySelector('[data-jx-customer-name]') as HTMLElement;
      customer.textContent = '异步边界已切换';
    });
  },
});
const finalBoundarySwitchResult = await finalBoundarySwitchFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(finalBoundarySwitchResult.ok, false, '保存验证的异步边界后必须再次核对上下文');
assert.equal(finalBoundarySwitchResult.ok ? '' : finalBoundarySwitchResult.code, 'CONTEXT_CHANGED');

const droppedHistoryFixture = createGuardBoundaryFixture({
  savedRemark(remarkText) {
    return remarkText.split('\n').filter((line) => line !== '#销售：小王').join('\n');
  },
});
const droppedHistoryResult = await droppedHistoryFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(droppedHistoryResult.ok, false, '平台丢失历史备注行时不得报告成功');
assert.equal(droppedHistoryResult.ok ? '' : droppedHistoryResult.code, 'ORDER_COMPLETION_NOT_VERIFIED');

const appendedSignatureFixture = createGuardBoundaryFixture({
  savedRemark(remarkText) {
    return `${remarkText}【林恩光 08-09 13:26】`;
  },
});
const appendedSignatureResult = await appendedSignatureFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(appendedSignatureResult.ok, false, '飞鸽本次新追加备注人和时间时不得报告成功');
if (!appendedSignatureResult.ok) {
  assert.equal(appendedSignatureResult.code, 'ORDER_COMPLETION_NOT_VERIFIED');
  assert.match(appendedSignatureResult.message, /自动追加了备注人和时间/);
  assert.equal(appendedSignatureResult.remarkStatus, 'FAILED');
  assert.equal(appendedSignatureResult.greenFlagStatus, 'SUCCEEDED');
}

const hiddenGreenFixture = createGuardBoundaryFixture({
  greenMarkup: '<button data-test-green-control aria-label="红色旗帜" data-flag-color="red" hidden></button>',
});
const hiddenGreenResult = await hiddenGreenFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(hiddenGreenResult.ok, false, '隐藏的红旗控件不得被选中');
assert.equal(hiddenGreenResult.ok ? '' : hiddenGreenResult.code, 'GREEN_FLAG_NOT_FOUND');
assert.equal(hiddenGreenFixture.getSaveClicks(), 0, '红旗不可用时不得保存');

const disabledGreenFixture = createGuardBoundaryFixture({
  greenMarkup: '<button data-test-green-control aria-label="红色旗帜" data-flag-color="red" disabled></button>',
});
const disabledGreenResult = await disabledGreenFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(disabledGreenResult.ok, false, '禁用的红旗控件不得被选中');
assert.equal(disabledGreenResult.ok ? '' : disabledGreenResult.code, 'GREEN_FLAG_NOT_FOUND');
assert.equal(disabledGreenFixture.getSaveClicks(), 0, '红旗禁用时不得保存');

const nonGreenLabelFixture = createGuardBoundaryFixture({
  greenMarkup: '<button data-test-green-control aria-label="非红色旗帜"></button>',
});
const nonGreenLabelResult = await nonGreenLabelFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(nonGreenLabelResult.ok, false, '“非红色旗帜”不得被子串误判为红旗');
assert.equal(nonGreenLabelFixture.getSaveClicks(), 0);

const inactiveGreenFixture = createGuardBoundaryFixture({
  greenMarkup: '<button data-test-green-control aria-label="红色旗帜" data-flag-color="red-inactive"></button>',
});
const inactiveGreenResult = await inactiveGreenFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(inactiveGreenResult.ok, false, '`red-inactive` 不得通过精确红旗语义校验');
assert.equal(inactiveGreenFixture.getSaveClicks(), 0);

const ambiguousGreenFixture = createGuardBoundaryFixture({
  greenMarkup: '<button data-test-green-control aria-label="红色旗帜"></button><button data-test-green-control data-flag-color="red"></button>',
});
const ambiguousGreenResult = await ambiguousGreenFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(ambiguousGreenResult.ok, false, '多个合格红旗控件时必须因歧义停止');
assert.equal(ambiguousGreenFixture.getGreenClicks(), 0);
assert.equal(ambiguousGreenFixture.getSaveClicks(), 0);

const inexactActiveFlagFixture = createGuardBoundaryFixture({ savedCurrentFlag: 'not-red' });
const inexactActiveFlagResult = await inexactActiveFlagFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(inexactActiveFlagResult.ok, false, '`not-red` 不得通过红旗激活状态验证');
assert.equal(inexactActiveFlagResult.ok ? '' : inexactActiveFlagResult.code, 'ORDER_COMPLETION_NOT_VERIFIED');

const unrelatedDialogFixture = createGuardBoundaryFixture({
  beforeRemarkDialog: '<div role="dialog" aria-label="店铺公告"><button>知道了</button></div>',
  remarkDialogAriaLabel: null,
});
const unrelatedDialogResult = await unrelatedDialogFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(unrelatedDialogResult.ok, true, '应忽略无关的可见 dialog，根据备注文本和结构找到真实弹窗');

const ambiguousDialogFixture = createGuardBoundaryFixture({
  afterRemarkDialog: '<div role="dialog" aria-label="添加备注"><div>订单标记</div><textarea data-testid="order-remark-input"></textarea><button data-testid="order-remark-save">保存</button></div>',
});
const ambiguousDialogResult = await ambiguousDialogFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(ambiguousDialogResult.ok, false, '多个备注语义 dialog 同时可见时必须停止');
assert.equal(ambiguousDialogResult.ok ? '' : ambiguousDialogResult.code, 'ORDER_REMARK_DIALOG_NOT_FOUND');
assert.equal(ambiguousDialogFixture.getSaveClicks(), 0, '弹窗有歧义时不得保存');

const blankRemarkFixture = createGuardBoundaryFixture({ existingRemark: '' });
const blankRemarkResult = await blankRemarkFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.deepEqual(blankRemarkResult, {
  ok: true,
  remarkText: backendRemarkLines.join('\n'),
  remarkStatus: 'SUCCEEDED',
  greenFlagStatus: 'SUCCEEDED',
}, '空备注只能新增 OS 两行');
assert.equal(blankRemarkResult.ok && blankRemarkResult.remarkText.includes('#入EC'), false, '空备注不得自动新增 #入EC');

const malformedLinesFixture = createGuardBoundaryFixture();
const malformedLinesResult = await malformedLinesFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: [`${backendRemarkLines[0]}\n#非法追加`, backendRemarkLines[1]],
});
assert.equal(malformedLinesResult.ok, false, '后端备注 tuple 含换行时必须安全停止');
assert.equal(malformedLinesResult.ok ? '' : malformedLinesResult.code, 'ORDER_REMARK_INVALID');
assert.match(malformedLinesResult.ok ? '' : malformedLinesResult.message, /极享OS返回的订单备注格式不正确/);
assert.equal(malformedLinesFixture.input.value, '#入EC\n#销售：小王', '畸形 tuple 不得改写备注');
assert.equal(malformedLinesFixture.getGreenClicks(), 0, '畸形 tuple 不得点击红旗');
assert.equal(malformedLinesFixture.getSaveClicks(), 0, '畸形 tuple 不得保存');

const visibleOpenedDialogFixture = createGuardBoundaryFixture({
  keepDialogVisibleAfterSave: true,
  removeEditorAfterSave: true,
});
const visibleOpenedDialogResult = await visibleOpenedDialogFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(visibleOpenedDialogResult.ok, false, '本次打开的弹窗仍可见时，即使 textarea 被移除也不得报告成功');
assert.equal(visibleOpenedDialogResult.ok ? '' : visibleOpenedDialogResult.code, 'ORDER_COMPLETION_NOT_VERIFIED');
assert.equal(visibleOpenedDialogFixture.getSaveClicks(), 1);

const liveAdjacentCounterOrderDom = new JSDOM(`<!doctype html><html><body>
  <main id="workspace-chat">
    <div id="topbar-left-info"><span>刚刚好</span><span>添加备注</span></div>
  </main>
  <div class="ecom-collapse-item ecom-collapse-item-active">
    <div role="button" aria-expanded="true" class="ecom-collapse-header">
      <div><div>已发货</div></div>
      <div aria-hidden="true">+0</div><div><span>6955059225013785777</span></div>
      <button>修改</button>
    </div>
    <div data-btm="d5834"><span>淘金AI 多模态创作智能体 读书卡</span></div>
  </div>
</body></html>`, { url: 'https://im.jinritemai.com/pc_seller_v2/main/workspace' });
const liveAdjacentCounterContext = createDouyinFeigeAdapter(
  liveAdjacentCounterOrderDom.window.document,
  liveAdjacentCounterOrderDom.window.location.href,
).readContext();
assert.equal(
  liveAdjacentCounterContext.platformOrderNo,
  '6955059225013785777',
  '隐藏的 +0 计数与订单号相邻时，应从唯一展开订单卡的独立节点识别19位订单号',
);
assert.equal(
  liveAdjacentCounterContext.orderStatus,
  '已发货',
  '应从唯一展开订单卡的独立状态节点识别订单状态',
);
assert.equal(
  liveAdjacentCounterContext.productName,
  '淘金AI 多模态创作智能体 读书卡',
  '应优先从当前展开订单卡的商品节点识别商品名称',
);

function createLiveGreenFlagCompletionFixture() {
  const fixture = new JSDOM(`<!doctype html><html><body>
    <main id="workspace-chat">
      <div id="topbar-left-info"><span>悠然一刻</span><span>添加备注</span></div>
    </main>
    <div class="ecom-collapse-item ecom-collapse-item-active">
      <div role="button" aria-expanded="true" class="ecom-collapse-header">
        <div>已发货</div>
        <span>6955059225013785777</span>
        <div data-real-remark-summary>
          <span data-real-current-flag class="i-icon i-icon-flag" style="color: rgb(255, 59, 82)"><svg><path fill="currentColor"></path></svg></span>
          <span data-real-remark-lines>#销售：小王</span>
          <button type="button" render_type="feature_button">修改</button>
        </div>
      </div>
      <div data-btm="d5834">淘金AI 多模态创作智能体 读书卡</div>
    </div>
    <div class="ecom-drawer-wrapper-body" hidden>
      <div>订单备注</div>
      <div>订单标记</div>
      <label><input type="radio" value="4"><span class="i-icon i-icon-flag"><svg><path fill="#FF5C00"></path></svg></span></label>
      <label><input type="radio" value="1"><span class="i-icon i-icon-flag"><svg><path fill="#6C26FD"></path></svg></span></label>
      <label><input type="radio" value="2"><span class="i-icon i-icon-flag"><svg><path fill="#04CBE7"></path></svg></span></label>
      <label><input type="radio" value="3"><span class="i-icon i-icon-flag"><svg><path fill="#00C87F"></path></svg></span></label>
      <label><input type="radio" value="5"><span class="i-icon i-icon-flag"><svg><path fill="#FF3B52"></path></svg></span></label>
      <label><input type="radio" value="0"><span class="i-icon i-icon-flag"><svg><path fill="#69718C"></path></svg></span></label>
      <textarea id="textareaID" placeholder="请输入备注信息，使用Enter保存，使用⌘+Enter换行"></textarea>
      <label><input data-real-signature type="checkbox" checked />自动添加备注人和时间到末尾</label>
      <button type="button">确定</button>
      <button type="button">取消</button>
    </div>
  </body></html>`, { url: 'https://im.jinritemai.com/pc_seller_v2/main/workspace' });
  const fixtureDocument = fixture.window.document;
  const drawer = fixtureDocument.querySelector('.ecom-drawer-wrapper-body') as HTMLElement;
  const input = fixtureDocument.querySelector('#textareaID') as HTMLTextAreaElement;
  const summaryLines = fixtureDocument.querySelector('[data-real-remark-lines]') as HTMLElement;
  const currentFlag = fixtureDocument.querySelector('[data-real-current-flag]') as HTMLElement;
  const signature = fixtureDocument.querySelector('[data-real-signature]') as HTMLInputElement;
  fixtureDocument.querySelector('button[render_type="feature_button"]')?.addEventListener('click', () => {
    drawer.hidden = false;
    input.value = summaryLines.textContent || '';
  });
  [...drawer.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === '确定')
    ?.addEventListener('click', () => {
      summaryLines.textContent = signature.checked ? `${input.value}【林恩光 08-09 13:26】` : input.value;
      currentFlag.style.color = 'rgb(255, 59, 82)';
      drawer.hidden = true;
    });
  return createDouyinFeigeAdapter(fixtureDocument, fixture.window.location.href);
}

const liveGreenFlagCompletionResult = await createLiveGreenFlagCompletionFixture().completeOsOrder({
  expectedOrderNo: '6955059225013785777',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.deepEqual(liveGreenFlagCompletionResult, {
  ok: true,
  remarkText: `#销售：小王\n${backendRemarkLines.join('\n')}`,
  remarkStatus: 'SUCCEEDED',
  greenFlagStatus: 'SUCCEEDED',
}, '应识别飞鸽真实红色旗帜并取消平台自动追加备注人和时间');

function createCalibratedPaidOrderFixture(options: { includeConfirm?: boolean } = {}) {
  const fixture = new JSDOM(`<!doctype html><html><body>
    <main id="workspace-chat">
      <div id="topbar-left-info"><span>悠然一刻</span><span>添加备注</span></div>
    </main>
    <div class="ecom-collapse-item ecom-collapse-item-active generated-collapse-hash">
      <div role="button" aria-expanded="true" tabindex="0" class="ecom-collapse-header">
        <div class="generated-order-number-hash">6925095897028853458</div>
        <div data-testid="order-remark-summary">#悠然一刻/13826459812\n#入EC\n#直接退群</div>
        <button type="button" render_type="feature_button" is_disabled="false">修改</button>
        <span data-testid="current-order-flag" data-current-flag="red"></span>
      </div>
    </div>
    <div class="ecom-drawer-wrapper-body" hidden>
      <div>订单备注</div>
      <div>订单标记</div>
      <label><input type="radio" value="4"></label>
      <label><input type="radio" value="1" checked></label>
      <label><input type="radio" value="2"></label>
      <label><input type="radio" value="3"></label>
      <label><input type="radio" value="5"></label>
      <label><input type="radio" value="0"></label>
      <textarea
        class="ecom-input"
        id="textareaID"
        placeholder="请输入备注信息，使用Enter保存，使用⌘+Enter换行"
      ></textarea>
      ${options.includeConfirm === false ? '' : '<button type="button" class="ecom-btn ecom-btn-primary">确定</button>'}
      <button type="button" class="ecom-btn">取消</button>
    </div>
  </body></html>`, { url: 'https://im.jinritemai.com/pc_seller_v2/main/workspace' });
  const fixtureDocument = fixture.window.document;
  assert.equal(
    fixtureDocument.querySelector('[data-testid="order-card"],[class*="order-card"],[class*="orderItem"]'),
    null,
    '真实校准 fixture 不得意外命中旧订单卡候选',
  );
  const drawer = fixtureDocument.querySelector('.ecom-drawer-wrapper-body') as HTMLElement;
  const summary = fixtureDocument.querySelector('[data-testid="order-remark-summary"]') as HTMLElement;
  const input = fixtureDocument.querySelector('#textareaID') as HTMLTextAreaElement;
  const currentFlag = fixtureDocument.querySelector('[data-testid="current-order-flag"]') as HTMLElement;
  let editClicks = 0;
  let confirmClicks = 0;
  fixtureDocument.querySelector('button[render_type="feature_button"]')?.addEventListener('click', () => {
    editClicks += 1;
    drawer.hidden = false;
    input.value = summary.textContent || '';
  });
  [...drawer.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === '确定')
    ?.addEventListener('click', () => {
      confirmClicks += 1;
      summary.textContent = input.value;
      currentFlag.dataset.currentFlag = 'red';
      drawer.hidden = true;
    });
  return {
    adapter: createDouyinFeigeAdapter(fixtureDocument, fixture.window.location.href),
    input,
    drawer,
    getEditClicks: () => editClicks,
    getConfirmClicks: () => confirmClicks,
  };
}

const calibratedPaidOrderFixture = createCalibratedPaidOrderFixture();
const calibratedPaidContext = calibratedPaidOrderFixture.adapter.readContext();
assert.equal(
  calibratedPaidContext.platformOrderNo,
  '6925095897028853458',
  '应从当前展开的真实订单卡片语义中识别 19 位订单号',
);
assert.equal(calibratedPaidContext.orderStatus, '', '未校准的真实订单状态必须保持未识别');
assert.ok(calibratedPaidContext.diagnostics.includes('未识别订单状态'));
const calibratedMissingGreenResult = await calibratedPaidOrderFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(calibratedMissingGreenResult.ok, false);
assert.equal(
  calibratedMissingGreenResult.ok ? '' : calibratedMissingGreenResult.code,
  'GREEN_FLAG_NOT_FOUND',
  '订单状态未识别不阻断备注，只在红旗控件缺失时返回清晰结果',
);
assert.equal(calibratedPaidOrderFixture.getEditClicks(), 1, '订单状态未知仍应打开备注抽屉');
assert.equal(calibratedPaidOrderFixture.input.value, '#悠然一刻/13826459812\n#入EC\n#直接退群');
assert.equal(calibratedPaidOrderFixture.getConfirmClicks(), 0, '红旗语义缺失时不得点击“确定”');

const calibratedMissingConfirmFixture = createCalibratedPaidOrderFixture({ includeConfirm: false });
const calibratedMissingConfirmResult = await calibratedMissingConfirmFixture.adapter.completeOsOrder({
  expectedOrderNo: '6925095897028853458',
  expectedCustomerDisplayName: '悠然一刻',
  remarkLines: backendRemarkLines,
});
assert.equal(calibratedMissingConfirmResult.ok, false);
assert.equal(
  calibratedMissingConfirmResult.ok ? '' : calibratedMissingConfirmResult.code,
  'ORDER_REMARK_SAVE_NOT_FOUND',
  '订单状态未知不阻断备注，但仍必须验证保存控件',
);
assert.equal(calibratedMissingConfirmFixture.getConfirmClicks(), 0);
assert.equal(calibratedMissingConfirmFixture.getEditClicks(), 1);
assert.equal(calibratedMissingConfirmFixture.input.value, '#悠然一刻/13826459812\n#入EC\n#直接退群');

console.log('douyin feige page adapter: ok');
