import type { OrderFilters } from '../../types/order';

export type OrderSortOption = 'created_desc' | 'payment_desc' | 'payment_asc' | 'amount_desc' | 'amount_asc';

export const ORDER_SORT_OPTIONS: Array<{ value: OrderSortOption; label: string }> = [
  { value: 'created_desc', label: '最新创建' },
  { value: 'payment_desc', label: '最新付款' },
  { value: 'payment_asc', label: '最早付款' },
  { value: 'amount_desc', label: '实付金额从高到低' },
  { value: 'amount_asc', label: '实付金额从低到高' },
];

export function orderSortFilters(value: OrderSortOption): Pick<OrderFilters, 'sortBy' | 'sortDirection'> {
  if (value === 'payment_desc') return { sortBy: 'paymentDate', sortDirection: 'desc' };
  if (value === 'payment_asc') return { sortBy: 'paymentDate', sortDirection: 'asc' };
  if (value === 'amount_desc') return { sortBy: 'actualAmount', sortDirection: 'desc' };
  if (value === 'amount_asc') return { sortBy: 'actualAmount', sortDirection: 'asc' };
  return { sortBy: 'createdAt', sortDirection: 'desc' };
}

export function resolveOrderSortOption(filters: Pick<OrderFilters, 'sortBy' | 'sortDirection'>): OrderSortOption {
  if (filters.sortBy === 'paymentDate') return filters.sortDirection === 'asc' ? 'payment_asc' : 'payment_desc';
  if (filters.sortBy === 'actualAmount') return filters.sortDirection === 'asc' ? 'amount_asc' : 'amount_desc';
  return 'created_desc';
}
