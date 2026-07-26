import assert from 'node:assert/strict';
import { orderApi } from '../api';
import type { ApiResponse, PaginatedResponse } from '../api/types';
import type { Order } from '../types/order';
import useOrderStore from './useOrderStore';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

const order = (id: string): Order => ({
  id,
  orderNo: `ORD-${id}`,
  customerId: `customer-${id}`,
  customerName: `客户-${id}`,
  productLevel: '899',
  orderType: '899成交',
  amount: 899,
  actualAmount: 899,
  paymentMethod: '对公转账',
  status: '已确认',
  refundStatus: '无',
  owner: '销售',
  payments: [],
  createdAt: '2026-07-12T10:00:00.000Z',
  updatedAt: '2026-07-12T10:00:00.000Z',
});

const response = (id: string, page = 1, total = 1): ApiResponse<PaginatedResponse<Order>> => ({
  code: 0,
  message: 'ok',
  data: {
    items: [order(id)],
    pagination: { page, pageSize: 10, total, totalPages: Math.ceil(total / 10) },
  },
});

const originalFetchOrders = orderApi.fetchOrders;
const originalDeleteOrder = orderApi.deleteOrder;
const originalFetchStats = orderApi.fetchOrderStats;

try {
  const slow = deferred<ApiResponse<PaginatedResponse<Order>>>();
  const fast = deferred<ApiResponse<PaginatedResponse<Order>>>();
  let calls = 0;
  orderApi.fetchOrders = (() => (++calls === 1 ? slow.promise : fast.promise)) as typeof orderApi.fetchOrders;
  useOrderStore.getState().reset();
  const oldRequest = useOrderStore.getState().fetchItems({ search: 'old', page: 1, pageSize: 10 });
  const newRequest = useOrderStore.getState().fetchItems({ search: 'new', page: 1, pageSize: 10 });
  fast.resolve(response('new-result'));
  await newRequest;
  slow.resolve(response('old-result', 1, 99));
  await oldRequest;
  assert.equal(useOrderStore.getState().items[0]?.id, 'new-result', '较慢的旧筛选请求不得覆盖新结果');
  assert.equal(useOrderStore.getState().pagination.total, 1);

  const fetchedPages: number[] = [];
  orderApi.fetchOrders = (async (filters) => {
    const requestedPage = filters?.page || 1;
    fetchedPages.push(requestedPage);
    return response('previous-page-result', requestedPage, 11);
  }) as typeof orderApi.fetchOrders;
  orderApi.deleteOrder = (async () => ({ code: 0, message: 'ok', data: true })) as typeof orderApi.deleteOrder;
  orderApi.fetchOrderStats = (async () => ({
    code: 0,
    message: 'ok',
    data: { todayAmount: 0, todayCount: 0, monthAmount: 0, monthCount: 0, refundCount: 0, refundAmount: 0, upgradeCount: 0, upgradeAmount: 0 },
  })) as typeof orderApi.fetchOrderStats;
  useOrderStore.setState({
    items: [order('last-row')],
    filters: { page: 2, pageSize: 10 },
    pagination: { page: 2, pageSize: 10, total: 11, totalPages: 2 },
  });
  await useOrderStore.getState().delete('last-row');
  assert.deepEqual(fetchedPages, [1], '删除末页最后一条后应自动返回上一页');
  assert.equal(useOrderStore.getState().filters.page, 1);
} finally {
  orderApi.fetchOrders = originalFetchOrders;
  orderApi.deleteOrder = originalDeleteOrder;
  orderApi.fetchOrderStats = originalFetchStats;
  useOrderStore.getState().reset();
}
