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

export interface CockpitCustomerBattleItem {
  customerId: string;
  customerName: string;
  company: string;
  ownerId?: string;
  ownerName: string;
  stageCode: string;
  stageLabel: string;
  opportunityAmount: number;
  nextActionTitle?: string;
  nextActionDueAt?: Timestamp;
  contactGapDays?: number;
  riskLevel: 'low' | 'medium' | 'high';
  riskReason: string;
}

export interface CockpitCustomerBattleStage {
  stageCode: string;
  stageLabel: string;
  customerCount: number;
  opportunityAmount: number;
}

export interface CockpitSalesBattleProfile {
  userId: string;
  name: string;
  department?: string;
  identityStatus: 'resolved' | 'legacy' | 'unresolved';
  revenueAmount: number;
  orderCount: number;
  customerCount: number;
  activeOpportunityCount: number;
  opportunityAmount: number;
  todayDueTodoCount: number;
  todayCompletedTodoCount: number;
  todayFollowUpCount: number;
  overdueCustomerCount: number;
  riskCustomerCount: number;
  needsManagerInterventionCount?: number;
  missingNextActionCount: number;
  wonCount: number;
  lostCount: number;
  conversionRate: number;
  monthlyTargetAmount: number | null;
  targetGapAmount: number | null;
  targetCompletionRate: number | null;
  weeklyRevenueAmounts?: number[];
  stageDistribution?: CockpitCustomerBattleStage[];
  priorityCustomers: CockpitCustomerBattleItem[];
}

export interface CockpitDepartmentStatus {
  id: 'sales' | 'customer-success' | 'delivery' | 'academy' | 'finance' | 'marketing';
  name: string;
  memberCount: number;
  attentionCount: number;
  state: 'normal' | 'attention' | 'building';
  available: boolean;
}

export interface CockpitManagementPerformance {
  completedAmount: number;
  targetAmount: number | null;
  gapAmount: number | null;
  completionRate: number | null;
  targetSource: 'okr' | 'unconfigured';
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
    trend: CockpitTrendPoint[];
    startDate: string;
    endDate: string;
  };
  trend: CockpitTrendPoint[];
  salesRanking: CockpitPerformanceRankingItem[];
  recoveryRanking: CockpitPerformanceRankingItem[];
  customerHealth: CockpitCustomerHealth;
  customerBattles: CockpitCustomerBattleItem[];
  customerBattleStages: CockpitCustomerBattleStage[];
  salesBattleProfiles: CockpitSalesBattleProfile[];
  leadSources: CockpitLeadSourceItem[];
  orderHealth: CockpitOrderHealth;
  financeHealth: CockpitFinanceHealth;
  departmentStatuses: CockpitDepartmentStatus[];
  managementPerformance: CockpitManagementPerformance;
  riskTasks: CockpitRiskItem[];
}
