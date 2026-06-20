import type { ID, Timestamp } from './common';

export type AIResultType = 'CHART' | 'TABLE' | 'TEXT' | 'SUGGESTION' | 'METRIC' | 'ACTION';

export type AIAssistantTone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface AIAssistantAction {
  label: string;
  path: string;
  variant?: 'contained' | 'outlined' | 'text';
}

export interface AIAssistantMetric {
  id: string;
  label: string;
  value: string;
  subValue?: string;
  tone: AIAssistantTone;
}

export interface AIAssistantTask {
  id: string;
  title: string;
  description: string;
  count: number;
  priority: 'high' | 'medium' | 'low';
  module: string;
  path: string;
  actionLabel: string;
}

export interface AIAssistantInsight {
  id: string;
  title: string;
  content: string;
  tone: AIAssistantTone;
  path?: string;
}

export interface AIPromptTemplate {
  id: string;
  category: string;
  label: string;
  prompt: string;
}

export interface AIAssistantWorkbench {
  scopeLabel: string;
  generatedAt: Timestamp;
  metrics: AIAssistantMetric[];
  tasks: AIAssistantTask[];
  insights: AIAssistantInsight[];
  promptTemplates: AIPromptTemplate[];
}

export interface AIResultData {
  type: AIResultType;
  title: string;
  content: string;
  chartData?: Record<string, unknown>[];
  tableHeaders?: { key: string; label: string }[];
  tableRows?: Record<string, unknown>[];
  suggestions?: string[];
  metrics?: AIAssistantMetric[];
  actions?: AIAssistantAction[];
}

export interface AIQueryMessage {
  id: ID;
  role: 'user' | 'assistant';
  content: string;
  results?: AIResultData[];
  createdAt: Timestamp;
}

export interface AIQuerySession {
  id: ID;
  title: string;
  messages: AIQueryMessage[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type AIQueryScenario =
  | 'sales_data'
  | 'refund_reason'
  | 'sales_ranking'
  | 'conversion_rate'
  | 'high_potential'
  | 'finance_settlement'
  | 'order_review'
  | 'daily_tasks'
  | 'general';
