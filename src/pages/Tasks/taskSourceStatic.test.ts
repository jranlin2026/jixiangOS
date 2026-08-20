import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');

assert.match(source, /sourceType === ["']MARKETING_PUBLISH["']/, '新员工任务必须识别内容发布计划来源');
assert.match(source, /sourceType === ["']ASSET_MATRIX_PUBLISH["']/, '必须兼容历史资产发布批次来源');
assert.ok(source.includes('来自内容发布计划'), '员工任务必须显示内容发布计划来源');
assert.ok(source.includes('/marketing?tab=plans'), '必须可返回内容发布计划台账');

console.log('task source static tests passed');
