import React, { useEffect, useMemo, useState } from 'react';
import {
  useNavigate,
  useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import TablePagination from '../../shared/components/TablePagination';
import AddIcon from '@mui/icons-material/Add';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import FilterListIcon from '@mui/icons-material/FilterList';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SearchIcon from '@mui/icons-material/Search';
import useCustomerStore from '../../store/useCustomerStore';
import { customerApi, leadFlowApi, orderApi, settingsApi } from '../../api';
import { CUSTOMER_LEVELS, RESOURCE_OWNERSHIPS, ROUTES, getLifecycleConfigByCode, getLifecycleStatusTagSx, getProductLevelRowSx, getProductLevelTagSx, normalizeLifecycleStatusCode, normalizeResourceOwnership } from '../../shared/utils/constants';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import CustomerLevelBadge from '../../shared/components/CustomerLevelBadge';
import CustomerDetail from './CustomerDetail';
import CustomerForm from './CustomerForm';
import { formatPhoneForDisplay } from '../../shared/utils/phoneNumber';
import OrderForm from '../Orders/OrderForm';
import type { Customer, CustomerFilters } from '../../types/customer';
import type { LeadFlowConfig } from '../../types/lead';
import type { Order, OrderApplication } from '../../types/order';
import type { CustomerLevelConfig, LifecycleStatusConfig, User } from '../../types/settings';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import TableViewSettingsDialog from '../../shared/components/TableViewSettingsDialog';
import PermissionGate from '../../shared/auth/PermissionGate';
import { PERMISSION_KEYS } from '../../shared/utils/permissions';
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
import { isSuperAdminRoleName } from '../../shared/utils/roles';
import { ModuleHeader, ModulePage, ModuleToolbar, moduleTablePaperSx } from '../../shared/components/ModuleShell';
import { getScopedLeadAssignmentCandidates } from '../../shared/utils/leadAssignment';

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
  schemaVersion: number;
};

const CUSTOMER_VIEW_STORAGE_KEY = 'aaos_customer_table_view_v7';
const CUSTOMER_VIEW_SCHEMA_VERSION = 7;
const CUSTOMER_WIDTH_STORAGE_KEY = 'aaos_customer_table_column_widths_v2';
const CUSTOMER_ACTION_COLUMN_WIDTH = 190;
const formatCustomerSource = (customer: Customer) => [customer.leadSource, customer.sourceName].filter(Boolean).join('-') || '-';

const buildCustomerColumns = (lifecycleConfigs: LifecycleStatusConfig[], scope: CustomerScope = 'active'): CustomerColumn[] => {
  const getLifecycleConfig = (customer: Customer) => {
    const code = normalizeLifecycleStatusCode(customer.lifecycleStatusCode);
    return lifecycleConfigs.find((item) => item.code === code) || getLifecycleConfigByCode(code);
  };
  return [
  { id: 'name', label: '姓名', render: (customer) => customer.name || '-' },
  { id: 'company', label: '公司', render: (customer) => customer.company || '-' },
  { id: 'phone', label: '手机号', render: (customer) => formatPhoneForDisplay(customer.phone) || '-' },
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
          sx={getLifecycleStatusTagSx(`${config.code} ${config.name}`)}
        />
      );
    },
  },
  {
    id: 'customerLevel',
    label: '客户等级',
    render: (customer) => <CustomerLevelBadge level={customer.customerLevel} />,
  },
  {
    id: 'tags',
    label: '标签',
    render: (customer) => (
      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
        {customer.tags?.length ? customer.tags.map((tag) => (
          <Chip key={tag} label={tag} size="small" variant="outlined" sx={{ height: 22 }} />
        )) : '-'}
      </Box>
    ),
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
  {
    id: 'owner',
    label: scope === 'public_pool' ? '最后跟进人' : '销售负责人',
    render: (customer) => (scope === 'public_pool' ? (customer.releasedBy || customer.owner) : customer.owner) || '-',
  },
  { id: 'remark', label: '备注', render: (customer) => customer.remark || '-' },
  { id: 'createdAt', label: '创建时间', render: (customer) => formatDate(customer.createdAt, 'yyyy-MM-dd HH:mm:ss') },
  ];
};

const DEFAULT_VISIBLE_COLUMNS = [
  'name',
  'company',
  'phone',
  'lifecycleStatus',
  'customerLevel',
  'tags',
  'leadSource',
  'sourceType',
  'leadInputBy',
  'leadContributorName',
  'industry',
  'originalSalesTransferBy',
  'totalSpent',
  'orderCount',
  'owner',
  'remark',
  'createdAt',
];

const DEFAULT_COLUMN_WIDTHS: ColumnWidthMap = {
  name: 180,
  company: 220,
  phone: 150,
  wechat: 150,
  lifecycleStatus: 140,
  customerLevel: 130,
  tags: 180,
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
  remark: 220,
  createdAt: 180,
};

const getDefaultCustomerViewConfig = (columns: CustomerColumn[]): CustomerViewConfig => ({
  visibleColumnIds: DEFAULT_VISIBLE_COLUMNS.filter((id) => columns.some((column) => column.id === id)),
  columnOrder: columns.map((column) => column.id),
  frozenColumnCount: 0,
  schemaVersion: CUSTOMER_VIEW_SCHEMA_VERSION,
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
  if (config.schemaVersion !== CUSTOMER_VIEW_SCHEMA_VERSION) return defaultConfig;
  const visibleColumnIds = Array.isArray(config.visibleColumnIds)
    ? config.visibleColumnIds.filter((id): id is string => typeof id === 'string' && validIds.has(id))
    : defaultConfig.visibleColumnIds;
  const configuredOrder = Array.isArray(config.columnOrder)
    ? config.columnOrder.filter((id): id is string => typeof id === 'string' && validIds.has(id))
    : [];
  const missingOrderIds = columns.map((column) => column.id).filter((id) => !configuredOrder.includes(id));
  const frozenColumnCount = Number.isFinite(config.frozenColumnCount)
    ? Math.max(0, Math.min(Number(config.frozenColumnCount), visibleColumnIds.length))
    : defaultConfig.frozenColumnCount;
  return {
    visibleColumnIds: visibleColumnIds.length ? visibleColumnIds : defaultConfig.visibleColumnIds,
    columnOrder: [...configuredOrder, ...missingOrderIds],
    frozenColumnCount,
    schemaVersion: CUSTOMER_VIEW_SCHEMA_VERSION,
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

const getCustomerScopeFromTab = (tab?: string | null): CustomerScope => (
  tab === 'public_pool' ? 'public_pool' : 'active'
);

const FOLLOW_STATUS_OPTIONS = [
  { value: 'has_follow', label: '已跟进' },
  { value: 'no_follow', label: '未跟进' },
] as const;

const Customers: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const [leadFlowConfig, setLeadFlowConfig] = useState<LeadFlowConfig | null>(null);
  const [lifecycleConfigs, setLifecycleConfigs] = useState<LifecycleStatusConfig[]>([]);
  const [customerLevelConfigs, setCustomerLevelConfigs] = useState<CustomerLevelConfig[]>([]);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [customerScope, setCustomerScope] = useState<CustomerScope>(() => getCustomerScopeFromTab(searchParams.get('tab')));
  const [releaseTarget, setReleaseTarget] = useState<Customer | null>(null);
  const [releaseReason, setReleaseReason] = useState('');
  const [assignTarget, setAssignTarget] = useState<Customer | null>(null);
  const [assignOwner, setAssignOwner] = useState('');
  const [assignReason, setAssignReason] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [deleteCustomerTarget, setDeleteCustomerTarget] = useState<Customer | null>(null);
  const [deleteCustomerReason, setDeleteCustomerReason] = useState('');
  const [deleteCustomerSubmitting, setDeleteCustomerSubmitting] = useState(false);
  const { alert, dialog: feedbackDialog } = useAppFeedback();
  const columns = useMemo(() => buildCustomerColumns(lifecycleConfigs, customerScope), [customerScope, lifecycleConfigs]);
  const customerLevelOptions = useMemo(() => {
    const activeConfigs = customerLevelConfigs.filter((item) => item.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
    return activeConfigs.length
      ? activeConfigs.map((item) => ({ value: item.value, label: item.label, color: item.color }))
      : CUSTOMER_LEVELS;
  }, [customerLevelConfigs]);
  const [viewConfig, setViewConfig] = useState<CustomerViewConfig>(() => readCustomerViewConfig(buildCustomerColumns([], customerScope)));
  const [columnWidths, setColumnWidths] = useState<ColumnWidthMap>(() => readColumnWidths(CUSTOMER_WIDTH_STORAGE_KEY, DEFAULT_COLUMN_WIDTHS));

  useEffect(() => {
    fetchItems({
      ...filters,
      productLevel: undefined,
      lifecycleStatusCode: customerScope === 'public_pool' ? 'public_pool' : undefined,
    });
    settingsApi.fetchAssignableUsers({ isActive: true }).then((res) => {
      if (res.code === 0) {
        setUsers(res.data.filter((user) => user.isActive));
      }
    });
    leadFlowApi.fetchLeadFlowConfig().then((res) => {
      if (res.code === 0) setLeadFlowConfig(res.data);
    });
    settingsApi.fetchLifecycleStatusConfigs().then((res) => {
      if (res.code === 0) setLifecycleConfigs(res.data);
    });
    settingsApi.fetchCustomerLevelConfigs().then((res) => {
      if (res.code === 0) setCustomerLevelConfigs(res.data);
    });
  }, [currentUser?.id, fetchItems]);

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
  const frozenColumnCount = Math.min(viewConfig.frozenColumnCount, visibleColumns.length);
  const visibleOwnerUsers = useMemo(
    () => getScopedLeadAssignmentCandidates(users, leadFlowConfig, 'customers', currentUser),
    [currentUser, leadFlowConfig, users],
  );
  const isSuperAdmin = isSuperAdminRoleName(currentUser?.role);
  const isPublicPoolScope = customerScope === 'public_pool';
  const ownerFilterLabel = isPublicPoolScope ? '最后跟进人' : '销售负责人';
  const hasAdvancedFilters = Boolean(filters.sourceType || filters.leadSource || filters.industry || filters.city || filters.tag);
  const hasAnyActiveFilter = Boolean(
    filters.search
    || filters.customerLevel
    || filters.owner
    || filters.followStatus
    || hasAdvancedFilters
    || (!isPublicPoolScope && filters.lifecycleStatusCode),
  );
  const tableMinWidth = useMemo(
    () => visibleColumns.reduce((sum, column) => sum + (columnWidths[column.id] || 0), 0) + CUSTOMER_ACTION_COLUMN_WIDTH,
    [columnWidths, visibleColumns],
  );

  const handleViewDetail = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailOpen(true);
  };

  const getCurrentUserName = () => currentUser?.name || currentUser?.account || '';

  const isPublicPoolCustomer = (customer: Customer) => normalizeLifecycleStatusCode(customer.lifecycleStatusCode) === 'public_pool';
  const canCreateOrderForCustomer = (customer: Customer) => !isPublicPoolCustomer(customer);

  const scopedFilters = (baseFilters: CustomerFilters = filters, scope: CustomerScope = customerScope): CustomerFilters => ({
    ...baseFilters,
    productLevel: undefined,
    lifecycleStatusCode: scope === 'public_pool' ? 'public_pool' : undefined,
  });

  useEffect(() => {
    const nextScope = getCustomerScopeFromTab(searchParams.get('tab'));
    if (nextScope === customerScope) return;
    setCustomerScope(nextScope);
    const nextFilters = scopedFilters({ ...filters, page: 1, pageSize: pagination.pageSize || 10 }, nextScope);
    setFilters(nextFilters);
    fetchItems(nextFilters);
  }, [searchParams]);

  const handleClaimCustomer = async (customer: Customer) => {
    const userName = getCurrentUserName();
    if (!userName) {
      alert('当前登录用户无效，请重新登录后再领取客户');
      return;
    }
    const res = await customerApi.claimCustomerFromPublicPool(customer.id, userName);
    if (res.code !== 0 || !res.data) {
      alert(res.message || '领取失败');
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
      alert(res.message || '释放到公海失败');
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

  const handleOpenAssignCustomer = (customer: Customer) => {
    setAssignTarget(customer);
    setAssignOwner(customer.owner || '');
    setAssignReason('');
  };

  const handleCloseAssignCustomer = () => {
    if (assignSubmitting) return;
    setAssignTarget(null);
    setAssignOwner('');
    setAssignReason('');
  };

  const handleConfirmAssignCustomer = async () => {
    if (!assignTarget || !assignOwner) return;
    setAssignSubmitting(true);
    try {
      const res = await customerApi.assignCustomerOwner(assignTarget.id, assignOwner, assignReason);
      if (res.code !== 0 || !res.data) {
        await alert(res.message || '分配客户失败');
        return;
      }
      setSelectedCustomer((current) => (current?.id === assignTarget.id ? res.data : current));
      setAssignTarget(null);
      setAssignOwner('');
      setAssignReason('');
      fetchItems(scopedFilters());
    } finally {
      setAssignSubmitting(false);
    }
  };

  const handleOpenDeleteCustomer = (customer: Customer) => {
    setDeleteCustomerTarget(customer);
    setDeleteCustomerReason('');
  };

  const handleCloseDeleteCustomer = () => {
    setDeleteCustomerTarget(null);
    setDeleteCustomerReason('');
  };

  const handleConfirmDeleteCustomer = async () => {
    if (!deleteCustomerTarget) return;
    const reason = deleteCustomerReason.trim();
    if (!reason) return;
    setDeleteCustomerSubmitting(true);
    try {
      const res = await customerApi.deleteCustomer(deleteCustomerTarget.id, reason);
      if (res.code !== 0) {
        await alert(res.message || '删除客户失败');
        return;
      }
      handleCloseDeleteCustomer();
      fetchItems(scopedFilters());
    } finally {
      setDeleteCustomerSubmitting(false);
    }
  };

  const handleCreate = () => {
    setFormOpen(true);
  };

  const handleCreateOrder = (customer: Customer) => {
    if (!canCreateOrderForCustomer(customer)) {
      alert('公海客户需要先领取后才能提交订单申请');
      return;
    }
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

  const handleResetFilters = () => {
    const newFilters = scopedFilters({ page: 1, pageSize: pagination.pageSize || 10 }, customerScope);
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
      frozenColumnCount: Math.max(0, Math.min(value, current.visibleColumnIds.length)),
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
    width: CUSTOMER_ACTION_COLUMN_WIDTH,
    minWidth: CUSTOMER_ACTION_COLUMN_WIDTH,
    bgcolor: '#fff',
    boxShadow: '-1px 0 0 #e5e7eb',
  };

  return (
    <ModulePage>
      <ModuleHeader
        title={isPublicPoolScope ? '公海池' : '客户管理'}
        description={isPublicPoolScope ? '集中管理已释放客户，支持重新领取和后续跟进。' : '沉淀客户资产、跟进动态和订单关系。'}
        actions={(
          <>
          <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsOpen(true)}>
            视图设置
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
            新增客户
          </Button>
          </>
        )}
      />


      <ModuleToolbar>
        <TextField
          placeholder="搜索客户姓名/公司/电话/微信"
          value={filters.search || ''}
          onChange={handleSearch}
          size="small"
          sx={{ minWidth: { xs: '100%', sm: 260 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
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
          <InputLabel>{ownerFilterLabel}</InputLabel>
          <Select value={filters.owner || ''} label={ownerFilterLabel} onChange={(e) => handleFilterChange('owner', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {visibleOwnerUsers.map((user) => (
              <MenuItem key={user.id} value={user.name}>{user.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {!isPublicPoolScope && (
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
        )}
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>跟进状态</InputLabel>
          <Select
            value={filters.followStatus || ''}
            label="跟进状态"
            onChange={(e) => handleFilterChange('followStatus', e.target.value)}
          >
            <MenuItem value="">全部</MenuItem>
            {FOLLOW_STATUS_OPTIONS.map((status) => (
              <MenuItem key={status.value} value={status.value}>{status.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="outlined"
          startIcon={<FilterListIcon />}
          onClick={() => setMoreFiltersOpen((open) => !open)}
          sx={{ height: 40, px: 1.75, fontWeight: 700 }}
        >
          更多筛选
        </Button>
        <Box sx={{ flexGrow: 1, minWidth: { xs: '100%', md: 16 } }} />
        <Button
          variant="outlined"
          startIcon={<RestartAltIcon />}
          onClick={handleResetFilters}
          color={hasAnyActiveFilter ? 'primary' : 'inherit'}
          sx={{ height: 40, px: 1.75, fontWeight: 700 }}
        >
          重置
        </Button>
        <Collapse in={moreFiltersOpen} sx={{ width: '100%' }}>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', pt: 0.5 }}>
            <FormControl size="small" sx={{ minWidth: 140, bgcolor: '#fff' }}>
              <InputLabel>资源归属</InputLabel>
              <Select
                value={filters.sourceType || ''}
                label="资源归属"
                onChange={(e) => handleFilterChange('sourceType', e.target.value)}
              >
                <MenuItem value="">全部</MenuItem>
                {RESOURCE_OWNERSHIPS.map((item) => (
                  <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="线索来源"
              value={filters.leadSource || ''}
              onChange={(e) => handleFilterChange('leadSource', e.target.value)}
              size="small"
              sx={{ minWidth: 150 }}
            />
            <TextField
              label="行业"
              value={filters.industry || ''}
              onChange={(e) => handleFilterChange('industry', e.target.value)}
              size="small"
              sx={{ minWidth: 130 }}
            />
            <TextField
              label="城市"
              value={filters.city || ''}
              onChange={(e) => handleFilterChange('city', e.target.value)}
              size="small"
              sx={{ minWidth: 130 }}
            />
            <TextField
              label="客户标签"
              value={filters.tag || ''}
              onChange={(e) => handleFilterChange('tag', e.target.value)}
              size="small"
              sx={{ minWidth: 150 }}
            />
          </Box>
        </Collapse>
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
            {items.map((customer) => (
              <TableRow key={customer.id} hover>
                {visibleColumns.map((column, columnIndex) => (
                  <TableCell
                    key={column.id}
                    sx={{
                      ...getResizableCellSx(columnWidths[column.id]),
                      ...getFrozenColumnSx(columnIndex),
                      ...(column.id === 'name' ? { fontWeight: 500 } : {}),
                    }}
                    title={column.id === 'name' ? customer.name : undefined}
                  >
                    {column.render(customer)}
                  </TableCell>
                ))}
                <TableCell align="center" sx={actionColumnSx}>
                  <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                    {isSuperAdmin && (
                      <Tooltip title="删除客户到业务回收站">
                        <IconButton size="small" color="error" onClick={() => handleOpenDeleteCustomer(customer)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="查看客户">
                      <IconButton size="small" color="primary" onClick={() => handleViewDetail(customer)}>
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {canCreateOrderForCustomer(customer) && (
                    <PermissionGate permissionKey={PERMISSION_KEYS.CUSTOMER_CREATE_ORDER}>
                      <Tooltip title="提交订单申请">
                        <IconButton size="small" color="info" onClick={() => handleCreateOrder(customer)}>
                          <AddShoppingCartIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </PermissionGate>
                    )}
                    <PermissionGate permissionKey={PERMISSION_KEYS.CUSTOMER_VIEW_ORDERS}>
                      <Tooltip title="查看订单">
                        <IconButton size="small" color="secondary" onClick={() => handleViewOrders(customer)}>
                          <ReceiptLongIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </PermissionGate>
                    {!isPublicPoolCustomer(customer) && (
                      <PermissionGate permissionKey={PERMISSION_KEYS.CUSTOMER_ASSIGN}>
                        <Tooltip title="分配销售">
                          <IconButton size="small" color="info" onClick={() => handleOpenAssignCustomer(customer)}>
                            <AssignmentIndIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </PermissionGate>
                    )}
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
                <TableCell colSpan={visibleColumns.length + 1} align="center" sx={{ py: 6, color: '#9ca3af' }}>
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
              <Typography variant="body2">产品名称：{submittedOrderApplication.orderData.productName || submittedOrderApplication.orderData.productLevel || '-'}</Typography>
              <Typography variant="body2">产品等级：{submittedOrderApplication.orderData.productLevel || '-'}</Typography>
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

      <Dialog open={Boolean(assignTarget)} onClose={handleCloseAssignCustomer} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={handleCloseAssignCustomer}>分配销售</DialogCloseTitle>
        <DialogContent dividers>
          {assignTarget && (
            <Box sx={{ display: 'grid', gap: 1, bgcolor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 1, p: 1.5, mb: 2 }}>
              <Typography variant="body2">客户：{assignTarget.company || assignTarget.name}</Typography>
              <Typography variant="body2">当前负责人：{assignTarget.owner || '-'}</Typography>
            </Box>
          )}
          <FormControl size="small" fullWidth required sx={{ mb: 2 }}>
            <InputLabel>新的销售负责人</InputLabel>
            <Select
              value={assignOwner}
              label="新的销售负责人"
              onChange={(event) => setAssignOwner(event.target.value)}
            >
              {visibleOwnerUsers.length === 0 && (
                <MenuItem value="" disabled>
                  当前角色数据范围内暂无可分配成员，请检查数据范围或线索流转参与成员配置。
                </MenuItem>
              )}
              {visibleOwnerUsers.map((user) => (
                <MenuItem key={user.id} value={user.name}>{user.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="分配原因"
            value={assignReason}
            onChange={(event) => setAssignReason(event.target.value)}
            placeholder="例如：主管调整、客户无人跟进、转交给更合适的销售"
            multiline
            minRows={3}
            fullWidth
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAssignCustomer} disabled={assignSubmitting}>取消</Button>
          <Button variant="contained" onClick={handleConfirmAssignCustomer} disabled={!assignOwner || assignSubmitting}>
            保存分配
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteCustomerTarget)} onClose={deleteCustomerSubmitting ? undefined : handleCloseDeleteCustomer} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => {
          if (!deleteCustomerSubmitting) handleCloseDeleteCustomer();
        }}>删除客户</DialogCloseTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
            删除后客户会进入业务回收站。有关联订单的客户不会被删除，请先处理订单。
          </Typography>
          {deleteCustomerTarget && (
            <Box sx={{ p: 1.5, border: '1px solid #fee2e2', borderRadius: 1, bgcolor: '#fff7ed', mb: 2 }}>
              <Typography variant="body2">客户：{deleteCustomerTarget.company || deleteCustomerTarget.name}</Typography>
              <Typography variant="body2">负责人：{deleteCustomerTarget.owner || '-'}</Typography>
            </Box>
          )}
          <TextField
            label="删除原因"
            value={deleteCustomerReason}
            onChange={(event) => setDeleteCustomerReason(event.target.value)}
            placeholder="例如：测试客户、重复沉淀、无效客户"
            multiline
            minRows={3}
            required
            fullWidth
            autoFocus
            error={!deleteCustomerReason.trim()}
            helperText={!deleteCustomerReason.trim() ? '删除原因不能为空' : ' '}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteCustomer} disabled={deleteCustomerSubmitting}>取消</Button>
          <Button color="error" variant="contained" onClick={handleConfirmDeleteCustomer} disabled={!deleteCustomerReason.trim() || deleteCustomerSubmitting}>
            确认删除
          </Button>
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
        maxFrozenColumnCount={visibleColumns.length}
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
                <TableCell>产品名称</TableCell>
                <TableCell>产品等级</TableCell>
                <TableCell>订单类型</TableCell>
                <TableCell>金额</TableCell>
                <TableCell>付款日期</TableCell>
                <TableCell>状态</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {customerOrders.map((order) => (
                <TableRow key={order.id} sx={getProductLevelRowSx(order.productLevel)}>
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
                  <TableCell>{order.status}</TableCell>
                </TableRow>
              ))}
              {customerOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: '#9ca3af' }}>
                    暂无订单
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions sx={{ display: 'none' }}>
          {orderCustomer && canCreateOrderForCustomer(orderCustomer) && (
          <PermissionGate permissionKey={PERMISSION_KEYS.CUSTOMER_CREATE_ORDER}>
            <Button onClick={() => orderCustomer && handleCreateOrder(orderCustomer)}>提交订单申请</Button>
          </PermissionGate>
          )}
        </DialogActions>
      </Dialog>
      {feedbackDialog}
    </ModulePage>
  );
};

export default Customers;

