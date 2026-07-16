import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
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
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import TablePagination from '../../shared/components/TablePagination';
import AddIcon from '@mui/icons-material/Add';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import SettingsIcon from '@mui/icons-material/Settings';
import SupervisorAccountIcon from '@mui/icons-material/SupervisorAccount';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { format } from 'date-fns';
import { customerApi, deliveryApi, orderApi, productApi, settingsApi } from '../../api';
import { deliveryAssignmentApi } from '../../api/deliveryAssignmentApi';
import CustomerDetail from '../Customers/CustomerDetail';
import OrderDetail from '../Orders/OrderDetail';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import { getProductLevelRowSx, getProductLevelTagSx } from '../../shared/utils/constants';
import type {
  Delivery,
  DeliveryCreatableOrderSummary,
  DeliveryException,
  DeliveryExceptionType,
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
import { ModuleHeader, ModulePage, ModuleTabs } from '../../shared/components/ModuleShell';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';

type DeliveryColumnId =
  | 'orderNo'
  | 'customerName'
  | 'productName'
  | 'productType'
  | 'orderAmount'
  | 'paymentDate'
  | 'salesOwner'
  | 'owner'
  | 'currentStage'
  | 'plannedCompletedAt'
  | 'progress'
  | 'status'
  | 'priority'
  | 'customerSuccessStatus'
  | 'updatedAt';

type DeliveryColumnMeta = {
  id: DeliveryColumnId;
  label: string;
  width: number;
};

type DeliveryViewConfig = {
  visibleColumnIds: DeliveryColumnId[];
};

type TaskDraft = Record<string, string>;

const VIEW_STORAGE_KEY = 'jixiang_delivery_view_v5';

const STATUS_OPTIONS: Array<{ value: DeliveryOverallStatus; label: string; tone?: 'danger' | 'normal' }> = [
  { value: '全部', label: '全部' },
  { value: '待开始', label: '待开始' },
  { value: '交付中', label: '交付中' },
  { value: '超期', label: '超期', tone: 'danger' },
  { value: '阻塞', label: '阻塞', tone: 'danger' },
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

const EXCEPTION_OPTIONS: DeliveryExceptionType[] = ['客户不提供资料', '交付超期', '销售承诺不一致', '其他'];

const DELIVERY_COLUMNS: DeliveryColumnMeta[] = [
  { id: 'orderNo', label: '订单号', width: 160 },
  { id: 'customerName', label: '客户', width: 150 },
  { id: 'productName', label: '产品名称', width: 150 },
  { id: 'productType', label: '产品类型', width: 110 },
  { id: 'orderAmount', label: '订单金额', width: 120 },
  { id: 'paymentDate', label: '付款日期', width: 150 },
  { id: 'salesOwner', label: '销售负责人', width: 120 },
  { id: 'owner', label: '客户成功', width: 120 },
  { id: 'currentStage', label: '当前步骤', width: 150 },
  { id: 'plannedCompletedAt', label: '计划完成时间', width: 150 },
  { id: 'progress', label: '交付进度', width: 160 },
  { id: 'status', label: '状态', width: 105 },
  { id: 'priority', label: '优先级', width: 95 },
  { id: 'customerSuccessStatus', label: '维护状态', width: 110 },
  { id: 'updatedAt', label: '更新时间', width: 150 },
];

const DEFAULT_VISIBLE_COLUMNS: DeliveryColumnId[] = [
  'orderNo',
  'customerName',
  'productName',
  'productType',
  'orderAmount',
  'owner',
  'currentStage',
  'plannedCompletedAt',
  'progress',
  'status',
  'customerSuccessStatus',
];

function readViewConfig(): DeliveryViewConfig {
  try {
    const raw = localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return { visibleColumnIds: [...DEFAULT_VISIBLE_COLUMNS] };
    const parsed = JSON.parse(raw) as Partial<DeliveryViewConfig>;
    const validIds = new Set(DELIVERY_COLUMNS.map((item) => item.id));
    const visibleColumnIds = (parsed.visibleColumnIds || [])
      .filter((id): id is DeliveryColumnId => typeof id === 'string' && validIds.has(id as DeliveryColumnId));
    return { visibleColumnIds: visibleColumnIds.length ? visibleColumnIds : [...DEFAULT_VISIBLE_COLUMNS] };
  } catch {
    return { visibleColumnIds: [...DEFAULT_VISIBLE_COLUMNS] };
  }
}

function formatCurrency(value?: number) {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' }).format(value || 0);
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return format(date, 'yyyy-MM-dd HH:mm:ss');
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

function getTaskColor(task: DeliveryTask): 'default' | 'success' | 'warning' | 'info' {
  if (task.status === '已完成') return 'success';
  if (task.status === '进行中') return 'info';
  return 'default';
}

function getTerminalTaskCount(delivery: Delivery) {
  return delivery.tasks.filter(isTerminalTask).length;
}

function isTerminalTask(task: DeliveryTask) {
  return task.status === '已完成' || Boolean(task.completedAt);
}

function compactDraft(draft?: TaskDraft) {
  return Object.fromEntries(Object.entries(draft || {}).filter(([, value]) => value.trim()));
}

const DeliveryPage: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const canMutateDelivery = hasPermission(currentUser, PERMISSION_KEYS.DELIVERY_MOVE_CARD, 'write')
    || hasPermission(currentUser, PERMISSION_KEYS.DELIVERY_STAGE_CONFIG, 'write');
  const [tabValue, setTabValue] = useState(0);
  const [rows, setRows] = useState<Delivery[]>([]);
  const [stats, setStats] = useState<DeliveryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [filters, setFilters] = useState<DeliveryFilters>({ status: '全部', page: 1, pageSize: 10 });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0 });
  const [viewConfig, setViewConfig] = useState<DeliveryViewConfig>(readViewConfig);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creatableOrders, setCreatableOrders] = useState<DeliveryCreatableOrderSummary[]>([]);
  const [createSearch, setCreateSearch] = useState('');
  const [selectedCreateOrderId, setSelectedCreateOrderId] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createLoadError, setCreateLoadError] = useState('');
  const [productTypes, setProductTypes] = useState<DeliveryProductType[]>(['代理', '贴牌', '合伙人', '899', '课程']);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [taskDrafts, setTaskDrafts] = useState<Record<string, TaskDraft>>({});
  const [materialDrafts, setMaterialDrafts] = useState<Record<string, string>>({});
  const [exceptionType, setExceptionType] = useState<DeliveryExceptionType>('客户不提供资料');
  const [exceptionDescription, setExceptionDescription] = useState('');
  const [confirmNotes, setConfirmNotes] = useState('');
  const [assignDelivery, setAssignDelivery] = useState<Delivery | null>(null);
  const [assignOwnerId, setAssignOwnerId] = useState('');
  const [assignPriority, setAssignPriority] = useState<DeliveryPriority>('normal');
  const [assignPlanDate, setAssignPlanDate] = useState('');
  const [orderDetail, setOrderDetail] = useState<Order | null>(null);
  const [customerDetail, setCustomerDetail] = useState<Customer | null>(null);
  const { alert, confirm, dialog: feedbackDialog } = useAppFeedback();

  const visibleColumns = useMemo(
    () => DELIVERY_COLUMNS.filter((column) => viewConfig.visibleColumnIds.includes(column.id)),
    [viewConfig.visibleColumnIds],
  );

  const loadWorkbench = useCallback(async (nextFilters: DeliveryFilters) => {
    setLoading(true);
    setLoadError('');
    try {
      const [listRes, statsRes] = await Promise.all([
        deliveryApi.fetchDeliveries(nextFilters),
        deliveryApi.fetchDeliveryStats(nextFilters),
      ]);
      if (listRes.code === 0) {
        setRows(listRes.data.items);
        setPagination({ page: listRes.data.page, pageSize: listRes.data.pageSize, total: listRes.data.total });
      } else {
        setLoadError(listRes.message || '交付列表加载失败');
      }
      if (statsRes.code === 0) setStats(statsRes.data);
      else setLoadError((current) => current || statsRes.message || '交付统计加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkbench(filters);
  }, [filters, loadWorkbench]);

  useEffect(() => {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(viewConfig));
  }, [viewConfig]);

  useEffect(() => {
    const loadOptions = async () => {
      const [productsRes, levelsRes, usersRes, assignmentRes] = await Promise.all([
        productApi.getAllProducts(),
        productApi.getProductLevelConfigs(),
        settingsApi.fetchUsers({ isActive: true }),
        deliveryAssignmentApi.getConfig(),
      ]);
      if (usersRes.code === 0) {
        const activeUsers = usersRes.data.filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active');
        const participantIds = assignmentRes.code === 0 && assignmentRes.data.participants.length
          ? new Set(assignmentRes.data.participants.filter((item) => !item.paused).map((item) => item.userId))
          : null;
        setUsers(participantIds
          ? activeUsers.filter((user) => participantIds.has(user.id))
          : activeUsers.filter((user) => /客户成功/.test(`${user.role || ''}${user.positionName || ''}`)));
      }
      const productLevelSet = new Set<DeliveryProductType>();
      if (levelsRes.code === 0) {
        levelsRes.data.filter((level) => level.isActive).forEach((level) => productLevelSet.add(level.name));
      }
      if (productsRes.code === 0) {
        productsRes.data.filter((product) => product.isActive).forEach((product) => productLevelSet.add(product.level));
      }
      ['代理', '贴牌', '合伙人', '899', '课程'].forEach((item) => productLevelSet.add(item));
      setProductTypes(Array.from(productLevelSet));
    };
    loadOptions();
  }, []);

  useEffect(() => {
    if (!selectedDelivery) {
      setTaskDrafts({});
      setMaterialDrafts({});
      return;
    }
    setTaskDrafts(Object.fromEntries(selectedDelivery.tasks.map((task) => [task.id, task.resultFields || {}])));
    setMaterialDrafts(Object.fromEntries((selectedDelivery.materialItems || []).map((item) => [item.key, item.value || ''])));
    setExceptionDescription('');
    setConfirmNotes('');
  }, [selectedDelivery?.id]);

  const refreshAfterMutation = async (deliveryId?: string) => {
    await loadWorkbench(filters);
    const targetId = deliveryId || selectedDelivery?.id;
    if (targetId) {
      const res = await deliveryApi.fetchDeliveryById(targetId);
      if (res.code === 0) setSelectedDelivery(res.data);
    }
  };

  const handleFiltersChange = (patch: Partial<DeliveryFilters>) => {
    setFilters((current) => ({ ...current, ...patch, page: 1 }));
  };

  const handlePageChange = (_event: React.MouseEvent<HTMLButtonElement> | null, page: number) => {
    setFilters((current) => ({ ...current, page: page + 1 }));
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFilters((current) => ({ ...current, page: 1, pageSize: Number(event.target.value) }));
  };

  const loadCreatableOrders = useCallback(async (search = createSearch) => {
    setCreateLoading(true);
    setCreateLoadError('');
    try {
      const res = await deliveryApi.fetchCreatableDeliveryOrders(search);
      if (res.code === 0) {
        setCreatableOrders(res.data);
        setSelectedCreateOrderId((current) => (
          current && res.data.some((item) => item.orderId === current) ? current : res.data[0]?.orderId || ''
        ));
      } else {
        setCreatableOrders([]);
        setSelectedCreateOrderId('');
        setCreateLoadError(res.message || '可新建订单加载失败');
      }
    } finally {
      setCreateLoading(false);
    }
  }, [createSearch]);

  const openCreateDialog = async () => {
    if (!canMutateDelivery) return;
    setCreateOpen(true);
    await loadCreatableOrders('');
  };

  const handleCreateSearch = async () => {
    await loadCreatableOrders(createSearch);
  };

  const handleCreateDelivery = async () => {
    if (!canMutateDelivery) return;
    if (!selectedCreateOrderId) {
      await alert('请先选择一笔可新建交付单的订单');
      return;
    }
    const res = await deliveryApi.createDeliveryFromOrder(selectedCreateOrderId);
    if (res.code !== 0 || !res.data) {
      await alert(res.message || '新建交付单失败');
      return;
    }
    setCreateOpen(false);
    setCreateSearch('');
    setSelectedCreateOrderId('');
    await loadWorkbench({ ...filters, page: 1 });
    setFilters((current) => ({ ...current, page: 1 }));
    setSelectedDelivery(res.data);
  };

  const handleViewOrder = async (delivery: Delivery) => {
    const res = await orderApi.fetchOrderById(delivery.orderId);
    if (res.code === 0 && res.data) setOrderDetail(res.data);
  };

  const handleViewCustomer = async (delivery: Delivery) => {
    const res = await customerApi.fetchCustomerById(delivery.customerId);
    if (res.code === 0 && res.data) setCustomerDetail(res.data);
  };

  const handleOpenDelivery = async (delivery: Delivery) => {
    setSelectedDelivery(delivery);
    const response = await deliveryApi.fetchDeliveryById(delivery.id);
    if (response.code === 0 && response.data) {
      setSelectedDelivery((current) => current?.id === delivery.id ? response.data : current);
    } else {
      setSelectedDelivery((current) => current?.id === delivery.id ? null : current);
      await alert(response.message || '交付详情加载失败');
    }
  };

  const handleDeleteDelivery = async (delivery: Delivery) => {
    if (!canMutateDelivery) return;
    const ok = await confirm(`确认删除交付单「${delivery.orderNo}」吗？删除后不会影响订单和客户资料。`, '删除交付单');
    if (!ok) return;
    const res = await deliveryApi.deleteDelivery(delivery.id);
    if (res.code !== 0 || !res.data) {
      await alert(res.message || '交付单删除失败');
      return;
    }
    if (selectedDelivery?.id === delivery.id) setSelectedDelivery(null);
    await loadWorkbench(filters);
  };

  const handleToggleTaskCompletion = async (task: DeliveryTask) => {
    if (!canMutateDelivery) return;
    if (!selectedDelivery) return;
    const res = await deliveryApi.updateDeliveryTask(selectedDelivery.id, task.id, {
      status: isTerminalTask(task) ? '待开始' : '已完成',
      resultFields: compactDraft(taskDrafts[task.id]),
    });
    if (res.code !== 0) {
      await alert(res.message || '步骤保存失败');
      return;
    }
    setSelectedDelivery(res.data);
    await loadWorkbench(filters);
  };

  const handleUploadAttachment = async (task: DeliveryTask, event: React.ChangeEvent<HTMLInputElement>) => {
    if (!canMutateDelivery) return;
    if (!selectedDelivery) return;
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    let latest: Delivery | null = selectedDelivery;
    for (const file of files) {
      const res = await deliveryApi.addDeliveryAttachment(selectedDelivery.id, task.id, {
        name: file.name,
        size: file.size,
        fileType: file.type,
        uploadedBy: selectedDelivery.owner || '客户成功',
      });
      if (res.code === 0) latest = res.data;
    }
    setSelectedDelivery(latest);
    await loadWorkbench(filters);
  };

  const handleSaveMaterials = async () => {
    if (!canMutateDelivery) return;
    if (!selectedDelivery) return;
    const nextItems = (selectedDelivery.materialItems || []).map((item) => {
      const value = materialDrafts[item.key]?.trim();
      return {
        ...item,
        value,
        status: item.status === '已确认' ? item.status : value ? '已提供' as const : '缺失' as const,
      };
    });
    const res = await deliveryApi.updateDelivery(selectedDelivery.id, { materialItems: nextItems });
    if (res.code === 0) {
      setSelectedDelivery(res.data);
      await loadWorkbench(filters);
    }
  };

  const handleAddException = async () => {
    if (!canMutateDelivery) return;
    if (!selectedDelivery) return;
    const res = await deliveryApi.addDeliveryException(selectedDelivery.id, {
      type: exceptionType,
      description: exceptionDescription,
      createdBy: selectedDelivery.owner || '客户成功',
    });
    if (res.code !== 0) {
      await alert(res.message || '异常标记失败');
      return;
    }
    setSelectedDelivery(res.data);
    setExceptionDescription('');
    await loadWorkbench(filters);
  };

  const handleResolveException = async (exception: DeliveryException) => {
    if (!canMutateDelivery) return;
    if (!selectedDelivery) return;
    const res = await deliveryApi.resolveDeliveryException(selectedDelivery.id, exception.id, {
      resolvedBy: '客户成功主管',
      resolution: '主管已介入处理，交付可继续推进',
    });
    if (res.code !== 0) {
      await alert(res.message || '异常解除失败');
      return;
    }
    setSelectedDelivery(res.data);
    await loadWorkbench(filters);
  };

  const handleConfirmDelivery = async () => {
    if (!canMutateDelivery) return;
    if (!selectedDelivery) return;
    const res = await deliveryApi.confirmDeliveryCompletion(selectedDelivery.id, {
      confirmedBy: '客户成功主管',
      notes: confirmNotes,
    });
    if (res.code !== 0) {
      await alert(res.message || '主管确认失败');
      return;
    }
    setSelectedDelivery(res.data);
    await loadWorkbench(filters);
  };

  const openAssign = (delivery: Delivery) => {
    if (!canMutateDelivery) return;
    setAssignDelivery(delivery);
    setAssignOwnerId(delivery.ownerId || '');
    setAssignPriority(delivery.priority || 'normal');
    setAssignPlanDate(delivery.plannedCompletedAt || '');
  };

  const saveAssign = async () => {
    if (!canMutateDelivery) return;
    if (!assignDelivery) return;
    const user = users.find((item) => item.id === assignOwnerId);
    const res = await deliveryApi.updateDelivery(assignDelivery.id, {
      ownerId: user?.id,
      owner: user?.name || '待分配',
      priority: assignPriority,
      plannedCompletedAt: assignPlanDate || undefined,
    });
    if (res.code === 0) {
      setAssignDelivery(null);
      await loadWorkbench(filters);
      await alert('分配成功');
    }
  };

  const toggleColumn = (columnId: DeliveryColumnId) => {
    setViewConfig((current) => {
      const exists = current.visibleColumnIds.includes(columnId);
      if (exists && current.visibleColumnIds.length <= 1) return current;
      return {
        visibleColumnIds: exists
          ? current.visibleColumnIds.filter((item) => item !== columnId)
          : [...current.visibleColumnIds, columnId],
      };
    });
  };

  const renderProgress = (delivery: Delivery) => (
    <Box sx={{ minWidth: 120 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="caption" sx={{ color: '#64748b' }}>{delivery.progressPercent || 0}%</Typography>
        <Typography variant="caption" sx={{ color: '#94a3b8' }}>{getTerminalTaskCount(delivery)}/{delivery.tasks.length}</Typography>
      </Box>
      <LinearProgress variant="determinate" value={delivery.progressPercent || 0} sx={{ height: 6, borderRadius: 999 }} />
    </Box>
  );

  const renderCell = (delivery: Delivery, columnId: DeliveryColumnId) => {
    switch (columnId) {
      case 'orderNo':
        return <Button size="small" variant="text" onClick={() => handleViewOrder(delivery)} sx={{ p: 0, minWidth: 0, fontWeight: 700 }}>{delivery.orderNo}</Button>;
      case 'customerName':
        return <Button size="small" variant="text" onClick={() => handleViewCustomer(delivery)} sx={{ p: 0, minWidth: 0 }}>{delivery.customerName}</Button>;
      case 'productName':
        return delivery.productName || delivery.snapshot?.order.productName || delivery.productType || '-';
      case 'productType':
        return (
          <Chip
            size="small"
            label={delivery.productType}
            sx={getProductLevelTagSx(delivery.productType)}
          />
        );
      case 'orderAmount':
        return formatCurrency(delivery.orderAmount);
      case 'paymentDate':
        return formatDateTime(delivery.paymentDate);
      case 'salesOwner':
        return delivery.salesOwner || '-';
      case 'owner':
        return delivery.owner || '待分配';
      case 'currentStage':
        return delivery.currentStage;
      case 'plannedCompletedAt':
        return delivery.plannedCompletedAt ? formatDateTime(delivery.plannedCompletedAt) : '-';
      case 'progress':
        return renderProgress(delivery);
      case 'status':
        return <Chip size="small" label={delivery.status || '交付中'} color={getStatusColor(delivery.status)} />;
      case 'priority':
        return <Chip size="small" label={getPriorityLabel(delivery.priority)} color={getPriorityColor(delivery.priority)} variant="outlined" />;
      case 'customerSuccessStatus':
        return <Chip size="small" label={delivery.customerSuccessStatus || '未开始'} variant="outlined" color={delivery.customerSuccessStatus === '维护中' ? 'success' : 'default'} />;
      case 'updatedAt':
        return formatDateTime(delivery.updatedAt);
      default:
        return '-';
    }
  };

  const visibleRows = useMemo(() => {
    if (tabValue !== 1) return rows;
    return rows.filter((item) => item.status === '阻塞' || item.status === '超期' || (item.exceptions || []).some((exception) => exception.status !== '已解除'));
  }, [rows, tabValue]);

  const renderStatusBar = () => (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
      {STATUS_OPTIONS.map((option) => {
        const selected = (filters.status || '全部') === option.value;
        const count = stats?.statusCounts[option.value] || 0;
        return (
          <Button
            key={option.value}
            variant={selected ? 'contained' : 'outlined'}
            color={option.tone === 'danger' ? 'error' : 'primary'}
            onClick={() => handleFiltersChange({ status: option.value })}
            sx={{ borderRadius: 1.5, minWidth: 86 }}
          >
            {option.label}
            <Chip size="small" label={count} sx={{ ml: 1, height: 22, bgcolor: selected ? 'rgba(255,255,255,0.24)' : '#eef2f7' }} />
          </Button>
        );
      })}
    </Box>
  );

  const renderFilters = () => (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1.35fr) repeat(4, minmax(145px, 1fr))', gap: 1.25, mb: 2 }}>
      <TextField size="small" placeholder="搜索订单号/客户/负责人" value={filters.search || ''} onChange={(event) => handleFiltersChange({ search: event.target.value })} />
      <TextField select size="small" label="产品类型" value={filters.productType || ''} onChange={(event) => handleFiltersChange({ productType: event.target.value || undefined })}>
        <MenuItem value="">全部产品</MenuItem>
        {productTypes.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
      </TextField>
      <TextField select size="small" label="客户成功" value={filters.ownerId || ''} onChange={(event) => handleFiltersChange({ ownerId: event.target.value || undefined })}>
        <MenuItem value="">全部人员</MenuItem>
        {users.map((user) => <MenuItem key={user.id} value={user.id}>{user.name}</MenuItem>)}
      </TextField>
      <TextField select size="small" label="优先级" value={filters.priority || ''} onChange={(event) => handleFiltersChange({ priority: event.target.value as DeliveryPriority | '' })}>
        {PRIORITY_OPTIONS.map((item) => <MenuItem key={item.value || 'all'} value={item.value}>{item.label}</MenuItem>)}
      </TextField>
      <TextField size="small" label="计划完成前" type="date" value={filters.plannedEnd || ''} onChange={(event) => handleFiltersChange({ plannedEnd: event.target.value || undefined })} InputLabelProps={{ shrink: true }} />
    </Box>
  );

  const renderTable = () => (
    <>
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflowX: 'auto' }}>
        <Table sx={{ minWidth: visibleColumns.reduce((sum, column) => sum + column.width, 150), tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              {visibleColumns.map((column) => (
                <TableCell key={column.id} sx={{ width: column.width, fontWeight: 700 }}>{column.label}</TableCell>
              ))}
              <TableCell align="center" sx={{ width: 150, position: 'sticky', right: 0, bgcolor: '#f8fafc' }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.map((delivery) => (
              <TableRow key={delivery.id} hover sx={getProductLevelRowSx(delivery.productType)}>
                {visibleColumns.map((column) => (
                  <TableCell key={column.id} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {renderCell(delivery, column.id)}
                  </TableCell>
                ))}
                <TableCell align="center" sx={{ position: 'sticky', right: 0, bgcolor: '#fff' }}>
                  <Tooltip title="查看交付">
                    <IconButton size="small" onClick={() => void handleOpenDelivery(delivery)}><VisibilityIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  {canMutateDelivery && (
                    <>
                      <Tooltip title="分配交付">
                        <IconButton size="small" onClick={() => openAssign(delivery)}><AssignmentIndIcon fontSize="small" /></IconButton>
                      </Tooltip>
                      <Tooltip title="删除交付单">
                        <IconButton size="small" color="error" onClick={() => handleDeleteDelivery(delivery)}><DeleteOutlineIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!visibleRows.length && (
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
        count={tabValue === 1 ? visibleRows.length : pagination.total}
        page={(pagination.page || 1) - 1}
        rowsPerPage={pagination.pageSize}
        onPageChange={handlePageChange}
        onRowsPerPageChange={handleRowsPerPageChange}
        labelRowsPerPage="每页条数"
        labelDisplayedRows={({ from, to, count }) => (count === 0 ? '0 / 共 0 条' : `${from}-${to} / 共 ${count} 条`)}
      />
    </>
  );

  const renderStats = () => (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 2 }}>
        {[
          ['交付总数', stats?.total || 0, '#172033'],
          ['交付中', stats?.statusCounts['交付中'] || 0, '#1976d2'],
          ['异常/超期', (stats?.statusCounts['阻塞'] || 0) + (stats?.statusCounts['超期'] || 0), '#d32f2f'],
          ['已完成', stats?.statusCounts['已完成'] || 0, '#2e7d32'],
        ].map(([label, value, color]) => (
          <Paper key={label} elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">{label}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 800, color }}>{value}</Typography>
          </Paper>
        ))}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <Paper elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>步骤分布</Typography>
          <Stack spacing={1}>
            {(stats?.stageCounts || []).map((item) => (
              <Box key={item.stage} sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 1 }}>
                <Typography variant="body2">{item.stage}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.count}</Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
        <Paper elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>客户成功工作量</Typography>
          <Stack spacing={1}>
            {(stats?.ownerWorkload || []).map((item) => (
              <Box key={item.ownerId || item.owner} sx={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 1.5, alignItems: 'center' }}>
                <Typography variant="body2">{item.owner}</Typography>
                <Chip size="small" label={`总 ${item.total}`} />
                <Chip size="small" label={`异常 ${item.blocked + item.overdue}`} color={item.blocked + item.overdue ? 'error' : 'default'} variant="outlined" />
                <Chip size="small" label={`完成 ${item.completed}`} color="success" variant="outlined" />
              </Box>
            ))}
          </Stack>
        </Paper>
      </Box>
    </Box>
  );

  const renderMaterialPanel = (delivery: Delivery) => (
    <Paper elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>交付资料</Typography>
        {canMutateDelivery && <Button size="small" variant="outlined" onClick={handleSaveMaterials}>保存资料</Button>}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25 }}>
        {(delivery.materialItems || []).map((item) => (
          <TextField
            key={item.key}
            size="small"
            label={`${item.label} · ${item.status}`}
            value={materialDrafts[item.key] || ''}
            onChange={(event) => setMaterialDrafts((current) => ({ ...current, [item.key]: event.target.value }))}
          />
        ))}
      </Box>
    </Paper>
  );

  const renderSnapshotPanel = (delivery: Delivery) => (
    <Paper elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1.5 }}>客户与订单资料</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1.5 }}>
        {[
          ['客户', delivery.snapshot?.customer.name || delivery.customerName],
          ['公司', delivery.snapshot?.customer.company || '-'],
          ['手机', delivery.snapshot?.customer.phone || '-'],
          ['微信', delivery.snapshot?.customer.wechat || '-'],
          ['城市/行业', [delivery.snapshot?.customer.city, delivery.snapshot?.customer.industry].filter(Boolean).join(' / ') || '-'],
          ['产品名称', delivery.productName || delivery.snapshot?.order.productName || delivery.productType || '-'],
          ['订单金额', formatCurrency(delivery.orderAmount)],
          ['订单类型', delivery.orderType || '-'],
          ['付款日期', formatDateTime(delivery.paymentDate)],
          ['计划完成时间', delivery.plannedCompletedAt ? formatDateTime(delivery.plannedCompletedAt) : '-'],
          ['销售负责人', delivery.salesOwner || '-'],
        ].map(([label, value]) => (
          <Box key={label}>
            <Typography variant="caption" sx={{ color: '#64748b' }}>{label}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, mt: 0.25 }}>{value}</Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );

  const renderTaskRail = (delivery: Delivery) => (
    <Paper elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1.5 }}>交付步骤轨道</Typography>
      <Stack spacing={1.5}>
        {delivery.tasks.map((task, index) => {
          const isTerminal = isTerminalTask(task);
          return (
            <Box
              key={task.id}
              sx={{
                display: 'grid',
                gridTemplateColumns: '34px 1fr',
                gap: 1.5,
                p: 1.5,
                border: '1px solid',
                borderColor: isTerminal ? '#2e7d32' : '#e5e7eb',
                borderRadius: 1,
                bgcolor: isTerminal ? '#f6fff7' : '#fff',
              }}
            >
              <Checkbox
                checked={isTerminal}
                disabled={!canMutateDelivery || delivery.approvalStatus === '已确认' || delivery.status === '已完成'}
                onChange={() => handleToggleTaskCompletion(task)}
                inputProps={{ 'aria-label': `${index + 1}. ${task.title}${isTerminal ? '取消完成' : '标记完成'}` }}
              />
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{task.title}</Typography>
                    <Chip size="small" label={task.status} color={getTaskColor(task)} />
                  </Box>
                  {canMutateDelivery && (
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button component="label" size="small" variant="outlined" startIcon={<UploadFileIcon />}>
                        上传
                        <input hidden type="file" multiple onChange={(event) => handleUploadAttachment(task, event)} />
                      </Button>
                    </Box>
                  )}
                </Box>
                <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>{task.description}</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, mt: 1 }}>
                  <TextField size="small" label="后台地址" value={taskDrafts[task.id]?.backendUrl || ''} onChange={(event) => setTaskDrafts((current) => ({ ...current, [task.id]: { ...current[task.id], backendUrl: event.target.value } }))} />
                  <TextField size="small" label="账号" value={taskDrafts[task.id]?.account || ''} onChange={(event) => setTaskDrafts((current) => ({ ...current, [task.id]: { ...current[task.id], account: event.target.value } }))} />
                  <TextField size="small" label="交付说明" value={taskDrafts[task.id]?.note || ''} onChange={(event) => setTaskDrafts((current) => ({ ...current, [task.id]: { ...current[task.id], note: event.target.value } }))} />
                </Box>
                {!!task.attachments?.length && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
                    {task.attachments.map((attachment) => (
                      <Chip key={attachment.id} size="small" icon={<InsertDriveFileIcon />} label={attachment.name} variant="outlined" />
                    ))}
                  </Box>
                )}
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );

  const renderExceptionPanel = (delivery: Delivery) => (
    <Paper elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1.5 }}>异常与主管介入</Typography>
      {canMutateDelivery && <Stack spacing={1.25} sx={{ mb: 1.5 }}>
        <TextField select size="small" label="异常类型" value={exceptionType} onChange={(event) => setExceptionType(event.target.value as DeliveryExceptionType)} fullWidth>
          {EXCEPTION_OPTIONS.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
        </TextField>
        <TextField
          size="small"
          label="异常说明"
          value={exceptionDescription}
          onChange={(event) => setExceptionDescription(event.target.value)}
          minRows={2}
          multiline
          fullWidth
        />
        <Button variant="outlined" color="warning" startIcon={<WarningAmberIcon />} onClick={handleAddException} sx={{ alignSelf: 'flex-start' }}>
          标记异常
        </Button>
      </Stack>}
      <Stack spacing={1}>
        {(delivery.exceptions || []).map((exception) => (
          <Box key={exception.id} sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 1, p: 1, border: '1px solid #edf0f5', borderRadius: 1 }}>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{exception.type} · {exception.status}</Typography>
              <Typography variant="caption" sx={{ color: '#64748b' }}>{exception.description}</Typography>
            </Box>
            {canMutateDelivery && exception.status !== '已解除' && (
              <Button size="small" startIcon={<SupervisorAccountIcon />} onClick={() => handleResolveException(exception)} sx={{ justifySelf: 'flex-start' }}>主管解除</Button>
            )}
          </Box>
        ))}
        {!delivery.exceptions?.length && <Typography variant="body2" sx={{ color: '#94a3b8' }}>暂无异常记录。</Typography>}
      </Stack>
    </Paper>
  );

  const renderApprovalPanel = (delivery: Delivery) => (
    <Paper elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'center' }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>主管确认交付完成</Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            主管确认后，交付单进入已完成，客户后续进入客户成功维护。
          </Typography>
        </Box>
        <Chip label={delivery.approvalStatus || '未提交'} color={delivery.approvalStatus === '已确认' ? 'success' : delivery.approvalStatus === '待主管确认' ? 'info' : 'default'} />
      </Box>
      {delivery.supervisorConfirmedAt ? (
        <Typography variant="body2" sx={{ mt: 1.5, color: '#2e7d32' }}>
          {delivery.supervisorConfirmedBy || '客户成功主管'} 已于 {formatDateTime(delivery.supervisorConfirmedAt)} 确认完成。
        </Typography>
      ) : canMutateDelivery ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 1, mt: 1.5 }}>
          <TextField size="small" label="确认说明" value={confirmNotes} onChange={(event) => setConfirmNotes(event.target.value)} />
          <Button variant="contained" startIcon={<SupervisorAccountIcon />} onClick={handleConfirmDelivery}>主管确认</Button>
        </Box>
      ) : null}
    </Paper>
  );

  const renderDetailDialog = () => (
    <Dialog open={Boolean(selectedDelivery)} onClose={() => setSelectedDelivery(null)} maxWidth="lg" fullWidth>
      {selectedDelivery && (
        <>
          <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 1.5 }}>
            <Box>
              <Typography component="div" variant="h6" sx={{ fontWeight: 800 }}>{selectedDelivery.orderNo} · {selectedDelivery.customerName}</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
                <Chip
                  size="small"
                  label={selectedDelivery.productType}
                  sx={getProductLevelTagSx(selectedDelivery.productType)}
                />
                <Chip size="small" label={selectedDelivery.status || '交付中'} color={getStatusColor(selectedDelivery.status)} />
                <Chip size="small" label={`当前：${selectedDelivery.currentStage}`} variant="outlined" />
              </Stack>
            </Box>
            <IconButton onClick={() => setSelectedDelivery(null)}><CloseIcon /></IconButton>
          </DialogTitle>
          <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 2 }}>
              <Stack spacing={2}>
                {renderSnapshotPanel(selectedDelivery)}
                {renderTaskRail(selectedDelivery)}
              </Stack>
              <Stack spacing={2}>
                {renderMaterialPanel(selectedDelivery)}
                {renderExceptionPanel(selectedDelivery)}
                {renderApprovalPanel(selectedDelivery)}
              </Stack>
            </Box>
          </DialogContent>
        </>
      )}
    </Dialog>
  );

  const selectedCreateOrder = creatableOrders.find((order) => order.orderId === selectedCreateOrderId);

  const renderCreateDialog = () => (
    <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography component="div" variant="h6" sx={{ fontWeight: 800 }}>新建交付单</Typography>
        <IconButton onClick={() => setCreateOpen(false)}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {createLoadError && <Alert severity="error">{createLoadError}</Alert>}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.8fr) minmax(320px, 1.2fr) auto', gap: 1 }}>
            <TextField
              size="small"
              placeholder="搜索订单号/客户/产品"
              value={createSearch}
              onChange={(event) => setCreateSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleCreateSearch();
              }}
            />
            <TextField
              select
              size="small"
              label="选择已确认且未生成交付单的订单"
              value={selectedCreateOrderId}
              onChange={(event) => setSelectedCreateOrderId(event.target.value)}
              disabled={createLoading || !creatableOrders.length}
            >
              {creatableOrders.map((order) => (
                <MenuItem key={order.orderId} value={order.orderId}>
                  {order.orderNo} · {order.customerName} · {order.productName || order.productType}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" onClick={handleCreateSearch} disabled={createLoading}>刷新</Button>
          </Box>

          {selectedCreateOrder ? (
            <Paper elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1.5 }}>
                {[
                  ['订单号', selectedCreateOrder.orderNo],
                  ['客户', selectedCreateOrder.customerName],
                  ['产品名称', selectedCreateOrder.productName || selectedCreateOrder.productType],
                  ['产品类型', selectedCreateOrder.productType],
                  ['订单金额', formatCurrency(selectedCreateOrder.orderAmount)],
                  ['付款日期', formatDateTime(selectedCreateOrder.paymentDate)],
                  ['订单类型', selectedCreateOrder.orderType || '-'],
                  ['销售负责人', selectedCreateOrder.salesOwner || '-'],
                ].map(([label, value]) => (
                  <Box key={label}>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>{label}</Typography>
                    {label === '产品类型' ? (
                      <Box sx={{ mt: 0.5 }}>
                        <Chip
                          size="small"
                          label={value}
                          sx={getProductLevelTagSx(String(value))}
                        />
                      </Box>
                    ) : (
                      <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>{value}</Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </Paper>
          ) : (
            <Paper elevation={0} sx={{ p: 3, border: '1px dashed #cbd5e1', borderRadius: 1, textAlign: 'center', color: '#64748b' }}>
              {createLoading ? '正在加载可新建交付单的订单...' : '暂无可新建交付单的订单'}
            </Paper>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={() => setCreateOpen(false)}>取消</Button>
        {canMutateDelivery && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateDelivery} disabled={!selectedCreateOrderId || createLoading}>
            新建交付单
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );

  return (
    <ModulePage>
      <ModuleHeader
        title="交付中心"
        description="客户成功处理代理、贴牌、合伙人交付，主管在最终节点确认交付完成。"
        actions={(
          <>
          <Button variant="outlined" startIcon={<SettingsIcon />} onClick={() => setViewSettingsOpen(true)}>
            视图设置
          </Button>
          {canMutateDelivery && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateDialog}>
              新建交付单
            </Button>
          )}
          </>
        )}
      />

      <ModuleTabs value={tabValue} onChange={(_event, value) => setTabValue(value)}>
        <Tab label="交付工单台" />
        <Tab label="异常交付" />
        <Tab label="交付统计" />
      </ModuleTabs>

      {loadError && <Alert severity="error" sx={{ mb: 2 }}>交付数据加载失败：{loadError}</Alert>}

      {tabValue !== 2 && (
        <>
          {renderStatusBar()}
          {renderFilters()}
          {renderTable()}
        </>
      )}
      {tabValue === 2 && renderStats()}

      {renderDetailDialog()}
      {renderCreateDialog()}

      <Dialog open={viewSettingsOpen} onClose={() => setViewSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography component="div" variant="h6" sx={{ fontWeight: 800 }}>视图设置</Typography>
          <IconButton onClick={() => setViewSettingsOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            {DELIVERY_COLUMNS.map((column) => (
              <Box key={column.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                <Checkbox
                  checked={viewConfig.visibleColumnIds.includes(column.id)}
                  disabled={viewConfig.visibleColumnIds.length <= 1 && viewConfig.visibleColumnIds.includes(column.id)}
                  onChange={() => toggleColumn(column.id)}
                />
                <Typography variant="body2">{column.label}</Typography>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewConfig({ visibleColumnIds: [...DEFAULT_VISIBLE_COLUMNS] })}>恢复默认</Button>
          <Button variant="contained" onClick={() => setViewSettingsOpen(false)}>完成</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(assignDelivery)} onClose={() => setAssignDelivery(null)} maxWidth="xs" fullWidth>
        <DialogTitle>分配交付负责人</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField select label="客户成功" value={assignOwnerId} onChange={(event) => setAssignOwnerId(event.target.value)} fullWidth>
              <MenuItem value="">待分配</MenuItem>
              {users.map((user) => <MenuItem key={user.id} value={user.id}>{user.name}</MenuItem>)}
            </TextField>
            <TextField select label="优先级" value={assignPriority} onChange={(event) => setAssignPriority(event.target.value as DeliveryPriority)} fullWidth>
              {PRIORITY_OPTIONS.filter((item) => item.value).map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
            </TextField>
            <TextField label="计划完成时间" type="date" value={assignPlanDate} onChange={(event) => setAssignPlanDate(event.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDelivery(null)}>取消</Button>
          {canMutateDelivery && <Button variant="contained" onClick={saveAssign}>保存</Button>}
        </DialogActions>
      </Dialog>

      {orderDetail && <OrderDetail order={orderDetail} open={Boolean(orderDetail)} onClose={() => setOrderDetail(null)} />}
      {customerDetail && <CustomerDetail customer={customerDetail} open={Boolean(customerDetail)} onClose={() => setCustomerDetail(null)} readOnly />}
      {feedbackDialog}
    </ModulePage>
  );
};

export default DeliveryPage;
