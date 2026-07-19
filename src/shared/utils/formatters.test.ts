import assert from 'node:assert/strict';
import { formatEmployeeNameWithPosition, formatPaginationRows } from './formatters';

assert.equal(formatPaginationRows({ from: 0, to: 0, count: 0 }), '0 / 共 0 条');
assert.equal(formatPaginationRows({ from: 1, to: 10, count: 34 }), '1-10 / 共 34 条');

assert.equal(
  formatEmployeeNameWithPosition({ name: '李晓健', positionName: '销售专员' }),
  '李晓健（销售专员）',
);
assert.equal(
  formatEmployeeNameWithPosition({ name: '李晓健', positionName: '  ' }),
  '李晓健（未设置职位）',
);
