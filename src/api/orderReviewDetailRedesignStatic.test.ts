import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/pages/OrderReview/index.tsx'), 'utf8');
const detailOpenIndex = source.indexOf('open={Boolean(detailApplication)}');
const detail = source.slice(source.lastIndexOf('<Dialog', detailOpenIndex), source.indexOf('{feedbackDialog}'));

assert.match(detail, /fullScreen=\{mobileFullScreen\}/, '审核资料在手机端应全屏显示');
assert.match(detail, />订单审核资料</, '弹窗应使用统一的审核资料标题');
assert.match(detail, /<BusinessSummaryGrid[\s\S]*ariaLabel="订单审核摘要"/, '顶部应复用订单摘要组件');
for (const label of ['内部单据编号', '审核状态', '实付金额', '提交时间']) {
  assert.match(detail, new RegExp(`label: '${label}'`), `审核摘要缺少${label}`);
}
for (const [step, title] of [[1, '客户信息'], [2, '产品信息'], [3, '订单信息'], [4, '收款与凭证'], [5, '审核与系统记录']] as const) {
  assert.match(detail, new RegExp(`step=\\{${step}\\}[\\s\\S]*?title="${title}"`), `审核资料第${step}段必须为${title}`);
}
assert.doesNotMatch(detail, /<SnapshotSection/, '审核资料不应继续使用旧快照分区');
assert.match(detail, /display: \{ xs: 'grid', sm: 'none' \}/, '产品和审核记录在手机端应使用卡片');
assert.match(detail, />\s*通过\s*</, '主操作应统一命名为通过');
assert.doesNotMatch(detail, />\s*审核入库\s*</, '详情底部不应继续显示审核入库');

console.log('order review detail redesign static tests passed');
