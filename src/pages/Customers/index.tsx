import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import useCustomerStore from '../../store/useCustomerStore';
import { customerApi, orderApi, settingsApi } from '../../api';
import { CUSTOMER_LEVELS, ROUTES, getLifecycleConfigByCode, getProductLevelColor, normalizeLifecycleStatusCode, normalizeResourceOwnership } from '../../shared/utils/constants';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import CustomerLevelBadge from '../../shared/components/CustomerLevelBadge';
import CustomerDetail from './CustomerDetail';
import CustomerForm from './CustomerForm';
import OrderForm from '../Orders/OrderForm';
import type { Customer, CustomerFilters } from '../../types/customer';
import type { Order, OrderApplication } from '../../types/order';
import type { CustomerLevelConfig, LifecycleStatusConfig, User } from '../../types/settings';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import TableViewSettingsDialog from '../../shared/components/TableViewSettingsDialog';
import PermissionGate from '../../shared/auth/PermissionGate';
import { PERMISSION_KEYS } from '../../shared/utils/permissions';
import useAuthStore from '../../store/useAuthStore';
import { filterUsersByCurrentDataScope } from '../../shared/utils/dataVisibility';
import ResizableHeaderCell, {
  getResizableCellSx,
  readColumnWidths,
  resetColumnWidths,
  resizeColumnWidths,
  writeColumnWidths,
  type ColumnWidthMap,
} from '../../shared/components/ResizableTable';

type CustomerColumn = {
  id: string;
  label: string;
  render: (customer: Customer) => React.ReactNode;
};

type CustomerScope = 'active' | 'public_pool';

type CustomerViewConfig = {
  visibleColumnIds: string[];
  columnOrder: string[];
  frozenColumnCount: number;
};

const CUSTOMER_VIEW_STORAGE_KEY = 'aaos_customer_table_view_v5';
const CUSTOMER_WIDTH_STORAGE_KEY = 'aaos_customer_table_column_widths_v2';
const CUSTOMER_ACTION_COLUMN_WIDTH = 160;
const formatCustomerSource = (customer: Customer) => [customer.leadSource, customer.sourceName].filter(Boolean).join('-') || '-';

const buildCustomerColumns = (lifecycleConfigs: LifecycleStatusConfig[]): CustomerColumn[] => {
  const getLifecycleConfig = (customer: Customer) => {
    const code = normalizeLifecycleStatusCode(customer.lifecycleStatusCode);
    return lifecycleConfigs.find((item) => item.code === code) || getLifecycleConfigByCode(code);
  };
  return [
  { id: 'company', label: '公司', render: (customer) => customer.company || '-' },
  { id: 'phone', label: '电话', render: (customer) => customer.phone || '-' },
  { id: 'wechat', label: '微信', render: (customer) => customer.wechat || '-' },
  {
    id: 'lifecycleStatus',
    label: '生命周期',
    render: (customer) => {
      const config = getLifecycleConfig(customer);
      return (
        <Chip
          label={config.name}
          size="small"
          sx={{ bgcolor: `${config.color}18`, color: config.color, fontWeight: 600 }}
        />
      );
    },
  },
  {
    id: 'customerLevel',
    label: '客户等级',
    render: (customer) => <CustomerLevelBadge level={customer.customerLevel} />,
  },
  { id: 'leadSource', label: '线索来源', render: (customer) => formatCustomerSource(customer) },
  { id: 'sourceType', label: '资源归属', render: (customer) => normalizeResourceOwnership(customer.sourceType) },
  { id: 'leadInputBy', label: '线索录入人', render: (customer) => customer.leadInputBy || '-' },
  { id: 'leadContributorName', label: '线索贡献人', render: (customer) => customer.leadContributorName || '-' },
  { id: 'industry', label: '行业', render: (customer) => customer.industry || '-' },
  { id: 'city', label: '城市', render: (customer) => customer.city || '-' },
  { id: 'originalSalesTransferBy', label: '原销转人员', render: (customer) => customer.originalSalesTransferBy || '-' },
  { id: 'totalSpent', label: '累计消费', render: (customer) => formatCurrency(customer.totalSpent) },
  { id: 'orderCount', label: '订单数', render: (customer) => customer.orderCount },
  { id: 'owner', label: '销售负责人', render: (customer) => customer.owner || '-' },
  { id: 'createdAt', label: '创建时间', render: (customer) => formatDate(customer.createdAt) },
  ];
};

const DEFAULT_VISIBLE_COLUMNS = [
  'company',
  'phone',
  'lifecycleStatus',
  'customerLevel',
  'leadSource',
  'sourceType',
  'leadInputBy',
  'leadContributorName',
  'industry',
  'originalSalesTransferBy',
  'totalSpent',
  'orderCount',
  'owner',
  'createdAt',
];

const DEFAULT_COLUMN_WIDTHS: ColumnWidthMap = {
  name: 180,
  company: 220,
  phone: 150,
  wechat: 150,
  lifecycleStatus: 140,
  customerLevel: 130,
  leadSource: 160,
  sourceType: 140,
  leadInputBy: 140,
  leadContributorName: 140,
  industry: 140,
  city: 120,
  originalSalesTransferBy: 160,
  totalSpent: 140,
  orderCount: 120,
  owner: 140,
  createdAt: 180,
};

const getDefaultCustomerViewConfig = (columns: CustomerColumn[]): CustomerViewConfig => ({
  visibleColumnIds: DEFAULT_VISIBLE_COLUMNS.filter((id) => columns.some((column) => column.id === id)),
  columnOrder: columns.map((column) => column.id),
  frozenColumnCount: 0,
});

const normalizeCustomerViewConfig = (value: unknown, columns: CustomerColumn[]): CustomerViewConfig => {
  const validIds = new Set(columns.map((column) => column.id));
  const defaultConfig = getDefaultCustomerViewConfig(columns);
  if (Array.isArray(value)) {
    const visibleColumnIds = value.filter((id): id is string => typeof id === 'string' && validIds.has(id));
    return { ...defaultConfig, visibleColumnIds: visibleColumnIds.length ? visibleColumnIds : defaultConfig.visibleColumnIds };
  }
  if (!value || typeof value !== 'object') return defaultConfig;
  const config = value as Partial<CustomerViewConfig>;
  const visibleColumnIds = Array.isArray(config.visibleColumnIds)
    ? config.visibleColumnIds.filter((id): id is string => typeof id === 'string' && validIds.has(id))
    : defaultConfig.visibleColumnIds;
  const configuredOrder = Array.isArray(config.columnOrder)
    ? config.columnOrder.filter((id): id is string => typeof id === 'string' && validIds.has(id))
    : [];
  const missingOrderIds = columns.map((column) => column.id).filter((id) => !configuredOrder.includes(id));
  const frozenColumnCount = Number.isFinite(config.frozenColumnCount)
    ? Math.max(0, Math.min(Number(config.frozenColumnCount), visibleColumnIds.length + 1))
    : defaultConfig.frozenColumnCount;
  return {
    visibleColumnIds: visibleColumnIds.length ? visibleColumnIds : defaultConfig.visibleColumnIds,
    columnOrder: [...configuredOrder, ...missingOrderIds],
    frozenColumnCount,
  };
};

const readCustomerViewConfig = (columns: CustomerColumn[]) => {
  try {
    const raw = localStorage.getItem(CUSTOMER_VIEW_STORAGE_KEY);
    if (!raw) return getDefaultCustomerViewConfig(columns);
    const parsed = JSON.parse(raw);
    return normalizeCustomerViewConfig(parsed, columns);
  } catch {
    return getDefaultCustomerViewConfig(columns);
  }
};

const Customers: React.FC = () => {
  const navigate = useNavigate();
  const { items, filters, pagination, fetchItems, setFilters } = useCustomerStore();
  const currentUser = useAuthStore((state) => state.currentUser);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [orderCustomer, setOrderCustomer] = useState<Customer | null>(null);
  const [submittedOrderApplication, setSubmittedOrderApplication] = useState<OrderApplication | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [lifecycleConfigs, setLifecycleConfigs] = useState<LifecycleStatusConfig[]>([]);
  const [customerLevelConfigs, setCustomerLevelConfigs] = useState<CustomerLevelConfig[]>([]);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [customerScope, setCustomerScope] = useState<CustomerScope>('active');
  const [releaseTarget, setReleaseTarget] = useState<Customer | null>(null);
  const [releaseReason, setReleaseReason] = useState('');
  const columns = useMemo(() => buildCustomerColumns(lifecycleConfigs), [lifecycleConfigs]);
  const customerLevelOptions = useMemo(() => {
    const activeConfigs = customerLevelConfigs.filter((item) => item.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
    return activeConfigs.length
      ? activeConfigs.map((item) => ({ value: item.value, label: item.label, color: item.color }))
      : CUSTOMER_LEVELS;
  }, [customerLevelConfigs]);
  const [viewConfig, setViewConfig] = useState<CustomerViewConfig>(() => readCustomerViewConfig(buildCustomerColumns([])));
  const [columnWidths, setColumnWidths] = useState<ColumnWidthMap>(() => readColumnWidths(CUSTOMER_WIDTH_STORAGE_KEY, DEFAULT_COLUMN_WIDTHS));

  useEffect(() => {
    fetchItems();
    settingsApi.fetchUsers({ isActive: true }).then((res) => {
      if (res.code === 0) {
        setUsers(res.data.filter((user) => user.isActive));
      }
    });
    settingsApi.fetchLifecycleStatusConfigs().then((res) => {
      if (res.code === 0) setLifecycleConfigs(res.data);
    });
    settingsApi.fetchCustomerLevelConfigs().then((res) => {
      if (res.code === 0) setCustomerLevelConfigs(res.data);
    });
  }, [fetchItems]);

  useEffect(() => {
    localStorage.setItem(CUSTOMER_VIEW_STORAGE_KEY, JSON.stringify(viewConfig));
  }, [viewConfig]);

  useEffect(() => {
    writeColumnWidths(CUSTOMER_WIDTH_STORAGE_KEY, columnWidths);
  }, [columnWidths]);

  const orderedColumns = useMemo(() => {
    const columnMap = new Map(columns.map((column) => [column.id, column]));
    const ordered = viewConfig.columnOrder
      .map((columnId) => columnMap.get(columnId))
      .filter((column): column is CustomerColumn => Boolean(column));
    const missing = columns.filter((column) => !viewConfig.columnOrder.includes(column.id));
    return [...ordered, ...missing];
  }, [columns, viewConfig.columnOrder]);
  const visibleColumnIds = viewConfig.visibleColumnIds;
  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => visibleColumnIds.includes(column.id)),
    [orderedColumns, visibleColumnIds],
  );
  const frozenColumnCount = Math.min(viewConfig.frozenColumnCount, visibleColumns.length + 1);
  const visibleOwnerUsers = useMemo(() => filterUsersByCurrentDataScope(users), [users]);
  const tableMinWidth = useMemo(
    () => columnWidths.name + visibleColumns.reduce((sum, column) => sum + (columnWidths[column.id] || 0), 0) + CUSTOMER_ACTION_COLUMN_WIDTH,
    [columnWidths, visibleColumns],
  );

  const handleViewDetail = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailOpen(true);
  };

  const getCurrentUserName = () => currentUser?.name || currentUser?.account || '';

  const isPublicPoolCustomer = (customer: Customer) => normalizeLifecycleStatusCode(customer.lifecycleStatusCode) === 'public_pool';

  const scopedFilters = (baseFilters: CustomerFilters = filters, scope: CustomerScope = customerScope): CustomerFilters => ({
    ...baseFilters,
    productLevel: undefined,
    lifecycleStatusCode: scope === 'public_pool' ? 'public_pool' : undefined,
  });

  const handleScopeChange = (_: React.SyntheticEvent, value: CustomerScope) => {
    setCustomerScope(value);
    const nextFilters = scopedFilters({ ...filters, page: 1, pageSize: pagination.pageSize || 10 }, value);
    setFilters(nextFilters);
    fetchItems(nextFilters);
  };

  const handleClaimCustomer = async (customer: Customer) => {
    const userName = getCurrentUserName();
    if (!userName) {
      window.alert('当前登录用户无效，请重新登录后再领取客户');
      return;
    }
    const res = await customerApi.claimCustomerFromPublicPool(customer.id, userName);
    if (res.code !== 0 || !res.data) {
      window.alert(res.message || '领取失败');
      return;
    }
    setSelectedCustomer((current) => (current?.id === customer.id ? res.data : current));
    fetchItems(scopedFilters());
  };

  const handleReleaseCustomer = (customer: Customer) => {
    setReleaseTarget(customer);
    setReleaseReason('');
  };

  const handleConfirmReleaseCustomer = async () => {
    if (!releaseTarget) return;
    const res = await customerApi.releaseCustomerToPublicPool(releaseTarget.id, releaseReason.trim() || '销售放弃跟进');
    if (res.code !== 0 || !res.data) {
      window.alert(res.message || '释放到公海失败');
      return;
    }
    setSelectedCustomer((current) => (current?.id === releaseTarget.id ? res.data : current));
    setReleaseTarget(null);
    setReleaseReason('');
    setCustomerScope('public_pool');
    const nextFilters = scopedFilters({ ...filters, page: 1, pageSize: pagination.pageSize || 10 }, 'public_pool');
    setFilters(nextFilters);
    fetchItems(nextFilters);
  };

  const handleCreate = () => {
    setFormOpen(true);
  };

  const handleCreateOrder = (customer: Customer) => {
    setOrderCustomer(customer);
    setOrderFormOpen(true);
    setDetailOpen(false);
  };

  const handleViewOrders = async (customer: Customer) => {
    setOrderCustomer(customer);
    const res = await orderApi.fetchOrders({ customerId: customer.id, pageSize: 100 });
    setCustomerOrders(res.code === 0 ? res.data.items : []);
    setOrdersOpen(true);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFilters = { ...filters, search: e.target.value, productLevel: undefined, page: 1, pageSize: pagination.pageSize || 10 };
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handleFilterChange = (key: string, value: string) => {
    if (key === 'lifecycleStatusCode') {
      setCustomerScope(value === 'public_pool' ? 'public_pool' : 'active');
    }
    const newFilters = { ...filters, productLevel: undefined, [key]: value || undefined, page: 1, pageSize: pagination.pageSize || 10 };
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
        frozenColumnCount: Math.min(current.frozenColumnCount, visibleColumnIds.length + 1),
      };
    });
  };

  const handleReorderColumn = (sourceColumnId: string, targetColumnId: string) => {
    setViewConfig((current) => {
      const columnOrder = current.columnOrder.length ? current.columnOrder : columns.map((column) => column.id);
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
      frozenColumnCount: Math.max(0, Math.min(value, current.visibleColumnIds.length + 1)),
    }));
  };

  const handleResetViewConfig = () => {
    setViewConfig(getDefaultCustomerViewConfig(columns));
    setColumnWidths(resetColumnWidths(DEFAULT_COLUMN_WIDTHS));
  };

  const handleResizeColumn = (id: string, delta: number) => {
    setColumnWidths((current) => resizeColumnWidths(current, id, delta));
  };

  const getFrozenLeft = (columnIndex: number) => {
    const widths = [columnWidths.name, ...visibleColumns.map((column) => columnWidths[column.id] || DEFAULT_COLUMN_WIDTHS[column.id] || 120)];
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
    width: CUSTOMER_ACTION_COLUMN_WIDTH,
    minWidth: CUSTOMER_ACTION_COLUMN_WIDTH,
    bgcolor: '#fff',
    boxShadow: '-1px 0 0 #e5e7eb',
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          客户管理
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsOpen(true)}>
            视图设置
          </Button>
          <PermissionGate permissionKey={PERMISSION_KEYS.CUSTOMER_CREATE} action="write">
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
              新增客户
            </Button>
          </PermissionGate>
        </Box>
      </Box>

      <Tabs value={customerScope} onChange={handleScopeChange} sx={{ mb: 2 }}>
        <Tab value="active" label="客户列表" />
        <Tab value="public_pool" label="公海池" />
      </Tabs>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          placeholder="搜索客户姓名/公司/电话/微信"
          value={filters.search || ''}
          onChange={handleSearch}
          size="small"
          sx={{ minWidth: 260 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>客户等级</InputLabel>
          <Select value={filters.customerLevel || ''} label="客户等级" onChange={(e) => handleFilterChange('customerLevel', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {customerLevelOptions.map((level) => (
              <MenuItem key={level.value} value={level.value}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: level.color }} />
                  {level.label}
                </Box>
              </MenuItem>
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
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>生命周期</InputLabel>
          <Select
            value={filters.lifecycleStatusCode || ''}
            label="生命周期"
            onChange={(e) => handleFilterChange('lifecycleStatusCode', e.target.value)}
          >
            <MenuItem value="">默认客户</MenuItem>
            {lifecycleConfigs.map((status) => (
              <MenuItem key={status.code} value={status.code}>{status.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0', overflowX: 'auto' }}>
        <Table sx={{ tableLayout: 'fixed', minWidth: tableMinWidth }}>
          <TableHead>
            <TableRow>
              <ResizableHeaderCell columnId="name" width={columnWidths.name} onResize={handleResizeColumn} sx={getFrozenColumnSx(0, true)}>姓名</ResizableHeaderCell>
              {visibleColumns.map((column, columnIndex) => (
                <ResizableHeaderCell
                  key={column.id}
                  columnId={column.id}
                  width={columnWidths[column.id]}
                  onResize={handleResizeColumn}
                  sx={getFrozenColumnSx(columnIndex + 1, true)}
                >
                  {column.label}
                </ResizableHeaderCell>
              ))}
              <TableCell align="center" sx={{ ...actionColumnSx, zIndex: 5, bgcolor: '#f8fafc' }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((customer) => (
              <TableRow key={customer.id} hover>
                <TableCell sx={{ ...getResizableCellSx(columnWidths.name), ...getFrozenColumnSx(0), fontWeight: 500 }} title={customer.name}>{customer.name}</TableCell>
                {visibleColumns.map((column, columnIndex) => (
                  <TableCell key={column.id} sx={{ ...getResizableCellSx(columnWidths[column.id]), ...getFrozenColumnSx(columnIndex + 1) }}>{column.render(customer)}</TableCell>
                ))}
                <TableCell align="center" sx={actionColumnSx}>
                  <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                    <Tooltip title="查看客户">
                      <IconButton size="small" color="primary" onClick={() => handleViewDetail(customer)}>
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <PermissionGate permissionKey={PERMISSION_KEYS.CUSTOMER_CREATE_ORDER} action="write">
                      <Tooltip title="提交订单申请">
                        <IconButton size="small" color="info" onClick={() => handleCreateOrder(customer)}>
                          <AddShoppingCartIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </PermissionGate>
                    <PermissionGate permissionKey={PERMISSION_KEYS.CUSTOMER_VIEW_ORDERS}>
                      <Tooltip title="查看订单">
                        <IconButton size="small" color="secondary" onClick={() => handleViewOrders(customer)}>
                          <ReceiptLongIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </PermissionGate>
                    {isPublicPoolCustomer(customer) ? (
                      <Tooltip title="重新领取公海客户">
                        <IconButton size="small" color="primary" onClick={() => handleClaimCustomer(customer)}>
                          <PersonAddAltIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Tooltip title="放弃到公海">
                        <IconButton size="small" color="warning" onClick={() => handleReleaseCustomer(customer)}>
                          <ExitToAppIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + 2} align="center" sx={{ py: 6, color: '#9ca3af' }}>
                  暂无客户数据
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

      {selectedCustomer && (
        <CustomerDetail
          customer={selectedCustomer}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          onCreateOrder={handleCreateOrder}
          onViewOrders={handleViewOrders}
          onUpdated={(updated) => {
            setSelectedCustomer(updated);
            fetchItems({ ...filters, productLevel: undefined });
          }}
        />
      )}

      <CustomerForm
        key="new"
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={() => fetchItems({ ...filters, productLevel: undefined })}
      />

      <OrderForm
        open={orderFormOpen}
        customer={orderCustomer}
        onClose={() => setOrderFormOpen(false)}
        onSuccess={(application) => {
          fetchItems({ ...filters, productLevel: undefined });
          if (application) setSubmittedOrderApplication(application);
        }}
      />

      <Dialog
        open={Boolean(submittedOrderApplication)}
        onClose={() => setSubmittedOrderApplication(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogCloseTitle onClose={() => setSubmittedOrderApplication(null)}>订单申请已提交</DialogCloseTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: '#374151', mb: 2 }}>
            该订单已进入财务审核，审核通过后才会生成正式订单、提成和交付记录。
          </Typography>
          {submittedOrderApplication && (
            <Box sx={{ display: 'grid', gap: 1, bgcolor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 1, p: 1.5 }}>
              <Typography variant="body2">申请编号：{submittedOrderApplication.applicationNo}</Typography>
              <Typography variant="body2">客户：{submittedOrderApplication.orderData.customerName}</Typography>
              <Typography variant="body2">订单类型：{submittedOrderApplication.orderData.orderType}</Typography>
              <Typography variant="body2">实付金额：{formatCurrency(submittedOrderApplication.orderData.actualAmount || submittedOrderApplication.orderData.amount)}</Typography>
              <Typography variant="body2">当前状态：{submittedOrderApplication.status}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSubmittedOrderApplication(null)}>知道了</Button>
          <Button
            variant="contained"
            onClick={() => {
              setSubmittedOrderApplication(null);
              navigate(`${ROUTES.ORDERS}?tab=review`);
            }}
          >
            查看审核进度
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(releaseTarget)} onClose={() => setReleaseTarget(null)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setReleaseTarget(null)}>放弃到公海</DialogCloseTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
            客户将从默认客户列表移入公海池，释放销售归属，后续可在“公海池”重新领取。
          </Typography>
          <TextField
            label="放弃原因"
            value={releaseReason}
            onChange={(event) => setReleaseReason(event.target.value)}
            placeholder="例如：客户暂无意向、联系不上、预算不匹配"
            multiline
            minRows={3}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReleaseTarget(null)}>取消</Button>
          <Button color="warning" variant="contained" onClick={handleConfirmReleaseCustomer}>确认放弃</Button>
        </DialogActions>
      </Dialog>

      <TableViewSettingsDialog
        open={viewSettingsOpen}
        title="客户列表视图设置"
        description="勾选后会显示在客户管理列表中，设置会保存在当前浏览器。"
        columns={columns}
        visibleColumnIds={visibleColumnIds}
        columnOrder={viewConfig.columnOrder}
        frozenColumnCount={viewConfig.frozenColumnCount}
        maxFrozenColumnCount={visibleColumns.length + 1}
        onClose={() => setViewSettingsOpen(false)}
        onToggleColumn={handleToggleColumn}
        onReorderColumn={handleReorderColumn}
        onFrozenColumnCountChange={handleFrozenColumnCountChange}
        onReset={handleResetViewConfig}
      />

      <Dialog open={ordersOpen} onClose={() => setOrdersOpen(false)} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={() => setOrdersOpen(false)}>{orderCustomer?.company || orderCustomer?.name} 的订单</DialogCloseTitle>
        <DialogContent dividers>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>订单号</TableCell>
                <TableCell>产品分类</TableCell>
                <TableCell>订单类型</TableCell>
                <TableCell>金额</TableCell>
                <TableCell>付款日期</TableCell>
                <TableCell>状态</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {customerOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{order.orderNo}</TableCell>
                  <TableCell>
                    <Chip
                      label={order.productLevel}
                      size="small"
                      sx={{ bgcolor: `${getProductLevelColor(order.productLevel)}18`, color: getProductLevelColor(order.productLevel), fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell>{order.orderType}</TableCell>
                  <TableCell>{formatCurrency(order.actualAmount || order.amount)}</TableCell>
                  <TableCell>{formatDate(order.payments?.[0]?.paidAt || order.createdAt)}</TableCell>
                  <TableCell>{order.status}</TableCell>
                </TableRow>
              ))}
              {customerOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#9ca3af' }}>
                    暂无订单
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions sx={{ display: 'none' }}>
          <PermissionGate permissionKey={PERMISSION_KEYS.CUSTOMER_CREATE_ORDER} action="write">
            <Button onClick={() => orderCustomer && handleCreateOrder(orderCustomer)}>提交订单申请</Button>
          </PermissionGate>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Customers;
