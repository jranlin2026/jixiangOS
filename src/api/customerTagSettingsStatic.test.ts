import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/pages/Settings/CustomerTagConfig.tsx', 'utf8');
assert.match(source, /人工标签/);
assert.match(source, /添加分组/);
assert.match(source, /单选/);
assert.match(source, /多选/);
assert.match(source, /适用范围/);
assert.match(source, /合并标签/);
assert.match(source, /整理历史标签/);
assert.doesNotMatch(source, /freeSolo/);
