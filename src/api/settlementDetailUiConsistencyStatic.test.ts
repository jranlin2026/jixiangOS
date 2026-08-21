import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const orderSettlement = read('src/pages/Commission/index.tsx');
const recoverySettlement = read('src/pages/Finance/RecoverySettlement.tsx');

for (const [label, source] of [
  ['订单分账', orderSettlement],
  ['售后挽回分账', recoverySettlement],
] as const) {
  assert.match(source, /SettlementCompactDetailItem/, `${label}必须复用统一详情字段组件`);
  assert.match(source, /SettlementDetailCard/, `${label}必须复用统一详情卡片组件`);
  assert.match(source, /StatusSegmentBar/, `${label}必须复用统一分账状态分段栏`);
  assert.match(source, /moduleTableSx/, `${label}必须复用统一表格字体与边框样式`);
  assert.match(source, /<Table[^>]*size="small"/, `${label}表格必须使用统一的紧凑密度`);
  for (const action of ['处理分账', '调整分账', '重置分账', '确认分账', '撤回提成', '重新分账']) {
    assert.match(source, new RegExp(action), `${label}必须提供统一动作：${action}`);
  }
}

assert.doesNotMatch(orderSettlement, /function SettlementCompactDetailItem\(/, '订单分账不应保留页面私有的字段样式');
assert.doesNotMatch(recoverySettlement, /function CompactDetailItem\(/, '售后挽回分账不应保留页面私有的字段样式');
assert.match(recoverySettlement, /case 'customerName':[^]*fontWeight: 500/, '两个分账列表的客户名称字重必须一致');
assert.doesNotMatch(recoverySettlement, /order\.status === '已分账' \? '待发放'/, '不能用业务状态推导分账状态');
assert.match(recoverySettlement, /data-testid="recovery-settlement-editor"/, '售后挽回分账必须使用与订单分账一致的左右处理工作台');
