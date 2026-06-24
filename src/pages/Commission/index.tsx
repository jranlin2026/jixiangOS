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
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
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
import { commissionApi, commissionRuleApi, customerApi, departmentApi, orderApi, settingsApi } from '../../api';
import { getProductLevelColor, normalizeResourceOwnership } from '../../shared/utils/constants';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import ResizableHeaderCell, {
  readColumnWidths,
  resetColumnWidths,
  resizeColumnWidths,
  writeColumnWidths,
  type ColumnWidthMap,
} from '../../shared/components/ResizableTable';
import RefundStatusBadge from '../../shared/components/RefundStatusBadge';
import CommissionRuleConfig from './CommissionRuleConfig';
import OrderDetail from '../Orders/OrderDetail';
import CustomerDetail from '../Customers/CustomerDetail';
import type {
  Commission,
  CommissionAdjustmentInput,
  CommissionChargebackMethod,
  CommissionCreatableOrderSummary,
  CommissionOrderSummary,
  CommissionOrderSummaryFilters,
  CommissionOrderSummaryStatus,
  CommissionOrderSummaryStatusCounts,
  CommissionOperationLog,
  CommissionRole,
  CommissionRoleConfig,
  MonthlyCommissionPayout,
} from '../../types/commission';
import type { Department } from '../../types/department';
import type { Customer } from '../../types/customer';
import type { Order } from '../../types/order';
import type { User } from '../../types/settings';
import type { RefundStatus } from '../../types/common';

const ORDER_STATUS_OPTIONS: Array<{ value: CommissionOrderSummaryStatus | '全部'; label: string; important?: boolean }> = [
  { value: '全部', label: '全部' },
  { value: '待处理', label: '待处理', important: true },
  { value: '待确认', label: '待确认' },
  { value: '待发放', label: '待发放' },
  { value: '已发放', label: '已发放' },
  { value: '已撤回', label: '已撤回' },
  { value: '待冲销', label: '待冲销', important: true },
  { value: '已冲销', label: '已冲销' },
];

const DEFAULT_ORDER_STATUS_COUNTS: CommissionOrderSummaryStatusCounts = {
  全部: 0,
  待处理: 0,
  待确认: 0,
  待发放: 0,
  已发放: 0,
  已撤回: 0,
  待冲销: 0,
  已冲销: 0,
};

type OrderSplitColumnId =
  | 'orderNo'
  | 'customerName'
  | 'productLevel'
  | 'orderType'
  | 'orderAmount'
  | 'resourceOwnership'
  | 'paymentDate'
  | 'refundStatus'
  | 'salesOwner'
  | 'officialPaymentChannel'
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

const ORDER_SPLIT_VIEW_STORAGE_KEY = 'aaos_commission_order_split_view_v1';
const ORDER_SPLIT_WIDTH_STORAGE_KEY = 'aaos_commission_order_split_widths_v1';

const ORDER_SPLIT_COLUMNS: OrderSplitColumnMeta[] = [
  { id: 'orderNo', label: '订单号', defaultWidth: 170 },
  { id: 'customerName', label: '客户', defaultWidth: 150 },
  { id: 'productLevel', label: '产品等级', defaultWidth: 140 },
  { id: 'orderType', label: '订单类型', defaultWidth: 140 },
  { id: 'orderAmount', label: '实付金额', defaultWidth: 130 },
  { id: 'resourceOwnership', label: '资源归属', defaultWidth: 120 },
  { id: 'paymentDate', label: '付款日期', defaultWidth: 180 },
  { id: 'refundStatus', label: '退款状态', defaultWidth: 140 },
  { id: 'salesOwner', label: '销售负责人', defaultWidth: 130 },
  { id: 'officialPaymentChannel', label: '收款渠道', defaultWidth: 150 },
  { id: 'createdAt', label: '创建时间', defaultWidth: 160 },
  { id: 'splitDetails', label: '分账明细', defaultWidth: 310 },
  { id: 'totalCommissionAmount', label: '分账总额', defaultWidth: 130 },
  { id: 'pendingAssignCount', label: '待分配数', defaultWidth: 110 },
  { id: 'exceptionCount', label: '撤回/冲销数', defaultWidth: 130 },
  { id: 'status', label: '分账状态', defaultWidth: 120 },
];

const DEFAULT_ORDER_SPLIT_VISIBLE_COLUMNS: OrderSplitColumnId[] = [
  'orderNo',
  'customerName',
  'paymentDate',
  'orderAmount',
  'orderType',
  'salesOwner',
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

function getOrderStatusColor(status: CommissionOrderSummaryStatus): 'default' | 'success' | 'error' | 'warning' | 'info' {
  if (status === '已发放') return 'success';
  if (status === '待冲销') return 'error';
  if (status === '已冲销') return 'default';
  if (status === '已撤回') return 'default';
  if (status === '待处理') return 'warning';
  if (status === '待发放') return 'info';
  return 'default';
}

function getPayoutStatusColor(status: MonthlyCommissionPayout['status']): 'default' | 'success' | 'error' | 'warning' | 'info' {
  if (status === '已发放') return 'success';
  if (status === '待冲销') return 'error';
  if (status === '待确认') return 'info';
  if (status === '待发放') return 'warning';
  return 'default';
}

function escapeCsvValue(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

const REFUND_STATUS_VALUES = new Set<RefundStatus>([
  '无',
  '待分配',
  '挽回中',
  '挽回成功',
  '待财务退款',
  '退款申请中',
  '退款已批准',
  '退款已完成',
  '退款已拒绝',
]);

const CHARGEBACK_METHOD_OPTIONS: CommissionChargebackMethod[] = ['线下追回', '下月提成抵扣', '财务确认无需追回'];

function normalizeRefundStatusBadgeValue(status?: string): RefundStatus {
  return status && REFUND_STATUS_VALUES.has(status as RefundStatus) ? (status as RefundStatus) : '无';
}

interface CommissionProps {
  embedded?: boolean;
  initialTab?: 0 | 1 | 2;
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
  hideEmbeddedOrderSplitViewButton = false,
  orderSplitViewTrigger = 0,
  orderSplitCreateTrigger = 0,
}) => {
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
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutConfirmAction, setPayoutConfirmAction] = useState<PayoutConfirmAction | null>(null);
  const [payoutActionLoading, setPayoutActionLoading] = useState(false);

  const [commissionRoleConfigs, setCommissionRoleConfigs] = useState<CommissionRoleConfig[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
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
  const [chargebackMethod, setChargebackMethod] = useState<CommissionChargebackMethod>('下月提成抵扣');
  const [chargebackAmount, setChargebackAmount] = useState(0);
  const [orderDetail, setOrderDetail] = useState<Order | null>(null);
  const [operationLogs, setOperationLogs] = useState<CommissionOperationLog[]>([]);
  const [customerDetail, setCustomerDetail] = useState<Customer | null>(null);

  const activeEmployees = useMemo(() => employees.filter((item) => item.isActive), [employees]);
  const activeRoleConfigs = useMemo(() => commissionRoleConfigs.filter((item) => item.isActive), [commissionRoleConfigs]);
  const selectedCreatableOrder = useMemo(() => (
    creatableOrderRows.find((order) => order.orderId === selectedCreatableOrderId) || null
  ), [creatableOrderRows, selectedCreatableOrderId]);
  const monthlyPayoutSummary = useMemo(() => payoutRows.reduce((summary, row) => ({
    orderCount: summary.orderCount + row.orderCount,
    totalAmount: summary.totalAmount + row.totalAmount,
    pendingConfirmAmount: summary.pendingConfirmAmount + row.pendingConfirmAmount,
    pendingPayAmount: summary.pendingPayAmount + row.pendingPayAmount,
    paidAmount: summary.paidAmount + row.paidAmount,
    exceptionAmount: summary.exceptionAmount + (row.exceptionAmount || 0),
    withdrawnAmount: summary.withdrawnAmount + (row.withdrawnAmount || 0),
    chargebackAmount: summary.chargebackAmount + (row.chargebackAmount || 0),
  }), {
    orderCount: 0,
    totalAmount: 0,
    pendingConfirmAmount: 0,
    pendingPayAmount: 0,
    paidAmount: 0,
    exceptionAmount: 0,
    withdrawnAmount: 0,
    chargebackAmount: 0,
  }), [payoutRows]);

  const getDepartmentName = (departmentId?: string) => departments.find((item) => item.id === departmentId)?.name || '';
  const findEmployeeForDisplay = (ownerId?: string, ownerName?: string) => {
    const normalizedOwnerName = ownerName?.trim();
    return activeEmployees.find((user) => (
      user.id === ownerId || Boolean(normalizedOwnerName && user.name === normalizedOwnerName)
    ));
  };
  const formatEmployeeDisplayName = (user?: User | null, fallbackName?: string) => {
    const name = user?.name || fallbackName?.trim() || '';
    if (!name) return '待分配';
    const role = user?.role?.trim();
    return role ? `${name}（${role}）` : name;
  };
  const formatOwnerDisplayName = (ownerId?: string, ownerName?: string) => (
    formatEmployeeDisplayName(findEmployeeForDisplay(ownerId, ownerName), ownerName)
  );
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

  const fetchSettlementOptions = async () => {
    const [rolesRes, usersRes, departmentsRes] = await Promise.all([
      commissionRuleApi.getCommissionRoleConfigs(),
      settingsApi.fetchUsers({ isActive: true }),
      departmentApi.getDepartments({ isActive: true }),
    ]);
    if (rolesRes.code === 0) setCommissionRoleConfigs(rolesRes.data);
    if (usersRes.code === 0) setEmployees(usersRes.data);
    if (departmentsRes.code === 0) setDepartments(departmentsRes.data);
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
      if (res.code === 0) setPayoutRows(res.data);
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

  const buildNewSplitRow = (orderId: string, orderAmount: number): CommissionAdjustmentInput => ({
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
  });

  const openCreateSplitDialog = () => {
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
    setChargebackMethod('下月提成抵扣');
    setChargebackAmount(0);
  };

  const canAdjustSettlementSummary = (summary: CommissionOrderSummary) => (
    !summary.sourceOrderDeleted && !['已发放', '已撤回', '待冲销', '已冲销'].includes(summary.status)
  );

  const getAdjustDisabledReason = (summary: CommissionOrderSummary) => {
    if (summary.sourceOrderDeleted) return '源订单已删除，只能查看明细和历史';
    if (summary.status === '已发放') return '已发放提成不能直接调整，请先发起冲销';
    if (summary.status === '待冲销') return '待冲销提成需先完成冲销处理';
    if (summary.status === '已冲销') return '冲销已完成，只能查看留痕';
    if (summary.status === '已撤回') return '提成已撤回，只能查看留痕';
    return '调整分账';
  };

  const canDeleteOrderSplitSummary = (summary: CommissionOrderSummary) => (
    !summary.sourceOrderDeleted
    && ['待处理', '待确认'].includes(summary.status)
    && summary.commissions.length > 0
    && summary.commissions.every((commission) => commission.status === '待确认')
  );

  const getDeleteOrderSplitDisabledReason = (summary: CommissionOrderSummary) => {
    if (summary.sourceOrderDeleted) return '源订单已删除，只能查看明细和历史';
    if (!summary.commissions.length) return '该订单没有可删除的分账';
    if (!['待处理', '待确认'].includes(summary.status)) return '已进入发放或冲销链路，请使用撤回/冲销流程';
    if (!summary.commissions.every((commission) => commission.status === '待确认')) return '仅待确认阶段的分账可直接删除';
    return '删除订单分账';
  };

  const loadOperationLogs = async (orderId: string) => {
    const res = await commissionApi.fetchCommissionOperationLogs(orderId);
    if (res.code === 0) setOperationLogs(res.data);
  };

  const mapCommissionToSplitRow = (item: Commission): CommissionAdjustmentInput => {
    const employee = activeEmployees.find((user) => user.id === item.ownerId || user.name === item.owner);
    return {
      id: item.id,
      orderId: item.orderId,
      role: item.role,
      owner: employee?.name || '',
      ownerId: employee?.id || '',
      department: employee ? getDepartmentName(employee.departmentId) : '',
      departmentId: employee?.departmentId || '',
      paymentDate: item.paymentDate,
      commissionAmount: item.commissionAmount,
      commissionRate: item.commissionRate,
      performanceAmount: item.performanceAmount || item.orderAmount,
      calculationNote: item.calculationNote || item.formulaText || '',
      commissionRuleId: item.commissionRuleId,
    };
  };

  const openSettlementDetail = async (summary: CommissionOrderSummary, options?: { edit?: boolean }) => {
    setSummaryDetail(summary);
    resetSettlementDetailForms();
    setChargebackAmount(summary.commissions
      .filter((commission) => commission.status === '待冲销')
      .reduce((sum, commission) => sum + commission.commissionAmount, 0));
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
    if (nextSummary) {
      setChargebackAmount(nextSummary.commissions
        .filter((commission) => commission.status === '待冲销')
        .reduce((sum, commission) => sum + commission.commissionAmount, 0));
    }
    await loadOperationLogs(orderId);
  };

  const renderSplitDetails = (summary: CommissionOrderSummary) => {
    const rows = summary.splitSummary.slice(0, 3);
    return (
      <Stack spacing={0.6} sx={{ py: 0.5 }}>
        {rows.map((item, index) => {
          const isPendingOwner = !item.owner || item.owner === '待分配';
          const isWithdrawn = item.status === '已撤回';
          const isChargebackPending = item.status === '待冲销';
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
                {(isWithdrawn || isChargebackPending) && (
                  <Chip label={item.status} size="small" color={isChargebackPending ? 'error' : 'default'} sx={{ height: 20 }} />
                )}
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
      case 'productLevel':
        return (
          <Chip
            label={summary.productLevel || '-'}
            size="small"
            sx={{ bgcolor: `${getProductLevelColor(summary.productLevel)}18`, color: getProductLevelColor(summary.productLevel), fontWeight: 600 }}
          />
        );
      case 'orderType':
        return summary.orderType ? <Chip label={summary.orderType} size="small" variant="outlined" /> : '-';
      case 'orderAmount':
        return formatCurrency(summary.orderAmount);
      case 'resourceOwnership':
        return summary.resourceOwnership ? normalizeResourceOwnership(summary.resourceOwnership) : '-';
      case 'paymentDate':
        return summary.paymentDate ? formatDate(summary.paymentDate, 'yyyy-MM-dd HH:mm') : '-';
      case 'refundStatus':
        return <RefundStatusBadge status={normalizeRefundStatusBadgeValue(summary.refundStatus)} />;
      case 'salesOwner':
        return summary.salesOwner || summary.salesName || '-';
      case 'officialPaymentChannel':
        return summary.officialPaymentChannel || '-';
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
    if (!summaryDetail || !canAdjustSettlementSummary(summaryDetail)) return;
    const res = await commissionApi.fetchCommissionsByOrder(summaryDetail.orderId);
    if (res.code !== 0) return;
    setSplitOrderId(summaryDetail.orderId);
    setSplitRows(res.data.map(mapCommissionToSplitRow));
    setSplitReason('');
    setDetailEditMode(true);
  };

  const updateSplitRow = <K extends keyof CommissionAdjustmentInput>(index: number, key: K, value: CommissionAdjustmentInput[K]) => {
    setSplitRows((prev) => prev.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [key]: value } : row
    )));
  };

  const handleSplitOwnerChange = (index: number, ownerId: string) => {
    const employee = activeEmployees.find((item) => item.id === ownerId);
    setSplitRows((prev) => prev.map((row, rowIndex) => (
      rowIndex === index
        ? {
          ...row,
          ownerId,
          owner: employee?.name || '',
          departmentId: employee?.departmentId || '',
          department: getDepartmentName(employee?.departmentId),
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
    setDeleteSummary(summary);
    setDeleteReason('');
  };

  const closeDeleteOrderSplitDialog = () => {
    if (deleteLoading) return;
    setDeleteSummary(null);
    setDeleteReason('');
  };

  const confirmDeleteOrderSplit = async () => {
    if (!deleteSummary || !deleteReason.trim()) return;
    const deletingOrderId = deleteSummary.orderId;
    setDeleteLoading(true);
    try {
      const res = await commissionApi.deleteOrderCommissions(deletingOrderId, deleteReason);
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

  const startChargebackFromDetail = async () => {
    if (!summaryDetail || !detailActionReason.trim()) return;
    setDetailActionLoading(true);
    try {
      const res = await commissionApi.startCommissionChargeback(summaryDetail.orderId, detailActionReason);
      if (res.code === 0) {
        setDetailActionReason('');
        await refreshAll();
        await reloadSettlementDetail(summaryDetail.orderId);
      }
    } finally {
      setDetailActionLoading(false);
    }
  };

  const completeChargebackFromDetail = async () => {
    if (!summaryDetail || !detailActionReason.trim() || chargebackAmount <= 0) return;
    setDetailActionLoading(true);
    try {
      const res = await commissionApi.completeCommissionChargeback(summaryDetail.orderId, {
        method: chargebackMethod,
        amount: chargebackAmount,
        reason: detailActionReason,
      });
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
    if (!payoutPeriod) return;
    setPayoutConfirmAction({
      type: 'generate',
      title: '生成发放单',
      message: `将按 ${payoutPeriod} 当前可发放提成生成发放单。待确认、已撤回和待冲销明细不会进入可发放金额，历史订单、客户等业务数据不会被改动。`,
      confirmText: '生成发放单',
    });
  };

  const payOwner = async (ownerId?: string) => {
    if (!ownerId) return;
    const row = payoutRows.find((item) => item.ownerId === ownerId);
    setPayoutConfirmAction({
      type: 'payOwner',
      ownerId,
      title: '确认此人已发',
      message: `确认已完成 ${row ? formatOwnerDisplayName(row.ownerId, row.owner) : '该员工'} ${payoutPeriod} 的线下提成发放？系统会把该员工本月待发放提成标记为已发放，待确认、已撤回和待冲销明细不会变更。`,
      confirmText: '确认此人已发',
    });
  };

  const payBatch = async () => {
    if (monthlyPayoutSummary.pendingPayAmount <= 0) return;
    setPayoutConfirmAction({
      type: 'payBatch',
      title: '确认本月已发放',
      message: `确认已完成 ${payoutPeriod} 本月线下提成发放？系统只会把待发放金额 ${formatCurrency(monthlyPayoutSummary.pendingPayAmount)} 标记为已发放，待确认、已撤回和待冲销明细不会变更。`,
      confirmText: '确认本月已发放',
    });
  };

  const confirmPayoutAction = async () => {
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
          setPayoutRows(res.data);
          await fetchOrderSummaries();
        }
      }
      if (payoutConfirmAction.type === 'payBatch') {
        const res = await commissionApi.payMonthlyCommissionBatch(payoutPeriod);
        if (res.code === 0) {
          setPayoutRows(res.data);
          await fetchOrderSummaries();
        }
      }
      setPayoutConfirmAction(null);
    } finally {
      setPayoutActionLoading(false);
    }
  };

  const exportMonthlyStatement = () => {
    const headers = ['月份', '员工', '部门', '订单数', '应发提成', '待确认', '待发放', '已发放', '已撤回', '待冲销', '状态'];
    const rows = payoutRows.map((row) => [
      row.period,
      formatOwnerDisplayName(row.ownerId, row.owner),
      row.department || '-',
      row.orderCount,
      row.totalAmount,
      row.pendingConfirmAmount,
      row.pendingPayAmount,
      row.paidAmount,
      row.withdrawnAmount,
      row.chargebackAmount,
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

  const renderPayoutCommissionDetail = (commission: Commission) => {
    const note = commission.auditReason || commission.adjustReason || commission.calculationNote || '-';
    const fields: Array<{ label: string; value: React.ReactNode; strong?: boolean; alignRight?: boolean }> = [
      { label: '订单号', value: commission.orderNo, strong: true },
      { label: '客户', value: commission.customerName },
      { label: '提成角色', value: commission.role },
      { label: '提成金额', value: formatCurrency(commission.commissionAmount), strong: true, alignRight: true },
      { label: '状态', value: <Chip label={commission.status} size="small" /> },
      { label: '备注/原因', value: note },
    ];

    return (
      <Box
        key={commission.id}
        sx={{
          border: '1px solid #e5e7eb',
          borderRadius: 1,
          bgcolor: '#fff',
          px: 1.5,
          py: 1.25,
          maxWidth: 760,
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: 'minmax(150px, 1.25fr) minmax(120px, 1fr) 92px 112px 90px minmax(150px, 1.25fr)',
            },
            gap: { xs: 1, md: 1.25 },
            alignItems: 'center',
          }}
        >
          {fields.map((field) => (
            <Box key={field.label} sx={{ minWidth: 0, textAlign: { xs: 'left', md: field.alignRight ? 'right' : 'left' } }}>
              <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>
                {field.label}
              </Typography>
              <Typography
                component="div"
                variant="body2"
                sx={{
                  color: field.strong ? '#111827' : '#374151',
                  fontWeight: field.strong ? 700 : 500,
                  overflowWrap: 'anywhere',
                }}
              >
                {field.value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    );
  };

  const renderSplitSummaryCard = (commission: Commission) => {
    const note = commission.calculationNote || commission.formulaText || '-';
    const performanceAmount = commission.performanceAmount || commission.orderAmount;
    const statusColor = commission.status === '已发放'
      ? 'success'
      : commission.status === '待冲销'
        ? 'error'
        : commission.status === '待发放'
          ? 'info'
          : commission.status === '待确认'
            ? 'warning'
            : 'default';

    return (
      <Box
        key={commission.id}
        sx={{
          border: '1px solid #e5e7eb',
          borderRadius: 1,
          bgcolor: '#fff',
          px: 1.5,
          py: 1.25,
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', mb: 1 }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
            <Chip label={commission.role} size="small" color="primary" />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ color: '#111827', fontWeight: 800, overflowWrap: 'anywhere' }}>
                {formatOwnerDisplayName(commission.ownerId, commission.owner)}
              </Typography>
              <Typography variant="caption" sx={{ color: '#6b7280', overflowWrap: 'anywhere', display: 'block' }}>
                {commission.department || '-'}
              </Typography>
            </Box>
          </Stack>
          <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
            <Typography variant="caption" sx={{ color: '#6b7280', display: 'block' }}>提成金额</Typography>
            <Typography variant="h6" sx={{ color: '#d32f2f', fontWeight: 800, lineHeight: 1.25 }}>
              {formatCurrency(commission.commissionAmount)}
            </Typography>
          </Box>
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '120px 120px minmax(0, 1fr)' },
            gap: 1,
            alignItems: 'start',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>业绩金额</Typography>
            <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700 }}>
              {formatCurrency(performanceAmount)}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>状态</Typography>
            <Chip label={commission.status} size="small" color={statusColor} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>说明</Typography>
            <Typography variant="body2" sx={{ color: '#374151', overflowWrap: 'anywhere' }}>
              {note}
            </Typography>
          </Box>
        </Box>
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
          border: '1px solid #e5e7eb',
          borderRadius: 1,
          bgcolor: '#fff',
          p: 1.5,
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ alignItems: { xs: 'flex-start', sm: 'flex-start' }, justifyContent: 'space-between', mb: 1.25 }}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, mb: 0.5 }}>
              <Chip label={log.action} size="small" color={log.action === '确认分账' ? 'success' : 'primary'} />
              <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700, overflowWrap: 'anywhere' }}>
                {operationTitle}
              </Typography>
            </Stack>
            <Typography variant="caption" sx={{ color: '#6b7280', overflowWrap: 'anywhere', display: 'block' }}>
              {log.orderNo} / {log.customerName}
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: '#6b7280', flexShrink: 0 }}>
            {formatDate(log.operatedAt, 'yyyy-MM-dd HH:mm')}
          </Typography>
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, mb: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>
              操作人
            </Typography>
            <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700, overflowWrap: 'anywhere' }}>
              {log.operator || '-'}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>
              本次结果
            </Typography>
            <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700, overflowWrap: 'anywhere' }}>
              {splitSnapshot.length || log.commissionCount || 0} 个角色，合计 {amountText}
            </Typography>
          </Box>
        </Box>

        {log.reason && (
          <Box sx={{ bgcolor: '#f8fafc', borderRadius: 1, px: 1.25, py: 0.9, mb: 1 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>修改原因</Typography>
            <Typography variant="body2" sx={{ color: '#374151', overflowWrap: 'anywhere' }}>{log.reason}</Typography>
          </Box>
        )}

        {splitSnapshot.length > 0 ? (
          <Box sx={{ bgcolor: '#f8fafc', borderRadius: 1, px: 1.25, py: 1 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.75 }}>
              本次分账结果
            </Typography>
            <Stack spacing={0.75}>
              {splitSnapshot.map((item, index) => (
                <Box
                  key={`${log.id}-${item.role}-${item.ownerId || item.owner}-${index}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '96px minmax(0, 1fr) 112px 86px' },
                    gap: { xs: 0.5, sm: 1 },
                    alignItems: 'center',
                    bgcolor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 1,
                    px: 1,
                    py: 0.75,
                  }}
                >
                  <Chip label={item.role} size="small" variant="outlined" sx={{ justifySelf: { xs: 'flex-start', sm: 'stretch' } }} />
                  <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700, overflowWrap: 'anywhere' }}>
                    {formatOwnerDisplayName(item.ownerId, item.owner)}{item.department ? ` / ${item.department}` : ''}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#111827', fontWeight: 800, textAlign: { xs: 'left', sm: 'right' } }}>
                    {formatCurrency(item.commissionAmount)}
                  </Typography>
                  <Chip label={item.status} size="small" />
                </Box>
              ))}
            </Stack>
          </Box>
        ) : (
          <Box sx={{ bgcolor: '#f8fafc', borderRadius: 1, px: 1.25, py: 1 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>
              本次记录
            </Typography>
            <Typography variant="body2" sx={{ color: '#374151', overflowWrap: 'anywhere' }}>
              保存了 {log.commissionCount ?? '-'} 个分账角色，合计 {amountText}。旧记录未保存人员明细，后续新记录会直接展示每个角色的分账结果。
            </Typography>
          </Box>
        )}
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
          const importantBadgeTextColor = item.important ? '#111827' : undefined;
          return (
            <Button
              key={item.value}
              variant={selected ? 'contained' : 'outlined'}
              color={item.important ? 'error' : 'primary'}
              onClick={() => updateOrderFilter('status', item.value)}
              sx={{ borderRadius: 1.5 }}
            >
              {item.label}
              <Chip
                label={count}
                size="small"
                color={highlight && !selected ? (item.value === '待冲销' ? 'error' : 'warning') : 'default'}
                sx={{
                  ml: 1,
                  height: 22,
                  minWidth: 24,
                  bgcolor: selected ? 'rgba(255,255,255,0.24)' : '#eef2f7',
                  color: importantBadgeTextColor || (selected ? '#fff' : undefined),
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
              <TableRow key={summary.orderId} hover>
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
      <Stack spacing={1.25}>
        {splitRows.map((row, index) => (
          <Box
            key={row.id || `detail-card-${index}`}
            sx={{
              border: '1px solid #e5e7eb',
              borderRadius: 1,
              bgcolor: '#fff',
              px: 1.75,
              py: 1.5,
            }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
              <Typography variant="subtitle2" sx={{ color: '#111827', fontWeight: 800 }}>
                分账人员 {index + 1}
              </Typography>
              <Tooltip title={canDeleteSplitRow(row) ? '删除此条未确认分账' : '仅待确认阶段的分账可直接删除'}>
                <span>
                  <IconButton
                    size="small"
                    color="error"
                    disabled={!canDeleteSplitRow(row)}
                    onClick={() => setSplitRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}
                    aria-label="删除分账人员"
                    sx={{ width: 32, height: 32 }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1.2fr', lg: '1fr 1.25fr 1.1fr' },
                gap: 1.25,
                mb: 1.25,
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                {renderEditorFieldLabel('提成角色')}
                <FormControl size="small" fullWidth>
                  <Select
                    value={row.role}
                    onChange={(event) => updateSplitRow(index, 'role', event.target.value as CommissionRole)}
                    aria-label="提成角色"
                    fullWidth
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
                    fullWidth
                    sx={{ bgcolor: '#fff' }}
                  >
                    <MenuItem value="">选择员工</MenuItem>
                    {activeEmployees.map((employee) => (
                      <MenuItem key={employee.id} value={employee.id}>{formatEmployeeDisplayName(employee)}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>
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
            </Box>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1.8fr' },
                gap: 1.25,
              }}
            >
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
              <Box sx={{ minWidth: 0 }}>
                {renderEditorFieldLabel('提成金额')}
                <TextField
                  size="small"
                  type="number"
                  value={row.commissionAmount}
                  onChange={(event) => updateSplitRow(index, 'commissionAmount', Number(event.target.value))}
                  fullWidth
                  sx={editorInputSx}
                />
              </Box>
              <Box sx={{ minWidth: 0, gridColumn: { xs: 'auto', sm: '1 / -1', lg: '1 / -1' } }}>
                {renderEditorFieldLabel('说明')}
                <TextField
                  size="small"
                  value={row.calculationNote || ''}
                  onChange={(event) => updateSplitRow(index, 'calculationNote', event.target.value)}
                  fullWidth
                  sx={editorInputSx}
                />
              </Box>
            </Box>
          </Box>
        ))}
      </Stack>
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
          disabled={splitSaving || !splitReason.trim() || splitRows.length === 0 || splitRows.some((row) => !row.ownerId)}
          onClick={handleSaveSplitRows}
        >
          {splitSaving ? '保存中...' : createSplitOpen ? '保存分账' : '保存调整'}
        </Button>
      </Stack>
    </Stack>
  );

  const renderSettlementDetailActions = () => {
    if (!summaryDetail) return null;
    if (summaryDetail.sourceOrderDeleted || ['已撤回', '已冲销'].includes(summaryDetail.status)) {
      const text = summaryDetail.sourceOrderDeleted
        ? '源订单已删除，仅保留分账明细和历史记录。'
        : summaryDetail.status === '已冲销'
          ? '冲销已完成，该订单分账进入只读留痕状态。'
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
          <TextField label="撤回原因" value={detailActionReason} onChange={(event) => setDetailActionReason(event.target.value)} size="small" placeholder="例如：订单退款、规则错误" fullWidth />
          <Button color="error" variant="outlined" onClick={withdrawOrderFromDetail} disabled={detailActionLoading || !detailActionReason.trim()}>撤回提成</Button>
        </Stack>
      );
    }

    if (summaryDetail.status === '待发放') {
      return (
        <Stack spacing={1.25}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>未发放提成可直接撤回，撤回后不进入月度发放。</Typography>
          <TextField label="撤回原因" value={detailActionReason} onChange={(event) => setDetailActionReason(event.target.value)} size="small" placeholder="例如：订单退款、金额错误" fullWidth />
          <Button color="error" variant="contained" onClick={withdrawOrderFromDetail} disabled={detailActionLoading || !detailActionReason.trim()}>撤回提成</Button>
        </Stack>
      );
    }

    if (summaryDetail.status === '已发放') {
      return (
        <Stack spacing={1.25}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>提成已发放，需要先发起冲销，后续登记追回或抵扣结果。</Typography>
          <TextField label="冲销原因" value={detailActionReason} onChange={(event) => setDetailActionReason(event.target.value)} size="small" placeholder="例如：订单退款后追回已发提成" fullWidth />
          <Button color="error" variant="contained" onClick={startChargebackFromDetail} disabled={detailActionLoading || !detailActionReason.trim()}>发起冲销</Button>
        </Stack>
      );
    }

    if (summaryDetail.status === '待冲销') {
      return (
        <Stack spacing={1.25}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>登记线下追回或下月抵扣结果，完成后不再计入待冲销金额。</Typography>
          <FormControl size="small" fullWidth>
            <InputLabel>冲销方式</InputLabel>
            <Select value={chargebackMethod} label="冲销方式" onChange={(event) => setChargebackMethod(event.target.value as CommissionChargebackMethod)}>
              {CHARGEBACK_METHOD_OPTIONS.map((method) => <MenuItem key={method} value={method}>{method}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField label="冲销金额" type="number" value={chargebackAmount} onChange={(event) => setChargebackAmount(Number(event.target.value))} size="small" fullWidth />
          <TextField label="处理说明" value={detailActionReason} onChange={(event) => setDetailActionReason(event.target.value)} size="small" placeholder="例如：已在 6 月提成中抵扣" fullWidth />
          <Button color="success" variant="contained" onClick={completeChargebackFromDetail} disabled={detailActionLoading || !detailActionReason.trim() || chargebackAmount <= 0}>确认冲销完成</Button>
        </Stack>
      );
    }

    return <Typography variant="body2" sx={{ color: '#64748b' }}>当前状态无需处理。</Typography>;
  };

  const renderMonthlyPayout = () => (
    <>
      <Stack direction="row" spacing={1.25} sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <TextField
          label="统计月份"
          type="month"
          value={payoutPeriod}
          onChange={(event) => setPayoutPeriod(event.target.value)}
          size="small"
          InputLabelProps={{ shrink: true }}
        />
        <Tooltip title="按当前月份可发放提成生成发放单，待确认、已撤回和待冲销明细不进入可发放金额">
          <Button variant="outlined" startIcon={<PaymentsIcon />} disabled={payoutActionLoading} onClick={generateMonthlyBatch}>生成发放单</Button>
        </Tooltip>
        <Tooltip title={payoutRows.length ? '导出当前员工提成月报' : '暂无可导出的月报数据'}>
          <span>
            <Button variant="outlined" startIcon={<FileDownloadIcon />} disabled={!payoutRows.length || payoutActionLoading} onClick={exportMonthlyStatement}>导出发放表</Button>
          </span>
        </Tooltip>
        <Tooltip title={monthlyPayoutSummary.pendingPayAmount > 0 ? '确认本月待发放提成已完成线下发放' : '当前月份没有待发放金额'}>
          <span>
            <Button variant="contained" startIcon={<CheckCircleIcon />} disabled={monthlyPayoutSummary.pendingPayAmount <= 0 || payoutActionLoading} onClick={payBatch}>确认本月已发放</Button>
          </span>
        </Tooltip>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1.25, mb: 2 }}>
        {[
          { label: '本月应发', value: monthlyPayoutSummary.totalAmount, color: '#111827' },
          { label: '待确认', value: monthlyPayoutSummary.pendingConfirmAmount, color: '#2563eb' },
          { label: '待发放', value: monthlyPayoutSummary.pendingPayAmount, color: '#d97706' },
          { label: '已发放', value: monthlyPayoutSummary.paidAmount, color: '#16a34a' },
          { label: '已撤回', value: monthlyPayoutSummary.withdrawnAmount, color: '#6b7280' },
          { label: '待冲销', value: monthlyPayoutSummary.chargebackAmount, color: '#dc2626' },
        ].map((item) => (
          <Box key={item.label} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, px: 1.5, py: 1.25, bgcolor: '#fff' }}>
            <Typography variant="caption" sx={{ color: '#6b7280' }}>{item.label}</Typography>
            <Typography variant="h6" sx={{ color: item.color, fontWeight: 800, lineHeight: 1.35 }}>
              {formatCurrency(item.value)}
            </Typography>
          </Box>
        ))}
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell width={52} />
              <TableCell>员工</TableCell>
              <TableCell>部门</TableCell>
              <TableCell>订单数</TableCell>
              <TableCell>应发提成</TableCell>
              <TableCell>待确认</TableCell>
              <TableCell>待发放</TableCell>
              <TableCell>已发放</TableCell>
              <TableCell>已撤回</TableCell>
              <TableCell>待冲销</TableCell>
              <TableCell>状态</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payoutRows.map((row) => {
              const ownerKey = row.ownerId || row.owner;
              const expanded = expandedPayoutOwners.has(ownerKey);
              const actionDisabledReason = !row.ownerId
                ? '无员工ID，需先在订单分账中分配员工'
                : row.chargebackAmount > 0
                  ? '存在待冲销明细，先由财务人工处理后再确认此人已发'
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
                    <TableCell sx={{ fontWeight: 700, color: '#111827' }}>{formatCurrency(row.totalAmount)}</TableCell>
                    <TableCell sx={{ color: row.pendingConfirmAmount > 0 ? '#2563eb' : undefined }}>{formatCurrency(row.pendingConfirmAmount)}</TableCell>
                    <TableCell sx={{ fontWeight: row.pendingPayAmount > 0 ? 700 : 400, color: row.pendingPayAmount > 0 ? '#d97706' : undefined }}>{formatCurrency(row.pendingPayAmount)}</TableCell>
                    <TableCell>{formatCurrency(row.paidAmount)}</TableCell>
                    <TableCell sx={{ color: row.withdrawnAmount > 0 ? '#6b7280' : undefined }}>{formatCurrency(row.withdrawnAmount)}</TableCell>
                    <TableCell sx={{ color: row.chargebackAmount > 0 ? '#dc2626' : undefined }}>{formatCurrency(row.chargebackAmount)}</TableCell>
                    <TableCell><Chip label={row.status} size="small" color={getPayoutStatusColor(row.status)} /></TableCell>
                    <TableCell align="center">
                      <Tooltip title={actionDisabledReason || '确认此人已发'}>
                        <span>
                          <IconButton size="small" color="success" disabled={Boolean(actionDisabledReason) || payoutActionLoading} onClick={() => payOwner(row.ownerId)}>
                            <CheckCircleIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={12} sx={{ p: 0, border: 0 }}>
                      <Collapse in={expanded} timeout="auto" unmountOnExit>
                        <Box sx={{ px: { xs: 1.5, sm: 2.5 }, py: 1.5, bgcolor: '#f8fafc' }}>
                          <Stack spacing={1}>
                            {row.commissions.map((commission) => renderPayoutCommissionDetail(commission))}
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
                <TableCell colSpan={12} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                  {payoutLoading ? '加载中...' : '暂无员工提成月报数据'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
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
                订单分账负责确认每笔提成，员工提成月报负责统计每个人本月应发、待确认、待发放、已撤回和待冲销金额。
              </Typography>
            </Box>
            {tabValue === 0 && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setOrderSplitViewOpen(true)}>
                  视图设置
                </Button>
                <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateSplitDialog}>
                  新建订单分账
                </Button>
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
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateSplitDialog}>
              新建订单分账
            </Button>
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
                仅显示已确认、未退款完成、且当前没有有效分账的订单。
              </Typography>
            </Paper>

            {selectedCreatableOrder ? (
              <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, p: 2 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1, mb: 2 }}>
                  {[
                    { label: '订单号', value: selectedCreatableOrder.orderNo },
                    { label: '客户', value: selectedCreatableOrder.customerName },
                    { label: '实付金额', value: formatCurrency(selectedCreatableOrder.orderAmount) },
                    { label: '付款日期', value: formatDate(selectedCreatableOrder.paymentDate, 'yyyy-MM-dd HH:mm') },
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
        <DialogCloseTitle onClose={closeDeleteOrderSplitDialog}>删除订单分账</DialogCloseTitle>
        <DialogContent dividers>
          {deleteSummary && (
            <Stack spacing={2}>
              <Typography variant="body2" sx={{ color: '#374151', lineHeight: 1.8 }}>
                将删除 {deleteSummary.orderNo} / {deleteSummary.customerName} 的全部待确认分账记录。
                删除后，该订单会重新出现在“新建订单分账”可选范围内。
              </Typography>
              <TextField
                label="删除原因"
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
            {deleteLoading ? '删除中...' : '确认删除'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(summaryDetail)} onClose={() => { setSummaryDetail(null); resetSettlementDetailForms(); }} maxWidth="xl" fullWidth>
        <DialogCloseTitle onClose={() => { setSummaryDetail(null); resetSettlementDetailForms(); }}>订单分账处理</DialogCloseTitle>
        <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
          {summaryDetail && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.15fr 0.85fr' }, gap: 2, minHeight: '68vh' }}>
              <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
                <Box sx={{ p: 2, borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mb: 0.5 }}>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>{summaryDetail.orderNo}</Typography>
                      <Chip label={summaryDetail.status} size="small" color={getOrderStatusColor(summaryDetail.status)} />
                      {summaryDetail.sourceOrderDeleted && <Chip label="源订单已删除" size="small" />}
                    </Stack>
                    <Typography variant="body2" sx={{ color: '#64748b', overflowWrap: 'anywhere' }}>
                      {summaryDetail.customerName} · {summaryDetail.orderType || '-'} · {formatDate(summaryDetail.paymentDate, 'yyyy-MM-dd HH:mm')}
                    </Typography>
                  </Box>
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
                </Box>
                <Box sx={{ p: 2 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1, mb: 2 }}>
                    {[
                      { label: '实付金额', value: formatCurrency(summaryDetail.orderAmount) },
                      { label: '分账总额', value: formatCurrency(summaryDetail.totalCommissionAmount) },
                      { label: '提成角色', value: `${summaryDetail.commissions.length} 个` },
                      { label: '撤回/冲销', value: `${summaryDetail.exceptionCount} 条` },
                    ].map((item) => (
                      <Box key={item.label} sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: 1, px: 1.25, py: 1 }}>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>{item.label}</Typography>
                        <Typography variant="body2" sx={{ color: '#111827', fontWeight: 800 }}>{item.value}</Typography>
                      </Box>
                    ))}
                  </Box>
                  {detailEditMode ? (
                    renderDetailSplitEditor()
                  ) : (
                    <Stack spacing={1.25}>
                      {summaryDetail.commissions.map((commission) => renderSplitSummaryCard(commission))}
                    </Stack>
                  )}
                </Box>
              </Paper>

              <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
                <Box sx={{ p: 2, borderBottom: '1px solid #eef2f7' }}>
                  <Typography variant="subtitle2" sx={{ color: '#2196F3', fontWeight: 800 }}>当前可操作</Typography>
                </Box>
                <Box sx={{ p: 2, borderBottom: '1px solid #eef2f7' }}>
                  {renderSettlementDetailActions()}
                </Box>
                <Box sx={{ p: 2 }}>
                  <Typography variant="subtitle2" sx={{ color: '#111827', fontWeight: 800, mb: 1.5 }}>操作历史</Typography>
                  {operationLogs.length === 0 ? (
                    <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无分账修改记录</Typography>
                  ) : (
                    <Stack spacing={1.25} sx={{ maxHeight: '46vh', overflowY: 'auto', pr: 0.5 }}>
                      {operationLogs.map((log) => renderOperationLogCard(log))}
                    </Stack>
                  )}
                </Box>
              </Paper>
            </Box>
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
