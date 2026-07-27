import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/shared/components/BusinessExportDialog.tsx'), 'utf8');

assert.match(source, /current_view/);
assert.match(source, /standard/);
assert.match(source, /all/);
assert.match(source, /标准业务字段（推荐）/);
assert.match(source, /enableStandardMode/);
assert.match(source, /导出原因/);
assert.match(source, /预计导出/);
assert.match(source, /getBusinessExportDisabledReason/);
assert.match(source, /downloadBusinessExportWorkbook/);
assert.match(source, /if \(busy\) return/);
