import assert from 'node:assert/strict';
import useCustomerStore from './useCustomerStore';
import { customerApi } from '../api/customerApi';
import type { ApiResponse, PaginatedResponse } from '../api/types';
import type { Customer } from '../types/customer';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const response = (id: string, total: number): ApiResponse<PaginatedResponse<Customer>> => ({
  code: 0, message: 'ok', data: {
    items: [{ id, name: id, company: '', phone: '13800000000', customerLevel: 'L1', owner: '销售', totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], activityRecords: [], sourceType: '公司资源', createdAt: '', updatedAt: '' }],
    pagination: { page: 1, pageSize: 10, total, totalPages: 1 },
  },
});

const originalFetch = customerApi.fetchCustomers;
const runRace = async (oldFails: boolean) => {
  const slow = deferred<ApiResponse<PaginatedResponse<Customer>>>();
  const fast = deferred<ApiResponse<PaginatedResponse<Customer>>>();
  let calls = 0;
  customerApi.fetchCustomers = (() => (++calls === 1 ? slow.promise : fast.promise)) as typeof customerApi.fetchCustomers;
  useCustomerStore.setState({ items: [], error: null, loading: false, pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } });
  const oldRequest = useCustomerStore.getState().fetchItems({ search: 'old' });
  const newRequest = useCustomerStore.getState().fetchItems({ search: 'new' });
  fast.resolve(response('new-result', 1));
  await newRequest;
  assert.equal(useCustomerStore.getState().items[0]?.id, 'new-result');
  assert.equal(useCustomerStore.getState().loading, false);
  if (oldFails) slow.reject(new Error('old failure')); else slow.resolve(response('old-result', 99));
  await oldRequest;
  const state = useCustomerStore.getState();
  assert.equal(calls, 2);
  assert.equal(state.items[0]?.id, 'new-result');
  assert.deepEqual(state.pagination, { page: 1, pageSize: 10, total: 1, totalPages: 1 });
  assert.equal(state.error, null);
  assert.equal(state.loading, false);
};

await runRace(false);
await runRace(true);
customerApi.fetchCustomers = originalFetch;
