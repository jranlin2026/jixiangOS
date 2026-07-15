import type { Timestamp } from './common';
import type { CustomerTodo } from './customerTodo';

export type DashboardRangePreset = 'today' | 'week' | 'month' | 'custom';

export interface DashboardDateRange {
  preset: DashboardRangePreset;
  startDate?: string;
  endDate?: string;
}

export interface HomeTaskItem {
  id: string;
  title: string;
  count: number;
  path: string;
  tone: 'primary' | 'warning' | 'error' | 'success' | 'info';
  description: string;
}

export interface HomeQuickAction {
  id: string;
  label: string;
  path: string;
  icon: 'lead' | 'customer' | 'order' | 'review' | 'commission' | 'refund' | 'delivery' | 'ai';
}

export interface HomeActivityItem {
  id: string;
  title: string;
  content: string;
  module: string;
  path: string;
  createdAt: Timestamp;
}

export interface HomeWorkbenchData {
  todayLabel: string;
  scopeLabel: string;
  tasks: HomeTaskItem[];
  quickActions: HomeQuickAction[];
  activities: HomeActivityItem[];
  personalMetrics: Array<{ label: string; value: string; tone: HomeTaskItem['tone'] }>;
  customerTodos: CustomerTodo[];
}

export interface CockpitKpi {
  id: string;
  label: string;
  value: string;
  subValue?: string;
  tone: HomeTaskItem['tone'];
}

export interface CockpitFunnelItem {
  id: string;
  label: string;
  count: number;
  amount?: number;
}

export interface CockpitRankingItem {
  name: string;
  count: number;
  amount: number;
}

export interface CockpitRiskItem {
  id: string;
  title: string;
  count: number;
  path: string;
  tone: HomeTaskItem['tone'];
}

export interface BusinessCockpitData {
  rangeLabel: string;
  scopeLabel: string;
  kpis: CockpitKpi[];
  funnel: CockpitFunnelItem[];
  salesRanking: CockpitRankingItem[];
  contributorRanking: CockpitRankingItem[];
  sourceConversion: CockpitRankingItem[];
  productRevenue: CockpitRankingItem[];
  riskTasks: CockpitRiskItem[];
}
