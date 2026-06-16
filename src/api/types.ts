/** API 响应类型 */
export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

/** 分页响应类型 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

/** 创建成功的 API 响应 */
export function createSuccessResponse<T>(data: T, message: string = 'success'): ApiResponse<T> {
  return { code: 0, data, message };
}

/** 创建失败的 API 响应 */
export function createErrorResponse<T>(message: string, code: number = -1): ApiResponse<T> {
  return { code, data: null as T, message };
}

/** 模拟异步延迟 */
export function delay(ms: number = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
