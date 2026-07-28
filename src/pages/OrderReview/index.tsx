import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  FormControl,
  IconButton,
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
  useMediaQuery,
} from '@mui/material';
import type { Theme } from '@mui/material/styles';
import TablePagination from '../../shared/components/TablePagination';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import BlockIcon from '@mui/icons-material/Block';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SortIcon from '@mui/icons-material/Sort';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { customerApi, orderApi, orderReviewApi, ORDER_APPLICATION_STATUSES } from '../../api';
import type { Order, OrderApplication, OrderApplicationFilters, OrderApplicationStatus } from '../../types/order';
import type { Customer } from '../../types/customer';
import type { Role } from '../../types/role';
import { formatCurrency, formatEmployeeNameWithPosition, formatLeadSourceLabel, formatPaginationRows } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import { BusinessDetailField, BusinessDetailSection } from '../../shared/components/BusinessDetailSection';
import BusinessSummaryGrid from '../../shared/components/BusinessSummaryGrid';
import TableViewSettingsDialog from '../../shared/components/TableViewSettingsDialog';
import CustomerDetail from '../Customers/CustomerDetail';
import OrderForm from '../Orders/OrderForm';
import { getProductLevelRowSx, getProductLevelTagSx, normalizeResourceOwnership, ROUTES, STORAGE_KEYS } from '../../shared/utils/constants';
import { getCurrentOperatorUser } from '../../shared/utils/currentOperator';
import { hasPermission, isSuperAdminUser, PERMISSION_KEYS } from '../../shared/utils/permissions';
import { getStorageData } from '../../api/mock/storage';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import AttachmentPreviewLink from '../../shared/components/AttachmentPreview';
import BusinessAttachmentLinks from '../../shared/components/BusinessAttachmentLinks';
import {
  REVIEW_QUEUE_OPTIONS,
  getOrderApplicationUnifiedReviewStatus,
  getOrderApplicationReviewStatuses,
  type ReviewQueueView,
} from '../../shared/utils/reviewQueue';
import BusinessStatusChip from '../../shared/components/BusinessStatusChip';
import BusinessImportReviewControls from '../../shared/components/BusinessImportReviewControls';
import {
  isImportedPendingReviewRecord,
  toggleImportedReviewId,
  type BusinessImportReviewSelection,
} from '../../shared/utils/businessImportReviewModel';
import useAuthStore from '../../store/useAuthStore';
import BusinessImportReviewPageCheckbox from '../../shared/components/BusinessImportReviewPageCheckbox';
import { createOrderReviewLoadGate } from './orderReviewLoadGate';
import type { User } from '../../types/settings';

type ReviewAction = {
  type: 'approve' | 'return' | 'reject';
  application: OrderApplication;
} | null;

type ReviewOutcome = {
  type: 'return' | 'reject';
  application: OrderApplication;
};

type OrderReviewProps = {
  embedded?: boolean;
  importBatchId?: string;
  refreshSignal?: number;
  onImportBatchClear?: () => void;
  viewSettingsOpen?: boolean;
  onViewSettingsClose?: () => void;
};

type ReviewColumn = {
  id: string;
  label: string;
};

type ReviewViewConfig = {
  visibleColumnIds: string[];
  columnOrder: string[];
  frozenColumnCount: number;
  schemaVersion: number;
};

const REVIEW_VIEW_STORAGE_KEY = 'aaos_order_review_table_view_v1';
const REVIEW_VIEW_SCHEMA_VERSION = 3;
const REVIEW_ACTION_COLUMN_WIDTH = 184;

const REVIEW_COLUMNS: ReviewColumn[] = [
  { id: 'applicationNo', label: '内部单据编号' },
  { id: 'status', label: '审核状态' },
  { id: 'customer', label: '客户' },
  { id: 'productName', label: '产品名称' },
  { id: 'productLevel', label: '产品等级' },
  { id: 'orderType', label: '订单类型' },
  { id: 'amount', label: '实付金额' },
  { id: 'officialPaymentChannel', label: '官方收款渠道' },
  { id: 'thirdPartyOrderNo', label: '第三方平台订单' },
  { id: 'resourceOwnership', label: '资源归属' },
  { id: 'owner', label: '销售负责人' },
  { id: 'applicantName', label: '订单创建人' },
  { id: 'paymentAt', label: '付款时间' },
  { id: 'submittedAt', label: '提交时间' },
  { id: 'orderNo', label: '正式订单号' },
  { id: 'leadInputBy', label: '线索录入人' },
  { id: 'leadContributorName', label: '线索贡献人' },
  { id: 'reviewerName', label: '审核人' },
  { id: 'reviewedAt', label: '审核时间' },
  { id: 'reason', label: '退回/驳回原因' },
  { id: 'notes', label: '备注' },
  { id: 'importBatchId', label: '导入批次' },
  { id: 'importRowNumber', label: 'Excel 行号' },
  { id: 'importedByName', label: '导入人' },
  { id: 'importedAt', label: '导入时间' },
];

const REVIEW_DEFAULT_VISIBLE_COLUMNS = [
  'status',
  'customer',
  'productName',
  'productLevel',
  'amount',
  'owner',
  'applicantName',
  'paymentAt',
  'submittedAt',
  'reviewerName',
  'reviewedAt',
  'reason',
];

const REVIEW_COLUMN_WIDTHS: Record<string, number> = {
  applicationNo: 180,
  status: 110,
  customer: 140,
  productName: 180,
  productLevel: 130,
  orderType: 150,
  amount: 130,
  officialPaymentChannel: 160,
  thirdPartyOrderNo: 180,
  resourceOwnership: 140,
  owner: 140,
  applicantName: 130,
  paymentAt: 160,
  submittedAt: 160,
  orderNo: 180,
  leadInputBy: 140,
  leadContributorName: 150,
  reviewerName: 130,
  reviewedAt: 160,
  reason: 180,
  notes: 220,
  importBatchId: 220,
  importRowNumber: 110,
  importedByName: 140,
  importedAt: 180,
};

const getDefaultReviewViewConfig = (): ReviewViewConfig => ({
  visibleColumnIds: REVIEW_DEFAULT_VISIBLE_COLUMNS,
  columnOrder: REVIEW_COLUMNS.map((column) => column.id),
  frozenColumnCount: 0,
  schemaVersion: REVIEW_VIEW_SCHEMA_VERSION,
});

const normalizeReviewViewConfig = (value: unknown): ReviewViewConfig => {
  const validIds = new Set(REVIEW_COLUMNS.map((column) => column.id));
  const defaultConfig = getDefaultReviewViewConfig();
  if (!value || typeof value !== 'object') return defaultConfig;
  const config = value as Partial<ReviewViewConfig>;
  if (config.schemaVersion !== REVIEW_VIEW_SCHEMA_VERSION) return defaultConfig;
  const visibleColumnIds = Array.isArray(config.visibleColumnIds)
    ? config.visibleColumnIds.filter((id): id is string => typeof id === 'string' && validIds.has(id))
    : defaultConfig.visibleColumnIds;
  const configuredOrder = Array.isArray(config.columnOrder)
    ? config.columnOrder.filter((id): id is string => typeof id === 'string' && validIds.has(id))
    : [];
  const missingOrderIds = REVIEW_COLUMNS.map((column) => column.id).filter((id) => !configuredOrder.includes(id));
  const frozenColumnCount = Number.isFinite(config.frozenColumnCount)
    ? Math.max(0, Math.min(Number(config.frozenColumnCount), visibleColumnIds.length))
    : defaultConfig.frozenColumnCount;
  return {
    visibleColumnIds: visibleColumnIds.length ? visibleColumnIds : defaultConfig.visibleColumnIds,
    columnOrder: [...configuredOrder, ...missingOrderIds],
    frozenColumnCount,
    schemaVersion: REVIEW_VIEW_SCHEMA_VERSION,
  };
};

const readReviewViewConfig = () => {
  try {
    const raw = localStorage.getItem(REVIEW_VIEW_STORAGE_KEY);
    if (!raw) return getDefaultReviewViewConfig();
    return normalizeReviewViewConfig(JSON.parse(raw));
  } catch {
    return getDefaultReviewViewConfig();
  }
};

const reviewActionText: Record<OrderApplication['reviewLogs'][number]['action'], string> = {
  submit: '提交申请',
  resubmit: '重新提交',
  approve: '审核入库',
  return: '退回修改',
  reject: '驳回终止',
};

function formatDate(value?: string, pattern = 'yyyy-MM-dd HH:mm') {
  if (!value) return '-';
  try {
    return format(new Date(value), pattern);
  } catch {
    return value;
  }
}

const OrderReview: React.FC<OrderReviewProps> = ({
  embedded = false,
  importBatchId = '',
  refreshSignal = 0,
  onImportBatchClear,
  viewSettingsOpen = false,
  onViewSettingsClose,
}) => {
  const mobileFullScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  const [items, setItems] = useState<OrderApplication[]>([]);
  const [reviewQueueView, setReviewQueueView] = useState<ReviewQueueView>('pending');
  const [filters, setFilters] = useState<OrderApplicationFilters>({
    statuses: getOrderApplicationReviewStatuses('pending'),
    importBatchId: importBatchId || undefined,
    sortBy: 'createdAt',
    sortDirection: 'desc',
    page: 1,
    pageSize: 10,
  });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [ownerCandidates, setOwnerCandidates] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewConfig, setViewConfig] = useState<ReviewViewConfig>(readReviewViewConfig);
  const [editingApplication, setEditingApplication] = useState<OrderApplication | null>(null);
  const [detailApplication, setDetailApplication] = useState<OrderApplication | null>(null);
  const [detailFormalOrder, setDetailFormalOrder] = useState<{ applicationId: string; order: Order } | null>(null);
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [approvedApplication, setApprovedApplication] = useState<OrderApplication | null>(null);
  const [reviewOutcome, setReviewOutcome] = useState<ReviewOutcome | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [cleanupApplication, setCleanupApplication] = useState<OrderApplication | null>(null);
  const [cleanupReason, setCleanupReason] = useState('');
  const [cleanupSubmitting, setCleanupSubmitting] = useState(false);
  const [importSelection, setImportSelection] = useState<BusinessImportReviewSelection>({ mode: 'ids', ids: [] });
  const loadGateRef = React.useRef(createOrderReviewLoadGate());
  const reviewSubmittingRef = React.useRef(false);
  const currentAuthUser = useAuthStore((state) => state.currentUser);
  const reviewer = hasPermission(currentAuthUser, PERMISSION_KEYS.ORDER_REVIEW, 'write');
  const canCreateOrderApplication = hasPermission(currentAuthUser, PERMISSION_KEYS.ORDER_CREATE, 'write');
  const currentUser = currentAuthUser || getCurrentOperatorUser();
  const canCleanupReview = Boolean(currentUser && isSuperAdminUser(
    currentUser,
    getStorageData<Role[]>(STORAGE_KEYS.ROLES) || [],
  ));
  const { alert, dialog: feedbackDialog } = useAppFeedback();
  const navigate = useNavigate();

  const loadItems = async (nextFilters = filters) => {
    const attempt = loadGateRef.current.begin();
    setLoading(true);
    try {
      const res = await orderReviewApi.fetchOrderApplications(nextFilters, attempt.signal);
      if (!loadGateRef.current.isLatest(attempt.requestId)) return;
      if (res.code === 0) {
        setItems(res.data.items);
        setPagination(res.data.pagination);
      }
    } catch (error) {
      if (attempt.signal.aborted || !loadGateRef.current.isLatest(attempt.requestId)) return;
      throw error;
    } finally {
      if (loadGateRef.current.finish(attempt.requestId)) setLoading(false);
    }
  };

  useEffect(() => () => loadGateRef.current.dispose(), []);

  useEffect(() => {
    let active = true;
    orderReviewApi.fetchOwnerCandidates().then((response) => {
      if (active && response.code === 0) {
        setOwnerCandidates(response.data.filter((user) => user.isActive));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const nextFilters: OrderApplicationFilters = {
      ...filters,
      importBatchId: importBatchId || undefined,
      page: 1,
    };
    setFilters(nextFilters);
    setImportSelection({ mode: 'ids', ids: [] });
    void loadItems(nextFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importBatchId, refreshSignal]);

  useEffect(() => {
    localStorage.setItem(REVIEW_VIEW_STORAGE_KEY, JSON.stringify(viewConfig));
  }, [viewConfig]);

  const handleFilterChange = (key: keyof OrderApplicationFilters, value: string) => {
    const nextFilters = { ...filters, [key]: value || undefined, page: 1, pageSize: pagination.pageSize };
    setFilters(nextFilters);
    setImportSelection({ mode: 'ids', ids: [] });
    loadItems(nextFilters);
  };

  const handleReviewQueueViewChange = (view: ReviewQueueView) => {
    const nextFilters: OrderApplicationFilters = {
      ...filters,
      status: undefined,
      statuses: getOrderApplicationReviewStatuses(view),
      page: 1,
      pageSize: pagination.pageSize,
    };
    setReviewQueueView(view);
    setFilters(nextFilters);
    setImportSelection({ mode: 'ids', ids: [] });
    loadItems(nextFilters);
  };

  const handlePaymentDateSort = () => {
    const nextFilters: OrderApplicationFilters = {
      ...filters,
      sortBy: 'paymentDate',
      sortDirection: filters.sortBy === 'paymentDate' && filters.sortDirection === 'desc' ? 'asc' : 'desc',
      page: 1,
      pageSize: pagination.pageSize,
    };
    setFilters(nextFilters);
    setImportSelection({ mode: 'ids', ids: [] });
    loadItems(nextFilters);
  };

  const handleResetFilters = () => {
    const nextFilters: OrderApplicationFilters = {
      statuses: getOrderApplicationReviewStatuses('pending'),
      sortBy: 'createdAt',
      sortDirection: 'desc',
      page: 1,
      pageSize: pagination.pageSize,
    };
    setReviewQueueView('pending');
    setFilters(nextFilters);
    setImportSelection({ mode: 'ids', ids: [] });
    onImportBatchClear?.();
    loadItems(nextFilters);
  };

  const handlePageChange = (_event: React.MouseEvent<HTMLButtonElement> | null, page: number) => {
    const nextFilters = { ...filters, page: page + 1, pageSize: pagination.pageSize };
    setFilters(nextFilters);
    loadItems(nextFilters);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const nextFilters = { ...filters, page: 1, pageSize: Number(event.target.value) };
    setFilters(nextFilters);
    loadItems(nextFilters);
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
      const columnOrder = current.columnOrder.length ? current.columnOrder : REVIEW_COLUMNS.map((column) => column.id);
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
    setViewConfig(getDefaultReviewViewConfig());
  };

  const loadApplicationDetail = async (application: OrderApplication) => {
    const response = await orderReviewApi.fetchOrderApplicationById(application.id);
    if (response.code === 0 && response.data) return response.data;
    await alert(response.message || '订单申请详情加载失败');
    return null;
  };

  const openApplicationDetail = async (application: OrderApplication) => {
    setDetailApplication(application);
    setDetailFormalOrder(null);
    const detail = await loadApplicationDetail(application);
    if (!detail) {
      setDetailApplication((current) => current?.id === application.id ? null : current);
      return;
    }
    setDetailApplication((current) => current?.id === application.id ? detail : current);
    if (detail.orderId && !detail.sourceOrderDeleted) {
      const formalOrderResponse = await orderApi.fetchOrderById(detail.orderId);
      if (formalOrderResponse.code === 0
        && formalOrderResponse.data
        && formalOrderResponse.data.sourceApplicationId === application.id) {
        setDetailFormalOrder({ applicationId: application.id, order: formalOrderResponse.data });
      }
    }
  };

  const closeApplicationDetail = () => {
    setDetailApplication(null);
    setDetailFormalOrder(null);
  };

  const openApplicationEdit = async (application: OrderApplication) => {
    const detail = await loadApplicationDetail(application);
    if (detail) setEditingApplication(detail);
  };

  const openApproveDialog = (application: OrderApplication) => {
    setReviewAction({ type: 'approve', application });
    setReviewReason('');
    setReviewError('');
  };

  const openReturnDialog = (application: OrderApplication) => {
    setReviewAction({ type: 'return', application });
    setReviewReason('');
    setReviewError('');
  };

  const openRejectDialog = (application: OrderApplication) => {
    setReviewAction({ type: 'reject', application });
    setReviewReason('');
    setReviewError('');
  };

  const resetReviewDialog = () => {
    setReviewAction(null);
    setReviewReason('');
    setReviewError('');
    setReviewOutcome(null);
  };

  const closeReviewDialog = () => {
    if (reviewSubmittingRef.current) return;
    resetReviewDialog();
  };

  const openCleanupDialog = (application: OrderApplication) => {
    setCleanupApplication(application);
    setCleanupReason('');
  };

  const closeCleanupDialog = () => {
    setCleanupApplication(null);
    setCleanupReason('');
  };

  const submitReviewAction = async () => {
    if (!reviewAction || reviewSubmittingRef.current) return;
    const action = reviewAction;
    const reason = reviewReason.trim();
    if (action.type !== 'approve' && !reason) return;

    reviewSubmittingRef.current = true;
    setReviewSubmitting(true);
    setReviewError('');
    let shouldRefresh = false;

    try {
      const res = action.type === 'approve'
        ? await orderReviewApi.approveOrderApplication(action.application.id)
        : action.type === 'return'
          ? await orderReviewApi.returnOrderApplication(action.application.id, reason)
          : await orderReviewApi.rejectOrderApplication(action.application.id, reason);

      if (res.code !== 0 || !res.data) {
        setReviewError(res.message || '订单审核操作失败');
        return;
      }

      if (action.type === 'approve') {
        setApprovedApplication(res.data);
        resetReviewDialog();
      } else {
        setReviewOutcome({ type: action.type, application: res.data });
      }
      shouldRefresh = true;
    } catch (error) {
      const message = error instanceof Error && error.message.trim() ? error.message : '订单审核操作失败';
      setReviewError(message);
    } finally {
      reviewSubmittingRef.current = false;
      setReviewSubmitting(false);
    }

    if (shouldRefresh) await loadItems();
  };

  const handleCleanupApplication = async () => {
    if (!cleanupApplication) return;
    const reason = cleanupReason.trim();
    if (!reason) return;
    setCleanupSubmitting(true);
    try {
      const res = await orderReviewApi.cleanupDeletedSourceOrderApplication(cleanupApplication.id, reason);
      if (res.code !== 0) {
        await alert(res.message || '清理订单审核记录失败');
        return;
      }
      closeCleanupDialog();
      await loadItems();
    } finally {
      setCleanupSubmitting(false);
    }
  };

  const viewFormalOrder = (application?: OrderApplication | null) => {
    if (!application?.orderId) return;
    navigate(`${ROUTES.ORDERS}?tab=list&orderId=${encodeURIComponent(application.orderId)}`);
  };

  const viewReturnedReviewRecord = () => {
    if (!reviewOutcome) return;
    const target = reviewOutcome.application;
    closeReviewDialog();
    void openApplicationDetail(target);
  };

  const viewProcessedReviewRecords = () => {
    closeReviewDialog();
    handleReviewQueueViewChange('processed');
  };

  const handleViewCustomer = async (application: OrderApplication) => {
    const { customerId, customerName } = application.orderData;
    let customer: Customer | null = null;

    if (customerId) {
      const res = await customerApi.fetchCustomerById(customerId);
      if (res.code === 0) customer = res.data;
    }

    if (!customer) {
      const res = await customerApi.fetchCustomers({ search: customerName, pageSize: 20 });
      if (res.code === 0) {
        customer = res.data.items.find(
          (item) => item.company === customerName || item.name === customerName,
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

  const orderedColumns = useMemo(() => {
    const columnMap = new Map(REVIEW_COLUMNS.map((column) => [column.id, column]));
    const ordered = viewConfig.columnOrder
      .map((columnId) => columnMap.get(columnId))
      .filter((column): column is ReviewColumn => Boolean(column));
    const missing = REVIEW_COLUMNS.filter((column) => !viewConfig.columnOrder.includes(column.id));
    return [...ordered, ...missing];
  }, [viewConfig.columnOrder]);
  const visibleColumnIds = viewConfig.visibleColumnIds;
  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => visibleColumnIds.includes(column.id)),
    [orderedColumns, visibleColumnIds],
  );
  const frozenColumnCount = Math.min(viewConfig.frozenColumnCount, visibleColumns.length);
  const tableMinWidth = useMemo(
    () => visibleColumns.reduce((sum, column) => sum + (REVIEW_COLUMN_WIDTHS[column.id] || 140), 0) + REVIEW_ACTION_COLUMN_WIDTH,
    [visibleColumns],
  );

  const getFrozenLeft = (columnIndex: number) => visibleColumns
    .slice(0, columnIndex)
    .reduce((sum, column) => sum + (REVIEW_COLUMN_WIDTHS[column.id] || 140), 0);

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
    width: REVIEW_ACTION_COLUMN_WIDTH,
    minWidth: REVIEW_ACTION_COLUMN_WIDTH,
    bgcolor: '#fff',
    boxShadow: '-1px 0 0 #e5e7eb',
  };

  const renderReviewCell = (application: OrderApplication, columnId: string) => {
    switch (columnId) {
      case 'applicationNo':
        return (
          <Button
            variant="text"
            size="small"
            onClick={() => void openApplicationDetail(application)}
            sx={{ px: 0, minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', fontWeight: 700 }}
          >
            {application.applicationNo}
          </Button>
        );
      case 'orderNo':
        return application.orderNo ? (
          <Button variant="text" size="small" onClick={() => viewFormalOrder(application)} sx={{ px: 0 }}>
            {application.orderNo}
          </Button>
        ) : '-';
      case 'status':
        {
          const unifiedStatus = getOrderApplicationUnifiedReviewStatus(application.status, Boolean(application.sourceOrderDeleted));
          return <BusinessStatusChip status={unifiedStatus} />;
        }
      case 'customer':
        return (
          <Button
            variant="text"
            size="small"
            onClick={() => handleViewCustomer(application)}
            sx={{ p: 0, minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', fontWeight: 500 }}
          >
            {application.orderData.customerName}
          </Button>
        );
      case 'productName':
        return `${application.orderData.productName || application.orderData.productLevel || '-'}${(application.orderData.items?.length || 0) > 1 ? ` 等${application.orderData.items!.length}项` : ''}`;
      case 'productLevel':
        return (
          <Chip
            label={application.orderData.productLevel || '-'}
            size="small"
            sx={getProductLevelTagSx(application.orderData.productLevel)}
          />
        );
      case 'orderType':
        return <Chip label={application.orderData.orderType || '-'} size="small" variant="outlined" />;
      case 'amount':
        return formatCurrency(application.orderData.actualAmount || application.orderData.amount);
      case 'officialPaymentChannel':
        return application.orderData.officialPaymentChannel || '-';
      case 'thirdPartyOrderNo':
        return application.orderData.thirdPartyOrderNo || '-';
      case 'resourceOwnership':
        return normalizeResourceOwnership(application.orderData.resourceOwnership || application.orderData.sourceType);
      case 'owner':
        return application.orderData.owner || '-';
      case 'applicantName':
        return application.applicantName;
      case 'paymentAt':
        return formatDate(application.orderData.payments?.[0]?.paidAt);
      case 'submittedAt':
        return formatDate(application.submittedAt);
      case 'leadInputBy':
        return application.orderData.leadInputBy || '-';
      case 'leadContributorName':
        return application.orderData.leadContributorName || '-';
      case 'reviewerName':
        return application.reviewerName || '-';
      case 'reviewedAt':
        return formatDate(application.reviewedAt);
      case 'reason':
        return (
          <Tooltip title={application.reason || ''}>
            <Typography variant="body2" noWrap>{application.reason || '-'}</Typography>
          </Tooltip>
        );
      case 'notes':
        return (
          <Tooltip title={application.orderData.notes || ''}>
            <Typography variant="body2" noWrap>{application.orderData.notes || '-'}</Typography>
          </Tooltip>
        );
      case 'importBatchId':
        return application.importBatchId || '-';
      case 'importRowNumber':
        return application.importRowNumber || '-';
      case 'importedByName':
        return application.importedByName || '-';
      case 'importedAt':
        return formatDate(application.importedAt);
      default:
        return null;
    }
  };

  const isCurrentUserApplicant = (application: OrderApplication) => (
    Boolean(currentUser?.id && application.applicantId === currentUser.id)
    || Boolean(currentUser?.name && !application.applicantId && application.applicantName === currentUser.name)
  );

  const detailProductItems = useMemo(() => {
    const orderData = detailApplication?.orderData;
    if (!orderData) return [];
    return orderData.items?.length ? orderData.items : [{
      id: 'legacy-primary',
      productName: orderData.productName || orderData.productLevel || '-',
      productLevel: orderData.productLevel || '-',
      unitPrice: orderData.amount,
      quantity: 1,
      subtotal: orderData.amount,
      isPrimary: true,
    }];
  }, [detailApplication]);

  return (
    <Box sx={embedded ? { pt: 1 } : { p: 3 }}>
      {!embedded && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>订单审核台</Typography>
            <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
              销售提交后先进入审核台，财务审核通过才生成正式订单和提成。
            </Typography>
          </Box>
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="搜索客户、订单号或创建人"
          value={filters.search || ''}
          onChange={(event) => handleFilterChange('search', event.target.value)}
          sx={{ minWidth: 280 }}
        />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>销售负责人</InputLabel>
          <Select
            label="销售负责人"
            value={filters.owner || ''}
            onChange={(event) => handleFilterChange('owner', event.target.value)}
          >
            <MenuItem value="">全部</MenuItem>
            {ownerCandidates.map((user) => (
              <MenuItem key={user.id} value={user.name}>{formatEmployeeNameWithPosition(user)}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>审核视图</InputLabel>
          <Select
            label="审核视图"
            value={reviewQueueView}
            onChange={(event) => handleReviewQueueViewChange(event.target.value as ReviewQueueView)}
          >
            {REVIEW_QUEUE_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="付款开始"
          type="date"
          value={filters.paymentStartDate || ''}
          onChange={(event) => handleFilterChange('paymentStartDate', event.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          label="付款结束"
          type="date"
          value={filters.paymentEndDate || ''}
          onChange={(event) => handleFilterChange('paymentEndDate', event.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <Button variant="outlined" startIcon={<SortIcon />} onClick={handlePaymentDateSort}>
          {filters.sortBy === 'paymentDate'
            ? `付款时间${filters.sortDirection === 'asc' ? '升序' : '降序'}`
            : '按付款时间排序'}
        </Button>
        <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={handleResetFilters}>
          重置
        </Button>
      </Box>

      {reviewer ? (
        <Box sx={{ mb: 2 }}>
          <BusinessImportReviewControls
            module="orders"
            importBatchId={filters.importBatchId || ''}
            selection={importSelection}
            canReview={reviewer}
            onSelectionChange={setImportSelection}
            onRefresh={() => loadItems()}
          />
        </Box>
      ) : null}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0', overflowX: 'auto' }}>
        <Table sx={{ tableLayout: 'fixed', minWidth: tableMinWidth }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <BusinessImportReviewPageCheckbox
                  module="orders"
                  canReview={reviewer}
                  records={items}
                  selection={importSelection}
                  onSelectionChange={setImportSelection}
                  ariaLabel="选择当前页导入待审记录"
                />
              </TableCell>
              {visibleColumns.map((column, columnIndex) => (
                <TableCell
                  key={column.id}
                  sx={{
                    width: REVIEW_COLUMN_WIDTHS[column.id] || 140,
                    minWidth: REVIEW_COLUMN_WIDTHS[column.id] || 140,
                    maxWidth: REVIEW_COLUMN_WIDTHS[column.id] || 140,
                    ...getFrozenColumnSx(columnIndex, true),
                  }}
                >
                  {column.label}
                </TableCell>
              ))}
              <TableCell
                align="center"
                sx={{ ...actionColumnSx, zIndex: 5, bgcolor: '#f8fafc' }}
              >
                操作
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((application) => {
              const canFinanceOperate = reviewer && application.status === ORDER_APPLICATION_STATUSES.PENDING_REVIEW;
              const canResubmit = application.status === ORDER_APPLICATION_STATUSES.RETURNED
                && canCreateOrderApplication
                && isCurrentUserApplicant(application);
              const canViewFormalOrder = application.status === ORDER_APPLICATION_STATUSES.APPROVED
                && Boolean(application.orderId)
                && !application.sourceOrderDeleted;
              const canCleanupApplication = canCleanupReview
                && (application.status === ORDER_APPLICATION_STATUSES.REJECTED
                  || (application.status === ORDER_APPLICATION_STATUSES.APPROVED
                    && Boolean(application.orderId)
                    && Boolean(application.sourceOrderDeleted)));
              return (
                <TableRow key={application.id} hover sx={getProductLevelRowSx(application.orderData.productLevel)}>
                  <TableCell padding="checkbox">
                    <Checkbox
                      aria-label={`选择导入申请 ${application.applicationNo}`}
                      disabled={!reviewer
                        || importSelection.mode === 'batch'
                        || !isImportedPendingReviewRecord(application, 'orders')}
                      checked={importSelection.mode === 'batch'
                        ? application.importBatchId === importSelection.importBatchId
                          && isImportedPendingReviewRecord(application, 'orders')
                        : importSelection.ids.includes(application.id)}
                      onChange={() => {
                        if (!reviewer) return;
                        setImportSelection((selection) => toggleImportedReviewId(selection, application.id));
                      }}
                    />
                  </TableCell>
                  {visibleColumns.map((column, columnIndex) => (
                    <TableCell
                      key={column.id}
                      sx={{
                        width: REVIEW_COLUMN_WIDTHS[column.id] || 140,
                        minWidth: REVIEW_COLUMN_WIDTHS[column.id] || 140,
                        maxWidth: REVIEW_COLUMN_WIDTHS[column.id] || 140,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        ...getFrozenColumnSx(columnIndex),
                      }}
                    >
                      {renderReviewCell(application, column.id)}
                    </TableCell>
                  ))}
                  <TableCell align="center" sx={actionColumnSx}>
                    <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}>
                      <Tooltip title="查看审核详情">
                        <IconButton aria-label="查看审核详情" size="small" color="primary" onClick={() => void openApplicationDetail(application)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {canCleanupApplication && (
                        <Tooltip title={application.status === ORDER_APPLICATION_STATUSES.REJECTED ? '清理已驳回审核记录' : '清理已删除订单的审核记录'}>
                          <IconButton aria-label="清理订单审核记录" size="small" color="error" onClick={() => openCleanupDialog(application)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canFinanceOperate && (
                        <>
                          <Tooltip title="通过">
                            <IconButton aria-label="通过" size="small" sx={{ color: '#15803d' }} onClick={() => openApproveDialog(application)}>
                              <CheckCircleOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="退回修改">
                            <IconButton aria-label="退回修改" size="small" color="info" onClick={() => openReturnDialog(application)}>
                              <ReplayIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="驳回终止">
                            <IconButton aria-label="驳回终止" size="small" color="error" onClick={() => openRejectDialog(application)}>
                              <BlockIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {canResubmit && (
                        <Tooltip title="修改并重新提交">
                          <IconButton aria-label="修改并重新提交" size="small" color="primary" onClick={() => void openApplicationEdit(application)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canViewFormalOrder && (
                        <Tooltip title="查看正式订单">
                          <IconButton aria-label="查看正式订单" size="small" color="primary" onClick={() => viewFormalOrder(application)}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
            {!items.length && (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + 2} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                  {loading
                    ? '加载中...'
                    : reviewQueueView === 'pending'
                      ? '暂无待审核/退回修改订单申请'
                      : '当前审核视图暂无订单申请'}
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

      <TableViewSettingsDialog
        open={viewSettingsOpen}
        title="订单审核台视图设置"
        description="勾选后会显示在订单审核台列表中，设置会保存在当前浏览器。"
        columns={REVIEW_COLUMNS}
        visibleColumnIds={visibleColumnIds}
        columnOrder={viewConfig.columnOrder}
        frozenColumnCount={viewConfig.frozenColumnCount}
        maxFrozenColumnCount={visibleColumns.length}
        onClose={onViewSettingsClose || (() => undefined)}
        onToggleColumn={handleToggleColumn}
        onReorderColumn={handleReorderColumn}
        onFrozenColumnCountChange={handleFrozenColumnCountChange}
        onReset={handleResetViewConfig}
      />

      <OrderForm
        open={Boolean(editingApplication)}
        application={editingApplication}
        onClose={() => setEditingApplication(null)}
        onSuccess={() => {
          setEditingApplication(null);
          loadItems();
        }}
      />

      <Dialog open={Boolean(cleanupApplication)} onClose={cleanupSubmitting ? undefined : closeCleanupDialog} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => {
          if (!cleanupSubmitting) closeCleanupDialog();
        }}>清理订单审核记录</DialogCloseTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
            {cleanupApplication?.status === ORDER_APPLICATION_STATUSES.REJECTED
              ? '该申请已被驳回。清理后将从审核台隐藏，但仍保留清理人、原因和时间等审计留痕。'
              : '仅用于清理正式订单已经删除后的审核台残留记录。正式订单仍存在或尚未入库的申请不会被清理。'}
          </Typography>
          {cleanupApplication && (
            <Box sx={{ p: 1.5, border: '1px solid #fee2e2', borderRadius: 1, bgcolor: '#fff7ed', mb: 2 }}>
              <Typography variant="body2">内部单据编号：{cleanupApplication.applicationNo}</Typography>
              <Typography variant="body2">正式订单号：{cleanupApplication.orderNo || '-'}</Typography>
              <Typography variant="body2">客户：{cleanupApplication.orderData.customerName}</Typography>
            </Box>
          )}
          <TextField
            label="清理原因"
            value={cleanupReason}
            onChange={(event) => setCleanupReason(event.target.value)}
            placeholder={cleanupApplication?.status === ORDER_APPLICATION_STATUSES.REJECTED
              ? '例如：测试申请已驳回，清理审核台记录'
              : '例如：正式订单已删除，清理审核台残留记录'}
            multiline
            minRows={3}
            required
            fullWidth
            autoFocus
            error={!cleanupReason.trim()}
            helperText={!cleanupReason.trim() ? '清理原因不能为空' : ' '}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCleanupDialog} disabled={cleanupSubmitting}>取消</Button>
          <Button color="error" variant="contained" onClick={handleCleanupApplication} disabled={!cleanupReason.trim() || cleanupSubmitting}>
            确认清理
          </Button>
        </DialogActions>
      </Dialog>
      {selectedCustomer && (
        <CustomerDetail
          customer={selectedCustomer}
          open={customerOpen}
          onClose={() => setCustomerOpen(false)}
          onUpdated={(updated) => setSelectedCustomer(updated)}
          readOnly
        />
      )}

      <Dialog
        open={Boolean(reviewAction)}
        onClose={reviewSubmitting ? undefined : closeReviewDialog}
        disableEscapeKeyDown={reviewSubmitting}
        maxWidth="xs"
        fullWidth
      >
        <DialogCloseTitle onClose={closeReviewDialog} closeDisabled={reviewSubmitting}>
          {reviewOutcome
            ? reviewOutcome.type === 'return' ? '已退回修改' : '已驳回终止'
            : reviewAction?.type === 'approve' ? '确认订单入库' : reviewAction?.type === 'return' ? '退回修改' : '驳回终止'}
        </DialogCloseTitle>
        <DialogContent dividers>
          {reviewError && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {reviewError}
            </Alert>
          )}
          {reviewOutcome ? (
            <Box sx={{ display: 'grid', gap: 1.25 }}>
              <Typography variant="body2" sx={{ color: '#374151' }}>
                {reviewOutcome.type === 'return'
                  ? '已退回修改，创建人可修改后重新提交。'
                  : '已驳回终止，不会生成正式订单，不能重新提交。'}
              </Typography>
              <Box sx={{ p: 1.5, border: '1px solid #dbe3ef', borderRadius: 1, bgcolor: '#f8fafc' }}>
                <Typography variant="body2">内部单据编号：{reviewOutcome.application.applicationNo}</Typography>
                <Typography variant="body2">客户：{reviewOutcome.application.orderData.customerName}</Typography>
                <Typography variant="body2">产品名称：{reviewOutcome.application.orderData.productName || reviewOutcome.application.orderData.productLevel || '-'}</Typography>
              </Box>
            </Box>
          ) : reviewAction && (
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <Typography variant="body2" sx={{ color: '#4b5563' }}>
                {reviewAction.type === 'approve'
                  ? '审核通过后，这条申请会生成正式订单，并进入后续提成和交付流程。'
                  : reviewAction.type === 'return'
                    ? '请填写退回原因，销售可以按原因修改后重新提交。'
                    : '请填写驳回原因，驳回后该申请将结束，不会生成正式订单。'}
              </Typography>
              <Box sx={{ p: 1.5, border: '1px solid #e5e7eb', borderRadius: 1, bgcolor: '#f8fafc' }}>
                <Typography variant="body2">客户：{reviewAction.application.orderData.customerName}</Typography>
                <Typography variant="body2">
                  产品名称：{reviewAction.application.orderData.productName || reviewAction.application.orderData.productLevel || '-'}
                  {(reviewAction.application.orderData.items?.length || 0) > 1
                    ? ` 等 ${reviewAction.application.orderData.items!.length} 项`
                    : ''}
                </Typography>
                <Typography variant="body2">
                  产品等级/类型：{reviewAction.application.orderData.productLevel || '-'} / {reviewAction.application.orderData.orderType || '-'}
                </Typography>
                <Typography variant="body2">
                  产品总计：{formatCurrency(
                    reviewAction.application.orderData.standardTotalAmount
                    || reviewAction.application.orderData.amount,
                  )}
                </Typography>
                <Typography variant="body2">
                  实付金额：{formatCurrency(reviewAction.application.orderData.actualAmount || reviewAction.application.orderData.amount)}
                </Typography>
              </Box>
              {reviewAction.type !== 'approve' && (
                <TextField
                  label={reviewAction.type === 'return' ? '退回原因' : '驳回原因'}
                  value={reviewReason}
                  onChange={(event) => setReviewReason(event.target.value)}
                  disabled={reviewSubmitting}
                  placeholder={reviewAction.type === 'return' ? '例如：付款凭证不清晰，请补充后重提' : '例如：收款信息不匹配，无法入库'}
                  multiline
                  minRows={3}
                  required
                  fullWidth
                  autoFocus
                  error={!reviewReason.trim()}
                  helperText={!reviewReason.trim() ? '原因不能为空' : ' '}
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {reviewOutcome ? (
            <>
              <Button onClick={closeReviewDialog}>继续审核</Button>
              {reviewOutcome.type === 'return' ? (
                <Button variant="contained" onClick={viewReturnedReviewRecord}>查看审核详情</Button>
              ) : (
                <Button variant="contained" onClick={viewProcessedReviewRecords}>查看已处理记录</Button>
              )}
            </>
          ) : (
            <>
              <Button onClick={closeReviewDialog} disabled={reviewSubmitting}>取消</Button>
              <Button
                variant="contained"
                color={reviewAction?.type === 'reject' ? 'error' : reviewAction?.type === 'return' ? 'warning' : 'primary'}
                onClick={submitReviewAction}
                disabled={reviewSubmitting || ((reviewAction?.type === 'return' || reviewAction?.type === 'reject') && !reviewReason.trim())}
              >
                {reviewAction?.type === 'approve' ? '确认入库' : reviewAction?.type === 'return' ? '确认退回修改' : '确认驳回终止'}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(approvedApplication)} onClose={() => setApprovedApplication(null)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setApprovedApplication(null)}>订单已入库</DialogCloseTitle>
        <DialogContent dividers>
          {approvedApplication && (
            <Box sx={{ display: 'grid', gap: 1.25 }}>
              <Typography variant="body2" sx={{ color: '#374151' }}>
                财务审核已通过，系统已生成正式订单，并同步进入提成和交付流程。
              </Typography>
              <Box sx={{ p: 1.5, border: '1px solid #dbeafe', borderRadius: 1, bgcolor: '#eff6ff' }}>
                <Typography variant="body2">内部单据编号：{approvedApplication.applicationNo}</Typography>
                <Typography variant="body2">正式订单号：{approvedApplication.orderNo || '-'}</Typography>
                <Typography variant="body2">客户：{approvedApplication.orderData.customerName}</Typography>
                <Typography variant="body2">产品名称：{approvedApplication.orderData.productName || approvedApplication.orderData.productLevel || '-'}</Typography>
                <Typography variant="body2">产品等级：{approvedApplication.orderData.productLevel || '-'}</Typography>
                <Typography variant="body2">
                  实付金额：{formatCurrency(approvedApplication.orderData.actualAmount || approvedApplication.orderData.amount)}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApprovedApplication(null)}>继续审核</Button>
          <Button
            variant="contained"
            disabled={!approvedApplication?.orderId}
            onClick={() => {
              const target = approvedApplication;
              setApprovedApplication(null);
              viewFormalOrder(target);
            }}
          >
            查看正式订单
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(detailApplication)}
        onClose={closeApplicationDetail}
        maxWidth="md"
        fullWidth
        fullScreen={mobileFullScreen}
        PaperProps={{ sx: { maxHeight: { xs: '100dvh', sm: '94vh' }, bgcolor: '#f8fafc' } }}
      >
        {detailApplication && (
          <>
            <DialogCloseTitle onClose={closeApplicationDetail} sx={{ px: { xs: 2, sm: 3 }, py: 2, bgcolor: '#fff' }}>
              <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 850 }}>订单审核资料</Typography>
            </DialogCloseTitle>
            <DialogContent sx={{ px: { xs: 1.5, sm: 3 }, py: 2.5, bgcolor: '#f8fafc' }}>
              <BusinessSummaryGrid
                ariaLabel="订单审核摘要"
                desktopColumns="minmax(240px, 1.4fr) 120px 130px minmax(190px, 1fr)"
                sx={{ mb: 2.5 }}
                items={[
                  { label: '内部单据编号', value: detailApplication.applicationNo },
                  { label: '审核状态', value: <BusinessStatusChip status={getOrderApplicationUnifiedReviewStatus(detailApplication.status, Boolean(detailApplication.sourceOrderDeleted))} /> },
                  { label: '实付金额', value: formatCurrency(detailApplication.orderData.actualAmount ?? detailApplication.orderData.amount), strong: true },
                  { label: '提交时间', value: formatDate(detailApplication.submittedAt, 'yyyy-MM-dd HH:mm:ss') },
                ]}
              />

              <BusinessDetailSection step={1} title="客户信息" summary={`${detailApplication.orderData.customerName} / ${detailApplication.orderData.owner || '未分配'}`} columns={2}>
                <BusinessDetailField label="客户名称">{detailApplication.orderData.customerName}</BusinessDetailField>
                <BusinessDetailField label="销售负责人">{detailApplication.orderData.owner || '-'}</BusinessDetailField>
                <BusinessDetailField label="资源归属">
                  {normalizeResourceOwnership(detailApplication.orderData.resourceOwnership || detailApplication.orderData.sourceType)}
                </BusinessDetailField>
                <BusinessDetailField label="线索来源">
                  {formatLeadSourceLabel(detailApplication.orderData.leadSource, detailApplication.orderData.sourceName)}
                </BusinessDetailField>
                <BusinessDetailField label="线索录入人">{detailApplication.orderData.leadInputBy || '-'}</BusinessDetailField>
                <BusinessDetailField label="线索贡献人">{detailApplication.orderData.leadContributorName || '-'}</BusinessDetailField>
              </BusinessDetailSection>

              <BusinessDetailSection step={2} title="产品信息" summary={`${detailProductItems.length} 项 / ${formatCurrency(detailApplication.orderData.standardTotalAmount || detailApplication.orderData.amount)}`} columns={1}>
                <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
                  <TableContainer sx={{ display: { xs: 'none', sm: 'block' }, border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#fff' }}>
                    <Table size="small" sx={{ minWidth: 620, tableLayout: 'fixed' }}>
                      <TableHead><TableRow sx={{ bgcolor: '#f8fafc' }}>
                        <TableCell sx={{ width: '32%' }}>产品名称</TableCell>
                        <TableCell sx={{ width: '18%' }}>产品等级</TableCell>
                        <TableCell align="right">产品价格</TableCell>
                        <TableCell align="right">数量</TableCell>
                        <TableCell align="right">小计</TableCell>
                      </TableRow></TableHead>
                      <TableBody>
                        {detailProductItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 650 }}>{item.productName}</Typography>
                              {item.isPrimary ? <Chip label="主产品" size="small" color="primary" variant="outlined" sx={{ mt: 0.6, height: 20, fontSize: 11 }} /> : null}
                            </TableCell>
                            <TableCell><Chip label={item.productLevel} size="small" sx={getProductLevelTagSx(item.productLevel)} /></TableCell>
                            <TableCell align="right">{formatCurrency(item.unitPrice)}</TableCell>
                            <TableCell align="right">{item.quantity}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(item.subtotal)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell colSpan={4} align="right" sx={{ fontWeight: 700 }}>产品合计（{detailProductItems.length}项）</TableCell>
                          <TableCell align="right" sx={{ color: '#1d4ed8', fontWeight: 850 }}>{formatCurrency(detailApplication.orderData.standardTotalAmount || detailApplication.orderData.amount)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Box sx={{ display: { xs: 'grid', sm: 'none' }, gap: 1.25 }}>
                    {detailProductItems.map((item) => (
                      <Box key={`mobile-${item.id}`} sx={{ p: 1.5, border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#fff' }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 750, wordBreak: 'break-word' }}>{item.productName}</Typography>
                            <Box sx={{ mt: 0.75, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                              {item.isPrimary ? <Chip label="主产品" size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: 11 }} /> : null}
                              <Chip label={item.productLevel} size="small" sx={{ ...getProductLevelTagSx(item.productLevel), height: 20, fontSize: 11 }} />
                            </Box>
                          </Box>
                          <Typography variant="subtitle2" sx={{ flexShrink: 0, color: '#1d4ed8', fontWeight: 850 }}>{formatCurrency(item.subtotal)}</Typography>
                        </Box>
                        <Box sx={{ mt: 1.25, pt: 1.25, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, borderTop: '1px solid #e2e8f0' }}>
                          <BusinessDetailField label="产品价格">{formatCurrency(item.unitPrice)}</BusinessDetailField>
                          <BusinessDetailField label="数量">{item.quantity}</BusinessDetailField>
                        </Box>
                      </Box>
                    ))}
                    <Box sx={{ px: 1.5, py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, border: '1px solid #bfdbfe', borderRadius: 1.5, bgcolor: '#eff6ff' }}>
                      <Typography variant="body2" sx={{ fontWeight: 750 }}>产品合计（{detailProductItems.length}项）</Typography>
                      <Typography variant="subtitle2" sx={{ color: '#1d4ed8', fontWeight: 850 }}>{formatCurrency(detailApplication.orderData.standardTotalAmount || detailApplication.orderData.amount)}</Typography>
                    </Box>
                  </Box>
                </Box>
              </BusinessDetailSection>

              <BusinessDetailSection step={3} title="订单信息" columns={2}>
                <BusinessDetailField label="订单类型">{detailApplication.orderData.orderType || '-'}</BusinessDetailField>
                <BusinessDetailField label="第三方平台订单">{detailApplication.orderData.thirdPartyOrderNo || '-'}</BusinessDetailField>
                <BusinessDetailField label="正式订单号">{detailApplication.orderNo || '审核通过后生成'}</BusinessDetailField>
                <BusinessDetailField label="备注信息" wide>
                  <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{detailApplication.orderData.notes || '-'}</Typography>
                </BusinessDetailField>
                {detailFormalOrder?.applicationId === detailApplication.id
                  && (detailFormalOrder.order.thirdPartyOrderNo || '') !== (detailApplication.orderData.thirdPartyOrderNo || '') ? (
                  <Alert severity="info" sx={{ gridColumn: '1 / -1' }}>
                    提交审核时的第三方平台订单为“{detailApplication.orderData.thirdPartyOrderNo || '-'}”；
                    正式订单当前第三方平台订单为“{detailFormalOrder.order.thirdPartyOrderNo || '-'}”。
                  </Alert>
                ) : null}
              </BusinessDetailSection>

              <BusinessDetailSection step={4} title="收款与凭证" summary={`共 ${detailApplication.orderData.payments?.length || 0} 笔 / 实付 ${formatCurrency(detailApplication.orderData.actualAmount ?? detailApplication.orderData.amount)}`} columns={1}>
                <Box sx={{ gridColumn: '1 / -1', display: 'grid', gap: 1.5 }}>
                  {detailApplication.orderData.payments?.length ? detailApplication.orderData.payments.map((payment, index) => (
                    <Box key={payment.id} sx={{ border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#fff', overflow: 'hidden' }}>
                      <Box sx={{ px: 2, py: 1.25, display: 'flex', justifyContent: 'space-between', gap: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>第{index + 1}笔付款</Typography>
                        <Typography variant="subtitle2" sx={{ color: '#1d4ed8', fontWeight: 850 }}>{formatCurrency(payment.amount)}</Typography>
                      </Box>
                      <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                        <BusinessDetailField label="官方收款渠道">{detailApplication.orderData.officialPaymentChannel || payment.paymentMethod || '-'}</BusinessDetailField>
                        <BusinessDetailField label="付款时间">{formatDate(payment.paidAt, 'yyyy-MM-dd HH:mm:ss')}</BusinessDetailField>
                        <BusinessDetailField label="付款订单号">{payment.paymentOrderNo || '-'}</BusinessDetailField>
                        <BusinessDetailField label="付款截图">
                          {payment.attachments?.length
                            ? <BusinessAttachmentLinks attachments={payment.attachments} />
                            : <AttachmentPreviewLink title="付款截图" fileName={payment.voucherName} src={payment.voucherPreview} />}
                        </BusinessDetailField>
                        <BusinessDetailField label="付款备注" wide>{payment.remark || '-'}</BusinessDetailField>
                      </Box>
                    </Box>
                  )) : (
                    <Box sx={{ py: 3, textAlign: 'center', color: '#94a3b8', border: '1px dashed #cbd5e1', borderRadius: 1.5, bgcolor: '#fff' }}>暂无付款记录</Box>
                  )}
                  <Box sx={{ p: 2, border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#fff' }}>
                    <BusinessDetailField label="成交路径 / 聊天记录">
                      {detailApplication.orderData.dealEvidenceAttachments?.length
                        ? <BusinessAttachmentLinks attachments={detailApplication.orderData.dealEvidenceAttachments} />
                        : <AttachmentPreviewLink title="成交路径 / 聊天记录" fileName={detailApplication.orderData.dealEvidenceName} src={detailApplication.orderData.dealEvidencePreview} />}
                    </BusinessDetailField>
                  </Box>
                </Box>
              </BusinessDetailSection>

              <BusinessDetailSection step={5} title="审核与系统记录" summary={`${detailApplication.reviewLogs.length} 条记录`} defaultExpanded={false} columns={1}>
                <Box sx={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
                  <BusinessDetailField label="内部单据编号">{detailApplication.applicationNo}</BusinessDetailField>
                  <BusinessDetailField label="正式订单号">{detailApplication.orderNo || '审核通过后生成'}</BusinessDetailField>
                  <BusinessDetailField label="订单创建人">{detailApplication.applicantName}</BusinessDetailField>
                  <BusinessDetailField label="提交时间">{formatDate(detailApplication.submittedAt, 'yyyy-MM-dd HH:mm:ss')}</BusinessDetailField>
                  <BusinessDetailField label="审核人">{detailApplication.reviewerName || '-'}</BusinessDetailField>
                  <BusinessDetailField label="审核时间">{formatDate(detailApplication.reviewedAt, 'yyyy-MM-dd HH:mm:ss')}</BusinessDetailField>
                  <BusinessDetailField label="退回 / 驳回原因" wide>{detailApplication.reason || '-'}</BusinessDetailField>
                  {detailApplication.importBatchId ? (
                    <>
                      <BusinessDetailField label="导入批次">{detailApplication.importBatchId}</BusinessDetailField>
                      <BusinessDetailField label="Excel 行号">{detailApplication.importRowNumber || '-'}</BusinessDetailField>
                      <BusinessDetailField label="导入人">{detailApplication.importedByName || '-'}</BusinessDetailField>
                      <BusinessDetailField label="导入时间">{formatDate(detailApplication.importedAt, 'yyyy-MM-dd HH:mm:ss')}</BusinessDetailField>
                      <BusinessDetailField label="目标订单创建人">{detailApplication.targetCreatorName || '-'}</BusinessDetailField>
                      <BusinessDetailField label="凭证状态">
                        {detailApplication.orderData.payments?.some((payment) => Boolean(payment.attachments?.length || payment.voucherPreview))
                          || detailApplication.orderData.dealEvidenceAttachments?.length
                          || detailApplication.orderData.dealEvidencePreview ? '已上传凭证' : '凭证缺失'}
                      </BusinessDetailField>
                      <BusinessDetailField label="预检警告" wide>{detailApplication.importWarnings?.length ? detailApplication.importWarnings.join('；') : '无'}</BusinessDetailField>
                    </>
                  ) : null}
                </Box>
                <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
                  <TableContainer sx={{ display: { xs: 'none', sm: 'block' }, border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#fff' }}>
                    <Table size="small">
                      <TableHead><TableRow sx={{ bgcolor: '#f8fafc' }}>
                        <TableCell>操作人</TableCell>
                        <TableCell>操作时间</TableCell>
                        <TableCell>操作类型</TableCell>
                        <TableCell>操作内容</TableCell>
                      </TableRow></TableHead>
                      <TableBody>
                        {detailApplication.reviewLogs.length ? detailApplication.reviewLogs.map((log) => (
                          <TableRow key={log.id}>
                            <TableCell>{log.operatorName || '-'}</TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(log.createdAt, 'yyyy-MM-dd HH:mm:ss')}</TableCell>
                            <TableCell><Chip label={reviewActionText[log.action]} size="small" variant="outlined" /></TableCell>
                            <TableCell sx={{ minWidth: 220, whiteSpace: 'normal', wordBreak: 'break-word' }}>{log.reason || reviewActionText[log.action]}</TableCell>
                          </TableRow>
                        )) : (
                          <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: '#94a3b8' }}>暂无审核记录</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Box sx={{ display: { xs: 'grid', sm: 'none' }, gap: 1.25 }}>
                    {detailApplication.reviewLogs.length ? detailApplication.reviewLogs.map((log) => (
                      <Box key={`mobile-${log.id}`} sx={{ p: 1.5, border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#fff' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                          <Chip label={reviewActionText[log.action]} size="small" variant="outlined" />
                          <Typography variant="caption" sx={{ color: '#64748b' }}>{formatDate(log.createdAt, 'yyyy-MM-dd HH:mm:ss')}</Typography>
                        </Box>
                        <Typography variant="body2" sx={{ mt: 1.25, fontWeight: 650, whiteSpace: 'normal', wordBreak: 'break-word' }}>{log.reason || reviewActionText[log.action]}</Typography>
                        <Typography variant="caption" sx={{ mt: 0.75, display: 'block', color: '#64748b' }}>操作人：{log.operatorName || '-'}</Typography>
                      </Box>
                    )) : (
                      <Box sx={{ py: 3, textAlign: 'center', color: '#94a3b8', border: '1px dashed #cbd5e1', borderRadius: 1.5, bgcolor: '#fff' }}>暂无审核记录</Box>
                    )}
                  </Box>
                </Box>
              </BusinessDetailSection>
            </DialogContent>
            <DialogActions sx={{ position: 'sticky', bottom: 0, zIndex: 2, px: { xs: 1.5, sm: 3 }, py: 1.5, bgcolor: '#fff', borderTop: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
              <Button onClick={closeApplicationDetail}>关闭</Button>
              {reviewer && detailApplication.status === ORDER_APPLICATION_STATUSES.PENDING_REVIEW && (
                <>
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => {
                      const target = detailApplication;
                      closeApplicationDetail();
                      openRejectDialog(target);
                    }}
                  >
                    驳回终止
                  </Button>
                  <Button
                    variant="outlined"
                    color="info"
                    onClick={() => {
                      const target = detailApplication;
                      closeApplicationDetail();
                      openReturnDialog(target);
                    }}
                  >
                    退回修改
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => {
                      const target = detailApplication;
                      closeApplicationDetail();
                      openApproveDialog(target);
                    }}
                  >
                    通过
                  </Button>
                </>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
      {feedbackDialog}
    </Box>
  );
};

export default OrderReview;
