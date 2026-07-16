import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  Alert,
  Tabs,
} from '@mui/material';
import TablePagination from '../../shared/components/TablePagination';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import SortIcon from '@mui/icons-material/Sort';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { useSearchParams } from 'react-router-dom';
import useOrderStore from '../../store/useOrderStore';
import { customerApi, orderApi, productApi, settingsApi } from '../../api';
import { getProductLevelColor, getProductLevelRowSx, getProductLevelTagSx, PRODUCT_LEVELS, normalizeResourceOwnership } from '../../shared/utils/constants';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import CustomerDetail from '../Customers/CustomerDetail';
import OrderDetail from './OrderDetail';
import OrderForm from './OrderForm';
import OrderHistoryDialog from './OrderHistoryDialog';
import OrderReview from '../OrderReview';
import type { Customer } from '../../types/customer';
import type { Order } from '../../types/order';
import type { OrderTypeConfig, User } from '../../types/settings';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import TableViewSettingsDialog from '../../shared/components/TableViewSettingsDialog';
import PermissionGate from '../../shared/auth/PermissionGate';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import { filterUsersByCurrentDataScope } from '../../shared/utils/dataVisibility';
import useAuthStore from '../../store/useAuthStore';
import ResizableHeaderCell, {
  getResizableCellSx,
  readColumnWidths,
  resetColumnWidths,
  resizeColumnWidths,
  writeColumnWidths,
  type ColumnWidthMap,
} from '../../shared/components/ResizableTable';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import { ModuleHeader, ModulePage, ModuleTabs, ModuleToolbar, moduleTablePaperSx } from '../../shared/components/ModuleShell';

type OrderColumn = {
  id: string;
  label: string;
};

type OrderViewConfig = {
  visibleColumnIds: string[];
  columnOrder: string[];
  frozenColumnCount: number;
  schemaVersion: number;
};

const ORDER_VIEW_STORAGE_KEY = 'aaos_order_table_view_v7';
const ORDER_VIEW_SCHEMA_VERSION = 7;
const ORDER_WIDTH_STORAGE_KEY = 'aaos_order_table_column_widths_v1';
const ORDER_ACTION_COLUMN_WIDTH = 160;

const ORDER_COLUMNS: OrderColumn[] = [
  { id: 'orderNo', label: '订单号' },
  { id: 'customer', label: '客户' },
  { id: 'productName', label: '产品名称' },
  { id: 'productLevel', label: '产品等级' },
  { id: 'orderType', label: '订单类型' },
  { id: 'actualAmount', label: '实付金额' },
  { id: 'officialPaymentChannel', label: '官方收款渠道' },
  { id: 'resourceOwnership', label: '资源归属' },
  { id: 'paymentDate', label: '付款时间' },
  { id: 'owner', label: '销售负责人' },
  { id: 'leadInputBy', label: '线索录入人' },
  { id: 'leadContributorName', label: '线索贡献人' },
  { id: 'originalOrderId', label: '第三方平台订单' },
  { id: 'notes', label: '备注' },
  { id: 'createdAt', label: '创建时间' },
];

const DEFAULT_VISIBLE_COLUMNS = [
  'orderNo',
  'customer',
  'productName',
  'productLevel',
  'orderType',
  'actualAmount',
  'officialPaymentChannel',
  'resourceOwnership',
  'paymentDate',
  'owner',
  'leadInputBy',
  'leadContributorName',
  'originalOrderId',
  'notes',
  'createdAt',
];

const DEFAULT_COLUMN_WIDTHS: ColumnWidthMap = {
  orderNo: 180,
  customer: 180,
  productName: 180,
  productLevel: 140,
  orderType: 140,
  actualAmount: 140,
  officialPaymentChannel: 160,
  resourceOwnership: 140,
  paymentDate: 180,
  owner: 140,
  leadInputBy: 140,
  leadContributorName: 150,
  originalOrderId: 180,
  notes: 220,
  createdAt: 180,
};

const getDefaultOrderViewConfig = (): OrderViewConfig => ({
  visibleColumnIds: DEFAULT_VISIBLE_COLUMNS.filter((id) => ORDER_COLUMNS.some((column) => column.id === id)),
  columnOrder: ORDER_COLUMNS.map((column) => column.id),
  frozenColumnCount: 0,
  schemaVersion: ORDER_VIEW_SCHEMA_VERSION,
});

const normalizeOrderViewConfig = (value: unknown): OrderViewConfig => {
  const validIds = new Set(ORDER_COLUMNS.map((column) => column.id));
  const defaultConfig = getDefaultOrderViewConfig();
  if (Array.isArray(value)) {
    const visibleColumnIds = value.filter((id): id is string => typeof id === 'string' && validIds.has(id));
    return { ...defaultConfig, visibleColumnIds: visibleColumnIds.length ? visibleColumnIds : defaultConfig.visibleColumnIds };
  }
  if (!value || typeof value !== 'object') return defaultConfig;
  const config = value as Partial<OrderViewConfig>;
  if (config.schemaVersion !== ORDER_VIEW_SCHEMA_VERSION) return defaultConfig;
  const visibleColumnIds = Array.isArray(config.visibleColumnIds)
    ? config.visibleColumnIds.filter((id): id is string => typeof id === 'string' && validIds.has(id))
    : defaultConfig.visibleColumnIds;
  const configuredOrder = Array.isArray(config.columnOrder)
    ? config.columnOrder.filter((id): id is string => typeof id === 'string' && validIds.has(id))
    : [];
  const missingOrderIds = ORDER_COLUMNS.map((column) => column.id).filter((id) => !configuredOrder.includes(id));
  const frozenColumnCount = Number.isFinite(config.frozenColumnCount)
    ? Math.max(0, Math.min(Number(config.frozenColumnCount), visibleColumnIds.length))
    : defaultConfig.frozenColumnCount;
  return {
    visibleColumnIds: visibleColumnIds.length ? visibleColumnIds : defaultConfig.visibleColumnIds,
    columnOrder: [...configuredOrder, ...missingOrderIds],
    frozenColumnCount,
    schemaVersion: ORDER_VIEW_SCHEMA_VERSION,
  };
};

const readOrderViewConfig = () => {
  try {
    const raw = localStorage.getItem(ORDER_VIEW_STORAGE_KEY);
    if (!raw) return getDefaultOrderViewConfig();
    const parsed = JSON.parse(raw);
    return normalizeOrderViewConfig(parsed);
  } catch {
    return getDefaultOrderViewConfig();
  }
};

const Orders: React.FC = () => {
  const { items, filters, pagination, loading, fetchItems, setFilters, delete: deleteOrder } = useOrderStore();
  const currentUser = useAuthStore((state) => state.currentUser);
  const [searchParams, setSearchParams] = useSearchParams();
  const visibleTabs = useMemo<Array<{ value: 'list' | 'review'; label: string }>>(() => {
    const tabs: Array<{ value: 'list' | 'review'; label: string }> = [];
    if (hasPermission(currentUser, PERMISSION_KEYS.ORDER_MANAGE)) {
      tabs.push({ value: 'list', label: '订单列表' });
    }
    if (hasPermission(currentUser, PERMISSION_KEYS.ORDER_REVIEW_LIST)) {
      tabs.push({ value: 'review', label: '订单审核台' });
    }
    return tabs;
  }, [currentUser]);
  const requestedTab: 'list' | 'review' = searchParams.get('tab') === 'review' ? 'review' : 'list';
  const activeTab: 'list' | 'review' | false = visibleTabs.some((tab) => tab.value === requestedTab)
    ? requestedTab
    : visibleTabs[0]?.value || false;
  const orderIdParam = searchParams.get('orderId');
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [orderCustomer, setOrderCustomer] = useState<Customer | null>(null);
  const [customerOrdersOpen, setCustomerOrdersOpen] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [productLevels, setProductLevels] = useState<{ name: string; color: string }[]>([]);
  const [orderTypeConfigs, setOrderTypeConfigs] = useState<OrderTypeConfig[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [reviewViewSettingsOpen, setReviewViewSettingsOpen] = useState(false);
  const [viewConfig, setViewConfig] = useState<OrderViewConfig>(readOrderViewConfig);
  const [columnWidths, setColumnWidths] = useState<ColumnWidthMap>(() => readColumnWidths(ORDER_WIDTH_STORAGE_KEY, DEFAULT_COLUMN_WIDTHS));
  const [orderLookupMessage, setOrderLookupMessage] = useState('');
  const { alert, confirm, dialog: feedbackDialog } = useAppFeedback();

  useEffect(() => {
    productApi.getProductLevelConfigs().then((res) => {
      if (res.code === 0) {
        setProductLevels(res.data.filter((level) => level.isActive).map((level) => ({ name: level.name, color: level.color })));
      }
    });
    settingsApi.fetchOrderTypeConfigs().then((res) => {
      if (res.code === 0) setOrderTypeConfigs(res.data);
    });
    orderApi.fetchOwnerCandidates().then((res) => {
      if (res.code === 0) setUsers(res.data.filter((user) => user.isActive));
    });
  }, []);

  useEffect(() => {
    if (activeTab !== 'list') return;
    fetchItems({ ...filters, paymentMethod: undefined });
  }, [activeTab, fetchItems]);

  useEffect(() => {
    localStorage.setItem(ORDER_VIEW_STORAGE_KEY, JSON.stringify(viewConfig));
  }, [viewConfig]);

  useEffect(() => {
    writeColumnWidths(ORDER_WIDTH_STORAGE_KEY, columnWidths);
  }, [columnWidths]);

  useEffect(() => {
    if (!orderIdParam || activeTab !== 'list') return;
    let active = true;
    orderApi.fetchOrderById(orderIdParam).then((res) => {
      if (!active) return;
      if (res.code === 0 && res.data) {
        setSelectedOrder(res.data);
        setDetailOpen(true);
      } else {
        setOrderLookupMessage('未找到该正式订单，或当前账号无权查看。');
      }
    });
    return () => {
      active = false;
    };
  }, [activeTab, orderIdParam]);

  const handleViewDetail = (order: Order) => {
    setSelectedOrder(order);
    setDetailOpen(true);
  };

  const handleTabChange = (_event: React.SyntheticEvent, value: 'list' | 'review') => {
    const nextParams = new URLSearchParams(searchParams);
    if (value === 'review') {
      nextParams.set('tab', 'review');
      nextParams.delete('orderId');
    } else if (nextParams.has('orderId')) {
      nextParams.set('tab', 'list');
    } else {
      nextParams.delete('tab');
    }
    setSearchParams(nextParams, { replace: true });
  };

  const handleCloseDetail = () => {
    setDetailOpen(false);
    const nextParams = new URLSearchParams(searchParams);
    if (nextParams.has('orderId')) {
      nextParams.delete('orderId');
      setSearchParams(nextParams, { replace: true });
    }
  };

  const handleCreateOrder = () => {
    setEditingOrder(null);
    setFormOpen(true);
  };

  const handleEditOrder = (order: Order) => {
    setEditingOrder(order);
    setFormOpen(true);
  };

  const handleViewHistory = (order: Order) => {
    setSelectedOrder(order);
    setHistoryOpen(true);
  };

  const handleDeleteOrder = async (order: Order) => {
    const confirmed = await confirm(`确认删除订单 ${order.orderNo} 吗？删除后该订单将从订单管理中移除。`, '删除订单');
    if (!confirmed) return;
    try {
      await deleteOrder(order.id);
    } catch (error) {
      await alert(error instanceof Error ? error.message : '删除订单失败', '删除失败');
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, paymentMethod: undefined, [key]: value || undefined, page: 1, pageSize: pagination.pageSize || 10 };
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handlePaymentDateSort = () => {
    const nextDirection: 'asc' | 'desc' = filters.sortBy === 'paymentDate' && filters.sortDirection === 'desc' ? 'asc' : 'desc';
    const newFilters = { ...filters, paymentMethod: undefined, sortBy: 'paymentDate' as const, sortDirection: nextDirection, page: 1, pageSize: pagination.pageSize || 10 };
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handlePageChange = (_: React.MouseEvent<HTMLButtonElement> | null, page: number) => {
    const newFilters = { ...filters, page: page + 1, pageSize: pagination.pageSize || 10 };
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const pageSize = Number(event.target.value);
    const newFilters = { ...filters, page: 1, pageSize };
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handleToggleColumn = (id: string) => {
    setViewConfig((current) => {
      const visibleColumnIds = current.visibleColumnIds.includes(id)
        ? current.visibleColumnIds.filter((columnId) => columnId !== id)
        : [...current.visibleColumnIds, id];
      if (!visibleColumnIds.length) return current;
      return {
        ...current,
        visibleColumnIds,
        frozenColumnCount: Math.min(current.frozenColumnCount, visibleColumnIds.length),
      };
    });
  };

  const handleReorderColumn = (sourceColumnId: string, targetColumnId: string) => {
    setViewConfig((current) => {
      const columnOrder = current.columnOrder.length ? current.columnOrder : ORDER_COLUMNS.map((column) => column.id);
      const sourceIndex = columnOrder.indexOf(sourceColumnId);
      const targetIndex = columnOrder.indexOf(targetColumnId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current;
      const nextOrder = [...columnOrder];
      const [movedColumnId] = nextOrder.splice(sourceIndex, 1);
      nextOrder.splice(targetIndex, 0, movedColumnId);
      return { ...current, columnOrder: nextOrder };
    });
  };

  const handleFrozenColumnCountChange = (value: number) => {
    setViewConfig((current) => ({
      ...current,
      frozenColumnCount: Math.max(0, Math.min(value, current.visibleColumnIds.length)),
    }));
  };

  const handleResetViewConfig = () => {
    setViewConfig(getDefaultOrderViewConfig());
    setColumnWidths(resetColumnWidths(DEFAULT_COLUMN_WIDTHS));
  };

  const handleResizeColumn = (id: string, delta: number) => {
    setColumnWidths((current) => resizeColumnWidths(current, id, delta));
  };

  const getFrozenLeft = (columnIndex: number) => {
    const widths = visibleColumns.map((column) => columnWidths[column.id] || DEFAULT_COLUMN_WIDTHS[column.id] || 120);
    return widths.slice(0, columnIndex).reduce((sum, width) => sum + width, 0);
  };

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
    width: ORDER_ACTION_COLUMN_WIDTH,
    minWidth: ORDER_ACTION_COLUMN_WIDTH,
    bgcolor: '#fff',
    boxShadow: '-1px 0 0 #e5e7eb',
  };

  const handleViewCustomer = async (order: Order) => {
    let customer: Customer | null = null;

    if (order.customerId) {
      const res = await customerApi.fetchCustomerById(order.customerId);
      if (res.code === 0) customer = res.data;
    }

    if (!customer) {
      const res = await customerApi.fetchCustomers({ search: order.customerName, pageSize: 20 });
      if (res.code === 0) {
        customer = res.data.items.find(
          (item) => item.company === order.customerName || item.name === order.customerName,
        ) || res.data.items[0] || null;
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

    setSelectedCustomer({
      ...customer,
      orderCount: relatedOrders.length,
      totalSpent: relatedOrders.reduce((sum, item) => sum + (Number(item.actualAmount) || 0), 0),
    });
    setCustomerOpen(true);
  };

  const handleCreateOrderForCustomer = (customer: Customer) => {
    setOrderCustomer(customer);
    setEditingOrder(null);
    setFormOpen(true);
    setCustomerOpen(false);
  };

  const handleViewCustomerOrders = async (customer: Customer) => {
    setOrderCustomer(customer);
    const res = await orderApi.fetchOrders({ customerId: customer.id, pageSize: 100 });
    const relatedOrders = res.code === 0
      ? res.data.items.filter(
        (item) => item.customerId === customer.id
          || item.customerName === customer.company
          || item.customerName === customer.name,
      )
      : [];
    setCustomerOrders(relatedOrders);
    setCustomerOrdersOpen(true);
  };

  const productLevelOptions = productLevels.length
    ? productLevels
    : Object.values(PRODUCT_LEVELS).map((name) => ({ name, color: getProductLevelColor(name) }));
  const selectedProductLevel = productLevelOptions.some((level) => level.name === filters.productLevel)
    ? filters.productLevel || ''
    : '';
  const orderTypeOptions = orderTypeConfigs.filter((item) => item.isActive);
  const selectedOrderType = orderTypeOptions.some((item) => item.name === filters.orderType)
    ? filters.orderType || ''
    : '';
  const orderedColumns = useMemo(() => {
    const columnMap = new Map(ORDER_COLUMNS.map((column) => [column.id, column]));
    const ordered = viewConfig.columnOrder
      .map((columnId) => columnMap.get(columnId))
      .filter((column): column is OrderColumn => Boolean(column));
    const missing = ORDER_COLUMNS.filter((column) => !viewConfig.columnOrder.includes(column.id));
    return [...ordered, ...missing];
  }, [viewConfig.columnOrder]);
  const visibleColumnIds = viewConfig.visibleColumnIds;
  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => visibleColumnIds.includes(column.id)),
    [orderedColumns, visibleColumnIds],
  );
  const frozenColumnCount = Math.min(viewConfig.frozenColumnCount, visibleColumns.length);
  const visibleOwnerUsers = useMemo(
    () => filterUsersByCurrentDataScope(users, 'orders', currentUser || undefined),
    [currentUser, users],
  );
  const tableMinWidth = useMemo(
    () => visibleColumns.reduce((sum, column) => sum + (columnWidths[column.id] || 0), 0) + ORDER_ACTION_COLUMN_WIDTH,
    [columnWidths, visibleColumns],
  );

  const renderOrderCell = (order: Order, columnId: string) => {
    const customerDisplayName = order.customerName;
    switch (columnId) {
      case 'orderNo':
        return (
          <Button
            variant="text"
            size="small"
            onClick={() => handleViewDetail(order)}
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
              {order.orderNo}
            </Box>
          </Button>
        );
      case 'customer':
        return (
          <Button
            variant="text"
            size="small"
            onClick={() => handleViewCustomer(order)}
            sx={{ p: 0, minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', fontWeight: 500 }}
          >
            {customerDisplayName}
          </Button>
        );
      case 'productName':
        return order.productName || order.productLevel || '-';
      case 'productLevel':
        return (
          <Chip
            label={order.productLevel}
            size="small"
            sx={getProductLevelTagSx(order.productLevel)}
          />
        );
      case 'orderType':
        return <Chip label={order.orderType} size="small" variant="outlined" />;
      case 'actualAmount':
        return formatCurrency(order.actualAmount || order.amount);
      case 'officialPaymentChannel':
        return order.officialPaymentChannel || '-';
      case 'resourceOwnership':
        return normalizeResourceOwnership(order.resourceOwnership || order.sourceType);
      case 'paymentDate':
        return formatDate(order.payments?.[0]?.paidAt || order.createdAt, 'yyyy-MM-dd HH:mm:ss');
      case 'owner':
        return order.owner;
      case 'leadInputBy':
        return order.leadInputBy || '-';
      case 'leadContributorName':
        return order.leadContributorName || '-';
      case 'originalOrderId':
        return order.originalOrderId || '-';
      case 'notes':
        return order.notes || '-';
      case 'createdAt':
        return formatDate(order.createdAt, 'yyyy-MM-dd HH:mm:ss');
      default:
        return null;
    }
  };

  return (
    <ModulePage>
      <ModuleHeader
        title="订单管理"
        description="提交订单申请、财务审核和正式订单管理。"
        actions={(
          <>
          {activeTab === 'list' && (
            <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsOpen(true)}>
              视图设置
            </Button>
          )}
          {activeTab === 'review' && (
            <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setReviewViewSettingsOpen(true)}>
              视图设置
            </Button>
          )}
          <PermissionGate permissionKey={PERMISSION_KEYS.ORDER_CREATE} action="write">
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateOrder}>
              提交订单申请
            </Button>
          </PermissionGate>
          </>
        )}
      />

      {visibleTabs.length > 0 && (
        <ModuleTabs value={activeTab} onChange={handleTabChange}>
          {visibleTabs.map((tab) => (
            <Tab key={tab.value} value={tab.value} label={tab.label} />
          ))}
        </ModuleTabs>
      )}

      {activeTab === 'list' ? (
        <>
          <ModuleToolbar>
            <TextField
              placeholder="搜索订单号/客户名"
              value={filters.search || ''}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              size="small"
              sx={{ minWidth: 240 }}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>产品等级</InputLabel>
              <Select value={selectedProductLevel} label="产品等级" onChange={(e) => handleFilterChange('productLevel', e.target.value)}>
                <MenuItem value="">全部</MenuItem>
                {productLevelOptions.map((level) => (
                  <MenuItem key={level.name} value={level.name}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: level.color }} />
                      {level.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>订单类型</InputLabel>
              <Select value={selectedOrderType} label="订单类型" onChange={(e) => handleFilterChange('orderType', e.target.value)}>
                <MenuItem value="">全部</MenuItem>
                {orderTypeOptions.map((item) => (
                  <MenuItem key={item.id} value={item.name}>{item.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>销售负责人</InputLabel>
              <Select value={filters.owner || ''} label="销售负责人" onChange={(e) => handleFilterChange('owner', e.target.value)}>
                <MenuItem value="">全部</MenuItem>
                {visibleOwnerUsers.map((user) => (
                  <MenuItem key={user.id} value={user.name}>{user.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="outlined" startIcon={<SortIcon />} onClick={handlePaymentDateSort}>
              付款时间{filters.sortBy === 'paymentDate' && filters.sortDirection === 'asc' ? '升序' : '降序'}
            </Button>
          </ModuleToolbar>

          <TableContainer component={Paper} elevation={0} sx={[moduleTablePaperSx, { overflowX: 'auto' }]}>
            <Table sx={{ tableLayout: 'fixed', minWidth: tableMinWidth }}>
              <TableHead>
                <TableRow>
                  {visibleColumns.map((column, columnIndex) => (
                    <ResizableHeaderCell
                      key={column.id}
                      columnId={column.id}
                      width={columnWidths[column.id]}
                      onResize={handleResizeColumn}
                      sx={getFrozenColumnSx(columnIndex, true)}
                    >
                      {column.label}
                    </ResizableHeaderCell>
                  ))}
                  <TableCell align="center" sx={{ ...actionColumnSx, zIndex: 5, bgcolor: '#f8fafc' }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((order) => {
                  return (
                    <TableRow key={order.id} hover sx={getProductLevelRowSx(order.productLevel)}>
                      {visibleColumns.map((column, columnIndex) => (
                        <TableCell
                          key={column.id}
                          sx={{
                            ...getResizableCellSx(columnWidths[column.id]),
                            ...getFrozenColumnSx(columnIndex),
                            ...(column.id === 'orderNo' ? { fontWeight: 500 } : {}),
                          }}
                          title={column.id === 'orderNo' ? order.orderNo : undefined}
                        >
                          {renderOrderCell(order, column.id)}
                        </TableCell>
                      ))}
                      <TableCell align="center" sx={actionColumnSx}>
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
                          <Tooltip title="查看">
                            <IconButton size="small" color="primary" aria-label="查看" onClick={() => handleViewDetail(order)}>
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <PermissionGate permissionKey={PERMISSION_KEYS.ORDER_EDIT} action="write">
                            <Tooltip title="编辑">
                              <IconButton size="small" color="info" aria-label="编辑" onClick={() => handleEditOrder(order)}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </PermissionGate>
                          <PermissionGate permissionKey={PERMISSION_KEYS.ORDER_HISTORY}>
                            <Tooltip title="修改记录">
                              <IconButton size="small" color="secondary" aria-label="修改记录" onClick={() => handleViewHistory(order)}>
                                <HistoryIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </PermissionGate>
                          <PermissionGate permissionKey={PERMISSION_KEYS.ORDER_DELETE} action="delete">
                            <Tooltip title="删除">
                              <IconButton size="small" color="error" aria-label="删除" onClick={() => handleDeleteOrder(order)}>
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </PermissionGate>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={visibleColumns.length + 1}
                      align="center"
                      sx={{
                        p: 0,
                        color: '#9ca3af',
                        bgcolor: '#fff',
                      }}
                    >
                      <Box
                        sx={{
                          py: 6,
                          position: 'sticky',
                          left: 0,
                          width: 'calc(100vw - 360px)',
                          maxWidth: '100vw',
                          textAlign: 'center',
                        }}
                      >
                        {loading ? '加载中...' : '暂无订单数据'}
                      </Box>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={pagination.total}
            page={Math.max((pagination.page || 1) - 1, 0)}
            rowsPerPage={pagination.pageSize || 10}
            rowsPerPageOptions={[10, 20, 50, 100]}
            onPageChange={handlePageChange}
            onRowsPerPageChange={handleRowsPerPageChange}
            labelRowsPerPage="每页条数"
            labelDisplayedRows={formatPaginationRows}
            sx={{
              border: '1px solid #f0f0f0',
              borderTop: 0,
              bgcolor: '#fff',
              '& .MuiTablePagination-toolbar': { minHeight: 48 },
            }}
          />
        </>
      ) : activeTab === 'review' ? (
        <OrderReview
          embedded
          viewSettingsOpen={reviewViewSettingsOpen}
          onViewSettingsClose={() => setReviewViewSettingsOpen(false)}
        />
      ) : (
        <Alert severity="info">当前角色可提交订单申请，但未开通订单列表或订单审核列表查看权限。</Alert>
      )}

      {selectedOrder && (
        <OrderDetail order={selectedOrder} open={detailOpen} onClose={handleCloseDetail} />
      )}

      {selectedCustomer && (
        <CustomerDetail
          customer={selectedCustomer}
          open={customerOpen}
          onClose={() => setCustomerOpen(false)}
          onCreateOrder={handleCreateOrderForCustomer}
          onViewOrders={handleViewCustomerOrders}
          onUpdated={(updated) => {
            setSelectedCustomer(updated);
            fetchItems({ ...filters, paymentMethod: undefined });
          }}
          readOnly
        />
      )}

      <OrderForm
        open={formOpen}
        order={editingOrder}
        customer={orderCustomer}
        onClose={() => { setFormOpen(false); setEditingOrder(null); }}
        onSuccess={(application) => {
          fetchItems({ ...filters, paymentMethod: undefined });
          setOrderCustomer(null);
          if (application && hasPermission(currentUser, PERMISSION_KEYS.ORDER_REVIEW_LIST)) {
            const nextParams = new URLSearchParams(searchParams);
            nextParams.set('tab', 'review');
            nextParams.delete('orderId');
            setSearchParams(nextParams, { replace: true });
          }
        }}
      />
      <OrderHistoryDialog
        order={selectedOrder}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
      <Snackbar
        open={Boolean(orderLookupMessage)}
        autoHideDuration={3000}
        onClose={() => setOrderLookupMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert severity="warning" variant="filled" onClose={() => setOrderLookupMessage('')}>
          {orderLookupMessage}
        </Alert>
      </Snackbar>
      <TableViewSettingsDialog
        open={viewSettingsOpen}
        title="订单列表视图设置"
        description="勾选后会显示在订单管理列表中，设置会保存在当前浏览器。"
        columns={ORDER_COLUMNS}
        visibleColumnIds={visibleColumnIds}
        columnOrder={viewConfig.columnOrder}
        frozenColumnCount={viewConfig.frozenColumnCount}
        maxFrozenColumnCount={visibleColumns.length}
        onClose={() => setViewSettingsOpen(false)}
        onToggleColumn={handleToggleColumn}
        onReorderColumn={handleReorderColumn}
        onFrozenColumnCountChange={handleFrozenColumnCountChange}
        onReset={handleResetViewConfig}
      />

      <Dialog open={customerOrdersOpen} onClose={() => setCustomerOrdersOpen(false)} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={() => setCustomerOrdersOpen(false)}>{orderCustomer?.company || orderCustomer?.name} 的订单</DialogCloseTitle>
        <DialogContent dividers>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>订单号</TableCell>
                <TableCell>产品名称</TableCell>
                <TableCell>产品等级</TableCell>
                <TableCell>订单类型</TableCell>
                <TableCell>金额</TableCell>
                <TableCell>付款时间</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {customerOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{order.orderNo}</TableCell>
                  <TableCell>{order.productName || order.productLevel || '-'}</TableCell>
                  <TableCell>
                    <Chip
                      label={order.productLevel}
                      size="small"
                      sx={getProductLevelTagSx(order.productLevel)}
                    />
                  </TableCell>
                  <TableCell>{order.orderType}</TableCell>
                  <TableCell>{formatCurrency(order.actualAmount || order.amount)}</TableCell>
                  <TableCell>{formatDate(order.payments?.[0]?.paidAt || order.createdAt, 'yyyy-MM-dd HH:mm:ss')}</TableCell>
                </TableRow>
              ))}
              {customerOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#9ca3af' }}>暂无订单</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <PermissionGate permissionKey={PERMISSION_KEYS.ORDER_CREATE} action="write">
            <Button onClick={() => orderCustomer && handleCreateOrderForCustomer(orderCustomer)}>提交订单申请</Button>
          </PermissionGate>
        </DialogActions>
      </Dialog>
      {feedbackDialog}
    </ModulePage>
  );
};

export default Orders;
