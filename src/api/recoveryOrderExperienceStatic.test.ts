import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const recoveryOrderSource = readFileSync(
  join(process.cwd(), 'src/pages/AfterSales/RecoveryOrderTab.tsx'),
  'utf8',
);
const recoverySettlementSource = readFileSync(
  join(process.cwd(), 'src/pages/Finance/RecoverySettlement.tsx'),
  'utf8',
);
const recoveryOrderDetailSource = readFileSync(
  join(process.cwd(), 'src/shared/components/RecoveryOrderDetailContent.tsx'),
  'utf8',
);

assert.match(
  recoveryOrderSource,
  /label="挽回成交时间"[\s\S]*?type="datetime-local"/,
  'Recovery order form should expose a recovery-time datetime field.',
);

assert.match(
  recoveryOrderSource,
  /recoveryAt:\s*form\.recoveryAt/,
  'Recovery order submission should include the selected recovery time.',
);
assert.match(
  recoveryOrderSource,
  /recoveryStartDate:\s*localDateBoundaryIso\(recoveryStartDate\)[\s\S]*?recoveryEndDate:\s*localDateBoundaryIso\(recoveryEndDate, true\)/,
  '售后日期筛选应按浏览器本地自然日转换为明确的 ISO 时间边界。',
);
assert.match(
  recoveryOrderSource,
  /originalPaymentAt:\s*detail\.originalPaymentAt\s*\?\s*toDateTimeInputValue\(detail\.originalPaymentAt\)\s*:\s*''/,
  '未记录原订单付款时间的售后单在编辑时不得伪造时间。',
);

const createDialogSource = recoveryOrderSource.slice(
  recoveryOrderSource.indexOf('<Dialog\n        open={open}'),
  recoveryOrderSource.indexOf('<Dialog\n        open={Boolean(detailOrder)}'),
);

assert.equal(
  (createDialogSource.match(/<BusinessAttachmentPicker/g) || []).length,
  1,
  'Recovery order form should use one unified recovery evidence uploader.',
);
assert.match(createDialogSource, /title="挽回凭证"[\s\S]*?maxCount=\{8\}/);
for (const section of ['客户信息', '原订单信息', '挽回成交信息']) {
  assert.match(createDialogSource, new RegExp(`title="${section}"`), `新建售后挽回单应包含“${section}”填写分区。`);
}

const detailDialogSource = recoveryOrderSource.slice(
  recoveryOrderSource.indexOf('<Dialog\n        open={Boolean(detailOrder)}'),
  recoveryOrderSource.indexOf('<Dialog open={Boolean(historyOrder)}'),
);
for (const section of ['客户信息', '原订单信息', '挽回成交信息', '审核与系统记录']) {
  assert.match(detailDialogSource, new RegExp(section), `售后资料弹窗应包含“${section}”分区。`);
}
assert.match(detailDialogSource, /label="挽回凭证"/);

for (const field of [
  'originalProductLevel', 'sourcePlatformShop', 'customerMatchStatus',
  'officialPaymentChannel', 'paymentOrderNo', 'paymentAt', 'assistUserName',
  'auditorName', 'auditedAt', 'auditReason', 'updatedAt',
]) {
  assert.match(recoveryOrderSource, new RegExp(`\\| '${field}'`), `售后视图字段池应包含 ${field}。`);
}
assert.match(recoveryOrderSource, /const RECOVERY_ORDER_LIST_COLUMNS/);
assert.match(recoveryOrderSource, /const RECOVERY_ORDER_REVIEW_COLUMNS/);
assert.doesNotMatch(recoveryOrderSource.slice(
  recoveryOrderSource.indexOf('const RECOVERY_ORDER_LIST_COLUMNS'),
  recoveryOrderSource.indexOf('const RECOVERY_LIST_STATUSES'),
), /id: 'actions'/, '操作列不应进入视图设置字段池。');

const settlementRecoveryNoCell = recoverySettlementSource.slice(
  recoverySettlementSource.indexOf("case 'recoveryNo':"),
  recoverySettlementSource.indexOf("case 'customerName':"),
);
assert.match(
  settlementRecoveryNoCell,
  /component="button"[\s\S]*?onClick=\{\(\) => void openSourceDetail\(row\)\}/,
  'Finance recovery order number should open the recovery detail when clicked.',
);
assert.match(recoverySettlementSource, /售后挽回订单资料/);
assert.match(
  recoverySettlementSource,
  /<RecoveryOrderDetailContent[\s\S]*?order=\{sourceDetailOrder\}/,
  '财务售后分账应复用完整的售后挽回订单资料组件。',
);
assert.match(recoveryOrderDetailSource, /order\.recoveryAt \|\| order\.createdAt/);
assert.match(recoverySettlementSource, /finance_recovery_settlement_table_view_v2/);
for (const field of [
  'sourcePlatformShop', 'originalProductLevel', 'officialPaymentChannel', 'paymentAt',
  'splitDetails', 'totalCommissionAmount', 'customerPhone', 'customerWechat',
  'customerMatchStatus', 'sourcePlatform', 'sourceShop', 'paymentOrderNo',
  'assistUserName', 'auditorName', 'remark', 'updatedAt', 'performanceAmount',
  'settlementHandledBy', 'settlementConfirmedAt', 'settlementPaidAt', 'settlementWithdrawReason',
]) {
  assert.match(recoverySettlementSource, new RegExp(`\\| '${field}'`), `售后分账视图字段池应包含 ${field}。`);
}
const settlementColumnsSource = recoverySettlementSource.slice(
  recoverySettlementSource.indexOf('const RECOVERY_SETTLEMENT_COLUMNS'),
  recoverySettlementSource.indexOf('const DEFAULT_VISIBLE_COLUMNS'),
);
assert.doesNotMatch(settlementColumnsSource, /id: 'actions'/, '售后分账操作列不应进入视图设置字段池。');
for (const section of ['源业务资料', '付款资料', '分账明细']) {
  assert.match(recoverySettlementSource, new RegExp(section), `售后分账资料应包含“${section}”分区。`);
}
assert.match(
  recoverySettlementSource,
  /<SettlementOperationTimeline\s+compact\s+events=\{buildRecoverySettlementEvents\(detailOrder\)\}\s*\/>/,
  '售后分账资料应使用统一处理记录时间线。',
);
assert.match(recoverySettlementSource, /<RecoveryEvidenceLinks order=/);

assert.match(
  recoveryOrderSource,
  /\| 'recoveryAt'[\s\S]*?\{ id: 'recoveryAt', label: '挽回成交时间' \}/,
  'Recovery order list and review table should expose a recovery-time column.',
);
assert.match(
  recoveryOrderSource,
  /case 'recoveryAt':[\s\S]*?formatDate\(row\.recoveryAt \|\| row\.createdAt, 'yyyy-MM-dd HH:mm'\)/,
  'Recovery order list and review table should render the saved recovery time.',
);
assert.match(
  recoverySettlementSource,
  /\| 'recoveryAt'[\s\S]*?\{ id: 'recoveryAt', label: '挽回成交时间' \}/,
  'Finance recovery settlement table should expose the approved recovery transaction time column.',
);
assert.match(
  recoverySettlementSource,
  /case 'recoveryAt':[\s\S]*?row\.recoveryAt \? formatDate\(row\.recoveryAt, 'yyyy-MM-dd HH:mm'\) : '-'/,
  'Finance recovery settlement table should render the saved recovery transaction time without substituting creation time.',
);

assert.match(
  recoverySettlementSource,
  /handledViewSettingsTriggerRef\s*=\s*React\.useRef\(viewSettingsTrigger\)[\s\S]*?handledViewSettingsTriggerRef\.current === viewSettingsTrigger[\s\S]*?handledViewSettingsTriggerRef\.current = viewSettingsTrigger[\s\S]*?setViewSettingsOpen\(true\)/,
  '售后挽回分账页首次挂载或切回页签时不得把旧的视图设置信号当成新点击。',
);

assert.match(
  recoverySettlementSource,
  /cleanupDeletedRecoverySettlement[^]*?清理废弃售后挽回分账/,
  '超级管理员必须能清理源单已删除的废弃财务分账。',
);
assert.match(
  recoverySettlementSource,
  /aria-label=\{isSourceRecoveryDeleted\(row\) \? '清理废弃记录' : '重置售后挽回分账'\}[\s\S]*?isSourceRecoveryDeleted\(row\)[\s\S]*?<DeleteSweepIcon[\s\S]*?:[\s\S]*?<RestartAltIcon/,
  '待确认分账应使用“重置分账”及重置图标，废弃记录清理应使用独立的清理名称和图标。',
);
assert.doesNotMatch(
  recoverySettlementSource,
  /aria-label=\{isSourceRecoveryDeleted\(row\) \? '清理废弃售后挽回分账' : '删除售后挽回分账'\}/,
  '操作列不得继续用删除图标混淆重置分账和废弃记录清理。',
);
assert.match(
  recoverySettlementSource,
  /重置后会清空该挽回单当前保存的人员分账明细，并退回到“待处理”状态/,
  '重置分账确认框必须明确说明它清空当前明细并退回待处理。',
);
assert.match(
  recoverySettlementSource,
  /底层业务、提成及清理审计留痕仍保留/,
);
assert.match(
  recoverySettlementSource,
  /isSuperAdminRoleName\(currentUser\?\.role\)/,
  '管理员和系统管理员别名也应显示废弃分账清理入口。',
);
