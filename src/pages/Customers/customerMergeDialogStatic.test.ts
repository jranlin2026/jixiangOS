import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./CustomerMergeDialog.tsx', import.meta.url), 'utf8');

for (const label of [
  '客户姓名', '手机号', '微信', '公司', '客户等级', '行业', '城市',
  '线索来源', '备注', '销售负责人', '客户进度',
]) {
  assert.match(source, new RegExp(label));
}

for (const field of ['email', 'sourceType', 'sourceName', 'sourceAccount']) {
  assert.doesNotMatch(source, new RegExp(`\\{ key: '${field}'`), `${field} 不应作为合并选择字段`);
}

assert.match(source, /保留为主客户档案/);
assert.match(source, /最终客户资料/);
assert.match(source, /自动合并内容/);
assert.match(source, /manualTagIds/);
assert.match(source, /associationCounts/);
assert.match(source, /onMerged/);

console.log('customer merge dialog static: ok');
