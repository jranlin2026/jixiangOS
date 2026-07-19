import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import TablePagination from '../../shared/components/TablePagination';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import PaymentsIcon from '@mui/icons-material/Payments';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { commissionApi, commissionRuleApi, customerApi, orderApi, settingsApi } from '../../api';
import { getProductLevelRowSx, getProductLevelTagSx, normalizeResourceOwnership } from '../../shared/utils/constants';
import { formatCurrency, formatDate, formatEmployeeNameWithPosition, formatPaginationRows } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import ResizableHeaderCell, {
  readColumnWidths,
  resetColumnWidths,
  resizeColumnWidths,
  writeColumnWidths,
  type ColumnWidthMap,
} from '../../shared/components/ResizableTable';
import CommissionRuleConfig from './CommissionRuleConfig';
import OrderDetail from '../Orders/OrderDetail';
import CustomerDetail from '../Customers/CustomerDetail';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import type {
  Commission,
  CommissionAdjustmentInput,
  CommissionCreatableOrderSummary,
  CommissionOrderSummary,
  CommissionOrderSummaryFilters,
  CommissionOrderSummaryStatus,
  CommissionOrderSummaryStatusCounts,
  CommissionOperationLog,
  CommissionPayoutPlan,
  CommissionRole,
  CommissionRoleConfig,
  MonthlyCommissionRoleSummary,
  MonthlyCommissionPayout,
} from '../../types/commission';
import type { Department } from '../../types/department';
import type { Customer } from '../../types/customer';
import type { Order } from '../../types/order';
import type { Position } from '../../types/position';
import type { User } from '../../types/settings';
import { moduleRadius, moduleTablePaperSx, moduleTokens } from '../../shared/components/ModuleShell';

const ORDER_STATUS_OPTIONS: Array<{ value: CommissionOrderSummaryStatus | '全部'; label: string; important?: boolean }> = [
  { value: '全部', label: '全部' },
  { value: '待处理', label: '待处理', important: true },
  { value: '待确认', label: '待确认' },
  { value: '待发放', label: '待发放' },
  { value: '已发放', label: '已发放' },
  { value: '已撤回', label: '已撤回' },
];

const DEFAULT_ORDER_STATUS_COUNTS: CommissionOrderSummaryStatusCounts = {
  全部: 0,
  待处理: 0,
  待确认: 0,
  待发放: 0,
  已发放: 0,
  已撤回: 0,
};

type OrderSplitColumnId =
  | 'orderNo'
  | 'customerName'
  | 'productName'
  | 'productLevel'
  | 'orderType'
  | 'orderAmount'
  | 'resourceOwnership'
  | 'paymentDate'
  | 'salesOwner'
  | 'leadInputBy'
  | 'leadContributorName'
  | 'officialPaymentChannel'
  | 'originalOrderId'
  | 'notes'
  | 'createdAt'
  | 'splitDetails'
  | 'totalCommissionAmount'
  | 'pendingAssignCount'
  | 'exceptionCount'
  | 'status';

type OrderSplitColumnMeta = {
  id: OrderSplitColumnId;
  label: string;
  defaultWidth: number;
};

const ORDER_SPLIT_VIEW_STORAGE_KEY = 'aaos_commission_order_split_view_v3';
const ORDER_SPLIT_WIDTH_STORAGE_KEY = 'aaos_commission_order_split_widths_v3';

const ORDER_SPLIT_COLUMNS: OrderSplitColumnMeta[] = [
  { id: 'orderNo', label: '订单号', defaultWidth: 170 },
  { id: 'customerName', label: '客户', defaultWidth: 150 },
  { id: 'productName', label: '产品名称', defaultWidth: 180 },
  { id: 'productLevel', label: '产品等级', defaultWidth: 140 },
  { id: 'orderType', label: '订单类型', defaultWidth: 140 },
  { id: 'orderAmount', label: '实付金额', defaultWidth: 130 },
  { id: 'officialPaymentChannel', label: '官方收款渠道', defaultWidth: 160 },
  { id: 'resourceOwnership', label: '资源归属', defaultWidth: 120 },
  { id: 'paymentDate', label: '付款时间', defaultWidth: 180 },
  { id: 'salesOwner', label: '销售负责人', defaultWidth: 130 },
  { id: 'leadInputBy', label: '线索录入人', defaultWidth: 140 },
  { id: 'leadContributorName', label: '线索贡献人', defaultWidth: 150 },
  { id: 'originalOrderId', label: '第三方平台订单', defaultWidth: 180 },
  { id: 'notes', label: '备注', defaultWidth: 220 },
  { id: 'createdAt', label: '创建时间', defaultWidth: 160 },
  { id: 'splitDetails', label: '分账明细', defaultWidth: 310 },
  { id: 'totalCommissionAmount', label: '分账总额', defaultWidth: 130 },
  { id: 'pendingAssignCount', label: '待分配数', defaultWidth: 110 },
  { id: 'exceptionCount', label: '撤回数', defaultWidth: 130 },
  { id: 'status', label: '分账状态', defaultWidth: 120 },
];

const DEFAULT_ORDER_SPLIT_VISIBLE_COLUMNS: OrderSplitColumnId[] = [
  'orderNo',
  'customerName',
  'productName',
  'productLevel',
  'orderType',
  'orderAmount',
  'officialPaymentChannel',
  'resourceOwnership',
  'paymentDate',
  'salesOwner',
  'leadInputBy',
  'leadContributorName',
  'originalOrderId',
  'notes',
  'createdAt',
  'splitDetails',
  'status',
];

const DEFAULT_ORDER_SPLIT_COLUMN_ORDER = ORDER_SPLIT_COLUMNS.map((column) => column.id);
const DEFAULT_ORDER_SPLIT_COLUMN_WIDTHS = ORDER_SPLIT_COLUMNS.reduce<ColumnWidthMap>((result, column) => {
  result[column.id] = column.defaultWidth;
  return result;
}, {});

type OrderSplitViewConfig = {
  visibleColumnIds: OrderSplitColumnId[];
  columnOrder: OrderSplitColumnId[];
  frozenColumnCount: number;
};

function normalizeOrderSplitColumnIds(ids: unknown, fallback: OrderSplitColumnId[]): OrderSplitColumnId[] {
  if (!Array.isArray(ids)) return [...fallback];
  const validIds = new Set(ORDER_SPLIT_COLUMNS.map((column) => column.id));
  const normalized = ids.filter((id): id is OrderSplitColumnId => typeof id === 'string' && validIds.has(id as OrderSplitColumnId));
  return normalized.length ? normalized : [...fallback];
}

function readOrderSplitViewConfig(): OrderSplitViewConfig {
  try {
    const raw = localStorage.getItem(ORDER_SPLIT_VIEW_STORAGE_KEY);
    if (!raw) {
      return {
        visibleColumnIds: [...DEFAULT_ORDER_SPLIT_VISIBLE_COLUMNS],
        columnOrder: [...DEFAULT_ORDER_SPLIT_COLUMN_ORDER],
        frozenColumnCount: 0,
      };
    }
    const parsed = JSON.parse(raw) as Partial<OrderSplitViewConfig>;
    const storedOrder = normalizeOrderSplitColumnIds(parsed.columnOrder, DEFAULT_ORDER_SPLIT_COLUMN_ORDER);
    const missingIds = DEFAULT_ORDER_SPLIT_COLUMN_ORDER.filter((id) => !storedOrder.includes(id));
    return {
      visibleColumnIds: normalizeOrderSplitColumnIds(parsed.visibleColumnIds, DEFAULT_ORDER_SPLIT_VISIBLE_COLUMNS),
      columnOrder: [...storedOrder, ...missingIds],
      frozenColumnCount: Math.max(0, Math.min(Number(parsed.frozenColumnCount) || 0, ORDER_SPLIT_COLUMNS.length)),
    };
  } catch {
    return {
      visibleColumnIds: [...DEFAULT_ORDER_SPLIT_VISIBLE_COLUMNS],
      columnOrder: [...DEFAULT_ORDER_SPLIT_COLUMN_ORDER],
      frozenColumnCount: 0,
    };
  }
}

function getOrderStatusColor(status: CommissionOrderSummaryStatus): 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info' {
  if (status === '已发放') return 'success';
  if (status === '已撤回') return 'default';
  if (status === '待处理') return 'warning';
  if (status === '待确认') return 'info';
  if (status === '待发放') return 'primary';
  return 'default';
}

function getOrderStatusButtonColor(status: CommissionOrderSummaryStatus | '全部'): 'primary' | 'warning' | 'info' | 'success' | 'inherit' {
  if (status === '待处理') return 'warning';
  if (status === '待确认') return 'info';
  if (status === '待发放') return 'primary';
  if (status === '已发放') return 'success';
  return 'primary';
}

function getPayoutStatusColor(status: MonthlyCommissionPayout['status']): 'default' | 'success' | 'error' | 'warning' | 'info' {
  if (status === '已发放') return 'success';
  if (status === '待确认') return 'info';
  if (status === '待发放') return 'warning';
  return 'default';
}

function getCommissionStatusColor(status: Commission['status'] | '待处理'): 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info' {
  if (status === '已发放') return 'success';
  if (status === '待发放') return 'primary';
  if (status === '待处理') return 'warning';
  if (status === '待确认') return 'info';
  return 'default';
}

function getCommissionIssueText(commission: Commission): string {
  return [
    commission.auditReason,
    commission.frozenReason,
    commission.calculationNote,
    commission.formulaText,
    commission.payoutPlanName,
  ].filter(Boolean).join('；');
}

function isManualOrCustomCommission(commission: Commission): boolean {
  const issueText = getCommissionIssueText(commission);
  return Boolean(commission.isManualAdjusted)
    || commission.sourceType === '人工新增'
    || issueText.includes('自定义金额')
    || issueText.includes('财务人工')
    || issueText.includes('人工新增');
}

function hasResolvedCommissionBasis(commission: Commission): boolean {
  return Boolean(
    commission.payoutPlanId
    || commission.payoutPlanName
    || isManualOrCustomCommission(commission),
  );
}

function getCommissionDisplayStatus(commission: Commission): Commission['status'] | '待处理' {
  if (commission.status !== '待确认') return commission.status;
  const issueText = getCommissionIssueText(commission);
  const hasUnresolvedRuleText = ['未匹配', '未命中', '暂不计算', '缺少', '不可用'].some((keyword) => issueText.includes(keyword));
  const isPendingAssignment = !commission.ownerId || commission.owner === '待分配';
  if (
    isPendingAssignment
    || Boolean(commission.frozenReason)
    || issueText.includes('冻结')
    || !hasResolvedCommissionBasis(commission)
    || ((Number(commission.commissionAmount) || 0) === 0 && hasUnresolvedRuleText)
  ) {
    return '待处理';
  }
  return commission.status;
}

function escapeCsvValue(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

const CUSTOM_PAYOUT_PLAN_ID = '__custom_amount__';
const CUSTOM_PAYOUT_PLAN_NAME = '自定义金额';

const MONTHLY_PAYOUT_COLUMN_WIDTHS = {
  expand: 48,
  employee: 150,
  department: 130,
  orderCount: 90,
  monthlyPaidAmount: 120,
  totalAmount: 120,
  pendingConfirmAmount: 110,
  pendingPayAmount: 110,
  paidAmount: 110,
  withdrawnAmount: 110,
  status: 100,
  actions: 96,
};

const MONTHLY_PAYOUT_TABLE_WIDTH = Object.values(MONTHLY_PAYOUT_COLUMN_WIDTHS).reduce((sum, width) => sum + width, 0);

interface CommissionProps {
  embedded?: boolean;
  initialTab?: 0 | 1 | 2;
  payoutScope?: 'all' | 'mine';
  payoutMode?: 'finance' | 'mine';
  hidePayoutFinanceActions?: boolean;
  hideEmbeddedOrderSplitViewButton?: boolean;
  orderSplitViewTrigger?: number;
  orderSplitCreateTrigger?: number;
}

type PayoutConfirmAction =
  | { type: 'generate'; title: string; message: string; confirmText: string }
  | { type: 'payOwner'; ownerId: string; title: string; message: string; confirmText: string }
  | { type: 'payBatch'; title: string; message: string; confirmText: string };

const Commission: React.FC<CommissionProps> = ({
  embedded = false,
  initialTab = 0,
  payoutScope = 'all',
  payoutMode = 'finance',
  hidePayoutFinanceActions = false,
  hideEmbeddedOrderSplitViewButton = false,
  orderSplitViewTrigger = 0,
  orderSplitCreateTrigger = 0,
}) => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const canManageOrderSettlement = hasPermission(currentUser, PERMISSION_KEYS.FINANCE_SETTLEMENT, 'write');
  const canManagePayout = hasPermission(currentUser, PERMISSION_KEYS.FINANCE_PAYOUT, 'write');
  const showPayoutFinanceActions = canManagePayout && !hidePayoutFinanceActions;
  const [tabValue, setTabValue] = useState(initialTab);
  const lastOrderSplitViewTriggerRef = useRef(orderSplitViewTrigger);
  const lastOrderSplitCreateTriggerRef = useRef(orderSplitCreateTrigger);
  const [orderRows, setOrderRows] = useState<CommissionOrderSummary[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderPagination, setOrderPagination] = useState({ page: 1, pageSize: 10, total: 0 });
  const [orderFilters, setOrderFilters] = useState({
    search: '',
    status: '全部' as CommissionOrderSummaryStatus | '全部',
    ownerId: '',
    role: '' as CommissionRole | '',
    month: '',
    startDate: '',
    endDate: '',
  });
  const [orderStatusCounts, setOrderStatusCounts] = useState<CommissionOrderSummaryStatusCounts>(DEFAULT_ORDER_STATUS_COUNTS);
  const [orderSplitViewOpen, setOrderSplitViewOpen] = useState(false);
  const [orderSplitViewConfig, setOrderSplitViewConfig] = useState<OrderSplitViewConfig>(() => readOrderSplitViewConfig());
  const [orderSplitColumnWidths, setOrderSplitColumnWidths] = useState<ColumnWidthMap>(() => (
    readColumnWidths(ORDER_SPLIT_WIDTH_STORAGE_KEY, DEFAULT_ORDER_SPLIT_COLUMN_WIDTHS)
  ));
  const [draggedOrderSplitColumnId, setDraggedOrderSplitColumnId] = useState<OrderSplitColumnId | null>(null);
  const [dragOverOrderSplitColumnId, setDragOverOrderSplitColumnId] = useState<OrderSplitColumnId | null>(null);

  const [payoutPeriod, setPayoutPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [payoutRows, setPayoutRows] = useState<MonthlyCommissionPayout[]>([]);
  const [expandedPayoutOwners, setExpandedPayoutOwners] = useState<Set<string>>(new Set());
  const [expandedMinePayoutGroups, setExpandedMinePayoutGroups] = useState<Set<string>>(new Set());
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutConfirmAction, setPayoutConfirmAction] = useState<PayoutConfirmAction | null>(null);
  const [payoutActionLoading, setPayoutActionLoading] = useState(false);

  const [commissionRoleConfigs, setCommissionRoleConfigs] = useState<CommissionRoleConfig[]>([]);
  const [payoutPlans, setPayoutPlans] = useState<CommissionPayoutPlan[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [createSplitOpen, setCreateSplitOpen] = useState(false);
  const [creatableOrderRows, setCreatableOrderRows] = useState<CommissionCreatableOrderSummary[]>([]);
  const [creatableOrderLoading, setCreatableOrderLoading] = useState(false);
  const [creatableOrderSearch, setCreatableOrderSearch] = useState('');
  const [selectedCreatableOrderId, setSelectedCreatableOrderId] = useState('');

  const [splitOrderId, setSplitOrderId] = useState('');
  const [splitRows, setSplitRows] = useState<CommissionAdjustmentInput[]>([]);
  const [splitReason, setSplitReason] = useState('');
  const [splitSaving, setSplitSaving] = useState(false);
  const [summaryDetail, setSummaryDetail] = useState<CommissionOrderSummary | null>(null);
  const [deleteSummary, setDeleteSummary] = useState<CommissionOrderSummary | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [detailActionLoading, setDetailActionLoading] = useState(false);
  const [detailActionReason, setDetailActionReason] = useState('');
  const [orderDetail, setOrderDetail] = useState<Order | null>(null);
  const [operationLogs, setOperationLogs] = useState<CommissionOperationLog[]>([]);
  const [customerDetail, setCustomerDetail] = useState<Customer | null>(null);

  const activeEmployees = useMemo(() => employees.filter((item) => item.isActive), [employees]);
  const activeRoleConfigs = useMemo(() => commissionRoleConfigs.filter((item) => item.isActive), [commissionRoleConfigs]);
  const activePayoutPlans = useMemo(() => payoutPlans.filter((item) => item.isActive), [payoutPlans]);
  const selectedCreatableOrder = useMemo(() => (
    creatableOrderRows.find((order) => order.orderId === selectedCreatableOrderId) || null
  ), [creatableOrderRows, selectedCreatableOrderId]);
  const monthlyPayoutSummary = useMemo(() => payoutRows.reduce((summary, row) => ({
    orderCount: summary.orderCount + row.orderCount,
    monthlyPaidAmount: summary.monthlyPaidAmount + row.monthlyPaidAmount,
    totalAmount: summary.totalAmount + row.totalAmount,
    pendingConfirmAmount: summary.pendingConfirmAmount + row.pendingConfirmAmount,
    pendingPayAmount: summary.pendingPayAmount + row.pendingPayAmount,
    paidAmount: summary.paidAmount + row.paidAmount,
    exceptionAmount: summary.exceptionAmount + (row.exceptionAmount || 0),
    withdrawnAmount: summary.withdrawnAmount + (row.withdrawnAmount || 0),
    chargebackAmount: 0,
  }), {
    orderCount: 0,
    monthlyPaidAmount: 0,
    totalAmount: 0,
    pendingConfirmAmount: 0,
    pendingPayAmount: 0,
    paidAmount: 0,
    exceptionAmount: 0,
    withdrawnAmount: 0,
    chargebackAmount: 0,
  }), [payoutRows]);

  const findDepartment = (departmentId?: string) => departments.find((item) => item.id === departmentId);
  const getDepartmentName = (departmentId?: string) => findDepartment(departmentId)?.name || '';
  const getOwnerDepartment = (user?: User) => {
    if (!user) return undefined;
    const directDepartment = findDepartment(user.departmentId);
    if (directDepartment) return directDepartment;
    const position = positions.find((item) => item.id === user.positionId || item.name === user.positionName);
    return findDepartment(position?.departmentId);
  };
  const findEmployeeForDisplay = (ownerId?: string, ownerName?: string) => {
    const normalizedOwnerName = ownerName?.trim();
    return activeEmployees.find((user) => (
      user.id === ownerId || Boolean(normalizedOwnerName && user.name === normalizedOwnerName)
    ));
  };
  const formatEmployeeDisplayName = (user?: User | null, fallbackName?: string) => {
    const name = user?.name || fallbackName?.trim() || '';
    if (!name) return '待分配';
    return formatEmployeeNameWithPosition(user || { name });
  };
  const formatOwnerDisplayName = (ownerId?: string, ownerName?: string) => (
    formatEmployeeDisplayName(findEmployeeForDisplay(ownerId, ownerName), ownerName)
  );
  const filterPayoutRowsForScope = (rows: MonthlyCommissionPayout[]) => {
    if (payoutScope !== 'mine') return rows;
    const currentName = currentUser?.name?.trim();
    const currentId = currentUser?.id;
    if (!currentId && !currentName) return [];
    return rows.filter((row) => (
      row.ownerId === currentId
      || Boolean(currentName && row.owner === currentName)
    ));
  };
  const orderedOrderSplitColumns = useMemo(() => {
    const byId = new Map(ORDER_SPLIT_COLUMNS.map((column) => [column.id, column]));
    return orderSplitViewConfig.columnOrder
      .map((id) => byId.get(id))
      .filter((column): column is OrderSplitColumnMeta => Boolean(column));
  }, [orderSplitViewConfig.columnOrder]);
  const visibleOrderSplitColumns = useMemo(() => (
    orderedOrderSplitColumns.filter((column) => orderSplitViewConfig.visibleColumnIds.includes(column.id))
  ), [orderedOrderSplitColumns, orderSplitViewConfig.visibleColumnIds]);
  const frozenColumnCount = Math.min(orderSplitViewConfig.frozenColumnCount, visibleOrderSplitColumns.length);
  const orderSplitTableMinWidth = visibleOrderSplitColumns.reduce((sum, column) => (
    sum + (orderSplitColumnWidths[column.id] || column.defaultWidth)
  ), 170);

  const roleOptionsForSplit = (currentRole: CommissionRole) => {
    const options = activeRoleConfigs.slice();
    if (currentRole && !options.some((item) => item.name === currentRole)) {
      const current = commissionRoleConfigs.find((item) => item.name === currentRole);
      return current ? [current, ...options] : [{ id: currentRole, name: currentRole, code: currentRole, isActive: false, sortOrder: 999, createdAt: '', updatedAt: '' }, ...options];
    }
    return options;
  };

  const planOptionsForSplit = (currentPlanId?: string) => {
    const options = activePayoutPlans.slice();
    if (currentPlanId && currentPlanId !== CUSTOM_PAYOUT_PLAN_ID && !options.some((item) => item.id === currentPlanId)) {
      const current = payoutPlans.find((item) => item.id === currentPlanId);
      if (current) return [current, ...options];
    }
    return options;
  };

  const findPayoutPlanForRow = (row: CommissionAdjustmentInput) => (
    payoutPlans.find((item) => item.id === row.payoutPlanId)
    || (row.payoutPlanName
      ? payoutPlans.find((item) => (
        item.name === row.payoutPlanName
        && item.commissionType === row.ruleCalculationType
      ))
      : undefined)
  );

  const isCustomPayoutRow = (row: CommissionAdjustmentInput) => (
    row.payoutPlanId === CUSTOM_PAYOUT_PLAN_ID
    || row.payoutPlanName === CUSTOM_PAYOUT_PLAN_NAME
  );

  const formatPayoutPlanValue = (
    plan?: Pick<CommissionPayoutPlan, 'commissionType' | 'commissionValue' | 'tiers'>,
  ) => {
    if (!plan) return '未选择方案';
    if (plan.commissionType === 'tiered_percentage') {
      const tiers = plan.tiers || [];
      return tiers.length ? `销售月累计阶梯 · ${tiers.length} 档` : '销售月累计阶梯';
    }
    if (plan.commissionType === 'percentage') return `按业绩金额 ${plan.commissionValue}%`;
    return `固定金额 ${formatCurrency(plan.commissionValue)}`;
  };

  const applyPayoutPlanToSplitRow = (
    row: CommissionAdjustmentInput,
    planId?: string,
  ): CommissionAdjustmentInput => {
    if (planId === CUSTOM_PAYOUT_PLAN_ID) {
      return {
        ...row,
        payoutPlanId: CUSTOM_PAYOUT_PLAN_ID,
        payoutPlanName: CUSTOM_PAYOUT_PLAN_NAME,
        ruleCalculationType: 'fixed',
        commissionRate: 0,
        commissionAmount: Number(row.commissionAmount || 0),
        tierSnapshot: undefined,
        calculationNote: row.calculationNote || '财务自定义金额分账',
      };
    }
    const plan = planId ? payoutPlans.find((item) => item.id === planId) : undefined;
    if (!plan) {
      return {
        ...row,
        payoutPlanId: undefined,
        payoutPlanName: undefined,
      };
    }
    const performanceAmount = Number(
      row.performanceAmount
      || selectedCreatableOrder?.orderAmount
      || summaryDetail?.orderAmount
      || 0,
    );
    if (plan.commissionType === 'tiered_percentage') {
      return {
        ...row,
        payoutPlanId: plan.id,
        payoutPlanName: plan.name,
        ruleCalculationType: plan.commissionType,
        commissionRate: 0,
        commissionAmount: 0,
        performanceAmount,
        tierSnapshot: {
          tiers: plan.tiers || [],
          baseAmount: performanceAmount,
          gapToNext: 0,
        },
        calculationNote: plan.description || '销售月累计阶梯提成，月报自动结算金额',
      };
    }
    if (plan.commissionType === 'percentage') {
      const rate = Number(plan.commissionValue || 0) / 100;
      return {
        ...row,
        payoutPlanId: plan.id,
        payoutPlanName: plan.name,
        ruleCalculationType: plan.commissionType,
        commissionRate: rate,
        commissionAmount: Math.round(performanceAmount * rate * 100) / 100,
        performanceAmount,
        tierSnapshot: undefined,
        calculationNote: plan.description || `按业绩金额 ${plan.commissionValue}% 计算`,
      };
    }
    return {
      ...row,
      payoutPlanId: plan.id,
      payoutPlanName: plan.name,
      ruleCalculationType: plan.commissionType,
      commissionRate: 0,
      commissionAmount: Number(plan.commissionValue || 0),
      performanceAmount,
      tierSnapshot: undefined,
      calculationNote: plan.description || `固定提成 ${formatCurrency(plan.commissionValue)}`,
    };
  };

  const fetchSettlementOptions = async () => {
    const [rolesRes, plansRes, directoryRes] = await Promise.all([
      commissionRuleApi.getCommissionRoleConfigs(),
      commissionRuleApi.getCommissionPayoutPlans(),
      settingsApi.fetchAssignableDirectory(),
    ]);
    if (rolesRes.code === 0) setCommissionRoleConfigs(rolesRes.data);
    if (plansRes.code === 0) setPayoutPlans(plansRes.data);
    if (directoryRes.code === 0) {
      setEmployees(directoryRes.data.users);
      setDepartments(directoryRes.data.departments);
      setPositions(directoryRes.data.positions);
    }
  };

  const buildOrderSummaryFilters = (status = orderFilters.status): CommissionOrderSummaryFilters => ({
    search: orderFilters.search || undefined,
    status,
    ownerId: orderFilters.ownerId || undefined,
    role: orderFilters.role || undefined,
    month: orderFilters.month || undefined,
    startDate: orderFilters.startDate || undefined,
    endDate: orderFilters.endDate || undefined,
    page: orderPagination.page,
    pageSize: orderPagination.pageSize,
  });

  const fetchOrderSummaries = async () => {
    setOrderLoading(true);
    try {
      const res = await commissionApi.fetchCommissionOrderSummaries(buildOrderSummaryFilters());
      if (res.code === 0) {
        setOrderRows(res.data.items);
        setOrderPagination((prev) => ({
          ...prev,
          page: res.data.pagination.page,
          pageSize: res.data.pagination.pageSize,
          total: res.data.pagination.total,
        }));
      }
    } finally {
      setOrderLoading(false);
    }
  };

  const fetchOrderStatusCounts = async () => {
    const res = await commissionApi.fetchCommissionOrderSummaryStatusCounts(buildOrderSummaryFilters('全部'));
    if (res.code === 0) setOrderStatusCounts(res.data);
  };

  const fetchCreatableOrders = async (search = creatableOrderSearch) => {
    setCreatableOrderLoading(true);
    try {
      const res = await commissionApi.fetchCreatableCommissionOrders({
        search: search || undefined,
        page: 1,
        pageSize: 50,
      });
      if (res.code === 0) {
        setCreatableOrderRows(res.data.items);
        setSelectedCreatableOrderId((current) => (
          current && res.data.items.some((order) => order.orderId === current) ? current : ''
        ));
      }
    } finally {
      setCreatableOrderLoading(false);
    }
  };

  const fetchMonthlyPayouts = async (period = payoutPeriod) => {
    if (!period) return;
    setPayoutLoading(true);
    try {
      const res = await commissionApi.fetchMonthlyCommissionPayouts(period);
      if (res.code === 0) setPayoutRows(filterPayoutRowsForScope(res.data));
    } finally {
      setPayoutLoading(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([fetchOrderSummaries(), fetchOrderStatusCounts(), fetchMonthlyPayouts()]);
  };

  useEffect(() => {
    fetchSettlementOptions();
  }, []);

  useEffect(() => {
    fetchOrderSummaries();
  }, [orderFilters, orderPagination.page, orderPagination.pageSize]);

  useEffect(() => {
    fetchOrderStatusCounts();
  }, [
    orderFilters.search,
    orderFilters.ownerId,
    orderFilters.role,
    orderFilters.month,
    orderFilters.startDate,
    orderFilters.endDate,
  ]);

  useEffect(() => {
    localStorage.setItem(ORDER_SPLIT_VIEW_STORAGE_KEY, JSON.stringify(orderSplitViewConfig));
  }, [orderSplitViewConfig]);

  useEffect(() => {
    writeColumnWidths(ORDER_SPLIT_WIDTH_STORAGE_KEY, orderSplitColumnWidths);
  }, [orderSplitColumnWidths]);

  useEffect(() => {
    fetchMonthlyPayouts(payoutPeriod);
  }, [payoutPeriod]);

  useEffect(() => {
    if (!createSplitOpen) return;
    fetchCreatableOrders(creatableOrderSearch);
  }, [createSplitOpen, creatableOrderSearch]);

  useEffect(() => {
    if (orderSplitViewTrigger <= 0) return;
    if (lastOrderSplitViewTriggerRef.current === orderSplitViewTrigger) return;
    lastOrderSplitViewTriggerRef.current = orderSplitViewTrigger;
    setOrderSplitViewOpen(true);
  }, [orderSplitViewTrigger]);

  useEffect(() => {
    if (orderSplitCreateTrigger <= 0) return;
    if (lastOrderSplitCreateTriggerRef.current === orderSplitCreateTrigger) return;
    lastOrderSplitCreateTriggerRef.current = orderSplitCreateTrigger;
    openCreateSplitDialog();
  }, [orderSplitCreateTrigger]);

  const updateOrderFilter = (key: keyof typeof orderFilters, value: string) => {
    setOrderPagination((prev) => ({ ...prev, page: 1 }));
    setOrderFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleOrderPageChange = (_: React.MouseEvent<HTMLButtonElement> | null, page: number) => {
    setOrderPagination((prev) => ({ ...prev, page: page + 1 }));
  };

  const handleOrderRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setOrderPagination((prev) => ({ ...prev, page: 1, pageSize: Number(event.target.value) }));
  };

  const getFrozenLeft = (columnIndex: number) => visibleOrderSplitColumns.slice(0, columnIndex).reduce((sum, column) => (
    sum + (orderSplitColumnWidths[column.id] || column.defaultWidth)
  ), 0);

  const getFrozenColumnSx = (columnIndex: number, isHead = false) => (
    columnIndex < frozenColumnCount
      ? {
        position: 'sticky',
        left: getFrozenLeft(columnIndex),
        zIndex: isHead ? 5 : 3,
        bgcolor: isHead ? '#f8fafc' : '#fff',
        boxShadow: '1px 0 0 #e5e7eb',
      }
      : {}
  );

  const handleResizeOrderSplitColumn = (columnId: string, delta: number) => {
    setOrderSplitColumnWidths((prev) => resizeColumnWidths(prev, columnId, delta));
  };

  const toggleOrderSplitColumn = (columnId: OrderSplitColumnId) => {
    setOrderSplitViewConfig((prev) => {
      const isVisible = prev.visibleColumnIds.includes(columnId);
      if (isVisible && prev.visibleColumnIds.length <= 1) return prev;
      return {
        ...prev,
        visibleColumnIds: isVisible
          ? prev.visibleColumnIds.filter((id) => id !== columnId)
          : [...prev.visibleColumnIds, columnId],
      };
    });
  };

  const reorderOrderSplitColumn = (sourceId: OrderSplitColumnId, targetId: OrderSplitColumnId) => {
    if (sourceId === targetId) return;
    setOrderSplitViewConfig((prev) => {
      const nextOrder = [...prev.columnOrder];
      const sourceIndex = nextOrder.indexOf(sourceId);
      const targetIndex = nextOrder.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      const [moved] = nextOrder.splice(sourceIndex, 1);
      nextOrder.splice(targetIndex, 0, moved);
      return { ...prev, columnOrder: nextOrder };
    });
  };

  const handleOrderSplitColumnDragStart = (event: React.DragEvent<HTMLDivElement>, columnId: OrderSplitColumnId) => {
    setDraggedOrderSplitColumnId(columnId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnId);

    const rowElement = event.currentTarget.closest('[data-order-split-column-row="true"]') as HTMLElement | null;
    if (!rowElement) return;
    const rowRect = rowElement.getBoundingClientRect();
    const dragPreview = rowElement.cloneNode(true) as HTMLElement;
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-9999px';
    dragPreview.style.left = '-9999px';
    dragPreview.style.width = `${rowRect.width}px`;
    dragPreview.style.background = '#fff';
    dragPreview.style.border = '1px solid #90caf9';
    dragPreview.style.borderRadius = '8px';
    dragPreview.style.boxShadow = '0 14px 32px rgba(15, 23, 42, 0.22)';
    dragPreview.style.opacity = '0.96';
    dragPreview.style.pointerEvents = 'none';
    dragPreview.style.zIndex = '9999';
    document.body.appendChild(dragPreview);
    event.dataTransfer.setDragImage(dragPreview, 24, Math.min(24, rowRect.height / 2));
    window.setTimeout(() => {
      dragPreview.remove();
    }, 0);
  };

  const handleOrderSplitColumnDrop = (event: React.DragEvent<HTMLDivElement>, targetId: OrderSplitColumnId) => {
    event.preventDefault();
    const sourceId = (event.dataTransfer.getData('text/plain') || draggedOrderSplitColumnId) as OrderSplitColumnId | null;
    if (sourceId) reorderOrderSplitColumn(sourceId, targetId);
    setDraggedOrderSplitColumnId(null);
    setDragOverOrderSplitColumnId(null);
  };

  const clearOrderSplitColumnDrag = () => {
    setDraggedOrderSplitColumnId(null);
    setDragOverOrderSplitColumnId(null);
  };

  const resetOrderSplitView = () => {
    setOrderSplitViewConfig({
      visibleColumnIds: [...DEFAULT_ORDER_SPLIT_VISIBLE_COLUMNS],
      columnOrder: [...DEFAULT_ORDER_SPLIT_COLUMN_ORDER],
      frozenColumnCount: 0,
    });
    setOrderSplitColumnWidths(resetColumnWidths(DEFAULT_ORDER_SPLIT_COLUMN_WIDTHS));
  };

  const buildNewSplitRow = (orderId: string, orderAmount: number): CommissionAdjustmentInput => (
    applyPayoutPlanToSplitRow({
      orderId,
      role: activeRoleConfigs[0]?.name || '销售',
      owner: '',
      ownerId: '',
      department: '',
      departmentId: '',
      commissionAmount: 0,
      commissionRate: 0,
      performanceAmount: orderAmount,
      calculationNote: '财务人工新增分账',
      ruleCalculationType: 'fixed',
    }, activePayoutPlans[0]?.id)
  );

  const openCreateSplitDialog = () => {
    if (!canManageOrderSettlement) return;
    setCreateSplitOpen(true);
    setCreatableOrderSearch('');
    setSelectedCreatableOrderId('');
    setSplitOrderId('');
    setSplitRows([]);
    setSplitReason('');
  };

  const closeCreateSplitDialog = () => {
    setCreateSplitOpen(false);
    setCreatableOrderSearch('');
    setSelectedCreatableOrderId('');
    setSplitOrderId('');
    setSplitRows([]);
    setSplitReason('');
  };

  const handleSelectCreatableOrder = (orderId: string) => {
    const order = creatableOrderRows.find((item) => item.orderId === orderId);
    setSelectedCreatableOrderId(orderId);
    setSplitOrderId(orderId);
    setSplitReason('');
    setSplitRows(order ? [buildNewSplitRow(order.orderId, order.orderAmount)] : []);
  };

  const resetSettlementDetailForms = () => {
    setDetailEditMode(false);
    setDetailActionReason('');
  };

  const canAdjustSettlementSummary = (summary: CommissionOrderSummary) => (
    !summary.sourceOrderDeleted && !['已发放', '已撤回'].includes(summary.status)
  );

  const getAdjustDisabledReason = (summary: CommissionOrderSummary) => {
    if (summary.sourceOrderDeleted) return '源订单已删除，只能查看明细和历史';
    if (summary.status === '已发放') return '已发放提成不能直接调整，第一版不支持系统内冲销，请财务线下处理';
    if (summary.status === '已撤回') return '提成已撤回，只能查看留痕';
    return '调整分账';
  };

  const canDeleteOrderSplitSummary = (summary: CommissionOrderSummary) => (
    summary.commissions.length > 0
    && (
      summary.sourceOrderDeleted
        ? summary.commissions.every((commission) => !['已发放', '待冲销', '已冲销'].includes(commission.status))
        : ['待处理', '待确认'].includes(summary.status)
          && summary.commissions.every((commission) => commission.status === '待确认')
    )
  );

  const getDeleteOrderSplitDisabledReason = (summary: CommissionOrderSummary) => {
    if (summary.sourceOrderDeleted) {
      if (!summary.commissions.length) return '没有可清理的废弃分账';
      if (!summary.commissions.every((commission) => !['已发放', '待冲销', '已冲销'].includes(commission.status))) return '已发放的分账不能清理；第一版不支持系统内冲销，请财务线下处理';
      return '清理废弃分账';
    }
    if (!summary.commissions.length) return '该订单没有可删除的分账';
    if (!['待处理', '待确认'].includes(summary.status)) return '已进入发放链路，请使用撤回流程';
    if (!summary.commissions.every((commission) => commission.status === '待确认')) return '仅待确认阶段的分账可直接删除';
    return '删除订单分账';
  };

  const loadOperationLogs = async (orderId: string) => {
    const res = await commissionApi.fetchCommissionOperationLogs(orderId);
    if (res.code === 0) {
      setOperationLogs(res.data.filter((log) => !['发起冲销', '退款待冲销', '冲销处理完成'].includes(log.action)));
    }
  };

  const mapCommissionToSplitRow = (item: Commission): CommissionAdjustmentInput => {
    const employee = activeEmployees.find((user) => user.id === item.ownerId || user.name === item.owner);
    const ownerDepartment = getOwnerDepartment(employee);
    return {
      id: item.id,
      orderId: item.orderId,
      role: item.role,
      owner: employee?.name || '',
      ownerId: employee?.id || '',
      department: ownerDepartment?.name || item.department || '',
      departmentId: ownerDepartment?.id || item.departmentId || '',
      paymentDate: item.paymentDate,
      commissionAmount: item.commissionAmount,
      commissionRate: item.commissionRate,
      performanceAmount: item.performanceAmount || item.orderAmount,
      calculationNote: item.calculationNote || item.formulaText || '',
      commissionRuleId: item.commissionRuleId,
      payoutPlanId: item.payoutPlanId || (item.payoutPlanName === CUSTOM_PAYOUT_PLAN_NAME ? CUSTOM_PAYOUT_PLAN_ID : undefined),
      payoutPlanName: item.payoutPlanName,
      ruleCalculationType: item.ruleCalculationType || (item.commissionRate > 0 ? 'percentage' : 'fixed'),
      tierSnapshot: item.tierSnapshot,
    };
  };

  const openSettlementDetail = async (summary: CommissionOrderSummary, options?: { edit?: boolean }) => {
    if (options?.edit && !canManageOrderSettlement) return;
    setSummaryDetail(summary);
    resetSettlementDetailForms();
    await loadOperationLogs(summary.orderId);
    if (options?.edit && canAdjustSettlementSummary(summary)) {
      const res = await commissionApi.fetchCommissionsByOrder(summary.orderId);
      if (res.code !== 0) return;
      setSplitOrderId(summary.orderId);
      setSplitRows(res.data.map(mapCommissionToSplitRow));
      setSplitReason('');
      setDetailEditMode(true);
    }
  };

  const reloadSettlementDetail = async (orderId: string) => {
    const res = await commissionApi.fetchCommissionOrderSummaries({ pageSize: 500 });
    if (res.code !== 0) return;
    const nextSummary = res.data.items.find((item) => item.orderId === orderId) || null;
    setSummaryDetail(nextSummary);
    await loadOperationLogs(orderId);
  };

  const renderSplitDetails = (summary: CommissionOrderSummary) => {
    const rows = summary.splitSummary.slice(0, 3);
    return (
      <Stack spacing={0.6} sx={{ py: 0.5 }}>
        {rows.map((item, index) => {
          const isPendingOwner = !item.owner || item.owner === '待分配';
          const isWithdrawn = ['已撤回', '待冲销', '已冲销'].includes(item.status);
          return (
            <Box
              key={`${summary.orderId}-${item.role}-${item.owner || 'pending'}-${index}`}
              sx={{
                display: 'grid',
                gridTemplateColumns: '72px minmax(72px, 1fr) 88px',
                gap: 1,
                alignItems: 'center',
                lineHeight: 1.45,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#111827' }}>{item.role}</Typography>
              <Typography
                variant="caption"
                sx={{
                  color: isPendingOwner ? '#d32f2f' : '#374151',
                  fontWeight: isPendingOwner ? 700 : 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {formatOwnerDisplayName(item.ownerId, item.owner)}
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
                {isWithdrawn && <Chip label="已撤回" size="small" color="default" sx={{ height: 20 }} />}
                <Typography variant="caption" sx={{ fontWeight: 700, color: item.amount > 0 ? '#d32f2f' : '#6b7280' }}>
                  {formatCurrency(item.amount)}
                </Typography>
              </Stack>
            </Box>
          );
        })}
        {summary.splitSummary.length > 3 && (
          <Button
            size="small"
            onClick={() => openSettlementDetail(summary)}
            sx={{ alignSelf: 'flex-start', minWidth: 0, px: 0.5, py: 0, lineHeight: 1.4 }}
          >
            查看全部 {summary.splitSummary.length} 条
          </Button>
        )}
        {!summary.splitSummary.length && <Typography variant="caption" sx={{ color: '#9ca3af' }}>暂无分账</Typography>}
      </Stack>
    );
  };

  const getSourceOrderDeletedReason = (summary: CommissionOrderSummary) => (
    summary.sourceOrderDeleted ? '源订单已删除，仅可查看分账和历史' : ''
  );

  const renderOrderSplitCell = (summary: CommissionOrderSummary, columnId: OrderSplitColumnId) => {
    switch (columnId) {
      case 'orderNo':
        if (summary.sourceOrderDeleted) {
          return (
            <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
              <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700, overflowWrap: 'anywhere' }}>
                {summary.orderNo}
              </Typography>
              <Chip label="源订单已删除" size="small" color="default" sx={{ height: 22 }} />
            </Stack>
          );
        }
        return (
          <Button
            variant="text"
            size="small"
            onClick={() => viewOrder(summary)}
            sx={{
              minWidth: 0,
              maxWidth: '100%',
              p: 0,
              fontWeight: 700,
              lineHeight: 1.4,
              textAlign: 'left',
              textTransform: 'none',
              justifyContent: 'flex-start',
            }}
          >
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {summary.orderNo}
            </Box>
          </Button>
        );
      case 'customerName':
        if (summary.sourceOrderDeleted) {
          return (
            <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500, overflowWrap: 'anywhere' }}>
              {summary.customerName || '-'}
            </Typography>
          );
        }
        return summary.customerName ? (
          <Button
            variant="text"
            size="small"
            onClick={() => viewCustomer(summary)}
            sx={{
              minWidth: 0,
              maxWidth: '100%',
              p: 0,
              fontWeight: 500,
              lineHeight: 1.4,
              textAlign: 'left',
              textTransform: 'none',
              justifyContent: 'flex-start',
            }}
          >
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {summary.customerName}
            </Box>
          </Button>
        ) : '-';
      case 'productName':
        return summary.productName || summary.productLevel || '-';
      case 'productLevel':
        return (
          <Chip
            label={summary.productLevel || '-'}
            size="small"
            sx={getProductLevelTagSx(summary.productLevel)}
          />
        );
      case 'orderType':
        return summary.orderType ? <Chip label={summary.orderType} size="small" variant="outlined" /> : '-';
      case 'orderAmount':
        return formatCurrency(summary.orderAmount);
      case 'resourceOwnership':
        return summary.resourceOwnership ? normalizeResourceOwnership(summary.resourceOwnership) : '-';
      case 'paymentDate':
        return summary.paymentDate ? formatDate(summary.paymentDate, 'yyyy-MM-dd HH:mm:ss') : '-';
      case 'salesOwner':
        return summary.salesOwner || summary.salesName || '-';
      case 'leadInputBy':
        return summary.leadInputBy || '-';
      case 'leadContributorName':
        return summary.leadContributorName || '-';
      case 'officialPaymentChannel':
        return summary.officialPaymentChannel || '-';
      case 'originalOrderId':
        return summary.originalOrderId || '-';
      case 'notes':
        return summary.notes || '-';
      case 'createdAt':
        return summary.createdAt ? formatDate(summary.createdAt) : '-';
      case 'splitDetails':
        return renderSplitDetails(summary);
      case 'totalCommissionAmount':
        return <Typography variant="body2" sx={{ fontWeight: 700, color: '#d32f2f' }}>{formatCurrency(summary.totalCommissionAmount)}</Typography>;
      case 'pendingAssignCount':
        return summary.pendingAssignCount ? <Chip label={summary.pendingAssignCount} size="small" color="warning" /> : '0';
      case 'exceptionCount':
        return summary.exceptionCount ? <Chip label={summary.exceptionCount} size="small" color="error" /> : '0';
      case 'status':
        return <Chip label={summary.status} size="small" color={getOrderStatusColor(summary.status)} />;
      default:
        return '-';
    }
  };

  const beginDetailAdjust = async () => {
    if (!canManageOrderSettlement) return;
    if (!summaryDetail || !canAdjustSettlementSummary(summaryDetail)) return;
    const res = await commissionApi.fetchCommissionsByOrder(summaryDetail.orderId);
    if (res.code !== 0) return;
    setSplitOrderId(summaryDetail.orderId);
    setSplitRows(res.data.map(mapCommissionToSplitRow));
    setSplitReason('');
    setDetailEditMode(true);
  };

  const recalcSplitRow = (row: CommissionAdjustmentInput): CommissionAdjustmentInput => {
    if (isCustomPayoutRow(row)) {
      return {
        ...row,
        ruleCalculationType: 'fixed',
        commissionRate: 0,
        tierSnapshot: undefined,
      };
    }
    const plan = findPayoutPlanForRow(row);
    const calculationType = row.ruleCalculationType || 'fixed';
    const performanceAmount = Number(row.performanceAmount || 0);
    if (calculationType === 'tiered_percentage') {
      return {
        ...row,
        commissionRate: 0,
        commissionAmount: 0,
        tierSnapshot: {
          tiers: plan?.tiers || row.tierSnapshot?.tiers || [],
          baseAmount: performanceAmount,
          gapToNext: row.tierSnapshot?.gapToNext || 0,
        },
      };
    }
    if (calculationType === 'percentage') {
      const commissionRate = plan ? Number(plan.commissionValue || 0) / 100 : Number(row.commissionRate || 0);
      return {
        ...row,
        commissionRate,
        commissionAmount: Math.round(performanceAmount * commissionRate * 100) / 100,
      };
    }
    return {
      ...row,
      commissionRate: 0,
      commissionAmount: plan ? Number(plan.commissionValue || 0) : row.commissionAmount,
    };
  };

  const updateSplitRow = <K extends keyof CommissionAdjustmentInput>(index: number, key: K, value: CommissionAdjustmentInput[K]) => {
    setSplitRows((prev) => prev.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, [key]: value };
      if (key === 'payoutPlanId') return applyPayoutPlanToSplitRow(next, value as string);
      return key === 'ruleCalculationType' || key === 'commissionRate' || key === 'performanceAmount'
        ? recalcSplitRow(next)
        : next;
    }));
  };

  const handleSplitOwnerChange = (index: number, ownerId: string) => {
    const employee = activeEmployees.find((item) => item.id === ownerId);
    const ownerDepartment = getOwnerDepartment(employee);
    setSplitRows((prev) => prev.map((row, rowIndex) => (
      rowIndex === index
        ? {
          ...row,
          ownerId,
          owner: employee?.name || '',
          departmentId: ownerDepartment?.id || '',
          department: ownerDepartment?.name || '',
        }
        : row
    )));
  };

  const handleAddSplitRow = () => {
    const orderAmount = selectedCreatableOrder?.orderAmount || splitRows[0]?.performanceAmount || summaryDetail?.orderAmount || 0;
    setSplitRows((prev) => [
      ...prev,
      buildNewSplitRow(splitOrderId, orderAmount),
    ]);
  };

  const canDeleteSplitRow = (row: CommissionAdjustmentInput) => {
    if (createSplitOpen) return true;
    if (splitRows.length <= 1) return false;
    if (!row.id) return true;
    const existing = summaryDetail?.commissions.find((commission) => commission.id === row.id);
    return !existing || existing.status === '待确认';
  };

  const handleSaveSplitRows = async () => {
    if (!canManageOrderSettlement) return;
    setSplitSaving(true);
    try {
      const res = await commissionApi.saveOrderCommissionAdjustments(splitOrderId, splitRows, splitReason);
      if (res.code === 0) {
        setDetailEditMode(false);
        if (createSplitOpen) closeCreateSplitDialog();
        await refreshAll();
        if (summaryDetail) await reloadSettlementDetail(splitOrderId);
      }
    } finally {
      setSplitSaving(false);
    }
  };

  const openDeleteOrderSplitDialog = (summary: CommissionOrderSummary) => {
    if (!canManageOrderSettlement) return;
    setDeleteSummary(summary);
    setDeleteReason('');
  };

  const closeDeleteOrderSplitDialog = () => {
    if (deleteLoading) return;
    setDeleteSummary(null);
    setDeleteReason('');
  };

  const confirmDeleteOrderSplit = async () => {
    if (!canManageOrderSettlement) return;
    if (!deleteSummary || !deleteReason.trim()) return;
    const deletingOrderId = deleteSummary.orderId;
    const shouldCleanupDeletedSource = deleteSummary.sourceOrderDeleted;
    setDeleteLoading(true);
    try {
      const res = shouldCleanupDeletedSource
        ? await commissionApi.cleanupDeletedSourceOrderCommissions(deletingOrderId, deleteReason)
        : await commissionApi.deleteOrderCommissions(deletingOrderId, deleteReason);
      if (res.code === 0) {
        setDeleteSummary(null);
        setDeleteReason('');
        if (summaryDetail?.orderId === deletingOrderId) {
          setSummaryDetail(null);
          resetSettlementDetailForms();
        }
        await refreshAll();
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmOrderFromDetail = async () => {
    if (!canManageOrderSettlement) return;
    if (!summaryDetail || summaryDetail.sourceOrderDeleted) return;
    setDetailActionLoading(true);
    try {
      const res = await commissionApi.confirmOrderCommissions(summaryDetail.orderId, '订单分账确认');
      if (res.code === 0) {
        await refreshAll();
        await reloadSettlementDetail(summaryDetail.orderId);
      }
    } finally {
      setDetailActionLoading(false);
    }
  };

  const withdrawOrderFromDetail = async () => {
    if (!canManageOrderSettlement) return;
    if (!summaryDetail || !detailActionReason.trim()) return;
    setDetailActionLoading(true);
    try {
      const res = await commissionApi.withdrawOrderCommissions(summaryDetail.orderId, detailActionReason);
      if (res.code === 0) {
        setDetailActionReason('');
        await refreshAll();
        await reloadSettlementDetail(summaryDetail.orderId);
      }
    } finally {
      setDetailActionLoading(false);
    }
  };

  const viewOrder = async (summary: CommissionOrderSummary) => {
    const res = await orderApi.fetchOrderById(summary.orderId);
    if (res.code === 0) setOrderDetail(res.data);
  };

  const viewCustomer = async (summary: CommissionOrderSummary) => {
    const orderRes = await orderApi.fetchOrderById(summary.orderId);
    const order = orderRes.code === 0 ? orderRes.data : null;
    let customer: Customer | null = null;

    if (order?.customerId) {
      const customerRes = await customerApi.fetchCustomerById(order.customerId);
      if (customerRes.code === 0) customer = customerRes.data;
    }

    if (!customer) {
      const customerRes = await customerApi.fetchCustomers({ search: summary.customerName, pageSize: 20 });
      if (customerRes.code === 0) {
        customer = customerRes.data.items.find(
          (item) => item.company === summary.customerName || item.name === summary.customerName,
        ) || customerRes.data.items[0] || null;
      }
    }

    if (!customer) return;

    const ordersRes = await orderApi.fetchOrders({ customerId: customer.id, pageSize: 100 });
    const relatedOrders = ordersRes.code === 0
      ? ordersRes.data.items.filter(
        (item) => item.customerId === customer!.id
          || item.customerName === customer!.company
          || item.customerName === customer!.name,
      )
      : [];

    setCustomerDetail({
      ...customer,
      orderCount: relatedOrders.length,
      totalSpent: relatedOrders.reduce((sum, item) => sum + (Number(item.actualAmount) || 0), 0),
    });
  };

  const generateMonthlyBatch = async () => {
    if (!canManagePayout) return;
    if (!payoutPeriod) return;
    setPayoutConfirmAction({
      type: 'generate',
      title: '生成发放单',
      message: `将按 ${payoutPeriod} 当前可发放提成生成发放单。待确认和已撤回明细不会进入可发放金额，历史订单、客户等业务数据不会被改动。`,
      confirmText: '生成发放单',
    });
  };

  const payOwner = async (ownerId?: string) => {
    if (!canManagePayout) return;
    if (!ownerId) return;
    const row = payoutRows.find((item) => item.ownerId === ownerId);
    setPayoutConfirmAction({
      type: 'payOwner',
      ownerId,
      title: '确认此人已发',
      message: `确认已完成 ${row ? formatOwnerDisplayName(row.ownerId, row.owner) : '该员工'} ${payoutPeriod} 的线下提成发放？系统会把该员工本月待发放提成标记为已发放，待确认和已撤回明细不会变更。`,
      confirmText: '确认此人已发',
    });
  };

  const payBatch = async () => {
    if (!canManagePayout) return;
    if (monthlyPayoutSummary.pendingPayAmount <= 0) return;
    setPayoutConfirmAction({
      type: 'payBatch',
      title: '确认本月已发放',
      message: `确认已完成 ${payoutPeriod} 本月线下提成发放？系统只会把待发放金额 ${formatCurrency(monthlyPayoutSummary.pendingPayAmount)} 标记为已发放，待确认和已撤回明细不会变更。`,
      confirmText: '确认本月已发放',
    });
  };

  const confirmPayoutAction = async () => {
    if (!canManagePayout) return;
    if (!payoutConfirmAction) return;
    setPayoutActionLoading(true);
    try {
      if (payoutConfirmAction.type === 'generate') {
        await commissionApi.generateSettlementBatch(payoutPeriod);
        await fetchMonthlyPayouts(payoutPeriod);
      }
      if (payoutConfirmAction.type === 'payOwner') {
        const res = await commissionApi.payMonthlyOwnerCommissions(payoutPeriod, payoutConfirmAction.ownerId);
        if (res.code === 0) {
          setPayoutRows(filterPayoutRowsForScope(res.data));
          await fetchOrderSummaries();
        }
      }
      if (payoutConfirmAction.type === 'payBatch') {
        const res = await commissionApi.payMonthlyCommissionBatch(payoutPeriod);
        if (res.code === 0) {
          setPayoutRows(filterPayoutRowsForScope(res.data));
          await fetchOrderSummaries();
        }
      }
      setPayoutConfirmAction(null);
    } finally {
      setPayoutActionLoading(false);
    }
  };

  const exportMonthlyStatement = () => {
    const headers = ['月份', '员工', '部门', '订单数', '总实付金额', '应发提成', '待确认', '待发放', '已发放', '已撤回', '状态'];
    const rows = payoutRows.map((row) => [
      row.period,
      formatOwnerDisplayName(row.ownerId, row.owner),
      row.department || '-',
      row.orderCount,
      row.monthlyPaidAmount,
      row.totalAmount,
      row.pendingConfirmAmount,
      row.pendingPayAmount,
      row.paidAmount,
      row.withdrawnAmount,
      row.status,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `员工提成月报-${payoutPeriod}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const getDisplayCommissionAmount = (commission: Commission, tierSnapshot?: Commission['tierSnapshot']) => {
    if (commission.ruleCalculationType !== 'tiered_percentage') return commission.commissionAmount;
    const rate = tierSnapshot?.currentTier?.rate ?? commission.tierSnapshot?.currentTier?.rate ?? Number(commission.commissionRate || 0) * 100;
    if (!rate) return commission.commissionAmount;
    return Math.round(Number(commission.performanceAmount || commission.orderAmount || 0) * rate) / 100;
  };

  const countsTowardTieredMonthlyBase = (commission: Commission) => (
    commission.ruleCalculationType === 'tiered_percentage'
    && !['已撤回', '待冲销', '已冲销'].includes(commission.status)
  );

  const buildTierSnapshotForSummary = (commissions: Commission[]) => {
    const tierSource = commissions.find((commission) => commission.tierSnapshot?.tiers?.length);
    const tiers = tierSource?.tierSnapshot?.tiers || [];
    const monthlyBase = commissions
      .filter(countsTowardTieredMonthlyBase)
      .reduce((sum, commission) => sum + Number(commission.performanceAmount || commission.orderAmount || 0), 0);
    if (!tiers.length) return tierSource?.tierSnapshot;
    const currentTier = tiers.find((tier) => (
      monthlyBase >= tier.minAmount
      && (tier.maxAmount === undefined || monthlyBase < tier.maxAmount)
    ));
    const nextTier = tiers.find((tier) => tier.minAmount > monthlyBase);
    return {
      tiers,
      currentTier,
      nextTier,
      baseAmount: monthlyBase,
      gapToNext: nextTier ? Math.round((nextTier.minAmount - monthlyBase) * 100) / 100 : 0,
    };
  };

  const buildRoleSummariesFromCommissions = (sourceCommissions: Commission[]): MonthlyCommissionRoleSummary[] => {
    const roleBucketMap = new Map<string, { role: CommissionRole; isTiered: boolean; commissions: Commission[] }>();
    sourceCommissions.forEach((commission) => {
      const isTiered = commission.ruleCalculationType === 'tiered_percentage';
      const key = `${commission.role}::${isTiered ? 'tiered' : 'simple'}`;
      const existing = roleBucketMap.get(key);
      if (existing) {
        existing.commissions.push(commission);
      } else {
        roleBucketMap.set(key, { role: commission.role, isTiered, commissions: [commission] });
      }
    });
    return Array.from(roleBucketMap.values()).map(({ role, isTiered, commissions }) => {
      const tierSnapshot = isTiered ? buildTierSnapshotForSummary(commissions) : undefined;
      const pendingConfirmAmount = commissions
        .filter((commission) => commission.status === '待确认')
        .reduce((sum, commission) => sum + getDisplayCommissionAmount(commission, tierSnapshot), 0);
      const pendingPayAmount = commissions
        .filter((commission) => commission.status === '待发放')
        .reduce((sum, commission) => sum + getDisplayCommissionAmount(commission, tierSnapshot), 0);
      const paidAmount = commissions
        .filter((commission) => commission.status === '已发放')
        .reduce((sum, commission) => sum + getDisplayCommissionAmount(commission, tierSnapshot), 0);
      const withdrawnAmount = commissions
        .filter((commission) => ['已撤回', '待冲销', '已冲销'].includes(commission.status))
        .reduce((sum, commission) => sum + getDisplayCommissionAmount(commission, tierSnapshot), 0);
      const status: MonthlyCommissionPayout['status'] = pendingConfirmAmount > 0
        ? '待确认'
        : pendingPayAmount > 0
          ? '待发放'
          : paidAmount > 0
            ? '已发放'
            : '无应发';
      return {
        role,
        orderCount: new Set(commissions.map((commission) => commission.orderId)).size,
        monthlyPaidAmount: isTiered
          ? commissions
            .filter(countsTowardTieredMonthlyBase)
            .reduce((sum, commission) => sum + Number(commission.performanceAmount || commission.orderAmount || 0), 0)
          : commissions.reduce((sum, commission) => sum + Number(commission.orderAmount || 0), 0),
        pendingConfirmAmount,
        pendingPayAmount,
        paidAmount,
        exceptionAmount: 0,
        withdrawnAmount,
        chargebackAmount: 0,
        totalAmount: pendingConfirmAmount + pendingPayAmount + paidAmount,
        status,
        isTiered,
        tierSnapshot,
        commissions,
      };
    }).sort((a, b) => Number(b.isTiered) - Number(a.isTiered) || b.totalAmount - a.totalAmount || a.role.localeCompare(b.role, 'zh-CN'));
  };

  const getRoleSummariesForPayoutRow = (row: MonthlyCommissionPayout): MonthlyCommissionRoleSummary[] => {
    const sourceCommissions = row.roleSummaries?.length
      ? row.roleSummaries.flatMap((summary) => summary.commissions)
      : row.commissions;
    return buildRoleSummariesFromCommissions(sourceCommissions);
  };

  const formatTierBrief = (summary: MonthlyCommissionRoleSummary) => {
    const current = summary.tierSnapshot?.currentTier;
    if (!summary.isTiered) return '';
    if (!current) return '阶梯方案待月报结算';
    const range = current.maxAmount === undefined
      ? `${formatCurrency(current.minAmount)} 以上`
      : `${formatCurrency(current.minAmount)} - ${formatCurrency(current.maxAmount)}`;
    const nextText = summary.tierSnapshot?.gapToNext
      ? `，距下一档还差 ${formatCurrency(summary.tierSnapshot.gapToNext)}`
      : '，已到最高档';
    return `当前 ${range} · ${current.rate}%${nextText}`;
  };

  const renderPayoutRoleSummary = (summary: MonthlyCommissionRoleSummary, compact = false) => {
    const currentTier = summary.tierSnapshot?.currentTier;
    const nextTier = summary.tierSnapshot?.nextTier;
    const tierMax = currentTier?.maxAmount;
    const tierRange = currentTier
      ? tierMax === undefined
        ? `${formatCurrency(currentTier.minAmount)} 以上`
        : `${formatCurrency(currentTier.minAmount)} - ${formatCurrency(tierMax)}`
      : '待月报结算';
    const tierGapText = nextTier
      ? `还差 ${formatCurrency(summary.tierSnapshot?.gapToNext || 0)} 到 ${nextTier.rate}%`
      : currentTier
        ? '已到最高档'
        : '阶梯方案待结算';
    const roleNote = summary.isTiered ? formatTierBrief(summary) : '按订单方案结算，不参与销售阶梯';
    const metricItems = [
      { label: '待确认', value: summary.pendingConfirmAmount, color: '#d97706' },
      { label: '待发放', value: summary.pendingPayAmount, color: '#2563eb' },
      { label: '已发放', value: summary.paidAmount, color: '#16a34a' },
      { label: '已撤回', value: summary.withdrawnAmount, color: '#6b7280' },
    ];
    const metrics = (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 0.8, mt: 1.1 }}>
        {metricItems.map((item) => (
          <Box key={item.label} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, px: 1, py: 0.8, bgcolor: '#f8fafc' }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#64748b', lineHeight: 1.2 }}>{item.label}</Typography>
            <Typography variant="body2" sx={{ color: item.color, fontWeight: 900, mt: 0.25 }}>
              {formatCurrency(item.value)}
            </Typography>
          </Box>
        ))}
      </Box>
    );

    return (
      <Box
        key={summary.role}
        sx={{
          border: summary.isTiered ? '1px solid #bfdbfe' : '1px solid #dbe3ef',
          borderRadius: 1,
          bgcolor: '#fff',
          overflow: 'hidden',
        }}
      >
        {summary.isTiered ? (
          <Box
            sx={{
              px: compact ? 1.4 : 1.6,
              py: compact ? 1.2 : 1.35,
              bgcolor: '#eff6ff',
              borderBottom: '1px solid #bfdbfe',
            }}
          >
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.25}
              sx={{ alignItems: { xs: 'stretch', md: 'flex-start' }, justifyContent: 'space-between' }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mb: 0.55 }}>
                  <Chip label={summary.role} size="small" color="primary" sx={{ height: 22, fontWeight: 800 }} />
                  <Typography variant="caption" sx={{ color: '#475569', fontWeight: 800 }}>{summary.orderCount} 单</Typography>
                  <Chip label="阶梯提成视图" size="small" variant="outlined" color="primary" sx={{ height: 22, bgcolor: '#fff' }} />
                </Stack>
                <Typography variant="body2" sx={{ color: '#1e3a8a', fontWeight: 800, overflowWrap: 'anywhere' }}>
                  {roleNote}
                </Typography>
              </Box>
              <Box sx={{ textAlign: { xs: 'left', md: 'right' }, flexShrink: 0 }}>
                <Typography variant="caption" sx={{ color: '#475569', display: 'block' }}>本角色应发</Typography>
                <Typography variant={compact ? 'h6' : 'h5'} sx={{ color: '#0f172a', fontWeight: 900, lineHeight: 1.15 }}>
                  {formatCurrency(summary.totalAmount)}
                </Typography>
              </Box>
            </Stack>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(150px, 1fr))' }, gap: 0.8, mt: 1.15 }}>
              {[
                { label: '阶梯业绩', value: formatCurrency(summary.monthlyPaidAmount), helper: '只统计销售阶梯业绩' },
                { label: '当前档位', value: currentTier ? `${currentTier.rate}%` : '-', helper: tierRange },
                { label: '下一档', value: tierGapText, helper: nextTier ? `下一档 ${nextTier.rate}%` : '当前阶梯状态' },
              ].map((item) => (
                <Box key={item.label} sx={{ border: '1px solid #bfdbfe', borderRadius: 1, px: 1, py: 0.85, bgcolor: '#fff' }}>
                  <Typography variant="caption" sx={{ display: 'block', color: '#64748b', lineHeight: 1.2 }}>{item.label}</Typography>
                  <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 900, mt: 0.25, overflowWrap: 'anywhere' }}>
                    {item.value}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', overflowWrap: 'anywhere', display: 'block', mt: 0.1 }}>
                    {item.helper}
                  </Typography>
                </Box>
              ))}
            </Box>

            {metrics}
          </Box>
        ) : (
          <Box
            sx={{
              px: compact ? 1.4 : 1.6,
              py: compact ? 1.15 : 1.3,
              bgcolor: '#fff',
              borderBottom: '1px solid #eef2f7',
            }}
          >
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.25}
              sx={{ alignItems: { xs: 'stretch', md: 'flex-start' }, justifyContent: 'space-between' }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mb: 0.55 }}>
                  <Chip label={summary.role} size="small" color="default" sx={{ height: 22, fontWeight: 800 }} />
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>{summary.orderCount} 单</Typography>
                  <Chip label="普通结算视图" size="small" variant="outlined" sx={{ height: 22, bgcolor: '#fff' }} />
                </Stack>
                <Box sx={{ border: '1px solid #e5e7eb', borderRadius: 1, px: 1, py: 0.85, bgcolor: '#f8fafc', maxWidth: 620 }}>
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 0.25 }}>结算说明</Typography>
                  <Typography variant="body2" sx={{ color: '#334155', fontWeight: 800, overflowWrap: 'anywhere' }}>
                    {roleNote}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ textAlign: { xs: 'left', md: 'right' }, flexShrink: 0 }}>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>本角色应发</Typography>
                <Typography variant={compact ? 'h6' : 'h5'} sx={{ color: '#111827', fontWeight: 900, lineHeight: 1.15 }}>
                  {formatCurrency(summary.totalAmount)}
                </Typography>
              </Box>
            </Stack>
            {metrics}
          </Box>
        )}

        <Stack spacing={0.7} sx={{ p: compact ? 1 : 1.25, bgcolor: '#f8fafc' }}>
          {summary.commissions.map((commission) => renderPayoutCommissionDetail(commission, compact, summary.tierSnapshot))}
        </Stack>
      </Box>
    );
  };

  const renderPayoutCommissionDetail = (commission: Commission, compact = false, tierSnapshot?: Commission['tierSnapshot']) => {
    const note = commission.auditReason || commission.adjustReason || commission.calculationNote || '-';
    const formulaText = commission.formulaText || commission.payoutPlanName || commission.calculationNote || '-';
    const displayCommissionAmount = getDisplayCommissionAmount(commission, tierSnapshot);
    const sourceLabel = commission.sourceBusinessType === 'after_sales_recovery' || commission.sourceBusinessType === 'refund_recovery'
      ? '售后挽回分账'
      : '正式订单分账';

    return (
      <Box
        key={commission.id}
        sx={{
          border: '1px solid #e5e7eb',
          borderRadius: 1,
          bgcolor: '#fff',
          px: compact ? 1.15 : 1.35,
          py: compact ? 0.95 : 1.1,
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: compact
                ? 'minmax(190px, 1fr) minmax(110px, 0.65fr) minmax(260px, 1.45fr) minmax(130px, 0.65fr)'
                : 'minmax(210px, 1fr) minmax(120px, 0.65fr) minmax(280px, 1.45fr) minmax(140px, 0.65fr)',
            },
            gap: { xs: 0.9, md: 1.4 },
            alignItems: 'start',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#64748b', mb: 0.25 }}>订单 / 客户</Typography>
            <Typography variant="body2" sx={{ color: '#111827', fontWeight: 900, overflowWrap: 'anywhere', lineHeight: 1.35 }}>
              {commission.orderNo}
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', overflowWrap: 'anywhere', display: 'block' }}>
              {commission.customerName || '-'}{compact ? '' : ` · ${commission.role}`}
            </Typography>
            <Chip
              label={sourceLabel}
              size="small"
              sx={{
                mt: 0.6,
                height: 22,
                bgcolor: sourceLabel === '售后挽回分账' ? '#ecfdf5' : '#eff6ff',
                color: sourceLabel === '售后挽回分账' ? '#047857' : '#2563eb',
                fontWeight: 800,
              }}
            />
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#64748b', mb: 0.25 }}>实付金额</Typography>
            <Typography variant="body2" sx={{ color: '#0f766e', fontWeight: 900 }}>
              {formatCurrency(commission.orderAmount)}
            </Typography>
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#64748b', mb: 0.25 }}>计算说明 / 备注</Typography>
            <Typography variant="body2" sx={{ color: '#334155', fontWeight: 700, overflowWrap: 'anywhere', lineHeight: 1.35 }}>
              {formulaText}
            </Typography>
            {note && note !== formulaText && (
              <Typography variant="caption" sx={{ color: '#64748b', overflowWrap: 'anywhere', display: 'block', mt: 0.2 }}>
                {note}
              </Typography>
            )}
          </Box>

          <Box sx={{ minWidth: 0, textAlign: { xs: 'left', md: 'right' } }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#64748b', mb: 0.25 }}>提成金额</Typography>
            <Typography variant="body2" sx={{ color: '#111827', fontWeight: 900, mb: 0.45 }}>
              {formatCurrency(displayCommissionAmount)}
            </Typography>
            <Chip label={commission.status} size="small" color={getCommissionStatusColor(commission.status)} />
          </Box>
        </Box>
      </Box>
    );
  };

  const getMineCommissionStatusLabel = (status: Commission['status']) => (
    status === '待冲销' || status === '已冲销' || status === '已取消' ? '已撤回' : status
  );

  const getCommissionSourceMeta = (commission: Commission) => {
    const isAfterSales = commission.sourceBusinessType === 'after_sales_recovery'
      || commission.sourceBusinessType === 'refund_recovery'
      || Boolean(commission.sourceRecoveryOrderId);
    return isAfterSales
      ? {
        key: 'after_sales_recovery',
        title: '售后挽回分账',
        description: '来自售后挽回订单的提成，独立于正式订单业绩。',
        rowLabel: '售后挽回单',
        chipBg: '#ecfdf5',
        chipColor: '#047857',
      }
      : {
        key: 'formal_order',
        title: '正式订单分账',
        description: '来自订单审核通过后的正式订单分账。',
        rowLabel: '正式订单',
        chipBg: '#eff6ff',
        chipColor: '#2563eb',
      };
  };

  const toggleMinePayoutGroup = (groupKey: string) => {
    setExpandedMinePayoutGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const renderMinePayoutDetailTable = (
    summary: MonthlyCommissionRoleSummary,
    sourceRowLabel: string,
    tierSnapshot?: Commission['tierSnapshot'],
  ) => (
    <TableContainer sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflowX: 'auto', bgcolor: '#fff' }}>
      <Table size="small" sx={{ minWidth: 920 }}>
        <TableHead>
          <TableRow>
            <TableCell>订单号 / 客户</TableCell>
            <TableCell width={120}>来源</TableCell>
            <TableCell width={130}>实付金额</TableCell>
            <TableCell>计算说明</TableCell>
            <TableCell width={130} align="right">提成金额</TableCell>
            <TableCell width={110} align="center">状态</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {summary.commissions.map((commission) => {
            const note = commission.formulaText || commission.calculationNote || commission.payoutPlanName || '-';
            const extraNote = commission.auditReason || commission.adjustReason || '';
            const displayCommissionAmount = getDisplayCommissionAmount(commission, tierSnapshot);
            const displayStatus = getMineCommissionStatusLabel(commission.status);
            return (
              <TableRow key={commission.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 900, color: '#111827', overflowWrap: 'anywhere' }}>
                    {commission.orderNo}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block', overflowWrap: 'anywhere' }}>
                    {commission.customerName || '-'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={sourceRowLabel}
                    size="small"
                    sx={{
                      height: 22,
                      bgcolor: getCommissionSourceMeta(commission).chipBg,
                      color: getCommissionSourceMeta(commission).chipColor,
                      fontWeight: 800,
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ color: '#0f766e', fontWeight: 900 }}>
                    {formatCurrency(commission.orderAmount)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ color: '#334155', fontWeight: 700, overflowWrap: 'anywhere' }}>
                    {note}
                  </Typography>
                  {extraNote && (
                    <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 0.25, overflowWrap: 'anywhere' }}>
                      {extraNote}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" sx={{ color: '#111827', fontWeight: 900 }}>
                    {formatCurrency(displayCommissionAmount)}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Chip label={displayStatus} size="small" color={getCommissionStatusColor(displayStatus)} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderMinePayoutGroup = (
    sourceKey: string,
    sourceLabel: string,
    sourceRowLabel: string,
    summary: MonthlyCommissionRoleSummary,
  ) => {
    const groupKey = `${sourceKey}:${summary.role}:${summary.isTiered ? 'tiered' : 'simple'}`;
    const expanded = expandedMinePayoutGroups.has(groupKey);
    const title = `${summary.role} · ${summary.isTiered ? '阶梯提成订单' : '普通提成订单'}`;
    const currentTier = summary.tierSnapshot?.currentTier;
    const nextTier = summary.tierSnapshot?.nextTier;
    const tierRange = currentTier
      ? currentTier.maxAmount === undefined
        ? `${formatCurrency(currentTier.minAmount)} 以上`
        : `${formatCurrency(currentTier.minAmount)} - ${formatCurrency(currentTier.maxAmount)}`
      : '待结算';
    const tierNextText = nextTier
      ? `下一档 ${nextTier.rate}% · 还差 ${formatCurrency(summary.tierSnapshot?.gapToNext || 0)}`
      : currentTier
        ? '已到最高档'
        : '阶梯方案待结算';
    const metricItems = [
      { label: '待确认', value: summary.pendingConfirmAmount, color: '#2563eb' },
      { label: '待发放', value: summary.pendingPayAmount, color: '#d97706' },
      { label: '已发放', value: summary.paidAmount, color: '#16a34a' },
      { label: '已撤回', value: summary.withdrawnAmount, color: '#6b7280' },
    ];

    return (
      <Box key={groupKey} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
        <Box
          onClick={() => toggleMinePayoutGroup(groupKey)}
          sx={{
            px: 1.25,
            py: 1,
            cursor: 'pointer',
            bgcolor: summary.isTiered ? '#eff6ff' : '#fff',
            borderLeft: summary.isTiered ? '3px solid #2563eb' : '3px solid #cbd5e1',
            '&:hover': { bgcolor: summary.isTiered ? '#dbeafe' : '#f8fafc' },
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between' }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
              <IconButton size="small" sx={{ flexShrink: 0 }}>
                {expanded ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
              </IconButton>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 900, color: '#0f172a', overflowWrap: 'anywhere' }}>
                    {title}
                  </Typography>
                  <Chip label={sourceLabel} size="small" sx={{ height: 22, bgcolor: '#f8fafc', fontWeight: 800 }} />
                  <Chip label={`${summary.orderCount} 单`} size="small" variant="outlined" sx={{ height: 22, bgcolor: '#fff' }} />
                </Stack>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 0.25 }}>
                  {summary.isTiered ? `阶梯 GMV ${formatCurrency(summary.monthlyPaidAmount)} · 当前 ${tierRange}${currentTier ? ` · ${currentTier.rate}%` : ''}` : '按订单提成方案或自定义金额结算，不参与阶梯 GMV'}
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={2.2} sx={{ alignItems: 'center', justifyContent: { xs: 'flex-start', md: 'flex-end' }, flexWrap: 'wrap', rowGap: 0.5 }}>
              <Box>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>实付合计</Typography>
                <Typography variant="body2" sx={{ color: '#0f766e', fontWeight: 900 }}>
                  {formatCurrency(summary.monthlyPaidAmount)}
                </Typography>
              </Box>
              <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>应发提成</Typography>
                <Typography variant="body2" sx={{ color: '#111827', fontWeight: 900 }}>
                  {formatCurrency(summary.totalAmount)}
                </Typography>
              </Box>
            </Stack>
          </Stack>
        </Box>
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Box sx={{ p: 1.25, bgcolor: '#f8fafc', borderTop: '1px solid #e5e7eb' }}>
            {summary.isTiered && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(160px, 1fr))' }, gap: 0.8, mb: 1 }}>
                {[
                  { label: '阶梯业绩', value: formatCurrency(summary.monthlyPaidAmount), helper: '只统计本组阶梯订单' },
                  { label: '当前档位', value: currentTier ? `${currentTier.rate}%` : '-', helper: tierRange },
                  { label: '本组预估提成', value: formatCurrency(summary.totalAmount), helper: tierNextText },
                ].map((item) => (
                  <Box key={item.label} sx={{ border: '1px solid #bfdbfe', borderRadius: 1, px: 1, py: 0.85, bgcolor: '#fff' }}>
                    <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>{item.label}</Typography>
                    <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 900, mt: 0.2 }}>{item.value}</Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 0.1, overflowWrap: 'anywhere' }}>{item.helper}</Typography>
                  </Box>
                ))}
              </Box>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 0.8, mb: 1 }}>
              {metricItems.map((item) => (
                <Box key={item.label} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, px: 1, py: 0.75, bgcolor: '#fff' }}>
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>{item.label}</Typography>
                  <Typography variant="body2" sx={{ color: item.color, fontWeight: 900 }}>{formatCurrency(item.value)}</Typography>
                </Box>
              ))}
            </Box>
            {renderMinePayoutDetailTable(summary, sourceRowLabel, summary.tierSnapshot)}
          </Box>
        </Collapse>
      </Box>
    );
  };

  const renderMinePayoutRoleSections = () => {
    const sourceGroups = new Map<string, {
      title: string;
      description: string;
      rowLabel: string;
      commissions: Commission[];
    }>();

    payoutRows.forEach((row) => {
      const rowCommissions = row.roleSummaries?.length
        ? row.roleSummaries.flatMap((summary) => summary.commissions)
        : row.commissions;
      rowCommissions.forEach((commission) => {
        const meta = getCommissionSourceMeta(commission);
        const existing = sourceGroups.get(meta.key);
        if (existing) {
          existing.commissions.push(commission);
        } else {
          sourceGroups.set(meta.key, {
            title: meta.title,
            description: meta.description,
            rowLabel: meta.rowLabel,
            commissions: [commission],
          });
        }
      });
    });

    return (
      <Stack spacing={1.25}>
        {['formal_order', 'after_sales_recovery']
          .map((sourceKey) => {
            const group = sourceGroups.get(sourceKey);
            if (!group?.commissions.length) return null;
            const summaries = buildRoleSummariesFromCommissions(group.commissions);
            const totalAmount = summaries.reduce((sum, summary) => sum + summary.totalAmount, 0);
            const orderCount = new Set(group.commissions.map((commission) => commission.orderId || commission.orderNo)).size;
            return (
              <Box key={sourceKey} sx={{ border: '1px solid #dbe3ef', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                <Box sx={{ px: 1.4, py: 1.05, bgcolor: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between' }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ color: '#0f172a', fontWeight: 900 }}>
                        {group.title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#64748b', display: 'block', overflowWrap: 'anywhere' }}>
                        {group.description}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.8} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                      <Chip label={`${orderCount} 单`} size="small" sx={{ height: 24, bgcolor: '#eef2ff', color: '#2563eb', fontWeight: 800 }} />
                      <Chip label={`应发 ${formatCurrency(totalAmount)}`} size="small" sx={{ height: 24, bgcolor: '#ecfdf5', color: '#047857', fontWeight: 800 }} />
                    </Stack>
                  </Stack>
                </Box>
                <Stack spacing={0.8} sx={{ p: 1 }}>
                  {summaries.map((summary) => renderMinePayoutGroup(sourceKey, group.title, group.rowLabel, summary))}
                </Stack>
              </Box>
            );
          })}
      </Stack>
    );
  };

  const renderSplitSummaryCard = (commission: Commission) => {
    const note = commission.calculationNote || commission.formulaText || '-';
    const performanceAmount = commission.performanceAmount || commission.orderAmount;
    const planName = commission.payoutPlanName || '历史分账未记录方案';
    const planSummary = commission.payoutPlanName
      ? formatPayoutPlanValue({
        commissionType: commission.ruleCalculationType || 'fixed',
        commissionValue: commission.ruleCalculationType === 'percentage'
          ? Math.round(Number(commission.commissionRate || 0) * 10000) / 100
          : commission.commissionAmount,
        tiers: commission.tierSnapshot?.tiers,
      })
      : '旧数据未保存方案快照';
    const displayStatus = getCommissionDisplayStatus(commission);
    const statusColor = getCommissionStatusColor(displayStatus);

    return (
      <Box
        key={commission.id}
        sx={{
          border: '1px solid #e5e7eb',
          borderRadius: 1,
          bgcolor: '#fff',
          minHeight: 250,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ px: 1.35, py: 1.15, borderBottom: '1px solid #eef2f7', bgcolor: '#f8fafc' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
              <Chip label={commission.role} size="small" color="primary" sx={{ height: 22, mt: 0.1 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ color: '#111827', fontWeight: 900, overflowWrap: 'anywhere', lineHeight: 1.35 }}>
                  {formatOwnerDisplayName(commission.ownerId, commission.owner)}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', overflowWrap: 'anywhere', display: 'block' }}>
                  {commission.department || '-'}
                </Typography>
              </Box>
            </Stack>
            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
              <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>提成</Typography>
              <Typography variant="h6" sx={{ color: '#dc2626', fontWeight: 900, lineHeight: 1.2 }}>
                {formatCurrency(commission.commissionAmount)}
              </Typography>
            </Box>
          </Stack>
        </Box>

        <Stack spacing={1.05} sx={{ p: 1.35, flex: 1 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>业绩金额</Typography>
              <Typography variant="body2" sx={{ color: '#111827', fontWeight: 800 }}>
                {formatCurrency(performanceAmount)}
              </Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>状态</Typography>
              <Chip label={displayStatus} size="small" color={statusColor} />
            </Box>
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>提成方案</Typography>
            <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700, overflowWrap: 'anywhere' }}>
              {planName}
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', overflowWrap: 'anywhere', display: 'block' }}>
              {planSummary}
            </Typography>
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>说明</Typography>
            <Typography variant="body2" sx={{ color: '#374151', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {note}
            </Typography>
          </Box>
        </Stack>
      </Box>
    );
  };

  const renderOperationLogCard = (log: CommissionOperationLog) => {
    const amountText = log.totalCommissionAmount === undefined ? '-' : formatCurrency(log.totalCommissionAmount);
    const splitSnapshot = log.splitSnapshot || [];
    const operationTitle = log.action === '调整分账'
      ? '调整了订单分账'
      : log.action === '确认分账'
        ? '确认了订单分账'
        : log.action;

    return (
      <Box
        key={log.id}
        sx={{
          minWidth: 0,
        }}
      >
        <Box
          sx={{
            border: '1px solid #e5e7eb',
            borderLeft: `3px solid ${log.action === '确认分账' ? '#16a34a' : '#2563eb'}`,
            borderRadius: 1,
            bgcolor: '#fff',
            px: 1.25,
            py: 1,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, minWidth: 0 }}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0, mb: 0.25, flexWrap: 'wrap', rowGap: 0.25 }}>
                <Chip label={log.action} size="small" color={log.action === '确认分账' ? 'success' : 'primary'} sx={{ height: 22 }} />
                <Typography variant="body2" sx={{ color: '#111827', fontWeight: 800, overflowWrap: 'anywhere', minWidth: 0 }}>
                  {operationTitle}
                </Typography>
              </Stack>
              <Typography variant="caption" sx={{ color: '#64748b', overflowWrap: 'anywhere', display: 'block' }}>
                {splitSnapshot.length || log.commissionCount || 0} 个角色 · 合计 {amountText} · {log.operator || '-'}
              </Typography>
            </Box>
            <Typography variant="caption" sx={{ color: '#64748b', flexShrink: 0 }}>
              {formatDate(log.operatedAt, 'MM-dd HH:mm')}
            </Typography>
          </Stack>

          <Box
            component="details"
            sx={{
              mt: 0.75,
              minWidth: 0,
              '& summary': {
                cursor: 'pointer',
                color: '#2563eb',
                fontSize: 12,
                fontWeight: 700,
                outline: 'none',
              },
            }}
          >
            <Box component="summary">查看明细</Box>
            <Stack spacing={0.75} sx={{ mt: 0.75, minWidth: 0 }}>
              {log.reason && (
                <Box sx={{ bgcolor: '#f8fafc', borderRadius: 1, px: 1, py: 0.75 }}>
                  <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>原因</Typography>
                  <Typography variant="body2" sx={{ color: '#374151', overflowWrap: 'anywhere' }}>{log.reason}</Typography>
                </Box>
              )}
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>
                本次记录
              </Typography>
              {splitSnapshot.length > 0 ? (
                splitSnapshot.map((item, index) => (
                  <Box
                    key={`${log.id}-${item.role}-${item.ownerId || item.owner}-${index}`}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 0.75,
                      alignItems: 'start',
                      bgcolor: '#f8fafc',
                      border: '1px solid #eef2f7',
                      borderRadius: 1,
                      px: 1,
                      py: 0.65,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.25 }}>
                        <Chip label={item.role} size="small" variant="outlined" sx={{ height: 22 }} />
                        <Chip label={item.status} size="small" sx={{ height: 22 }} />
                      </Stack>
                      <Typography variant="caption" sx={{ display: 'block', color: '#111827', fontWeight: 700, overflowWrap: 'anywhere', mt: 0.35 }}>
                        {formatOwnerDisplayName(item.ownerId, item.owner)}{item.department ? ` / ${item.department}` : ''}
                      </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: '#111827', fontWeight: 900, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {formatCurrency(item.commissionAmount)}
                    </Typography>
                  </Box>
                ))
              ) : (
                <Typography variant="caption" sx={{ color: '#64748b' }}>
                  旧记录未保存人员明细。
                </Typography>
              )}
            </Stack>
          </Box>
        </Box>
      </Box>
    );
  };

  const togglePayoutExpanded = (ownerKey: string) => {
    setExpandedPayoutOwners((prev) => {
      const next = new Set(prev);
      if (next.has(ownerKey)) next.delete(ownerKey);
      else next.add(ownerKey);
      return next;
    });
  };

  const renderOrderStatusBar = () => (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
        {ORDER_STATUS_OPTIONS.map((item) => {
          const selected = orderFilters.status === item.value;
          const count = orderStatusCounts[item.value] || 0;
          const highlight = item.important && count > 0;
          const badgeTextColor = item.value === '待处理' ? '#92400e' : undefined;
          return (
            <Button
              key={item.value}
              variant={selected ? 'contained' : 'outlined'}
              color={getOrderStatusButtonColor(item.value)}
              onClick={() => updateOrderFilter('status', item.value)}
              sx={{ borderRadius: 1.5 }}
            >
              {item.label}
              <Chip
                label={count}
                size="small"
                color={highlight && !selected ? 'warning' : 'default'}
                sx={{
                  ml: 1,
                  height: 22,
                  minWidth: 24,
                  bgcolor: selected ? 'rgba(255,255,255,0.24)' : '#eef2f7',
                  color: badgeTextColor || (selected ? '#fff' : undefined),
                  '& .MuiChip-label': { px: 0.75 },
                }}
              />
            </Button>
          );
        })}
    </Box>
  );

  const renderOrderToolbar = () => (
    <Stack direction="row" spacing={1.25} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
      <TextField
        placeholder="搜索订单号/客户"
        value={orderFilters.search}
        onChange={(event) => updateOrderFilter('search', event.target.value)}
        size="small"
        sx={{ minWidth: 240 }}
      />
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>提成角色</InputLabel>
        <Select value={orderFilters.role} label="提成角色" onChange={(event) => updateOrderFilter('role', event.target.value)}>
          <MenuItem value="">全部</MenuItem>
          {activeRoleConfigs.map((role) => <MenuItem key={role.id} value={role.name}>{role.name}</MenuItem>)}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>人员</InputLabel>
        <Select value={orderFilters.ownerId} label="人员" onChange={(event) => updateOrderFilter('ownerId', event.target.value)}>
          <MenuItem value="">全部</MenuItem>
          {activeEmployees.map((employee) => (
            <MenuItem key={employee.id} value={employee.id}>{formatEmployeeDisplayName(employee)}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        label="付款开始"
        type="date"
        value={orderFilters.startDate}
        onChange={(event) => updateOrderFilter('startDate', event.target.value)}
        size="small"
        InputLabelProps={{ shrink: true }}
      />
      <TextField
        label="付款结束"
        type="date"
        value={orderFilters.endDate}
        onChange={(event) => updateOrderFilter('endDate', event.target.value)}
        size="small"
        InputLabelProps={{ shrink: true }}
      />
    </Stack>
  );

  const renderOrderSplitTable = () => (
    <>
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '4px 4px 0 0', overflowX: 'auto' }}>
        <Table sx={{ minWidth: orderSplitTableMinWidth + 150 }}>
          <TableHead>
            <TableRow>
              {visibleOrderSplitColumns.map((column, columnIndex) => (
                <ResizableHeaderCell
                  key={column.id}
                  columnId={column.id}
                  width={orderSplitColumnWidths[column.id] || column.defaultWidth}
                  onResize={handleResizeOrderSplitColumn}
                  sx={getFrozenColumnSx(columnIndex, true)}
                >
                  {column.label}
                </ResizableHeaderCell>
              ))}
              <TableCell
                align="center"
                sx={{
                  position: 'sticky',
                  right: 0,
                  zIndex: 5,
                  bgcolor: '#f8fafc',
                  width: 150,
                  minWidth: 150,
                  boxShadow: '-1px 0 0 #e5e7eb',
                }}
              >
                操作
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orderRows.map((summary) => {
              return (
              <TableRow key={summary.orderId} hover sx={getProductLevelRowSx(summary.productLevel)}>
                {visibleOrderSplitColumns.map((column, columnIndex) => (
                  <TableCell
                    key={`${summary.orderId}-${column.id}`}
                    sx={{
                      width: orderSplitColumnWidths[column.id] || column.defaultWidth,
                      minWidth: orderSplitColumnWidths[column.id] || column.defaultWidth,
                      maxWidth: orderSplitColumnWidths[column.id] || column.defaultWidth,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: column.id === 'splitDetails' ? 'normal' : 'nowrap',
                      verticalAlign: column.id === 'splitDetails' ? 'top' : 'middle',
                      ...getFrozenColumnSx(columnIndex),
                    }}
                  >
                    {renderOrderSplitCell(summary, column.id)}
                  </TableCell>
                ))}
                <TableCell
                  align="center"
                  sx={{
                    position: 'sticky',
                    right: 0,
                    zIndex: 4,
                    bgcolor: '#fff',
                    width: 150,
                    minWidth: 150,
                    boxShadow: '-1px 0 0 #e5e7eb',
                  }}
                >
                  <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'center' }}>
                    <Tooltip title="查看分账">
                      <IconButton size="small" color="primary" onClick={() => openSettlementDetail(summary)} aria-label="查看分账">
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {canManageOrderSettlement && (
                      <>
                    <Tooltip title={getAdjustDisabledReason(summary)}>
                      <span>
                        <IconButton
                          size="small"
                          color="primary"
                          disabled={!canAdjustSettlementSummary(summary)}
                          onClick={() => openSettlementDetail(summary, { edit: true })}
                          aria-label="调整分账"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={getDeleteOrderSplitDisabledReason(summary)}>
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={!canDeleteOrderSplitSummary(summary)}
                          onClick={() => openDeleteOrderSplitDialog(summary)}
                          aria-label="删除订单分账"
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                      </>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
              );
            })}
            {!orderRows.length && (
              <TableRow>
                <TableCell colSpan={visibleOrderSplitColumns.length + 1} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                  {orderLoading ? '加载中...' : '暂无订单分账'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={orderPagination.total}
        page={Math.max((orderPagination.page || 1) - 1, 0)}
        rowsPerPage={orderPagination.pageSize || 10}
        rowsPerPageOptions={[10, 20, 50, 100]}
        onPageChange={handleOrderPageChange}
        onRowsPerPageChange={handleOrderRowsPerPageChange}
        labelRowsPerPage="每页条数"
        labelDisplayedRows={formatPaginationRows}
        sx={{
          border: '1px solid #e5e7eb',
          borderTop: 0,
          bgcolor: '#fff',
          '& .MuiTablePagination-toolbar': { minHeight: 48 },
        }}
      />
    </>
  );

  const renderEditorFieldLabel = (label: string) => (
    <Typography variant="caption" sx={{ display: 'block', color: '#64748b', fontWeight: 700, mb: 0.5 }}>
      {label}
    </Typography>
  );

  const editorInputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: '#fff',
    },
    '& input': {
      fontWeight: 600,
    },
  };

  const renderDetailSplitEditor = () => (
    <Stack spacing={1.25}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(280px, 320px))' },
          gap: 1.25,
          alignItems: 'stretch',
          justifyContent: 'start',
        }}
      >
        {splitRows.map((row, index) => {
          const planText = isCustomPayoutRow(row)
            ? `${CUSTOM_PAYOUT_PLAN_NAME} · 手工 ${formatCurrency(Number(row.commissionAmount || 0))}`
            : `${row.payoutPlanName || findPayoutPlanForRow(row)?.name || '未选择方案'} · ${formatPayoutPlanValue(findPayoutPlanForRow(row) || {
              commissionType: row.ruleCalculationType || 'fixed',
              commissionValue: row.ruleCalculationType === 'percentage'
                ? Math.round(Number(row.commissionRate || 0) * 10000) / 100
                : Number(row.commissionAmount || 0),
              tiers: row.tierSnapshot?.tiers,
            })}`;
          return (
            <Paper
              key={row.id || `detail-card-${index}`}
              elevation={0}
              sx={{
                border: '1px solid #dbe3ef',
                borderRadius: 1,
                bgcolor: '#fff',
                overflow: 'hidden',
                minHeight: 270,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box sx={{ px: 1.35, py: 1.1, borderBottom: '1px solid #eef2f7', bgcolor: '#f8fafc' }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.35 }}>
                      <Chip label={row.role || `角色 ${index + 1}`} size="small" color="primary" sx={{ height: 22 }} />
                      <Typography variant="caption" sx={{ color: '#64748b' }}>
                        分账 {index + 1}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ color: '#111827', fontWeight: 800, overflowWrap: 'anywhere' }}>
                      {row.owner || '未选择人员'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      {row.department || '部门自动带出'}
                    </Typography>
                  </Box>
                  <Tooltip title={canDeleteSplitRow(row) ? '删除此条未确认分账' : '仅待确认阶段的分账可直接删除'}>
                    <span>
                      <IconButton
                        size="small"
                        color="error"
                        disabled={!canDeleteSplitRow(row)}
                        onClick={() => setSplitRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}
                        aria-label="删除分账人员"
                        sx={{ width: 30, height: 30 }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Box>

              <Stack spacing={1.05} sx={{ p: 1.35, flex: 1 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    {renderEditorFieldLabel('角色')}
                    <FormControl size="small" fullWidth>
                      <Select
                        value={row.role}
                        onChange={(event) => updateSplitRow(index, 'role', event.target.value as CommissionRole)}
                        aria-label="提成角色"
                        sx={{ bgcolor: '#fff' }}
                      >
                        {roleOptionsForSplit(row.role).map((role) => (
                          <MenuItem key={role.id} value={role.name}>{role.name}{role.isActive ? '' : '（已停用）'}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    {renderEditorFieldLabel('人员')}
                    <FormControl size="small" fullWidth>
                      <Select
                        value={row.ownerId || ''}
                        onChange={(event) => handleSplitOwnerChange(index, event.target.value)}
                        displayEmpty
                        aria-label="人员"
                        renderValue={(value) => {
                          if (!value) return '选择员工';
                          const employee = activeEmployees.find((item) => item.id === value);
                          return formatEmployeeDisplayName(employee, row.owner);
                        }}
                        sx={{ bgcolor: '#fff' }}
                      >
                        <MenuItem value="">选择员工</MenuItem>
                        {activeEmployees.map((employee) => (
                          <MenuItem key={employee.id} value={employee.id}>{formatEmployeeDisplayName(employee)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    {renderEditorFieldLabel('部门')}
                    <TextField
                      size="small"
                      value={row.department || ''}
                      placeholder="自动带出"
                      InputProps={{ readOnly: true }}
                      fullWidth
                      sx={editorInputSx}
                    />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    {renderEditorFieldLabel('业绩金额')}
                    <TextField
                      size="small"
                      type="number"
                      value={row.performanceAmount || 0}
                      onChange={(event) => updateSplitRow(index, 'performanceAmount', Number(event.target.value))}
                      fullWidth
                      sx={editorInputSx}
                    />
                  </Box>
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  {renderEditorFieldLabel('提成方案')}
                  <FormControl size="small" fullWidth>
                    <Select
                      value={row.payoutPlanId || ''}
                      onChange={(event) => updateSplitRow(index, 'payoutPlanId', event.target.value as CommissionAdjustmentInput['payoutPlanId'])}
                      displayEmpty
                      aria-label="提成方案"
                      renderValue={(value) => {
                        if (!value) return '选择提成方案';
                        return findPayoutPlanForRow(row)?.name || row.payoutPlanName || CUSTOM_PAYOUT_PLAN_NAME;
                      }}
                      sx={{ bgcolor: '#fff' }}
                    >
                      <MenuItem value="">选择提成方案</MenuItem>
                      <MenuItem value={CUSTOM_PAYOUT_PLAN_ID}>{CUSTOM_PAYOUT_PLAN_NAME} · 手工填写金额</MenuItem>
                      {!planOptionsForSplit(row.payoutPlanId).length && <MenuItem value="" disabled>请先配置提成方案</MenuItem>}
                      {planOptionsForSplit(row.payoutPlanId).map((plan) => (
                        <MenuItem key={plan.id} value={plan.id}>
                          {plan.name}{plan.isActive ? '' : '（已停用）'} · {formatPayoutPlanValue(plan)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Typography variant="caption" sx={{ display: 'block', color: '#64748b', mt: 0.45, overflowWrap: 'anywhere' }}>
                    {planText}
                  </Typography>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, alignItems: 'end' }}>
                  <Box sx={{ minWidth: 0 }}>
                    {renderEditorFieldLabel(isCustomPayoutRow(row) ? '自定义金额' : row.ruleCalculationType === 'tiered_percentage' ? '提成金额' : '方案金额')}
                    <TextField
                      size="small"
                      type={row.ruleCalculationType === 'tiered_percentage' ? 'text' : 'number'}
                      value={row.ruleCalculationType === 'tiered_percentage' ? '' : row.commissionAmount}
                      onChange={(event) => updateSplitRow(index, 'commissionAmount', Number(event.target.value))}
                      InputProps={{ readOnly: !isCustomPayoutRow(row) }}
                      placeholder={row.ruleCalculationType === 'tiered_percentage' ? '月报自动结算' : undefined}
                      fullWidth
                      sx={editorInputSx}
                    />
                  </Box>
                  <Box sx={{ minWidth: 0, textAlign: 'right' }}>
                    <Typography variant="caption" sx={{ display: 'block', color: '#64748b' }}>
                      当前提成
                    </Typography>
                    <Typography variant="h6" sx={{ color: '#dc2626', fontWeight: 900, lineHeight: 1.3 }}>
                      {row.ruleCalculationType === 'tiered_percentage' ? '月报结算' : formatCurrency(Number(row.commissionAmount || 0))}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  {renderEditorFieldLabel('说明')}
                  <TextField
                    size="small"
                    value={row.calculationNote || ''}
                    onChange={(event) => updateSplitRow(index, 'calculationNote', event.target.value)}
                    placeholder="可选"
                    fullWidth
                    sx={editorInputSx}
                  />
                </Box>
              </Stack>
            </Paper>
          );
        })}
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' } }}>
        <Button startIcon={<AddIcon />} onClick={handleAddSplitRow}>新增分账</Button>
        <TextField
          label="调整原因"
          value={splitReason}
          onChange={(event) => setSplitReason(event.target.value)}
          size="small"
          required
          sx={{ minWidth: { xs: 'auto', sm: 300 } }}
        />
      </Stack>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button onClick={() => (createSplitOpen ? closeCreateSplitDialog() : setDetailEditMode(false))}>
          {createSplitOpen ? '取消新建' : '取消编辑'}
        </Button>
        <Button
          variant="contained"
          disabled={splitSaving || !splitReason.trim() || splitRows.length === 0 || splitRows.some((row) => !row.ownerId || !row.payoutPlanId)}
          onClick={handleSaveSplitRows}
        >
          {splitSaving ? '保存中...' : createSplitOpen ? '保存分账' : '保存调整'}
        </Button>
      </Stack>
    </Stack>
  );

  const renderSettlementDetailActions = () => {
    if (!summaryDetail) return null;
    if (!canManageOrderSettlement) {
      return <Typography variant="body2" sx={{ color: '#64748b' }}>当前账号只能查看分账信息。</Typography>;
    }
    if (summaryDetail.sourceOrderDeleted || summaryDetail.status === '已撤回') {
      const text = summaryDetail.sourceOrderDeleted
        ? '源订单已删除，仅保留分账明细和历史记录。'
        : '提成已撤回，该订单分账进入只读留痕状态。';
      return (
        <Box sx={{ bgcolor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 1, p: 1.5 }}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>{text}</Typography>
        </Box>
      );
    }

    if (summaryDetail.status === '待处理') {
      return (
        <Stack spacing={1.25}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>先在左侧调整分账，补齐人员或异常信息后，再进入确认流程。</Typography>
        </Stack>
      );
    }

    if (summaryDetail.status === '待确认') {
      return (
        <Stack spacing={1.25}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>确认后，本订单提成会进入待发放。</Typography>
          <Button variant="contained" color="success" onClick={confirmOrderFromDetail} disabled={detailActionLoading}>确认分账</Button>
          <TextField label="撤回原因" value={detailActionReason} onChange={(event) => setDetailActionReason(event.target.value)} size="small" placeholder="例如：线下调整、规则错误" fullWidth />
          <Button color="error" variant="outlined" onClick={withdrawOrderFromDetail} disabled={detailActionLoading || !detailActionReason.trim()}>撤回提成</Button>
        </Stack>
      );
    }

    if (summaryDetail.status === '待发放') {
      return (
        <Stack spacing={1.25}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>未发放提成可直接撤回，撤回后不进入月度发放。</Typography>
          <TextField label="撤回原因" value={detailActionReason} onChange={(event) => setDetailActionReason(event.target.value)} size="small" placeholder="例如：线下调整、金额错误" fullWidth />
          <Button color="error" variant="contained" onClick={withdrawOrderFromDetail} disabled={detailActionLoading || !detailActionReason.trim()}>撤回提成</Button>
        </Stack>
      );
    }

    if (summaryDetail.status === '已发放') {
      return (
        <Box sx={{ bgcolor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 1, p: 1.5 }}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>提成已发放，第一版不支持系统内冲销，请财务线下处理。</Typography>
        </Box>
      );
    }

    return <Typography variant="body2" sx={{ color: '#64748b' }}>当前状态无需处理。</Typography>;
  };

  const renderMonthlyPayout = () => (
    <>
      <Stack direction="row" spacing={1.25} sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <TextField
          label={payoutMode === 'mine' ? '我的提成月份' : '统计月份'}
          type="month"
          value={payoutPeriod}
          onChange={(event) => setPayoutPeriod(event.target.value)}
          size="small"
          InputLabelProps={{ shrink: true }}
        />
        {showPayoutFinanceActions && (
          <Tooltip title="按当前月份可发放提成生成发放单，待确认和已撤回明细不进入可发放金额">
            <Button variant="outlined" startIcon={<PaymentsIcon />} disabled={payoutActionLoading} onClick={generateMonthlyBatch}>生成发放单</Button>
          </Tooltip>
        )}
        <Tooltip title={payoutRows.length ? '导出当前员工提成月报' : '暂无可导出的月报数据'}>
          <span>
            <Button variant="outlined" startIcon={<FileDownloadIcon />} disabled={!payoutRows.length || payoutActionLoading} onClick={exportMonthlyStatement}>导出发放表</Button>
          </span>
        </Tooltip>
        {showPayoutFinanceActions && (
          <Tooltip title={monthlyPayoutSummary.pendingPayAmount > 0 ? '确认本月待发放提成已完成线下发放' : '当前月份没有待发放金额'}>
            <span>
              <Button variant="contained" startIcon={<CheckCircleIcon />} disabled={monthlyPayoutSummary.pendingPayAmount <= 0 || payoutActionLoading} onClick={payBatch}>确认本月已发放</Button>
            </span>
          </Tooltip>
        )}
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, mb: 1.5 }}>
        {[
          { label: '总实付金额', value: monthlyPayoutSummary.monthlyPaidAmount, color: '#0f766e' },
          { label: '本月应发', value: monthlyPayoutSummary.totalAmount, color: '#111827' },
          { label: '待确认', value: monthlyPayoutSummary.pendingConfirmAmount, color: '#2563eb' },
          { label: '待发放', value: monthlyPayoutSummary.pendingPayAmount, color: '#d97706' },
          { label: '已发放', value: monthlyPayoutSummary.paidAmount, color: '#16a34a' },
          { label: '已撤回', value: monthlyPayoutSummary.withdrawnAmount, color: '#6b7280' },
        ].map((item) => (
          <Box key={item.label} sx={{ border: `1px solid ${moduleTokens.softLine}`, borderRadius: moduleRadius, px: 1.25, py: 0.85, bgcolor: '#fff' }}>
            <Typography variant="caption" sx={{ color: '#6b7280' }}>{item.label}</Typography>
            <Typography variant="subtitle1" sx={{ color: item.color, fontWeight: 800, lineHeight: 1.25 }}>
              {formatCurrency(item.value)}
            </Typography>
          </Box>
        ))}
        </Box>

      {payoutMode === 'mine' ? (
        <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
          {payoutRows.length ? (
            <Stack spacing={1} sx={{ p: 1.25 }}>
              {renderMinePayoutRoleSections()}
            </Stack>
          ) : (
            <Box sx={{ py: 3.5, textAlign: 'center', color: '#9ca3af' }}>
              {payoutLoading ? '加载中...' : '暂无我的提成数据'}
            </Box>
          )}
        </Paper>
      ) : (
      <TableContainer component={Paper} elevation={0} sx={[moduleTablePaperSx, { overflowX: 'auto' }]}>
        <Table
          size="small"
          sx={{
            tableLayout: 'fixed',
            width: MONTHLY_PAYOUT_TABLE_WIDTH,
            minWidth: MONTHLY_PAYOUT_TABLE_WIDTH,
            '& .MuiTableCell-root': { py: 1, height: 44, overflow: 'hidden', textOverflow: 'ellipsis' },
            '& .MuiTableHead-root .MuiTableCell-root': { bgcolor: '#f1f5f9', fontWeight: 800 },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: MONTHLY_PAYOUT_COLUMN_WIDTHS.expand }} />
              <TableCell sx={{ width: MONTHLY_PAYOUT_COLUMN_WIDTHS.employee }}>员工</TableCell>
              <TableCell sx={{ width: MONTHLY_PAYOUT_COLUMN_WIDTHS.department }}>部门</TableCell>
              <TableCell sx={{ width: MONTHLY_PAYOUT_COLUMN_WIDTHS.orderCount }}>订单数</TableCell>
              <TableCell sx={{ width: MONTHLY_PAYOUT_COLUMN_WIDTHS.monthlyPaidAmount }}>总实付金额</TableCell>
              <TableCell sx={{ width: MONTHLY_PAYOUT_COLUMN_WIDTHS.totalAmount }}>应发提成</TableCell>
              <TableCell sx={{ width: MONTHLY_PAYOUT_COLUMN_WIDTHS.pendingConfirmAmount }}>待确认</TableCell>
              <TableCell sx={{ width: MONTHLY_PAYOUT_COLUMN_WIDTHS.pendingPayAmount }}>待发放</TableCell>
              <TableCell sx={{ width: MONTHLY_PAYOUT_COLUMN_WIDTHS.paidAmount }}>已发放</TableCell>
              <TableCell sx={{ width: MONTHLY_PAYOUT_COLUMN_WIDTHS.withdrawnAmount }}>已撤回</TableCell>
              <TableCell sx={{ width: MONTHLY_PAYOUT_COLUMN_WIDTHS.status }}>状态</TableCell>
              {showPayoutFinanceActions && <TableCell align="center" sx={{ width: MONTHLY_PAYOUT_COLUMN_WIDTHS.actions }}>操作</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {payoutRows.map((row) => {
              const ownerKey = row.ownerId || row.owner;
              const expanded = expandedPayoutOwners.has(ownerKey);
              const actionDisabledReason = !row.ownerId
                ? '无员工ID，需先在订单分账中分配员工'
                : row.pendingPayAmount <= 0
                    ? '没有待发放金额'
                    : '';
              return (
                <React.Fragment key={ownerKey}>
                  <TableRow hover>
                    <TableCell>
                      <IconButton size="small" onClick={() => togglePayoutExpanded(ownerKey)}>
                        {expanded ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{formatOwnerDisplayName(row.ownerId, row.owner)}</TableCell>
                    <TableCell>{row.department || '-'}</TableCell>
                    <TableCell>{row.orderCount}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: '#0f766e' }}>{formatCurrency(row.monthlyPaidAmount)}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: '#111827' }}>{formatCurrency(row.totalAmount)}</TableCell>
                    <TableCell sx={{ color: row.pendingConfirmAmount > 0 ? '#2563eb' : undefined }}>{formatCurrency(row.pendingConfirmAmount)}</TableCell>
                    <TableCell sx={{ fontWeight: row.pendingPayAmount > 0 ? 700 : 400, color: row.pendingPayAmount > 0 ? '#d97706' : undefined }}>{formatCurrency(row.pendingPayAmount)}</TableCell>
                    <TableCell>{formatCurrency(row.paidAmount)}</TableCell>
                    <TableCell sx={{ color: row.withdrawnAmount > 0 ? '#6b7280' : undefined }}>{formatCurrency(row.withdrawnAmount)}</TableCell>
                    <TableCell><Chip label={row.status} size="small" color={getPayoutStatusColor(row.status)} /></TableCell>
                    {showPayoutFinanceActions && (
                      <TableCell align="center">
                        <Tooltip title={actionDisabledReason || '确认此人已发'}>
                          <span>
                            <IconButton size="small" color="success" disabled={Boolean(actionDisabledReason) || payoutActionLoading} onClick={() => payOwner(row.ownerId)}>
                              <CheckCircleIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={showPayoutFinanceActions ? 12 : 11} sx={{ p: 0, border: 0 }}>
                      <Collapse in={expanded} timeout="auto" unmountOnExit>
                        <Box sx={{ px: { xs: 1.5, sm: 2.5 }, py: 1.5, bgcolor: '#f8fafc' }}>
                          <Stack spacing={1}>
                            {getRoleSummariesForPayoutRow(row).map((summary) => renderPayoutRoleSummary(summary))}
                          </Stack>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
            {!payoutRows.length && (
              <TableRow>
                <TableCell colSpan={showPayoutFinanceActions ? 12 : 11} align="center" sx={{ py: 3.5, height: 72, color: '#9ca3af' }}>
                  {payoutLoading ? '加载中...' : '暂无员工提成月报数据'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      )}

    </>
  );

  return (
    <Box sx={{ p: embedded ? 0 : 3 }}>
      {!embedded && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 2 }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>财务结算台</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
                订单分账负责确认每笔提成，员工提成月报负责统计每个人本月应发、待确认、待发放和已撤回金额。
              </Typography>
            </Box>
            {tabValue === 0 && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setOrderSplitViewOpen(true)}>
                  视图设置
                </Button>
                {canManageOrderSettlement && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateSplitDialog}>
                    新建订单分账
                  </Button>
                )}
              </Stack>
            )}
          </Box>

          <Tabs value={tabValue} onChange={(_event, value) => setTabValue(value)} sx={{ mb: 3, borderBottom: '1px solid #e5e7eb' }}>
            <Tab label="订单分账台" />
            <Tab label="员工提成月报" />
            <Tab label="规则配置" />
          </Tabs>
        </>
      )}
      {embedded && tabValue === 0 && !hideEmbeddedOrderSplitViewButton && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setOrderSplitViewOpen(true)}>
            视图设置
          </Button>
            {canManageOrderSettlement && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateSplitDialog}>
                新建订单分账
              </Button>
            )}
          </Stack>
        </Box>
      )}

      {tabValue === 0 && (
        <>
          {renderOrderStatusBar()}
          {renderOrderToolbar()}
          {renderOrderSplitTable()}
        </>
      )}

      {tabValue === 1 && renderMonthlyPayout()}

      {tabValue === 2 && <CommissionRuleConfig />}

      <Dialog open={createSplitOpen} onClose={closeCreateSplitDialog} maxWidth="lg" fullWidth>
        <DialogCloseTitle onClose={closeCreateSplitDialog}>新建订单分账</DialogCloseTitle>
        <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
          <Stack spacing={2}>
            <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, p: 2 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} sx={{ alignItems: { xs: 'stretch', md: 'center' } }}>
                <TextField
                  label="搜索可新建分账订单"
                  placeholder="订单号/客户"
                  value={creatableOrderSearch}
                  onChange={(event) => setCreatableOrderSearch(event.target.value)}
                  size="small"
                  sx={{ minWidth: { xs: 'auto', md: 260 } }}
                />
                <FormControl size="small" sx={{ minWidth: { xs: 'auto', md: 360 }, flex: 1 }}>
                  <InputLabel shrink>选择订单</InputLabel>
                  <Select
                    value={selectedCreatableOrderId}
                    label="选择订单"
                    onChange={(event) => handleSelectCreatableOrder(event.target.value)}
                    displayEmpty
                    renderValue={(value) => {
                      if (!value) return creatableOrderLoading ? '加载中...' : '选择一笔未生成分账的已确认订单';
                      const order = creatableOrderRows.find((item) => item.orderId === value);
                      return order ? `${order.orderNo} / ${order.customerName} / ${formatCurrency(order.orderAmount)}` : '选择订单';
                    }}
                  >
                    {creatableOrderRows.map((order) => (
                      <MenuItem key={order.orderId} value={order.orderId}>
                        {order.orderNo} / {order.customerName} / {formatCurrency(order.orderAmount)}
                      </MenuItem>
                    ))}
                    {!creatableOrderRows.length && (
                      <MenuItem value="" disabled>
                        {creatableOrderLoading ? '加载中...' : '暂无可新建分账的订单'}
                      </MenuItem>
                    )}
                  </Select>
                </FormControl>
                <Button variant="outlined" onClick={() => fetchCreatableOrders()} disabled={creatableOrderLoading}>
                  刷新
                </Button>
              </Stack>
              <Typography variant="caption" sx={{ display: 'block', color: '#64748b', mt: 1 }}>
                仅显示已确认且当前没有有效分账的订单。
              </Typography>
            </Paper>

            {selectedCreatableOrder ? (
              <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, p: 2 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1, mb: 2 }}>
                  {[
                    { label: '订单号', value: selectedCreatableOrder.orderNo },
                    { label: '客户', value: selectedCreatableOrder.customerName },
                    { label: '实付金额', value: formatCurrency(selectedCreatableOrder.orderAmount) },
                    { label: '付款日期', value: formatDate(selectedCreatableOrder.paymentDate, 'yyyy-MM-dd HH:mm:ss') },
                  ].map((item) => (
                    <Box key={item.label} sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: 1, px: 1.25, py: 1 }}>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>{item.label}</Typography>
                      <Typography variant="body2" sx={{ color: '#111827', fontWeight: 800, overflowWrap: 'anywhere' }}>{item.value}</Typography>
                    </Box>
                  ))}
                </Box>
                {renderDetailSplitEditor()}
              </Paper>
            ) : (
              <Paper elevation={0} sx={{ border: '1px dashed #cbd5e1', borderRadius: 1, p: 3, textAlign: 'center', color: '#64748b' }}>
                <Typography variant="body2">先选择一笔订单，再填写分账人员和金额。</Typography>
              </Paper>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreateSplitDialog}>关闭</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteSummary)} onClose={closeDeleteOrderSplitDialog} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={closeDeleteOrderSplitDialog}>{deleteSummary?.sourceOrderDeleted ? '清理废弃分账' : '删除订单分账'}</DialogCloseTitle>
        <DialogContent dividers>
          {deleteSummary && (
            <Stack spacing={2}>
              <Typography variant="body2" sx={{ color: '#374151', lineHeight: 1.8 }}>
                {deleteSummary.sourceOrderDeleted
                  ? `将清理 ${deleteSummary.orderNo} / ${deleteSummary.customerName} 的废弃分账记录。清理后只保留操作日志，已发放后的分账不会允许清理。`
                  : `将删除 ${deleteSummary.orderNo} / ${deleteSummary.customerName} 的全部待确认分账记录。删除后，该订单会重新出现在“新建订单分账”可选范围内。`}
              </Typography>
              <TextField
                label={deleteSummary.sourceOrderDeleted ? '清理原因' : '删除原因'}
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                required
                fullWidth
                multiline
                minRows={2}
                autoFocus
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteOrderSplitDialog} disabled={deleteLoading}>取消</Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmDeleteOrderSplit}
            disabled={deleteLoading || !deleteReason.trim()}
          >
            {deleteLoading ? (deleteSummary?.sourceOrderDeleted ? '清理中...' : '删除中...') : (deleteSummary?.sourceOrderDeleted ? '确认清理' : '确认删除')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(summaryDetail)} onClose={() => { setSummaryDetail(null); resetSettlementDetailForms(); }} maxWidth="xl" fullWidth>
        <DialogCloseTitle onClose={() => { setSummaryDetail(null); resetSettlementDetailForms(); }}>订单分账处理</DialogCloseTitle>
        <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
          {summaryDetail && (
            <Stack spacing={1.5}>
              <Paper
                elevation={0}
                sx={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 1,
                  bgcolor: '#fff',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', lg: 'minmax(320px, 1.4fr) repeat(4, minmax(110px, 0.65fr))' },
                    gap: 0,
                    alignItems: 'stretch',
                  }}
                >
                  <Box sx={{ px: 2, py: 1.5, borderRight: { lg: '1px solid #e5e7eb' }, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mb: 0.5 }}>
                      <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 900, letterSpacing: 0 }}>
                        {summaryDetail.orderNo}
                      </Typography>
                      <Chip label={summaryDetail.status} size="small" color={getOrderStatusColor(summaryDetail.status)} />
                      {summaryDetail.sourceOrderDeleted && <Chip label="源订单已删除" size="small" />}
                    </Stack>
                    <Typography variant="body2" sx={{ color: '#64748b', overflowWrap: 'anywhere' }}>
                      {summaryDetail.customerName} · {summaryDetail.orderType || '-'} · {formatDate(summaryDetail.paymentDate, 'yyyy-MM-dd HH:mm:ss')}
                    </Typography>
                  </Box>
                  {[
                    { label: '实付金额', value: formatCurrency(summaryDetail.orderAmount), color: '#0f172a' },
                    { label: '分账总额', value: formatCurrency(summaryDetail.totalCommissionAmount), color: '#d97706' },
                    { label: '提成角色', value: `${summaryDetail.commissions.length} 个`, color: '#2563eb' },
                    { label: '已撤回', value: `${summaryDetail.exceptionCount} 条`, color: summaryDetail.exceptionCount ? '#64748b' : '#64748b' },
                  ].map((item) => (
                    <Box
                      key={item.label}
                      sx={{
                        px: 1.5,
                        py: 1.5,
                        borderTop: { xs: '1px solid #e5e7eb', lg: 0 },
                        borderRight: { lg: '1px solid #e5e7eb' },
                      }}
                    >
                      <Typography variant="caption" sx={{ display: 'block', color: '#64748b', lineHeight: 1.2 }}>{item.label}</Typography>
                      <Typography variant="body2" sx={{ color: item.color, fontWeight: 900, mt: 0.35 }}>{item.value}</Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 360px' }, gap: 1.5, minHeight: '58vh' }}>
                <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
                  <Box
                    sx={{
                      px: 2,
                      py: 1.25,
                      borderBottom: '1px solid #eef2f7',
                      bgcolor: '#fff',
                      display: 'flex',
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      justifyContent: 'space-between',
                      gap: 1.5,
                      flexDirection: { xs: 'column', sm: 'row' },
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ color: '#0f172a', fontWeight: 900 }}>
                        {detailEditMode ? '分账明细编辑' : '分账明细'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>
                        按角色核对人员、方案和金额，确认无误后进入右侧操作。
                      </Typography>
                    </Box>
                    {canManageOrderSettlement && (
                    <Tooltip title={detailEditMode ? '正在调整分账' : getAdjustDisabledReason(summaryDetail)}>
                      <span>
                        <Button
                          size="small"
                          variant={detailEditMode ? 'contained' : 'outlined'}
                          startIcon={<EditIcon />}
                          disabled={detailEditMode || !canAdjustSettlementSummary(summaryDetail)}
                          onClick={beginDetailAdjust}
                          sx={{ whiteSpace: 'nowrap' }}
                        >
                          {detailEditMode ? '正在调整' : '调整分账'}
                        </Button>
                      </span>
                    </Tooltip>
                    )}
                  </Box>
                  <Box sx={{ p: 1.5, bgcolor: '#f8fafc' }}>
                    {detailEditMode ? (
                      renderDetailSplitEditor()
                    ) : (
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(260px, 310px))' },
                          gap: 1.25,
                          alignItems: 'stretch',
                          justifyContent: 'start',
                        }}
                      >
                        {summaryDetail.commissions.map((commission) => renderSplitSummaryCard(commission))}
                      </Box>
                    )}
                  </Box>
                </Paper>

                <Stack spacing={1.5} sx={{ minWidth: 0 }}>
                  <Paper elevation={0} sx={{ border: '1px solid #dbeafe', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                    <Box sx={{ px: 1.5, py: 1.1, borderBottom: '1px solid #dbeafe', bgcolor: '#f8fbff' }}>
                      <Typography variant="subtitle2" sx={{ color: '#2563eb', fontWeight: 900 }}>当前动作</Typography>
                    </Box>
                    <Box sx={{ p: 1.5 }}>
                      {renderSettlementDetailActions()}
                    </Box>
                  </Paper>

                  <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                    <Box sx={{ px: 1.5, py: 1.1, borderBottom: '1px solid #eef2f7' }}>
                      <Typography variant="subtitle2" sx={{ color: '#0f172a', fontWeight: 900 }}>操作历史</Typography>
                    </Box>
                    <Box sx={{ p: 1.5 }}>
                      {operationLogs.length === 0 ? (
                        <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无分账修改记录</Typography>
                      ) : (
                        <Stack spacing={1.25} sx={{ maxHeight: '42vh', overflowY: 'auto', overflowX: 'hidden', pr: 0.5, minWidth: 0 }}>
                          {operationLogs.map((log) => renderOperationLogCard(log))}
                        </Stack>
                      )}
                    </Box>
                  </Paper>
                </Stack>
              </Box>
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={orderSplitViewOpen} onClose={() => setOrderSplitViewOpen(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setOrderSplitViewOpen(false)}>订单分账台视图设置</DialogCloseTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>
              勾选后会显示在订单分账台中，设置会保存在当前浏览器。
            </Typography>
            <TextField
              label="固定前 N 列"
              type="number"
              size="small"
              value={orderSplitViewConfig.frozenColumnCount}
              onChange={(event) => {
                const nextValue = Math.max(0, Math.min(Number(event.target.value) || 0, visibleOrderSplitColumns.length));
                setOrderSplitViewConfig((prev) => ({ ...prev, frozenColumnCount: nextValue }));
              }}
              inputProps={{ min: 0, max: visibleOrderSplitColumns.length }}
              helperText="横向滚动时，前 N 个已显示字段会固定在左侧。"
              sx={{ maxWidth: 220 }}
            />
            <Box sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
              {orderedOrderSplitColumns.map((column, index) => {
                const isDragging = draggedOrderSplitColumnId === column.id;
                const isDragTarget = dragOverOrderSplitColumnId === column.id;
                return (
                  <Box
                    key={column.id}
                    data-order-split-column-row="true"
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      if (draggedOrderSplitColumnId && draggedOrderSplitColumnId !== column.id) {
                        setDragOverOrderSplitColumnId(column.id);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverOrderSplitColumnId === column.id) setDragOverOrderSplitColumnId(null);
                    }}
                    onDrop={(event) => handleOrderSplitColumnDrop(event, column.id)}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '28px 40px 1fr',
                      alignItems: 'center',
                      minHeight: 48,
                      px: 1.25,
                      borderTop: index === 0 ? 0 : '1px solid #eef2f7',
                      bgcolor: isDragTarget ? '#e3f2fd' : '#fff',
                      opacity: isDragging ? 0.38 : 1,
                      outline: isDragTarget ? '2px solid #90caf9' : '2px solid transparent',
                      outlineOffset: -2,
                      transform: isDragging ? 'scale(0.99)' : 'none',
                      transition: 'background-color 120ms ease, opacity 120ms ease, transform 120ms ease, outline-color 120ms ease',
                      '&:hover': {
                        bgcolor: isDragTarget ? '#e3f2fd' : '#f8fafc',
                      },
                      '&:hover .order-split-drag-handle': {
                        opacity: 1,
                      },
                    }}
                  >
                    <Tooltip title="拖动排序">
                      <Box
                        className="order-split-drag-handle"
                        draggable
                        onDragStart={(event) => handleOrderSplitColumnDragStart(event, column.id)}
                        onDragEnd={clearOrderSplitColumnDrag}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isDragging ? '#1976d2' : '#94a3b8',
                          cursor: 'grab',
                          opacity: isDragging ? 1 : 0.35,
                          '&:active': { cursor: 'grabbing' },
                        }}
                      >
                        <DragIndicatorIcon fontSize="small" />
                      </Box>
                    </Tooltip>
                    <Checkbox
                      checked={orderSplitViewConfig.visibleColumnIds.includes(column.id)}
                      onChange={() => toggleOrderSplitColumn(column.id)}
                      disabled={orderSplitViewConfig.visibleColumnIds.length <= 1 && orderSplitViewConfig.visibleColumnIds.includes(column.id)}
                      sx={{ p: 0.75 }}
                    />
                    <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {column.label}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetOrderSplitView}>恢复默认</Button>
        </DialogActions>
      </Dialog>

      {orderDetail && (
        <OrderDetail order={orderDetail} open={Boolean(orderDetail)} onClose={() => setOrderDetail(null)} />
      )}

      <Dialog
        open={Boolean(payoutConfirmAction)}
        onClose={() => !payoutActionLoading && setPayoutConfirmAction(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogCloseTitle onClose={() => !payoutActionLoading && setPayoutConfirmAction(null)}>
          {payoutConfirmAction?.title || '确认操作'}
        </DialogCloseTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: '#374151', lineHeight: 1.8 }}>
            {payoutConfirmAction?.message}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={payoutActionLoading} onClick={() => setPayoutConfirmAction(null)}>取消</Button>
          <Button variant="contained" disabled={payoutActionLoading} onClick={confirmPayoutAction}>
            {payoutActionLoading ? '处理中...' : payoutConfirmAction?.confirmText || '确认'}
          </Button>
        </DialogActions>
      </Dialog>

      {customerDetail && (
        <CustomerDetail
          customer={customerDetail}
          open={Boolean(customerDetail)}
          onClose={() => setCustomerDetail(null)}
          readOnly
        />
      )}
    </Box>
  );
};

export default Commission;
