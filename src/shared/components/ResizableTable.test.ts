import assert from 'node:assert/strict';
import {
  clampColumnWidth,
  createAutoTableStorageKey,
  getAutoColumnId,
  readColumnWidths,
  resizeColumnWidths,
  type ColumnWidthMap,
} from './ResizableTable';

const storage = (() => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

const defaults: ColumnWidthMap = {
  name: 180,
  phone: 140,
};

storage.clear();
assert.deepEqual(readColumnWidths('missing-key', defaults), defaults);

storage.setItem('table-widths', JSON.stringify({ name: 260, ghost: 999, phone: 20 }));
assert.deepEqual(readColumnWidths('table-widths', defaults), { name: 260, phone: 96 });

storage.setItem('bad-widths', '{');
assert.deepEqual(readColumnWidths('bad-widths', defaults), defaults);

assert.equal(clampColumnWidth(20), 96);
assert.equal(clampColumnWidth(240), 240);
assert.equal(clampColumnWidth(900), 520);

assert.deepEqual(resizeColumnWidths(defaults, 'name', 80), { name: 260, phone: 140 });
assert.deepEqual(resizeColumnWidths(defaults, 'name', -200), { name: 96, phone: 140 });

assert.equal(createAutoTableStorageKey('/refund-center', 2), 'aaos_auto_table_column_widths_v1:/refund-center:2');
assert.equal(getAutoColumnId('客户 客户列宽调整', 1), '客户');
assert.equal(getAutoColumnId('', 3), 'column-3');
