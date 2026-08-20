import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');

assert.ok(source.includes("sourceType === 'ASSET_MATRIX_PUBLISH'"), '员工任务必须识别资产发布批次来源');
assert.ok(source.includes('来自资产发布批次'), '员工任务必须显示发布批次来源');
assert.ok(source.includes('/assets?tab=matrix'), '必须可返回资产发布批次台账');

console.log('task source static tests passed');
