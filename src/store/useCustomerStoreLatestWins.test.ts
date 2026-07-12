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

const runStaleSettlesFirst = async (oldFails: boolean) => {
  const slowA = deferred<ApiResponse<PaginatedResponse<Customer>>>();
  const pendingB = deferred<ApiResponse<PaginatedResponse<Customer>>>();
  const third = deferred<ApiResponse<PaginatedResponse<Customer>>>();
  const requests = [slowA.promise, pendingB.promise, third.promise];
  let calls = 0;
  customerApi.fetchCustomers = (() => requests[calls++]) as typeof customerApi.fetchCustomers;
  const initial = response('initial-result', 7).data;
  useCustomerStore.setState({ items: initial.items, pagination: initial.pagination, error: null, loading: false });
  const requestA = useCustomerStore.getState().fetchItems({ search: 'A-old' });
  const requestB = useCustomerStore.getState().fetchItems({ search: 'B-new' });
  if (oldFails) slowA.reject(new Error('stale A failure')); else slowA.resolve(response('stale-A-result', 99));
  await requestA;
  let state = useCustomerStore.getState();
  assert.equal(state.loading, true, 'stale A must not clear B loading');
  assert.equal(state.items[0]?.id, 'initial-result', 'stale A must not replace items while B is pending');
  assert.deepEqual(state.pagination, initial.pagination, 'stale A must not replace pagination while B is pending');
  assert.equal(state.error, null, 'stale A failure must not set an error while B is pending');
  pendingB.resolve(response('B-result', 2));
  await requestB;
  state = useCustomerStore.getState();
  assert.equal(state.items[0]?.id, 'B-result');
  assert.equal(state.pagination.total, 2);
  assert.equal(state.loading, false);
  assert.equal(state.error, null);
  const requestC = useCustomerStore.getState().fetchItems({ search: 'C-third' });
  third.resolve(response('C-result', 3));
  await requestC;
  state = useCustomerStore.getState();
  assert.equal(calls, 3);
  assert.equal(state.items[0]?.id, 'C-result', 'request sequencing must continue after the race');
  assert.equal(state.pagination.total, 3);
  assert.equal(state.loading, false);
};

await runStaleSettlesFirst(false);
await runStaleSettlesFirst(true);
customerApi.fetchCustomers = originalFetch;
