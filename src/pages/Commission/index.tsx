import React, { useEffect, useMemo, useState } from 'react';
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import PaymentsIcon from '@mui/icons-material/Payments';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { commissionApi, commissionRuleApi, departmentApi, orderApi, settingsApi } from '../../api';
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
import CommissionRuleConfig from './CommissionRuleConfig';
import type {
  Commission,
  CommissionAdjustmentInput,
  CommissionOrderSummary,
  CommissionOrderSummaryFilters,
  CommissionOrderSummaryStatus,
  CommissionOrderSummaryStatusCounts,
  CommissionRole,
  CommissionRoleConfig,
  MonthlyCommissionPayout,
} from '../../types/commission';
import type { Department } from '../../types/department';
import type { Order } from '../../types/order';
import type { User } from '../../types/settings';

const ORDER_STATUS_OPTIONS: Array<{ value: CommissionOrderSummaryStatus | '全部'; label: string; important?: boolean }> = [
  { value: '全部', label: '全部' },
  { value: '待处理', label: '待处理', important: true },
  { value: '待确认', label: '待确认' },
  { value: '待发放', label: '待发放' },
  { value: '已发放', label: '已发放' },
  { value: '异常', label: '异常', important: true },
];

const DEFAULT_ORDER_STATUS_COUNTS: CommissionOrderSummaryStatusCounts = {
  全部: 0,
  待处理: 0,
  待确认: 0,
  待发放: 0,
  已发放: 0,
  异常: 0,
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
  { id: 'productLevel', label: '产品等级', defaultWidth: 120 },
  { id: 'orderType', label: '订单类型', defaultWidth: 130 },
  { id: 'orderAmount', label: '实付金额', defaultWidth: 130 },
  { id: 'resourceOwnership', label: '资源归属', defaultWidth: 120 },
  { id: 'paymentDate', label: '付款日期', defaultWidth: 130 },
  { id: 'refundStatus', label: '退款状态', defaultWidth: 120 },
  { id: 'salesOwner', label: '销售负责人', defaultWidth: 130 },
  { id: 'officialPaymentChannel', label: '收款渠道', defaultWidth: 150 },
  { id: 'createdAt', label: '创建时间', defaultWidth: 160 },
  { id: 'splitDetails', label: '分账明细', defaultWidth: 310 },
  { id: 'totalCommissionAmount', label: '分账总额', defaultWidth: 130 },
  { id: 'pendingAssignCount', label: '待分配数', defaultWidth: 110 },
  { id: 'exceptionCount', label: '异常数', defaultWidth: 100 },
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
  if (status === '异常') return 'error';
  if (status === '待处理') return 'warning';
  if (status === '待发放') return 'info';
  return 'default';
}

function getPayoutStatusColor(status: MonthlyCommissionPayout['status']): 'default' | 'success' | 'error' | 'warning' | 'info' {
  if (status === '已发放') return 'success';
  if (status === '异常') return 'error';
  if (status === '待发放') return 'warning';
  return 'default';
}

const Commission: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
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

  const [commissionRoleConfigs, setCommissionRoleConfigs] = useState<CommissionRoleConfig[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitOrderId, setSplitOrderId] = useState('');
  const [splitRows, setSplitRows] = useState<CommissionAdjustmentInput[]>([]);
  const [splitReason, setSplitReason] = useState('');
  const [splitSaving, setSplitSaving] = useState(false);
  const [summaryDetail, setSummaryDetail] = useState<CommissionOrderSummary | null>(null);
  const [orderDetail, setOrderDetail] = useState<Order | null>(null);

  const activeEmployees = useMemo(() => employees.filter((item) => item.isActive), [employees]);
  const activeRoleConfigs = useMemo(() => commissionRoleConfigs.filter((item) => item.isActive), [commissionRoleConfigs]);

  const getDepartmentName = (departmentId?: string) => departments.find((item) => item.id === departmentId)?.name || '';
  const selectedSplitSummary = orderRows.find((item) => item.orderId === splitOrderId);
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
    fetchOrderStatusCounts();
  }, [orderFilters, orderPagination.page, orderPagination.pageSize]);

  useEffect(() => {
    localStorage.setItem(ORDER_SPLIT_VIEW_STORAGE_KEY, JSON.stringify(orderSplitViewConfig));
  }, [orderSplitViewConfig]);

  useEffect(() => {
    writeColumnWidths(ORDER_SPLIT_WIDTH_STORAGE_KEY, orderSplitColumnWidths);
  }, [orderSplitColumnWidths]);

  useEffect(() => {
    fetchMonthlyPayouts(payoutPeriod);
  }, [payoutPeriod]);

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

  const renderSplitDetails = (summary: CommissionOrderSummary) => {
    const rows = summary.splitSummary.slice(0, 3);
    return (
      <Stack spacing={0.6} sx={{ py: 0.5 }}>
        {rows.map((item, index) => {
          const isPendingOwner = !item.owner || item.owner === '待分配';
          const isAbnormal = item.status === '已取消';
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
                {item.owner || '待分配'}
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
                {isAbnormal && <Chip label={item.status} size="small" color="error" sx={{ height: 20 }} />}
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
            onClick={() => setSummaryDetail(summary)}
            sx={{ alignSelf: 'flex-start', minWidth: 0, px: 0.5, py: 0, lineHeight: 1.4 }}
          >
            查看全部 {summary.splitSummary.length} 条
          </Button>
        )}
        {!summary.splitSummary.length && <Typography variant="caption" sx={{ color: '#9ca3af' }}>暂无分账</Typography>}
      </Stack>
    );
  };

  const renderOrderSplitCell = (summary: CommissionOrderSummary, columnId: OrderSplitColumnId) => {
    switch (columnId) {
      case 'orderNo':
        return <Typography variant="body2" sx={{ fontWeight: 700 }}>{summary.orderNo}</Typography>;
      case 'customerName':
        return summary.customerName || '-';
      case 'productLevel':
        return (
          <Chip
            label={summary.productLevel || '-'}
            size="small"
            sx={{ bgcolor: `${getProductLevelColor(summary.productLevel)}18`, color: getProductLevelColor(summary.productLevel), fontWeight: 600 }}
          />
        );
      case 'orderType':
        return summary.orderType || '-';
      case 'orderAmount':
        return formatCurrency(summary.orderAmount);
      case 'resourceOwnership':
        return summary.resourceOwnership ? normalizeResourceOwnership(summary.resourceOwnership) : '-';
      case 'paymentDate':
        return summary.paymentDate ? formatDate(summary.paymentDate, 'yyyy-MM-dd') : '-';
      case 'refundStatus':
        return summary.refundStatus || '-';
      case 'salesOwner':
        return summary.salesOwner || summary.salesName || '-';
      case 'officialPaymentChannel':
        return summary.officialPaymentChannel || '-';
      case 'createdAt':
        return summary.createdAt ? formatDate(summary.createdAt, 'yyyy-MM-dd HH:mm') : '-';
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

  const openSplitDialog = async (summary: CommissionOrderSummary) => {
    if (summary.status === '已发放') return;
    const res = await commissionApi.fetchCommissionsByOrder(summary.orderId);
    if (res.code !== 0) return;
    setSplitOrderId(summary.orderId);
    setSplitRows(res.data.map((item) => {
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
    }));
    setSplitReason('');
    setSplitDialogOpen(true);
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
    setSplitRows((prev) => [
      ...prev,
      {
        orderId: splitOrderId,
        role: activeRoleConfigs[0]?.name || '销售',
        owner: '',
        ownerId: '',
        department: '',
        departmentId: '',
        commissionAmount: 0,
        commissionRate: 0,
        performanceAmount: prev[0]?.performanceAmount || selectedSplitSummary?.orderAmount || 0,
        calculationNote: '财务人工新增分账',
      },
    ]);
  };

  const handleSaveSplitRows = async () => {
    setSplitSaving(true);
    try {
      const res = await commissionApi.saveOrderCommissionAdjustments(splitOrderId, splitRows, splitReason);
      if (res.code === 0) {
        setSplitDialogOpen(false);
        await refreshAll();
      }
    } finally {
      setSplitSaving(false);
    }
  };

  const confirmOrder = async (summary: CommissionOrderSummary) => {
    const res = await commissionApi.confirmOrderCommissions(summary.orderId, '订单分账确认');
    if (res.code === 0) await refreshAll();
  };

  const cancelOrder = async (summary: CommissionOrderSummary) => {
    await Promise.all(summary.commissions.map((item) => commissionApi.updateCommissionStatus(item.id, '已取消')));
    await refreshAll();
  };

  const viewOrder = async (summary: CommissionOrderSummary) => {
    const res = await orderApi.fetchOrderById(summary.orderId);
    if (res.code === 0) setOrderDetail(res.data);
  };

  const generateMonthlyBatch = async () => {
    if (!payoutPeriod) return;
    await commissionApi.generateSettlementBatch(payoutPeriod);
    await fetchMonthlyPayouts(payoutPeriod);
  };

  const payOwner = async (ownerId?: string) => {
    if (!ownerId) return;
    const res = await commissionApi.payMonthlyOwnerCommissions(payoutPeriod, ownerId);
    if (res.code === 0) {
      setPayoutRows(res.data);
      await fetchOrderSummaries();
    }
  };

  const payBatch = async () => {
    const res = await commissionApi.payMonthlyCommissionBatch(payoutPeriod);
    if (res.code === 0) {
      setPayoutRows(res.data);
      await fetchOrderSummaries();
    }
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
    <Box sx={{ mb: 2 }}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={orderFilters.status}
        onChange={(_event, value) => value && updateOrderFilter('status', value)}
        sx={{
          bgcolor: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 1,
          overflow: 'hidden',
          '& .MuiToggleButton-root': {
            border: 0,
            borderRight: '1px solid #e5e7eb',
            px: 1.5,
            minHeight: 40,
            color: '#374151',
            '&:last-of-type': { borderRight: 0 },
            '&.Mui-selected': {
              bgcolor: '#eef2f7',
              color: '#111827',
              fontWeight: 700,
            },
          },
        }}
      >
        {ORDER_STATUS_OPTIONS.map((item) => {
          const count = orderStatusCounts[item.value] || 0;
          const highlight = item.important && count > 0;
          return (
            <ToggleButton key={item.value} value={item.value}>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                <span>{item.label}</span>
                <Chip
                  label={count}
                  size="small"
                  color={highlight ? (item.value === '异常' ? 'error' : 'warning') : 'default'}
                  sx={{ height: 20, minWidth: 24, '& .MuiChip-label': { px: 0.75 } }}
                />
              </Stack>
            </ToggleButton>
          );
        })}
      </ToggleButtonGroup>
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
        <InputLabel>角色</InputLabel>
        <Select value={orderFilters.role} label="角色" onChange={(event) => updateOrderFilter('role', event.target.value)}>
          <MenuItem value="">全部</MenuItem>
          {activeRoleConfigs.map((role) => <MenuItem key={role.id} value={role.name}>{role.name}</MenuItem>)}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>人员</InputLabel>
        <Select value={orderFilters.ownerId} label="人员" onChange={(event) => updateOrderFilter('ownerId', event.target.value)}>
          <MenuItem value="">全部</MenuItem>
          {activeEmployees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.name}</MenuItem>)}
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
            {orderRows.map((summary) => (
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
                  <Stack direction="row" spacing={0.5} justifyContent="center">
                    <Tooltip title="查看分账">
                      <IconButton size="small" onClick={() => setSummaryDetail(summary)}><VisibilityIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title={summary.status === '已发放' ? '已发放不可直接调整' : '调整分账'}>
                      <span>
                        <IconButton size="small" color="primary" disabled={summary.status === '已发放'} onClick={() => openSplitDialog(summary)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="确认分账">
                      <span>
                        <IconButton size="small" color="success" disabled={summary.status !== '待确认'} onClick={() => confirmOrder(summary)}>
                          <CheckCircleIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="取消/异常">
                      <span>
                        <IconButton size="small" color="error" disabled={summary.status === '已发放'} onClick={() => cancelOrder(summary)}>
                          <CancelIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="查看订单">
                      <IconButton size="small" onClick={() => viewOrder(summary)}><ReceiptLongIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
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

  const renderMonthlyPayout = () => (
    <>
      <Stack direction="row" spacing={1.25} sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <TextField
          label="发放月份"
          type="month"
          value={payoutPeriod}
          onChange={(event) => setPayoutPeriod(event.target.value)}
          size="small"
          InputLabelProps={{ shrink: true }}
        />
        <Tooltip title="生成批次">
          <Button variant="outlined" startIcon={<PaymentsIcon />} onClick={generateMonthlyBatch}>生成</Button>
        </Tooltip>
        <Tooltip title="整批发放">
          <Button variant="contained" startIcon={<CheckCircleIcon />} onClick={payBatch}>发放</Button>
        </Tooltip>
      </Stack>
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell width={52} />
              <TableCell>人员</TableCell>
              <TableCell>部门</TableCell>
              <TableCell>订单数</TableCell>
              <TableCell>应发金额</TableCell>
              <TableCell>异常金额</TableCell>
              <TableCell>已发金额</TableCell>
              <TableCell>状态</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payoutRows.map((row) => {
              const ownerKey = row.ownerId || row.owner;
              const expanded = expandedPayoutOwners.has(ownerKey);
              return (
                <React.Fragment key={ownerKey}>
                  <TableRow hover>
                    <TableCell>
                      <IconButton size="small" onClick={() => togglePayoutExpanded(ownerKey)}>
                        {expanded ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{row.owner}</TableCell>
                    <TableCell>{row.department || '-'}</TableCell>
                    <TableCell>{row.orderCount}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: '#d32f2f' }}>{formatCurrency(row.pendingPayAmount)}</TableCell>
                    <TableCell>{formatCurrency(row.exceptionAmount)}</TableCell>
                    <TableCell>{formatCurrency(row.paidAmount)}</TableCell>
                    <TableCell><Chip label={row.status} size="small" color={getPayoutStatusColor(row.status)} /></TableCell>
                    <TableCell align="center">
                      <Tooltip title="发放此人">
                        <span>
                          <IconButton size="small" color="success" disabled={!row.ownerId || row.pendingPayAmount <= 0} onClick={() => payOwner(row.ownerId)}>
                            <CheckCircleIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={9} sx={{ p: 0, border: 0 }}>
                      <Collapse in={expanded} timeout="auto" unmountOnExit>
                        <Box sx={{ px: 7, py: 1.5, bgcolor: '#fafafa' }}>
                          <Stack spacing={0.75}>
                            {row.commissions.map((commission) => (
                              <Stack key={commission.id} direction="row" spacing={2} sx={{ fontSize: 13, color: '#4b5563' }}>
                                <Box sx={{ width: 150, fontWeight: 600 }}>{commission.orderNo}</Box>
                                <Box sx={{ width: 180 }}>{commission.customerName}</Box>
                                <Box sx={{ width: 110 }}>{commission.role}</Box>
                                <Box sx={{ width: 120 }}>{formatCurrency(commission.commissionAmount)}</Box>
                                <Box>{commission.status}</Box>
                              </Stack>
                            ))}
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
                <TableCell colSpan={9} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                  {payoutLoading ? '加载中...' : '暂无待发放人员'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>财务结算台</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            订单入库后自动生成分账，财务按订单确认，再按月份给人员发放。
          </Typography>
        </Box>
        {tabValue === 0 && (
          <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setOrderSplitViewOpen(true)}>
            视图设置
          </Button>
        )}
      </Box>

      <Tabs value={tabValue} onChange={(_event, value) => setTabValue(value)} sx={{ mb: 3, borderBottom: '1px solid #e5e7eb' }}>
        <Tab label="订单分账台" />
        <Tab label="月度发放" />
        <Tab label="规则配置" />
      </Tabs>

      {tabValue === 0 && (
        <>
          {renderOrderStatusBar()}
          {renderOrderToolbar()}
          {renderOrderSplitTable()}
        </>
      )}

      {tabValue === 1 && renderMonthlyPayout()}

      {tabValue === 2 && <CommissionRuleConfig />}

      <Dialog open={Boolean(summaryDetail)} onClose={() => setSummaryDetail(null)} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={() => setSummaryDetail(null)}>分账明细</DialogCloseTitle>
        <DialogContent dividers>
          {summaryDetail && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>角色</TableCell>
                  <TableCell>人员</TableCell>
                  <TableCell>部门</TableCell>
                  <TableCell>业绩金额</TableCell>
                  <TableCell>提成金额</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell>说明</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summaryDetail.commissions.map((commission) => (
                  <TableRow key={commission.id}>
                    <TableCell>{commission.role}</TableCell>
                    <TableCell>{commission.owner}</TableCell>
                    <TableCell>{commission.department}</TableCell>
                    <TableCell>{formatCurrency(commission.performanceAmount || commission.orderAmount)}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: '#d32f2f' }}>{formatCurrency(commission.commissionAmount)}</TableCell>
                    <TableCell><Chip label={commission.status} size="small" /></TableCell>
                    <TableCell>{commission.calculationNote || commission.formulaText || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

      <Dialog open={splitDialogOpen} onClose={() => setSplitDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogCloseTitle onClose={() => setSplitDialogOpen(false)}>
          {selectedSplitSummary
            ? `调整分账：${selectedSplitSummary.orderNo} / ${selectedSplitSummary.customerName} / ${formatCurrency(selectedSplitSummary.orderAmount)} / ${formatDate(selectedSplitSummary.paymentDate, 'yyyy-MM-dd')}`
            : '调整订单分账'}
        </DialogCloseTitle>
        <DialogContent dividers>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>角色</TableCell>
                <TableCell>人员</TableCell>
                <TableCell>部门</TableCell>
                <TableCell>业绩金额</TableCell>
                <TableCell>提成金额</TableCell>
                <TableCell>说明</TableCell>
                <TableCell align="center">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {splitRows.map((row, index) => (
                <TableRow key={row.id || `new-${index}`}>
                  <TableCell sx={{ minWidth: 130 }}>
                    <Select
                      size="small"
                      value={row.role}
                      onChange={(event) => updateSplitRow(index, 'role', event.target.value as CommissionRole)}
                      fullWidth
                    >
                      {roleOptionsForSplit(row.role).map((role) => (
                        <MenuItem key={role.id} value={role.name}>{role.name}{role.isActive ? '' : '（已停用）'}</MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell sx={{ minWidth: 150 }}>
                    <Select
                      size="small"
                      value={row.ownerId || ''}
                      onChange={(event) => handleSplitOwnerChange(index, event.target.value)}
                      displayEmpty
                      fullWidth
                    >
                      <MenuItem value="">选择员工</MenuItem>
                      {activeEmployees.map((employee) => (
                        <MenuItem key={employee.id} value={employee.id}>{employee.name}</MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell sx={{ minWidth: 140 }}>
                    <TextField size="small" value={row.department || ''} placeholder="自动带出" InputProps={{ readOnly: true }} fullWidth />
                  </TableCell>
                  <TableCell sx={{ minWidth: 120 }}>
                    <TextField
                      size="small"
                      type="number"
                      value={row.performanceAmount || 0}
                      onChange={(event) => updateSplitRow(index, 'performanceAmount', Number(event.target.value))}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 120 }}>
                    <TextField
                      size="small"
                      type="number"
                      value={row.commissionAmount}
                      onChange={(event) => updateSplitRow(index, 'commissionAmount', Number(event.target.value))}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 180 }}>
                    <TextField
                      size="small"
                      value={row.calculationNote || ''}
                      onChange={(event) => updateSplitRow(index, 'calculationNote', event.target.value)}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="删除">
                      <IconButton size="small" color="error" onClick={() => setSplitRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Stack direction="row" spacing={1.5} sx={{ mt: 2, alignItems: 'center', justifyContent: 'space-between' }}>
            <Button startIcon={<AddIcon />} onClick={handleAddSplitRow}>新增</Button>
            <TextField
              label="调整原因"
              value={splitReason}
              onChange={(event) => setSplitReason(event.target.value)}
              size="small"
              required
              sx={{ minWidth: 360 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSplitDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleSaveSplitRows}
            disabled={splitSaving || !splitReason.trim() || splitRows.length === 0 || splitRows.some((row) => !row.ownerId)}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(orderDetail)} onClose={() => setOrderDetail(null)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setOrderDetail(null)}>订单资料</DialogCloseTitle>
        <DialogContent dividers>
          {orderDetail && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 1.25 }}>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>订单号</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{orderDetail.orderNo}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>客户</Typography>
              <Typography variant="body2">{orderDetail.customerName}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>类型</Typography>
              <Typography variant="body2">{orderDetail.orderType}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>实付</Typography>
              <Typography variant="body2">{formatCurrency(orderDetail.actualAmount || orderDetail.amount)}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>付款日期</Typography>
              <Typography variant="body2">{formatDate(orderDetail.payments?.[0]?.paidAt || orderDetail.createdAt, 'yyyy-MM-dd HH:mm')}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>收款渠道</Typography>
              <Typography variant="body2">{orderDetail.officialPaymentChannel || orderDetail.paymentMethod}</Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default Commission;
