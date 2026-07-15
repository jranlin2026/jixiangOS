import { backendRequest } from './backendClient';
import type { ApiResponse } from './types';
import type { CustomerTodo, CustomerTodoInput } from '../types/customerTodo';

const base = (customerId: string) => `/customers/${encodeURIComponent(customerId)}/todos`;

export const customerTodoApi = {
  list(customerId: string): Promise<ApiResponse<CustomerTodo[]>> {
    return backendRequest<CustomerTodo[]>(base(customerId));
  },
  create(customerId: string, input: CustomerTodoInput): Promise<ApiResponse<CustomerTodo>> {
    return backendRequest<CustomerTodo>(base(customerId), { method: 'POST', body: JSON.stringify(input) });
  },
  update(customerId: string, todoId: string, input: CustomerTodoInput): Promise<ApiResponse<CustomerTodo>> {
    return backendRequest<CustomerTodo>(`${base(customerId)}/${encodeURIComponent(todoId)}`, { method: 'PUT', body: JSON.stringify(input) });
  },
  complete(customerId: string, todoId: string): Promise<ApiResponse<CustomerTodo>> {
    return backendRequest<CustomerTodo>(`${base(customerId)}/${encodeURIComponent(todoId)}/complete`, { method: 'POST' });
  },
  reopen(customerId: string, todoId: string): Promise<ApiResponse<CustomerTodo>> {
    return backendRequest<CustomerTodo>(`${base(customerId)}/${encodeURIComponent(todoId)}/reopen`, { method: 'POST' });
  },
  cancel(customerId: string, todoId: string, reason = ''): Promise<ApiResponse<CustomerTodo>> {
    return backendRequest<CustomerTodo>(`${base(customerId)}/${encodeURIComponent(todoId)}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) });
  },
};
