import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import useCustomerStore from '../../store/useCustomerStore';

test('resetListFilters clears customer filters but preserves page size', () => {
  useCustomerStore.setState({
    filters: {
      page: 7,
      pageSize: 50,
      search: '15638398270',
      customerLevel: 'L1',
      owner: 'employee-1',
      leadSource: '抖音',
      sourceName: '直播间01',
      tagIds: ['tag-1'],
    },
  });

  useCustomerStore.getState().resetListFilters();

  assert.deepEqual(useCustomerStore.getState().filters, { page: 1, pageSize: 50 });
});

test('customer list uses the shared page-exit filter reset hook', () => {
  const source = readFileSync(join(process.cwd(), 'src/pages/Customers/index.tsx'), 'utf8');

  assert.match(source, /useResetListFiltersOnPageExit\(resetListFilters\)/);
});
