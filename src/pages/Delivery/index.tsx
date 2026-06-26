import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  LinearProgress,
  MenuItem,
  Paper,
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
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonIcon from '@mui/icons-material/Person';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import useDeliveryStore from '../../store/useDeliveryStore';
import { customerApi, deliveryApi, orderApi, productApi, settingsApi } from '../../api';
import { DEFAULT_PRODUCT_LEVEL_CONFIGS } from '../../shared/utils/constants';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import ResizableHeaderCell, {
  getResizableCellSx,
  readColumnWidths,
  resetColumnWidths,
  resizeColumnWidths,
  writeColumnWidths,
  type ColumnWidthMap,
} from '../../shared/components/ResizableTable';
import TableViewSettingsDialog from '../../shared/components/TableViewSettingsDialog';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import CustomerDetail from '../Customers/CustomerDetail';
import OrderDetail from '../Orders/OrderDetail';
import DeliveryColumn from './DeliveryColumn';
import DeliveryCard from './DeliveryCard';
import type {
  Delivery,
  DeliveryFilters,
  DeliveryOverallStatus,
  DeliveryPriority,
  DeliveryProductType,
  DeliveryStats,
  DeliveryTask,
} from '../../types/delivery';
import type { Customer } from '../../types/customer';
import type { Order } from '../../types/order';
import type { User } from '../../types/settings';

type DeliveryColumnId =
  | 'orderNo'
  | 'customerName'
  | 'productType'
  | 'orderAmount'
  | 'paymentDate'
  | 'salesOwner'
  | 'owner'
  | 'currentStage'
  | 'progress'
  | 'taskCount'
  | 'status'
  | 'priority'
  | 'plannedCompletedAt'
  | 'updatedAt';

type DeliveryColumnMeta = {
  id: DeliveryColumnId;
  label: string;
  defaultWidth: number;
};

type ProductTabConfig = {
  label: string;
  type: DeliveryProductType;
  color: string;
};

type DeliveryViewConfig = {
  visibleColumnIds: DeliveryColumnId[];
  columnOrder: DeliveryColumnId[];
  frozenColumnCount: number;
};

const DELIVERY_VIEW_STORAGE_KEY = 'aaos_delivery_workbench_view_v1';
const DELIVERY_WIDTH_STORAGE_KEY = 'aaos_delivery_workbench_widths_v1';
const ACTION_COLUMN_WIDTH = 210;

const STATUS_OPTIONS: Array<{ value: DeliveryOverallStatus; label: string; important?: boolean }> = [
  { value: '全部', label: '全部' },
  { value: '待开始', label: '待开始' },
  { value: '交付中', label: '交付中' },
  { value: '超期', label: '超期', important: true },
  { value: '阻塞', label: '阻塞', important: true },
  { value: '待验收', label: '待验收' },
  { value: '已完成', label: '已完成' },
];

const PRIORITY_OPTIONS: Array<{ value: DeliveryPriority | ''; label: string }> = [
  { value: '', label: '全部优先级' },
  { value: 'urgent', label: '紧急' },
  { value: 'high', label: '高' },
  { value: 'normal', label: '普通' },
  { value: 'low', label: '低' },
];

const TASK_STATUS_OPTIONS = ['待开始', '进行中', '已完成', '已跳过'];

const DELIVERY_COLUMNS: DeliveryColumnMeta[] = [
  { id: 'orderNo', label: '订单号', defaultWidth: 170 },
  { id: 'customerName', label: '客户', defaultWidth: 160 },
  { id: 'productType', label: '产品类型', defaultWidth: 120 },
  { id: 'orderAmount', label: '订单金额', defaultWidth: 130 },
  { id: 'paymentDate', label: '付款日期', defaultWidth: 130 },
  { id: 'salesOwner', label: '销售负责人', defaultWidth: 130 },
  { id: 'owner', label: '交付负责人', defaultWidth: 130 },
  { id: 'currentStage', label: '当前阶段', defaultWidth: 140 },
  { id: 'progress', label: '交付进度', defaultWidth: 150 },
  { id: 'taskCount', label: '任务数', defaultWidth: 100 },
  { id: 'status', label: '交付状态', defaultWidth: 120 },
  { id: 'priority', label: '优先级', defaultWidth: 100 },
  { id: 'plannedCompletedAt', label: '计划完成', defaultWidth: 130 },
  { id: 'updatedAt', label: '更新时间', defaultWidth: 160 },
];

const DEFAULT_VISIBLE_COLUMNS: DeliveryColumnId[] = [
  'orderNo',
  'customerName',
  'productType',
  'orderAmount',
  'paymentDate',
  'owner',
  'currentStage',
  'progress',
  'status',
];

const DEFAULT_COLUMN_ORDER = DELIVERY_COLUMNS.map((column) => column.id);
const DEFAULT_COLUMN_WIDTHS = DELIVERY_COLUMNS.reduce<ColumnWidthMap>((result, column) => {
  result[column.id] = column.defaultWidth;
  return result;
}, {});

const fallbackProductTypes: ProductTabConfig[] = DEFAULT_PRODUCT_LEVEL_CONFIGS.map((level) => ({
  label: level.name.endsWith('产品') ? level.name : `${level.name}产品`,
  type: level.name,
  color: level.color,
}));

function normalizeColumnIds(ids: unknown, fallback: DeliveryColumnId[]): DeliveryColumnId[] {
  if (!Array.isArray(ids)) return [...fallback];
  const validIds = new Set(DELIVERY_COLUMNS.map((column) => column.id));
  const normalized = ids.filter((id): id is DeliveryColumnId => typeof id === 'string' && validIds.has(id as DeliveryColumnId));
  return normalized.length ? normalized : [...fallback];
}

function readDeliveryViewConfig(): DeliveryViewConfig {
  try {
    const raw = localStorage.getItem(DELIVERY_VIEW_STORAGE_KEY);
    if (!raw) {
      return { visibleColumnIds: [...DEFAULT_VISIBLE_COLUMNS], columnOrder: [...DEFAULT_COLUMN_ORDER], frozenColumnCount: 0 };
    }
    const parsed = JSON.parse(raw) as Partial<DeliveryViewConfig>;
    const storedOrder = normalizeColumnIds(parsed.columnOrder, DEFAULT_COLUMN_ORDER);
    const missingIds = DEFAULT_COLUMN_ORDER.filter((id) => !storedOrder.includes(id));
    return {
      visibleColumnIds: normalizeColumnIds(parsed.visibleColumnIds, DEFAULT_VISIBLE_COLUMNS),
      columnOrder: [...storedOrder, ...missingIds],
      frozenColumnCount: Math.max(0, Math.min(Number(parsed.frozenColumnCount) || 0, DELIVERY_COLUMNS.length)),
    };
  } catch {
    return { visibleColumnIds: [...DEFAULT_VISIBLE_COLUMNS], columnOrder: [...DEFAULT_COLUMN_ORDER], frozenColumnCount: 0 };
  }
}

function getStatusColor(status?: Delivery['status']): 'default' | 'success' | 'error' | 'warning' | 'info' {
  if (status === '已完成') return 'success';
  if (status === '阻塞') return 'error';
  if (status === '超期') return 'warning';
  if (status === '待验收') return 'info';
  return 'default';
}

function getPriorityLabel(priority?: DeliveryPriority) {
  if (priority === 'urgent') return '紧急';
  if (priority === 'high') return '高';
  if (priority === 'low') return '低';
  return '普通';
}

function getPriorityColor(priority?: DeliveryPriority): 'default' | 'success' | 'error' | 'warning' | 'info' {
  if (priority === 'urgent') return 'error';
  if (priority === 'high') return 'warning';
  if (priority === 'low') return 'default';
  return 'info';
}

const Delivery: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [rows, setRows] = useState<Delivery[]>([]);
  const [taskSourceRows, setTaskSourceRows] = useState<Delivery[]>([]);
  const [stats, setStats] = useState<DeliveryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<DeliveryFilters>({ status: '全部', page: 1, pageSize: 10 });
  const [listPagination, setListPagination] = useState({ page: 1, pageSize: 10, total: 0 });
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [viewConfig, setViewConfig] = useState<DeliveryViewConfig>(readDeliveryViewConfig);
  const [columnWidths, setColumnWidths] = useState<ColumnWidthMap>(() => readColumnWidths(DELIVERY_WIDTH_STORAGE_KEY, DEFAULT_COLUMN_WIDTHS));
  const [productTypes, setProductTypes] = useState<ProductTabConfig[]>(fallbackProductTypes);
  const [stageOptions, setStageOptions] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [assignDelivery, setAssignDelivery] = useState<Delivery | null>(null);
  const [assignOwnerId, setAssignOwnerId] = useState('');
  const [assignPriority, setAssignPriority] = useState<DeliveryPriority>('normal');
  const [assignPlanDate, setAssignPlanDate] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [orderDetail, setOrderDetail] = useState<Order | null>(null);
  const [customerDetail, setCustomerDetail] = useState<Customer | null>(null);
  const [boardProductType, setBoardProductType] = useState<DeliveryProductType>(fallbackProductTypes[0]?.type || '899');
  const [boardStages, setBoardStages] = useState<string[]>([]);
  const [activeDelivery, setActiveDelivery] = useState<Delivery | null>(null);
  const { items: boardItems, fetchByProductType, advanceStage } = useDeliveryStore();
  const { alert, confirm, dialog: feedbackDialog } = useAppFeedback();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const loadWorkbench = useCallback(async (nextFilters: DeliveryFilters) => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        deliveryApi.fetchDeliveries(nextFilters),
        deliveryApi.fetchDeliveryStats(nextFilters),
      ]);
      if (listRes.code === 0) {
        setRows(listRes.data.items);
        setListPagination({ page: listRes.data.page, pageSize: listRes.data.pageSize, total: listRes.data.total });
      }
      if (statsRes.code === 0) {
        setStats(statsRes.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkbench(filters);
  }, [filters, loadWorkbench]);

  useEffect(() => {
    localStorage.setItem(DELIVERY_VIEW_STORAGE_KEY, JSON.stringify(viewConfig));
  }, [viewConfig]);

  useEffect(() => {
    writeColumnWidths(DELIVERY_WIDTH_STORAGE_KEY, columnWidths);
  }, [columnWidths]);

  useEffect(() => {
    const loadStaticOptions = async () => {
      const [productsRes, levelsRes, usersRes] = await Promise.all([
        productApi.getAllProducts(),
        productApi.getProductLevelConfigs(),
        settingsApi.fetchUsers({ isActive: true }),
      ]);
      if (usersRes.code === 0) setUsers(usersRes.data.filter((user) => user.isActive));
      if (levelsRes.code === 0) {
        const levelsWithProducts = new Set(
          productsRes.code === 0 ? productsRes.data.filter((product) => product.isActive).map((product) => product.level) : [],
        );
        const next = levelsRes.data
          .filter((level) => level.isActive || levelsWithProducts.has(level.name))
          .map((level) => ({
            label: level.name.endsWith('产品') ? level.name : `${level.name}产品`,
            type: level.name,
            color: level.color,
          }));
        if (next.length) {
          setProductTypes(next);
          setBoardProductType(next[0].type);
        }
      }
    };
    loadStaticOptions();
  }, []);

  useEffect(() => {
    if (tabValue !== 1 || !boardProductType) return;
    const loadBoard = async () => {
      const [stagesRes] = await Promise.all([
        deliveryApi.fetchDeliveryStagesByProductType(boardProductType),
        fetchByProductType(boardProductType),
      ]);
      if (stagesRes.code === 0) setBoardStages(stagesRes.data);
    };
    loadBoard();
  }, [boardProductType, fetchByProductType, tabValue]);

  useEffect(() => {
    if (tabValue !== 2) return;
    deliveryApi.fetchDeliveries({ ...filters, status: '全部', page: 1, pageSize: 100 }).then((res) => {
      if (res.code === 0) setTaskSourceRows(res.data.items);
    });
  }, [filters, tabValue]);

  useEffect(() => {
    if (!selectedDelivery) {
      setBlockReason('');
      return;
    }
    setBlockReason(selectedDelivery.blockedReason || '');
  }, [selectedDelivery]);

  const pagination = {
    page: listPagination.page || 1,
    pageSize: listPagination.pageSize || 10,
    total: listPagination.total,
  };

  const orderedColumns = useMemo(() => {
    const columnMap = new Map(DELIVERY_COLUMNS.map((column) => [column.id, column]));
    const ordered = viewConfig.columnOrder
      .map((columnId) => columnMap.get(columnId))
      .filter((column): column is DeliveryColumnMeta => Boolean(column));
    const missing = DELIVERY_COLUMNS.filter((column) => !viewConfig.columnOrder.includes(column.id));
    return [...ordered, ...missing];
  }, [viewConfig.columnOrder]);

  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => viewConfig.visibleColumnIds.includes(column.id)),
    [orderedColumns, viewConfig.visibleColumnIds],
  );

  const frozenColumnCount = Math.min(viewConfig.frozenColumnCount, visibleColumns.length);
  const tableMinWidth = visibleColumns.reduce((sum, column) => sum + (columnWidths[column.id] || column.defaultWidth), 0) + ACTION_COLUMN_WIDTH;

  const getFrozenLeft = (columnIndex: number) => (
    visibleColumns.slice(0, columnIndex).reduce((sum, column) => sum + (columnWidths[column.id] || column.defaultWidth), 0)
  );

  const getFrozenColumnSx = (columnIndex: number, isHeader = false) => (
    columnIndex < frozenColumnCount
      ? {
          position: 'sticky' as const,
          left: getFrozenLeft(columnIndex),
          zIndex: isHeader ? 5 : 3,
          bgcolor: isHeader ? '#f8fafc' : '#fff',
          boxShadow: '1px 0 0 #e5e7eb',
        }
      : {}
  );

  const actionColumnSx = {
    position: 'sticky' as const,
    right: 0,
    zIndex: 4,
    width: ACTION_COLUMN_WIDTH,
    minWidth: ACTION_COLUMN_WIDTH,
    bgcolor: '#fff',
    boxShadow: '-1px 0 0 #e5e7eb',
  };

  const taskRows = useMemo(() => (
    taskSourceRows.flatMap((delivery) => delivery.tasks.map((task) => ({ delivery, task })))
  ), [taskSourceRows]);

  const handleFiltersChange = (patch: Partial<DeliveryFilters>) => {
    const next = { ...filters, ...patch, page: 1 };
    setFilters(next);
  };

  const handlePageChange = (_event: React.MouseEvent<HTMLButtonElement> | null, page: number) => {
    setFilters((current) => ({ ...current, page: page + 1 }));
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFilters((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) }));
  };

  const handleToggleColumn = (id: string) => {
    setViewConfig((current) => {
      const columnId = id as DeliveryColumnId;
      const visibleColumnIds = current.visibleColumnIds.includes(columnId)
        ? current.visibleColumnIds.filter((item) => item !== columnId)
        : [...current.visibleColumnIds, columnId];
      if (!visibleColumnIds.length) return current;
      return { ...current, visibleColumnIds, frozenColumnCount: Math.min(current.frozenColumnCount, visibleColumnIds.length) };
    });
  };

  const handleReorderColumn = (sourceColumnId: string, targetColumnId: string) => {
    setViewConfig((current) => {
      const sourceIndex = current.columnOrder.indexOf(sourceColumnId as DeliveryColumnId);
      const targetIndex = current.columnOrder.indexOf(targetColumnId as DeliveryColumnId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current;
      const nextOrder = [...current.columnOrder];
      const [moved] = nextOrder.splice(sourceIndex, 1);
      nextOrder.splice(targetIndex, 0, moved);
      return { ...current, columnOrder: nextOrder };
    });
  };

  const handleResetView = () => {
    setViewConfig({ visibleColumnIds: [...DEFAULT_VISIBLE_COLUMNS], columnOrder: [...DEFAULT_COLUMN_ORDER], frozenColumnCount: 0 });
    setColumnWidths(resetColumnWidths(DEFAULT_COLUMN_WIDTHS));
  };

  const refreshAfterMutation = async () => {
    await loadWorkbench(filters);
    if (tabValue === 1 && boardProductType) await fetchByProductType(boardProductType);
    if (selectedDelivery) {
      const res = await deliveryApi.fetchDeliveryById(selectedDelivery.id);
      if (res.code === 0) setSelectedDelivery(res.data);
    }
  };

  const handleAdvance = async (delivery: Delivery) => {
    const currentIndex = delivery.stages.indexOf(delivery.currentStage);
    const nextStage = delivery.stages[currentIndex + 1];
    if (!nextStage) {
      await alert('当前交付单已经到最后阶段。');
      return;
    }
    const ok = await confirm(`确认将 ${delivery.orderNo} 推进到「${nextStage}」吗？`, '推进交付阶段');
    if (!ok) return;
    await deliveryApi.advanceDeliveryStage(delivery.id, nextStage);
    await refreshAfterMutation();
  };

  const openAssign = (delivery: Delivery) => {
    setAssignDelivery(delivery);
    setAssignOwnerId(delivery.ownerId || '');
    setAssignPriority(delivery.priority || 'normal');
    setAssignPlanDate(delivery.plannedCompletedAt || '');
  };

  const saveAssign = async () => {
    if (!assignDelivery) return;
    const user = users.find((item) => item.id === assignOwnerId);
    await deliveryApi.updateDelivery(assignDelivery.id, {
      ownerId: user?.id,
      owner: user?.name || '待分配',
      priority: assignPriority,
      plannedCompletedAt: assignPlanDate || undefined,
    });
    setAssignDelivery(null);
    await refreshAfterMutation();
  };

  const handleTaskStatusChange = async (task: DeliveryTask, status: string) => {
    if (!selectedDelivery) return;
    const res = await deliveryApi.updateDeliveryTask(selectedDelivery.id, task.id, { status });
    if (res.code === 0) {
      setSelectedDelivery(res.data);
      await loadWorkbench(filters);
    }
  };

  const handleBlockToggle = async () => {
    if (!selectedDelivery) return;
    if (selectedDelivery.status === '阻塞') {
      await deliveryApi.updateDelivery(selectedDelivery.id, { blockedReason: undefined, status: '交付中' });
    } else {
      if (!blockReason.trim()) {
        await alert('请先填写阻塞原因。');
        return;
      }
      await deliveryApi.updateDelivery(selectedDelivery.id, { blockedReason: blockReason.trim(), status: '阻塞' });
    }
    await refreshAfterMutation();
  };

  const handleViewOrder = async (delivery: Delivery) => {
    const res = await orderApi.fetchOrderById(delivery.orderId);
    if (res.code === 0 && res.data) setOrderDetail(res.data);
  };

  const handleViewCustomer = async (delivery: Delivery) => {
    const res = await customerApi.fetchCustomerById(delivery.customerId);
    if (res.code === 0 && res.data) setCustomerDetail(res.data);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const delivery = boardItems.find((item) => item.id === event.active.id);
    if (delivery) setActiveDelivery(delivery);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDelivery(null);
    if (!active || !over) return;
    const deliveryId = String(active.id);
    const overId = String(over.id);
    let targetStage: string | null = null;
    if (overId.startsWith('stage-')) {
      targetStage = overId.replace('stage-', '');
    } else {
      targetStage = boardItems.find((item) => item.id === overId)?.currentStage || null;
    }
    const current = boardItems.find((item) => item.id === deliveryId);
    if (targetStage && current && current.currentStage !== targetStage) {
      await advanceStage(deliveryId, targetStage);
      await loadWorkbench(filters);
    }
  };

  const renderProgress = (delivery: Delivery) => (
    <Box sx={{ minWidth: 120 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" sx={{ color: '#64748b' }}>{delivery.progressPercent || 0}%</Typography>
        <Typography variant="caption" sx={{ color: '#94a3b8' }}>
          {delivery.tasks.filter((task) => task.status === '已完成' || task.completedAt).length}/{delivery.tasks.length}
        </Typography>
      </Box>
      <LinearProgress variant="determinate" value={delivery.progressPercent || 0} sx={{ height: 6, borderRadius: 999 }} />
    </Box>
  );

  const renderCell = (delivery: Delivery, columnId: DeliveryColumnId) => {
    switch (columnId) {
      case 'orderNo':
        return (
          <Button size="small" variant="text" onClick={() => handleViewOrder(delivery)} sx={{ p: 0, minWidth: 0, fontWeight: 700, textTransform: 'none' }}>
            {delivery.orderNo}
          </Button>
        );
      case 'customerName':
        return (
          <Button size="small" variant="text" onClick={() => handleViewCustomer(delivery)} sx={{ p: 0, minWidth: 0, textTransform: 'none' }}>
            {delivery.customerName}
          </Button>
        );
      case 'productType':
        return <Chip size="small" label={delivery.productType} />;
      case 'orderAmount':
        return formatCurrency(delivery.orderAmount || 0);
      case 'paymentDate':
        return delivery.paymentDate ? formatDate(delivery.paymentDate, 'yyyy-MM-dd HH:mm:ss') : '-';
      case 'salesOwner':
        return delivery.salesOwner || '-';
      case 'owner':
        return delivery.owner || '待分配';
      case 'currentStage':
        return delivery.currentStage;
      case 'progress':
        return renderProgress(delivery);
      case 'taskCount':
        return delivery.tasks.length;
      case 'status':
        return <Chip size="small" label={delivery.status || '交付中'} color={getStatusColor(delivery.status)} />;
      case 'priority':
        return <Chip size="small" label={getPriorityLabel(delivery.priority)} color={getPriorityColor(delivery.priority)} variant="outlined" />;
      case 'plannedCompletedAt':
        return delivery.plannedCompletedAt ? formatDate(delivery.plannedCompletedAt) : '-';
      case 'updatedAt':
        return formatDate(delivery.updatedAt);
      default:
        return '-';
    }
  };

  const renderStatusBar = () => (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
      {STATUS_OPTIONS.map((option) => {
        const selected = (filters.status || '全部') === option.value;
        const count = stats?.statusCounts[option.value] || 0;
        return (
          <Button
            key={option.value}
            variant={selected ? 'contained' : 'outlined'}
            color={option.important ? 'error' : 'primary'}
            onClick={() => handleFiltersChange({ status: option.value })}
            sx={{ borderRadius: 1.5 }}
          >
            {option.label}
            <Chip
              size="small"
              label={count}
              sx={{ ml: 1, height: 22, bgcolor: selected ? 'rgba(255,255,255,0.24)' : '#eef2f7' }}
            />
          </Button>
        );
      })}
    </Box>
  );

  const renderFilters = () => (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.4fr) repeat(5, minmax(150px, 1fr))', gap: 1.25, mb: 2 }}>
      <TextField size="small" placeholder="搜索订单号/客户/负责人" value={filters.search || ''} onChange={(event) => handleFiltersChange({ search: event.target.value })} />
      <TextField select size="small" label="产品类型" value={filters.productType || ''} onChange={(event) => handleFiltersChange({ productType: event.target.value || undefined })}>
        <MenuItem value="">全部产品</MenuItem>
        {productTypes.map((item) => <MenuItem key={item.type} value={item.type}>{item.label}</MenuItem>)}
      </TextField>
      <TextField select size="small" label="交付负责人" value={filters.ownerId || ''} onChange={(event) => handleFiltersChange({ ownerId: event.target.value || undefined })}>
        <MenuItem value="">全部人员</MenuItem>
        {users.map((user) => <MenuItem key={user.id} value={user.id}>{user.name}</MenuItem>)}
      </TextField>
      <TextField select size="small" label="优先级" value={filters.priority || ''} onChange={(event) => handleFiltersChange({ priority: event.target.value as DeliveryPriority | '' })}>
        {PRIORITY_OPTIONS.map((item) => <MenuItem key={item.value || 'all'} value={item.value}>{item.label}</MenuItem>)}
      </TextField>
      <TextField size="small" label="付款开始" type="date" value={filters.paymentStart || ''} onChange={(event) => handleFiltersChange({ paymentStart: event.target.value || undefined })} InputLabelProps={{ shrink: true }} />
      <TextField size="small" label="计划完成" type="date" value={filters.plannedEnd || ''} onChange={(event) => handleFiltersChange({ plannedEnd: event.target.value || undefined })} InputLabelProps={{ shrink: true }} />
    </Box>
  );

  const renderWorkbench = () => (
    <Box>
      {renderStatusBar()}
      {renderFilters()}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflowX: 'auto' }}>
        <Table sx={{ minWidth: tableMinWidth, tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              {visibleColumns.map((column, index) => (
                <ResizableHeaderCell
                  key={column.id}
                  columnId={column.id}
                  width={columnWidths[column.id] || column.defaultWidth}
                  onResize={(columnId, delta) => setColumnWidths((current) => resizeColumnWidths(current, columnId, delta))}
                  sx={getFrozenColumnSx(index, true)}
                >
                  {column.label}
                </ResizableHeaderCell>
              ))}
              <TableCell sx={actionColumnSx} align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((delivery) => (
              <TableRow key={delivery.id} hover>
                {visibleColumns.map((column, index) => (
                  <TableCell key={column.id} sx={{ ...getResizableCellSx(columnWidths[column.id]), ...getFrozenColumnSx(index) }}>
                    {renderCell(delivery, column.id)}
                  </TableCell>
                ))}
                <TableCell sx={actionColumnSx} align="center">
                  <Tooltip title="查看交付">
                    <IconButton size="small" onClick={() => setSelectedDelivery(delivery)}><VisibilityIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="推进阶段">
                    <span><IconButton size="small" onClick={() => handleAdvance(delivery)} disabled={delivery.status === '已完成'}><ArrowForwardIcon fontSize="small" /></IconButton></span>
                  </Tooltip>
                  <Tooltip title="分配负责人">
                    <IconButton size="small" onClick={() => openAssign(delivery)}><AssignmentIndIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="查看订单">
                    <IconButton size="small" onClick={() => handleViewOrder(delivery)}><ReceiptLongIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title="查看客户">
                    <IconButton size="small" onClick={() => handleViewCustomer(delivery)}><PersonIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + 1} align="center" sx={{ py: 6, color: '#94a3b8' }}>
                  {loading ? '加载中...' : '暂无交付单'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={pagination.total}
        page={(pagination.page || 1) - 1}
        rowsPerPage={pagination.pageSize}
        onPageChange={handlePageChange}
        onRowsPerPageChange={handleRowsPerPageChange}
        labelRowsPerPage="每页条数"
        labelDisplayedRows={formatPaginationRows}
      />
    </Box>
  );

  const renderBoard = () => {
    const currentConfig = productTypes.find((item) => item.type === boardProductType) || productTypes[0] || fallbackProductTypes[0];
    const stages = boardStages.length ? boardStages : Array.from(new Set(boardItems.flatMap((item) => item.stages)));
    return (
      <Box>
        <Box sx={{ mb: 2, maxWidth: 240 }}>
          <TextField select size="small" label="产品类型" value={boardProductType} onChange={(event) => setBoardProductType(event.target.value)} fullWidth>
            {productTypes.map((item) => <MenuItem key={item.type} value={item.type}>{item.label}</MenuItem>)}
          </TextField>
        </Box>
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2 }}>
            {stages.map((stage) => (
              <DeliveryColumn
                key={stage}
                stage={stage}
                deliveries={boardItems.filter((item) => item.currentStage === stage)}
                productType={boardProductType}
                color={currentConfig.color}
              />
            ))}
          </Box>
          <DragOverlay dropAnimation={null}>
            {activeDelivery ? <DeliveryCard delivery={activeDelivery} color={currentConfig.color} isDragging /> : null}
          </DragOverlay>
        </DndContext>
      </Box>
    );
  };

  const renderTaskCenter = () => (
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
      <Table>
        <TableHead>
          <TableRow sx={{ bgcolor: '#f8fafc' }}>
            <TableCell>任务</TableCell>
            <TableCell>订单号</TableCell>
            <TableCell>客户</TableCell>
            <TableCell>负责人</TableCell>
            <TableCell>截止日期</TableCell>
            <TableCell>状态</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {taskRows.map(({ delivery, task }) => (
            <TableRow key={`${delivery.id}-${task.id}`} hover>
              <TableCell>{task.title}</TableCell>
              <TableCell>{delivery.orderNo}</TableCell>
              <TableCell>{delivery.customerName}</TableCell>
              <TableCell>{task.assigneeName || delivery.owner || '待分配'}</TableCell>
              <TableCell>{task.dueDate ? formatDate(task.dueDate) : '-'}</TableCell>
              <TableCell><Chip size="small" label={task.status} color={task.status === '已完成' ? 'success' : task.status === '进行中' ? 'info' : 'default'} /></TableCell>
            </TableRow>
          ))}
          {!taskRows.length && (
            <TableRow><TableCell colSpan={6} align="center" sx={{ py: 5, color: '#94a3b8' }}>暂无交付任务</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderStats = () => (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 2 }}>
        <Paper elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb' }}><Typography variant="body2" color="text.secondary">交付总数</Typography><Typography variant="h5" sx={{ fontWeight: 800 }}>{stats?.total || 0}</Typography></Paper>
        <Paper elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb' }}><Typography variant="body2" color="text.secondary">交付中</Typography><Typography variant="h5" sx={{ fontWeight: 800 }}>{stats?.statusCounts['交付中'] || 0}</Typography></Paper>
        <Paper elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb' }}><Typography variant="body2" color="text.secondary">超期</Typography><Typography variant="h5" sx={{ fontWeight: 800, color: '#d32f2f' }}>{stats?.overdueCount || 0}</Typography></Paper>
        <Paper elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb' }}><Typography variant="body2" color="text.secondary">已完成</Typography><Typography variant="h5" sx={{ fontWeight: 800 }}>{stats?.statusCounts['已完成'] || 0}</Typography></Paper>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <Paper elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>阶段分布</Typography>
          <Stack spacing={1}>
            {(stats?.stageCounts || []).map((item) => (
              <Box key={item.stage} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">{item.stage}</Typography>
                <Chip size="small" label={item.count} />
              </Box>
            ))}
          </Stack>
        </Paper>
        <Paper elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>人员工作量</Typography>
          <Stack spacing={1}>
            {(stats?.ownerWorkload || []).slice(0, 8).map((item) => (
              <Box key={item.ownerId || item.owner} sx={{ display: 'grid', gridTemplateColumns: '1fr 70px 70px 70px', gap: 1 }}>
                <Typography variant="body2">{item.owner}</Typography>
                <Typography variant="body2">总 {item.total}</Typography>
                <Typography variant="body2" color="error">超 {item.overdue}</Typography>
                <Typography variant="body2">完 {item.completed}</Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>交付中心</Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>订单入库后自动生成交付单，交付团队按工单、任务和阶段推进。</Typography>
        </Box>
        {tabValue === 0 && (
          <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsOpen(true)}>
            视图设置
          </Button>
        )}
      </Box>

      <Tabs value={tabValue} onChange={(_event, value) => setTabValue(value)} sx={{ borderBottom: '1px solid #e5e7eb', mb: 2 }}>
        <Tab label="交付工单台" />
        <Tab label="阶段看板" />
        <Tab label="交付任务" />
        <Tab label="交付统计" />
      </Tabs>

      {tabValue === 0 && renderWorkbench()}
      {tabValue === 1 && renderBoard()}
      {tabValue === 2 && renderTaskCenter()}
      {tabValue === 3 && renderStats()}

      <TableViewSettingsDialog
        open={viewSettingsOpen}
        title="交付工单台视图设置"
        description="勾选后会显示在交付工单台中，设置会保存在当前浏览器。"
        columns={DELIVERY_COLUMNS}
        visibleColumnIds={viewConfig.visibleColumnIds}
        columnOrder={viewConfig.columnOrder}
        frozenColumnCount={viewConfig.frozenColumnCount}
        maxFrozenColumnCount={viewConfig.visibleColumnIds.length}
        onClose={() => setViewSettingsOpen(false)}
        onToggleColumn={handleToggleColumn}
        onReorderColumn={handleReorderColumn}
        onFrozenColumnCountChange={(value) => setViewConfig((current) => ({ ...current, frozenColumnCount: Math.max(0, Math.min(value, current.visibleColumnIds.length)) }))}
        onReset={handleResetView}
      />

      <Dialog open={Boolean(selectedDelivery)} onClose={() => setSelectedDelivery(null)} maxWidth="lg" fullWidth>
        <DialogCloseTitle onClose={() => setSelectedDelivery(null)}>
          {selectedDelivery?.orderNo || '交付详情'}
        </DialogCloseTitle>
        {selectedDelivery && (
          <DialogContent dividers>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 2, mb: 2 }}>
              <Box><Typography variant="caption" color="text.secondary">客户</Typography><Typography>{selectedDelivery.customerName}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">产品类型</Typography><Typography>{selectedDelivery.productType}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">交付负责人</Typography><Typography>{selectedDelivery.owner || '待分配'}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">当前状态</Typography><Chip size="small" label={selectedDelivery.status} color={getStatusColor(selectedDelivery.status)} /></Box>
              <Box><Typography variant="caption" color="text.secondary">订单金额</Typography><Typography>{formatCurrency(selectedDelivery.orderAmount || 0)}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">付款日期</Typography><Typography>{selectedDelivery.paymentDate ? formatDate(selectedDelivery.paymentDate, 'yyyy-MM-dd HH:mm:ss') : '-'}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">计划完成</Typography><Typography>{selectedDelivery.plannedCompletedAt ? formatDate(selectedDelivery.plannedCompletedAt) : '-'}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">进度</Typography>{renderProgress(selectedDelivery)}</Box>
            </Box>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>阶段进度</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {selectedDelivery.stages.map((stage) => (
                  <Chip key={stage} label={stage} color={stage === selectedDelivery.currentStage ? 'primary' : 'default'} variant={stage === selectedDelivery.currentStage ? 'filled' : 'outlined'} />
                ))}
              </Box>
            </Box>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>交付任务</Typography>
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>任务</TableCell>
                      <TableCell>负责人</TableCell>
                      <TableCell>截止日期</TableCell>
                      <TableCell>状态</TableCell>
                      <TableCell>完成时间</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {selectedDelivery.tasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>{task.title}</TableCell>
                        <TableCell>{task.assigneeName || selectedDelivery.owner || '待分配'}</TableCell>
                        <TableCell>{task.dueDate ? formatDate(task.dueDate) : '-'}</TableCell>
                        <TableCell>
                          <TextField select size="small" value={task.status} onChange={(event) => handleTaskStatusChange(task, event.target.value)} sx={{ minWidth: 120 }}>
                            {TASK_STATUS_OPTIONS.map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}
                          </TextField>
                        </TableCell>
                        <TableCell>{task.completedAt ? formatDate(task.completedAt) : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 1, alignItems: 'center' }}>
              <TextField label="阻塞原因" value={blockReason} onChange={(event) => setBlockReason(event.target.value)} size="small" fullWidth />
              <Button color={selectedDelivery.status === '阻塞' ? 'primary' : 'error'} variant="outlined" startIcon={<BlockIcon />} onClick={handleBlockToggle}>
                {selectedDelivery.status === '阻塞' ? '解除阻塞' : '标记阻塞'}
              </Button>
              <Button variant="contained" startIcon={<CheckCircleIcon />} onClick={() => handleAdvance(selectedDelivery)} disabled={selectedDelivery.status === '已完成'}>
                推进阶段
              </Button>
            </Box>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={Boolean(assignDelivery)} onClose={() => setAssignDelivery(null)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setAssignDelivery(null)}>分配交付</DialogCloseTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField select label="交付负责人" value={assignOwnerId} onChange={(event) => setAssignOwnerId(event.target.value)} fullWidth>
              <MenuItem value="">待分配</MenuItem>
              {users.map((user) => <MenuItem key={user.id} value={user.id}>{user.name}</MenuItem>)}
            </TextField>
            <TextField select label="优先级" value={assignPriority} onChange={(event) => setAssignPriority(event.target.value as DeliveryPriority)} fullWidth>
              {PRIORITY_OPTIONS.filter((item) => item.value).map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
            </TextField>
            <TextField label="计划完成日期" type="date" value={assignPlanDate} onChange={(event) => setAssignPlanDate(event.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={saveAssign}>保存</Button>
        </DialogActions>
      </Dialog>

      {orderDetail && <OrderDetail order={orderDetail} open={Boolean(orderDetail)} onClose={() => setOrderDetail(null)} />}
      {customerDetail && <CustomerDetail customer={customerDetail} open={Boolean(customerDetail)} onClose={() => setCustomerDetail(null)} readOnly />}
      {feedbackDialog}
    </Box>
  );
};

export default Delivery;
