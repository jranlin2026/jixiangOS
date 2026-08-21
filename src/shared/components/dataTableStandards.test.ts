import assert from 'node:assert/strict';
import {
  DATA_TABLE_COLUMN_WIDTHS,
  DATA_TABLE_METRICS,
  DATA_TABLE_TOKENS,
  getDataTableMinWidth,
} from './dataTableStandards';

assert.equal(DATA_TABLE_TOKENS.link, '#1E6BFF');
assert.equal(DATA_TABLE_TOKENS.linkHover, '#1554CC');
assert.equal(DATA_TABLE_TOKENS.action, '#64748B');
assert.equal(DATA_TABLE_METRICS.headerHeight, 44);
assert.equal(DATA_TABLE_METRICS.rowHeight, 52);

assert.equal(
  getDataTableMinWidth(
    [{ width: 180 }, { width: 120 }, { width: 60 }, {}],
    { selection: true, actionWidth: 96 },
  ),
  48 + 180 + 120 + DATA_TABLE_COLUMN_WIDTHS.minimum + DATA_TABLE_COLUMN_WIDTHS.default + 96,
  '表格最小宽度应包含选择列、所有可见业务列和操作列，并约束过窄字段',
);

assert.equal(
  getDataTableMinWidth([], { actionWidth: 96 }),
  DATA_TABLE_COLUMN_WIDTHS.emptyMinimum,
  '无数据或无可见字段时仍须保持完整工作区宽度',
);

console.log('data table standards tests passed');
