import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

const formal = read('src/pages/Commission/index.tsx');
const recovery = read('src/pages/Finance/RecoverySettlement.tsx');
const commissionApi = read('src/api/commissionApi.ts');
const timeline = read('src/shared/components/SettlementOperationTimeline.tsx');

const getFunctionSource = (source: string, startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(start, -1, `找不到函数起点：${startMarker}`);
  assert.notEqual(end, -1, `找不到函数终点：${endMarker}`);
  return source.slice(start, end);
};

assert.match(formal, /<SettlementOperationTimeline/, '正式订单分账应复用统一处理记录时间线');
assert.match(recovery, /<SettlementOperationTimeline/, '售后挽回分账应复用统一处理记录时间线');
assert.match(
  formal,
  /data-testid="order-settlement-detail-sidebar"[\s\S]{0,4000}<SettlementOperationTimeline[^>]*compact/,
  '正式订单处理记录应放在右侧操作栏，不应单独占用底部整块区域',
);
assert.match(
  recovery,
  /data-testid="recovery-settlement-detail-sidebar"[\s\S]{0,7000}<SettlementOperationTimeline[^>]*compact/,
  '售后挽回处理记录应放在右侧操作栏，不应单独占用底部整块区域',
);
assert.doesNotMatch(
  formal,
  /detailEditMode \? '正在调整' : '调整分账'/,
  '正式订单分账明细标题栏不应保留重复调整按钮',
);
assert.doesNotMatch(
  recovery,
  /<Typography variant="subtitle2"[^>]*>分账明细<\/Typography>[\s\S]{0,1600}?<Button[\s\S]{0,500}?>\s*调整分账\s*<\/Button>/,
  '售后挽回分账明细标题栏不应保留重复调整按钮',
);
assert.match(
  commissionApi,
  /setStorageData\(STORAGE_KEYS\.ORDERS, hydratedOrders, \{ persist: false \}\)/,
  '订单分账加载后应以服务端完整分页结果替换订单缓存，移除已删除源订单的旧缓存',
);
for (const label of ['操作人', '操作时间', '所属轮次', '状态变化', '操作原因']) {
  assert.match(timeline, new RegExp(label), `统一处理记录缺少${label}`);
}
assert.match(timeline, /查看变更/, '处理记录应支持按需展开变更明细');
assert.match(timeline, /data-testid="settlement-operation-event"/, '处理记录事件应提供稳定的布局回归测试标识');
const timelineConnectorSource = timeline.slice(
  timeline.indexOf("'&::after'"),
  timeline.indexOf("bgcolor: '#dbe3ef'") + "bgcolor: '#dbe3ef'".length,
);
assert.match(
  timelineConnectorSource,
  /width:\s*'1px'/,
  '处理记录的时间线连接线必须明确使用 1px，避免 MUI 将数值 1 解析成 100% 宽度并遮挡正文',
);
assert.doesNotMatch(
  timelineConnectorSource,
  /width:\s*1\s*,/,
  '处理记录的时间线连接线不能使用数值 1，MUI 会把它解析成 100% 宽度',
);
assert.match(
  timeline,
  /maxHeight:\s*\{\s*xs:\s*420,\s*lg:\s*520\s*\}/,
  '紧凑处理记录必须限制桌面与窄屏高度，避免历史记录把整个详情页无限拉长',
);
assert.match(
  timeline,
  /overflowY:\s*'auto'/,
  '紧凑处理记录超出最大高度后必须在模块内部滚动',
);
assert.doesNotMatch(
  timeline,
  /overflowY:\s*\{\s*xs:\s*'visible'/,
  '窄屏处理记录也不能无限展开全部历史记录',
);
assert.doesNotMatch(
  timeline,
  /gridTemplateColumns:\s*\{[^}]*md:\s*'repeat\(5,\s*minmax\(0,\s*1fr\)\)'/,
  '处理记录不应常驻展开五列元数据，避免每条记录被异常拉高',
);

const formalResetSource = getFunctionSource(formal, 'const confirmDeleteOrderSplit = async () => {', 'const confirmReopenOrderSplit = async () => {');
assert.doesNotMatch(
  formalResetSource,
  /setSummaryDetail\(null\)/,
  '正式订单重置分账成功后应保留处理页，由用户主动关闭',
);
const formalReopenSource = getFunctionSource(formal, 'const confirmReopenOrderSplit = async () => {', 'const confirmOrderFromDetail = async () => {');
assert.doesNotMatch(
  formalReopenSource,
  /closeSettlementDetail\(\)/,
  '正式订单重新分账成功后应保留处理页并切换到最新轮次',
);

for (const [startMarker, endMarker, label] of [
  ['const confirmSettlement = async (row: RecoveryOrder) => {', 'const withdrawSettlement = async', '确认分账'],
  ['const withdrawSettlement = async (row: RecoveryOrder', 'const reopenSettlement = async', '撤回分账'],
  ['const reopenSettlement = async () => {', 'const openResetSettlementDialog =', '重新分账'],
] as const) {
  const actionSource = getFunctionSource(recovery, startMarker, endMarker);
  assert.doesNotMatch(
    actionSource,
    /closeDetail\(\)|setDetailOrder\(null\)/,
    `售后挽回${label}成功后应保留处理页，由用户主动关闭`,
  );
}
const recoveryResetSource = getFunctionSource(recovery, 'const handleResetSettlement = async () => {', 'const canDeleteSettlement =');
assert.match(
  recoveryResetSource,
  /if \(cleanupDeletedSource\) closeDetail\(\)/,
  '清理已删除源业务的废弃分账后应关闭已不存在的处理页',
);
assert.doesNotMatch(
  recoveryResetSource,
  /setSelected\(null\);\s*closeDetail\(\)/,
  '普通重置分账成功后不应关闭售后挽回处理页',
);

console.log('settlement detail unification static tests passed');
