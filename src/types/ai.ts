import type { ID, Timestamp } from './common';

/** AI 结果类型 */
export type AIResultType = 'CHART' | 'TABLE' | 'TEXT' | 'SUGGESTION';

/** AI 结果数据 */
export interface AIResultData {
  type: AIResultType;
  title: string;
  content: string;
  chartData?: Record<string, unknown>[];
  tableHeaders?: { key: string; label: string }[];
  tableRows?: Record<string, unknown>[];
  suggestions?: string[];
}

/** AI 查询消息 */
export interface AIQueryMessage {
  id: ID;
  role: 'user' | 'assistant';
  content: string;
  results?: AIResultData[];
  createdAt: Timestamp;
}

/** AI 查询会话 */
export interface AIQuerySession {
  id: ID;
  title: string;
  messages: AIQueryMessage[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** AI 查询场景 */
export type AIQueryScenario =
  | 'sales_data'
  | 'refund_reason'
  | 'sales_ranking'
  | 'conversion_rate'
  | 'high_potential'
  | 'general';
