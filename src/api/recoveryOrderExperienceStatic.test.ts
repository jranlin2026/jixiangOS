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

assert.match(
  recoveryOrderSource,
  /label="挽回时间"[\s\S]*?type="datetime-local"/,
  'Recovery order form should expose a recovery-time datetime field.',
);

assert.match(
  recoveryOrderSource,
  /recoveryAt:\s*form\.recoveryAt/,
  'Recovery order submission should include the selected recovery time.',
);

const createDialogSource = recoveryOrderSource.slice(
  recoveryOrderSource.indexOf('<Dialog open={open}'),
  recoveryOrderSource.indexOf('<Dialog open={Boolean(detailOrder)}'),
);

assert.equal(
  (createDialogSource.match(/<BusinessAttachmentPicker/g) || []).length,
  1,
  'Recovery order form should render exactly one attachment upload window.',
);
assert.match(createDialogSource, /title="挽回凭证"/);
assert.doesNotMatch(createDialogSource, /title="聊天记录截图"/);

const detailDialogSource = recoveryOrderSource.slice(
  recoveryOrderSource.indexOf('<Dialog open={Boolean(detailOrder)}'),
  recoveryOrderSource.indexOf('<Dialog open={Boolean(historyOrder)}'),
);
assert.match(detailDialogSource, /挽回凭证/);
assert.doesNotMatch(detailDialogSource, /<TableCell>聊天记录截图<\/TableCell>/);

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
assert.match(recoverySettlementSource, /sourceDetailOrder\.recoveryAt/);

assert.match(
  recoveryOrderSource,
  /\| 'recoveryAt'[\s\S]*?\{ id: 'recoveryAt', label: '挽回时间' \}/,
  'Recovery order list and review table should expose a recovery-time column.',
);
assert.match(
  recoveryOrderSource,
  /case 'recoveryAt':[\s\S]*?formatDate\(row\.recoveryAt \|\| row\.createdAt, 'yyyy-MM-dd HH:mm'\)/,
  'Recovery order list and review table should render the saved recovery time.',
);
assert.match(
  recoverySettlementSource,
  /\| 'recoveryAt'[\s\S]*?\{ id: 'recoveryAt', label: '挽回时间' \}/,
  'Finance recovery settlement table should expose a recovery-time column.',
);
assert.match(
  recoverySettlementSource,
  /case 'recoveryAt':[\s\S]*?formatDate\(row\.recoveryAt \|\| row\.createdAt, 'yyyy-MM-dd HH:mm'\)/,
  'Finance recovery settlement table should render the saved recovery time.',
);

assert.doesNotMatch(
  recoverySettlementSource,
  /cleanupDeletedSourceRecoverySettlement|清理废弃分账/,
  '已删除源订单的撤回分账必须保留为只读财务留痕，不能提供物理清理入口。',
);
assert.match(
  recoverySettlementSource,
  /源售后挽回订单已删除，分账与撤回记录永久保留为只读留痕/,
);
