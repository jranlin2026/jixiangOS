/** 通用 ID 类型 */
export type ID = string;

/** 时间戳类型 */
export type Timestamp = string;

/** 分页参数 */
export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** 排序参数 */
export interface SortParams {
  field: string;
  direction: 'asc' | 'desc';
}

/** 通用 API 响应 */
export interface ApiResponse<T> {
  code: number;
  data: T;
  message: string;
}

/** 分页 API 响应 */
export interface PaginatedResponse<T> {
  items: T[];
  pagination: Pagination;
}

/** 筛选参数基类 */
export interface BaseFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

/** 时间范围 */
export interface DateRange {
  start: string;
  end: string;
}

/** 产品等级/业务分类 — 由产品配置维护，预设值仅作为初始数据 */
export type ProductLevel = string;

/** 客户等级 */
export type CustomerLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

/** 订单类型 — 由系统设置维护，预设值仅作为初始数据 */
export type OrderType = string;

/** 支付方式 */
export type PaymentMethod = '银行转账' | '支付宝' | '微信支付' | '对公转账' | '现金';

/** 退款状态 — 统一来源，从 order.ts 迁移到此处 */
export type RefundStatus =
  | '无'
  | '待分配'
  | '挽回中'
  | '挽回成功'
  | '待财务退款'
  | '退款申请中'
  | '退款已批准'
  | '退款已完成'
  | '退款已拒绝';

/** 产品等级 → 客户等级 映射 */
export const PRODUCT_TO_CUSTOMER_LEVEL: Record<string, CustomerLevel> = {
  '899': 'L2',
  '课程': 'L2',
  '代理': 'L3',
  '贴牌': 'L4',
  '合伙人': 'L5',
};
