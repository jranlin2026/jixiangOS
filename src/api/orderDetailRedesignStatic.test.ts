import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/pages/Orders/OrderDetail.tsx'), 'utf8');
const ordersPageSource = readFileSync(join(process.cwd(), 'src/pages/Orders/index.tsx'), 'utf8');

assert.match(source, /maxWidth="md"/, '订单详情应与提交订单使用相同的 md 弹窗宽度');
assert.match(source, /fullScreen=\{mobileFullScreen\}/, '手机端订单详情应使用全屏模式');
assert.match(source, />订单详情</, '详情标题应简化为订单详情');
assert.match(source, /md: 'minmax\(260px, 1\.5fr\) 120px 130px minmax\(210px, 1fr\)'/, '桌面摘要应压缩状态和金额列，尽量保持单行');
assert.match(source, /operationSectionRef\.current\?\.scrollIntoView/, '修改记录按钮应定位到审核与系统记录');
assert.doesNotMatch(source, /onHistory\?/, '订单详情不应再通过外部回调打开重复的修改记录弹窗');

for (const label of ['订单编号', '分账状态', '实付金额', '创建时间']) {
  assert.match(source, new RegExp(`label: '${label}'`), `顶部摘要必须显示${label}`);
}

for (const [step, title] of [[1, '客户信息'], [2, '产品信息'], [3, '订单信息'], [4, '收款与凭证'], [5, '审核与系统记录']] as const) {
  assert.match(source, new RegExp(`step=\\{${step}\\}[\\s\\S]*?title="${title}"`), `详情页第${step}段必须为${title}`);
}

const customerSection = source.slice(source.indexOf('title="客户信息"'), source.indexOf('title="产品信息"'));
for (const label of ['客户名称', '销售负责人', '资源归属', '线索来源']) {
  assert.match(customerSection, new RegExp(`label="${label}"`), `客户信息必须显示${label}`);
}
assert.doesNotMatch(customerSection, /线索录入人|线索贡献人/, '客户信息不应显示线索录入人和线索贡献人');

const orderSection = source.slice(source.indexOf('title="订单信息"'), source.indexOf('title="收款与凭证"'));
assert.doesNotMatch(orderSection, /订单状态|退款状态/, '订单信息不应显示订单状态和退款状态');

assert.match(source, /order\.payments\.map/, '收款与凭证应逐笔展示付款记录');
assert.match(source, /order\.actualAmount \?\? order\.amount/, '实付金额为0时不得错误回退到订单金额');
assert.match(source, /order\.reviewLogs \|\| \[\]/, '审核与系统记录应合并订单详情接口返回的真实审核记录');
assert.doesNotMatch(ordersPageSource, /orderReviewApi\.fetchOrderApplicationById/, '订单详情不得绕用审核台权限接口读取日志');
assert.doesNotMatch(ordersPageSource, /selectedOrderReviewLogs/, '审核日志应绑定订单详情响应，避免异步串单');
assert.match(source, /maxHeight: \{ xs: '100dvh', sm: '94vh' \}/, '手机全屏不得被桌面端最大高度限制');
assert.doesNotMatch(source, /id: `created-\$\{order\.id\}`/, '无历史记录时不得拼造审计记录');
assert.match(source, /display: \{ xs: 'grid', sm: 'none' \}/, '手机端应使用卡片而不是强制横向宽表格');
for (const label of ['操作人', '操作时间', '操作类型', '操作内容']) {
  assert.match(source, new RegExp(`>${label}<`), `审核与系统记录必须包含${label}列`);
}
assert.doesNotMatch(source, /position: 'sticky'/, '订单详情底部不应保留固定金额栏');

console.log('order detail redesign static tests passed');
