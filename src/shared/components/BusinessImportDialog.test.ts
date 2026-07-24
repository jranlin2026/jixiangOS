import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/shared/components/BusinessImportDialog.tsx'), 'utf8');

assert.match(source, /type: BusinessImportType/);
assert.match(source, /批量导入订单/);
assert.match(source, /批量导入售后挽回订单/);
assert.match(source, /createBusinessImportTemplateWorkbook/);
assert.match(source, /validateBusinessImportFile/);
assert.match(source, /parseBusinessImportWorkbook/);
assert.match(source, /businessImportApi\.precheck/);
assert.match(source, /businessImportApi\.confirm/);
assert.match(source, /pollBusinessImportJob/);
assert.match(source, /localStorage\.setItem/);
assert.match(source, /getBusinessImportConfirmDisabledReason/);
assert.match(source, /createBusinessImportSingleFlight/);
assert.match(source, /partial_failed/);
assert.match(source, /TablePagination/);
assert.match(source, /下载错误报告/);
assert.doesNotMatch(source, /OrderReview|RecoveryOrderTab|导入订单.*onClick/);
