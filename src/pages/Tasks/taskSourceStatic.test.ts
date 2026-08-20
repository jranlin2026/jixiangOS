import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');

assert.match(source, /sourceType === ["']ASSET_MATRIX_PUBLISH["']/, '员工任务必须识别资产发布批次来源');
assert.ok(source.includes('来自营销发布任务'), '员工任务必须显示营销发布任务来源');
assert.ok(source.includes('/marketing?tab=tasks'), '必须可返回营销发布任务台账');

console.log('task source static tests passed');
