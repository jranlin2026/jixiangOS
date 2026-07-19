import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./CustomerDuplicateGovernance.tsx', import.meta.url), 'utf8');
assert.match(source, /选择主客户/);
assert.match(source, /确定最终保留资料/);
assert.match(source, /检查合并影响/);
assert.match(source, /主客户是合并后继续使用的档案/);
assert.match(source, /associationCounts/);
assert.match(source, /72 小时/);
assert.match(source, /undoPrecheck/);
assert.match(source, /CUSTOMER_MERGE_UNDO/);

console.log('customer merge workflow static: ok');
