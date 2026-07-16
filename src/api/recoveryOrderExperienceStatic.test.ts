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
