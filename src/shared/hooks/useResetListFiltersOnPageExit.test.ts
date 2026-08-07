import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import useCustomerStore from '../../store/useCustomerStore';
import useLeadStore from '../../store/useLeadStore';
import useOrderStore from '../../store/useOrderStore';
import useRefundStore from '../../store/useRefundStore';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

test('global list stores clear business filters while preserving page size', () => {
  const cases = [
    { store: useCustomerStore, pageSize: 50, expected: { page: 1, pageSize: 50 } },
    { store: useLeadStore, pageSize: 30, expected: { page: 1, pageSize: 30 } },
    {
      store: useOrderStore,
      pageSize: 20,
      expected: { page: 1, pageSize: 20, sortBy: 'createdAt', sortDirection: 'desc' },
    },
    { store: useRefundStore, pageSize: 40, expected: { page: 1, pageSize: 40 } },
  ];

  for (const { store, pageSize, expected } of cases) {
    const listStore = store as unknown as {
      setState: (state: unknown) => void;
      getState: () => { filters: unknown; resetListFilters?: () => void };
    };
    listStore.setState({ filters: { page: 7, pageSize, search: '跨页面残留', status: 'pending' } });
    assert.equal(typeof listStore.getState().resetListFilters, 'function');
    listStore.getState().resetListFilters?.();
    assert.deepEqual(listStore.getState().filters, expected);
  }
});

test('all global-filter list pages use the shared page-exit reset hook', () => {
  const pages = [
    'src/pages/Customers/index.tsx',
    'src/pages/Leads/index.tsx',
    'src/pages/Orders/index.tsx',
    'src/pages/RefundCenter/index.tsx',
  ];

  for (const page of pages) {
    const source = read(page);
    assert.match(source, /useResetListFiltersOnPageExit\(resetListFilters\)/, page);
  }
});
