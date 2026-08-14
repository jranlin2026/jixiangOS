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
  amount?: number;
  description?: string;
}

export interface CockpitSummary {
  formalReceiptAmount: number;
  recoveryAmount: number;
  operatingAmount: number;
  formalOrderCount: number;
  recoveryOrderCount: number;
  newLeadCount: number;
  newCustomerCount: number;
}

export interface CockpitTrendPoint {
  date: string;
  label: string;
  formalReceiptAmount: number;
  recoveryAmount: number;
}

export interface CockpitPerformanceRankingItem {
  userId: string;
  name: string;
  department?: string;
  amount: number;
  count: number;
  averageAmount: number;
  assistCount?: number;
  identityStatus?: 'resolved' | 'legacy' | 'unresolved';
}

export interface CockpitCustomerHealth {
  newLeadCount: number;
  followedLeadCount: number;
  leadFollowRate: number;
  newCustomerCount: number;
  followingCustomerCount: number;
  followedCustomerCount: number;
  overdueTodoCount: number;
}

export interface CockpitLeadSourceItem {
  source: string;
  leadCount: number;
  followedCount: number;
  followRate: number;
  convertedCustomerCount: number;
  receiptAmount: number;
}

export interface CockpitOrderHealth {
  formalOrderCount: number;
  recoveryOrderCount: number;
  pendingReviewCount: number;
  returnedApplicationCount: number;
  refundingOrderCount: number;
  refundedOrderCount: number;
  refundAmount: number;
}

export interface CockpitFinanceHealth {
  formalGrossReceiptAmount: number;
  formalAdjustmentAmount: number;
  formalNetReceiptAmount: number;
  reconciliationIssueCount: number;
  reconciliationAmountIssueCount: number;
  reconciliationBusinessTimeIssueCount: number;
  reconciliationDifferenceAmount: number;
  reconciliationOrderIds: string[];
  reconciliationDetailsRestricted: boolean;
  pendingHandlingCommissionCount: number;
  pendingConfirmCommissionAmount: number;
  pendingPayCommissionAmount: number;
  paidCommissionAmount: number;
}

export interface BusinessCockpitData {
  rangeLabel: string;
  scopeLabel: string;
  updatedAt: Timestamp;
  summary: CockpitSummary;
  comparison: {
    label: string;
    summary: CockpitSummary;
    refundAmount: number;
    formalNetReceiptAmount: number;
  };
  trend: CockpitTrendPoint[];
  salesRanking: CockpitPerformanceRankingItem[];
  recoveryRanking: CockpitPerformanceRankingItem[];
  customerHealth: CockpitCustomerHealth;
  leadSources: CockpitLeadSourceItem[];
  orderHealth: CockpitOrderHealth;
  financeHealth: CockpitFinanceHealth;
  riskTasks: CockpitRiskItem[];
}
