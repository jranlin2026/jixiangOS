import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(testDir, 'GlobalTableColumnResizer.tsx'), 'utf8');

const applyIndex = source.indexOf('applyColumnWidth(table, columnIndex, width);');
const existingHandleGuardIndex = source.indexOf("if (header.querySelector('[role=\"separator\"]')) return;");

assert.ok(applyIndex >= 0, '全局列宽增强器应对当前表格单元格应用列宽');
assert.ok(existingHandleGuardIndex >= 0, '全局列宽增强器应避免重复创建拖拽手柄');
assert.ok(
  applyIndex < existingHandleGuardIndex,
  '表体重新渲染后必须先重新应用列宽和溢出规则，再跳过已存在的表头拖拽手柄',
);

assert.match(
  source,
  /cell\.style\.overflow = 'hidden';[\s\S]*cell\.style\.textOverflow = 'ellipsis';[\s\S]*cell\.style\.whiteSpace = 'nowrap';/,
  '列宽重新应用时应同时阻止内容绘制到相邻单元格',
);

console.log('GlobalTableColumnResizer tests passed');
