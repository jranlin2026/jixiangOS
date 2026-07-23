import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
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
} from '@mui/material';
import TablePagination from '../../shared/components/TablePagination';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import BlockIcon from '@mui/icons-material/Block';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { canReviewOrderApplications, customerApi, orderApi, orderReviewApi, ORDER_APPLICATION_STATUSES } from '../../api';
import type { OrderApplication, OrderApplicationFilters, OrderApplicationStatus } from '../../types/order';
import type { Customer } from '../../types/customer';
import type { Role } from '../../types/role';
import { formatCurrency, formatPaginationRows } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import TableViewSettingsDialog from '../../shared/components/TableViewSettingsDialog';
import CustomerDetail from '../Customers/CustomerDetail';
import OrderForm from '../Orders/OrderForm';
import { getProductLevelRowSx, getProductLevelTagSx, normalizeResourceOwnership, ROUTES, STORAGE_KEYS } from '../../shared/utils/constants';
import { getCurrentOperatorUser } from '../../shared/utils/currentOperator';
import { isSuperAdminUser } from '../../shared/utils/permissions';
import { getStorageData } from '../../api/mock/storage';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import AttachmentPreviewLink from '../../shared/components/AttachmentPreview';
import BusinessAttachmentLinks from '../../shared/components/BusinessAttachmentLinks';
import {
  REVIEW_QUEUE_OPTIONS,
  getOrderApplicationReviewStatuses,
  type ReviewQueueView,
} from '../../shared/utils/reviewQueue';

type ReviewAction = {
  type: 'approve' | 'return' | 'reject';
  application: OrderApplication;
} | null;

type OrderReviewProps = {
  embedded?: boolean;
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
const REVIEW_VIEW_SCHEMA_VERSION = 1;
const REVIEW_ACTION_COLUMN_WIDTH = 148;

const REVIEW_COLUMNS: ReviewColumn[] = [
  { id: 'applicationNo', label: '申请编号' },
  { id: 'orderNo', label: '正式订单号' },
  { id: 'status', label: '状态' },
  { id: 'customer', label: '客户' },
  { id: 'productName', label: '产品名称' },
  { id: 'productLevel', label: '产品等级' },
  { id: 'orderType', label: '订单类型' },
  { id: 'amount', label: '实付金额' },
  { id: 'applicantName', label: '提交人' },
  { id: 'submittedAt', label: '提交时间' },
  { id: 'reviewerName', label: '审核人' },
  { id: 'reason', label: '原因' },
];

const REVIEW_DEFAULT_VISIBLE_COLUMNS = REVIEW_COLUMNS.map((column) => column.id);

const REVIEW_COLUMN_WIDTHS: Record<string, number> = {
  applicationNo: 180,
  orderNo: 180,
  status: 110,
  customer: 140,
  productName: 180,
  productLevel: 130,
  orderType: 150,
  amount: 130,
  applicantName: 130,
  submittedAt: 160,
  reviewerName: 130,
  reason: 180,
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

const statusColor: Record<OrderApplicationStatus, 'warning' | 'info' | 'success' | 'error'> = {
  待财务审核: 'warning',
  退回修改: 'info',
  已入库: 'success',
  已驳回: 'error',
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

function SnapshotField({ label, children, strong = false }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <Box>
      <Typography variant="body2" sx={{ color: '#6b7280' }}>{label}</Typography>
      <Typography variant="body1" sx={{ fontWeight: strong ? 700 : 500, color: strong ? '#1a1a2e' : 'inherit' }}>
        {children}
      </Typography>
    </Box>
  );
}

const OrderReview: React.FC<OrderReviewProps> = ({ embedded = false, viewSettingsOpen = false, onViewSettingsClose }) => {
  const [items, setItems] = useState<OrderApplication[]>([]);
  const [reviewQueueView, setReviewQueueView] = useState<ReviewQueueView>('pending');
  const [filters, setFilters] = useState<OrderApplicationFilters>({
    statuses: getOrderApplicationReviewStatuses('pending'),
    page: 1,
    pageSize: 10,
  });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [viewConfig, setViewConfig] = useState<ReviewViewConfig>(readReviewViewConfig);
  const [editingApplication, setEditingApplication] = useState<OrderApplication | null>(null);
  const [detailApplication, setDetailApplication] = useState<OrderApplication | null>(null);
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [approvedApplication, setApprovedApplication] = useState<OrderApplication | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [cleanupApplication, setCleanupApplication] = useState<OrderApplication | null>(null);
  const [cleanupReason, setCleanupReason] = useState('');
  const [cleanupSubmitting, setCleanupSubmitting] = useState(false);
  const reviewer = useMemo(() => canReviewOrderApplications(), []);
  const currentUser = useMemo(() => getCurrentOperatorUser(), []);
  const canCleanupReview = Boolean(currentUser && isSuperAdminUser(
    currentUser,
    getStorageData<Role[]>(STORAGE_KEYS.ROLES) || [],
  ));
  const { alert, dialog: feedbackDialog } = useAppFeedback();
  const navigate = useNavigate();

  const loadItems = async (nextFilters = filters) => {
    setLoading(true);
    try {
      const res = await orderReviewApi.fetchOrderApplications(nextFilters);
      if (res.code === 0) {
        setItems(res.data.items);
        setPagination(res.data.pagination);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(REVIEW_VIEW_STORAGE_KEY, JSON.stringify(viewConfig));
  }, [viewConfig]);

  const handleFilterChange = (key: keyof OrderApplicationFilters, value: string) => {
    const nextFilters = { ...filters, [key]: value || undefined, page: 1, pageSize: pagination.pageSize };
    setFilters(nextFilters);
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
    const detail = await loadApplicationDetail(application);
    if (!detail) {
      setDetailApplication((current) => current?.id === application.id ? null : current);
      return;
    }
    setDetailApplication((current) => current?.id === application.id ? detail : current);
  };

  const openApplicationEdit = async (application: OrderApplication) => {
    const detail = await loadApplicationDetail(application);
    if (detail) setEditingApplication(detail);
  };

  const openApproveDialog = (application: OrderApplication) => {
    setReviewAction({ type: 'approve', application });
    setReviewReason('');
  };

  const openReturnDialog = (application: OrderApplication) => {
    setReviewAction({ type: 'return', application });
    setReviewReason('');
  };

  const openRejectDialog = (application: OrderApplication) => {
    setReviewAction({ type: 'reject', application });
    setReviewReason('');
  };

  const closeReviewDialog = () => {
    setReviewAction(null);
    setReviewReason('');
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
    if (!reviewAction) return;

    let res;
    if (reviewAction.type === 'approve') {
      res = await orderReviewApi.approveOrderApplication(reviewAction.application.id);
    } else if (reviewAction.type === 'return') {
      const reason = reviewReason.trim();
      if (!reason) return;
      res = await orderReviewApi.returnOrderApplication(reviewAction.application.id, reason);
    } else {
      const reason = reviewReason.trim();
      if (!reason) return;
      res = await orderReviewApi.rejectOrderApplication(reviewAction.application.id, reason);
    }

    if (res.code !== 0 || !res.data) {
      await alert(res.message || '订单审核操作失败');
      return;
    }

    if (reviewAction.type === 'approve') setApprovedApplication(res.data);
    closeReviewDialog();
    await loadItems();
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
        return <Chip label={application.status} size="small" color={statusColor[application.status]} variant="outlined" />;
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
        return application.orderData.productName || application.orderData.productLevel || '-';
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
      case 'applicantName':
        return application.applicantName;
      case 'submittedAt':
        return formatDate(application.submittedAt);
      case 'reviewerName':
        return application.reviewerName || '-';
      case 'reason':
        return (
          <Tooltip title={application.reason || ''}>
            <Typography variant="body2" noWrap>{application.reason || '-'}</Typography>
          </Tooltip>
        );
      default:
        return null;
    }
  };

  const isCurrentUserApplicant = (application: OrderApplication) => (
    Boolean(currentUser?.id && application.applicantId === currentUser.id)
    || Boolean(currentUser?.name && !application.applicantId && application.applicantName === currentUser.name)
  );

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
          placeholder="搜索申请号、订单号、客户或提交人"
          value={filters.search || ''}
          onChange={(event) => handleFilterChange('search', event.target.value)}
          sx={{ minWidth: 280 }}
        />
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
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0', overflowX: 'auto' }}>
        <Table sx={{ tableLayout: 'fixed', minWidth: tableMinWidth }}>
          <TableHead>
            <TableRow>
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
              const canResubmit = application.status === ORDER_APPLICATION_STATUSES.RETURNED && (!reviewer || isCurrentUserApplicant(application));
              const canViewFormalOrder = application.status === ORDER_APPLICATION_STATUSES.APPROVED && Boolean(application.orderId);
              const canCleanupApplication = canCleanupReview && application.status === ORDER_APPLICATION_STATUSES.APPROVED && Boolean(application.orderId);
              return (
                <TableRow key={application.id} hover sx={getProductLevelRowSx(application.orderData.productLevel)}>
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
                    <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {canCleanupApplication && (
                        <Tooltip title="清理已删除订单的审核记录">
                          <IconButton aria-label="清理订单审核记录" size="small" color="error" onClick={() => openCleanupDialog(application)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canFinanceOperate && (
                        <>
                          <Tooltip title="入库">
                            <IconButton aria-label="入库" size="small" color="primary" onClick={() => openApproveDialog(application)}>
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
                        <Tooltip title="修改提交">
                          <IconButton aria-label="修改提交" size="small" color="primary" onClick={() => void openApplicationEdit(application)}>
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
                <TableCell colSpan={visibleColumns.length + 1} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                  {loading
                    ? '加载中...'
                    : reviewQueueView === 'pending'
                      ? '暂无待处理/待修改订单申请'
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
            仅用于清理正式订单已经删除后的审核台残留记录。正式订单仍存在或尚未入库的申请不会被清理。
          </Typography>
          {cleanupApplication && (
            <Box sx={{ p: 1.5, border: '1px solid #fee2e2', borderRadius: 1, bgcolor: '#fff7ed', mb: 2 }}>
              <Typography variant="body2">申请编号：{cleanupApplication.applicationNo}</Typography>
              <Typography variant="body2">正式订单号：{cleanupApplication.orderNo || '-'}</Typography>
              <Typography variant="body2">客户：{cleanupApplication.orderData.customerName}</Typography>
            </Box>
          )}
          <TextField
            label="清理原因"
            value={cleanupReason}
            onChange={(event) => setCleanupReason(event.target.value)}
            placeholder="例如：正式订单已删除，清理审核台残留记录"
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

      <Dialog open={Boolean(reviewAction)} onClose={closeReviewDialog} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={closeReviewDialog}>
          {reviewAction?.type === 'approve' ? '确认订单入库' : reviewAction?.type === 'return' ? '退回修改' : '驳回终止'}
        </DialogCloseTitle>
        <DialogContent dividers>
          {reviewAction && (
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
                </Typography>
                <Typography variant="body2">
                  产品等级/类型：{reviewAction.application.orderData.productLevel || '-'} / {reviewAction.application.orderData.orderType || '-'}
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
          <Button onClick={closeReviewDialog}>取消</Button>
          <Button
            variant="contained"
            color={reviewAction?.type === 'reject' ? 'error' : reviewAction?.type === 'return' ? 'warning' : 'primary'}
            onClick={submitReviewAction}
            disabled={(reviewAction?.type === 'return' || reviewAction?.type === 'reject') && !reviewReason.trim()}
          >
            {reviewAction?.type === 'approve' ? '确认入库' : reviewAction?.type === 'return' ? '确认退回修改' : '确认驳回终止'}
          </Button>
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
                <Typography variant="body2">申请编号：{approvedApplication.applicationNo}</Typography>
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

      <Dialog open={Boolean(detailApplication)} onClose={() => setDetailApplication(null)} maxWidth="md" fullWidth>
        {detailApplication && (
          <>
            <DialogCloseTitle onClose={() => setDetailApplication(null)}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>{detailApplication.applicationNo}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>
                  {detailApplication.orderData.productName || detailApplication.orderData.productLevel || '-'}
                </Typography>
                <Chip label={detailApplication.orderData.productLevel || '-'} size="small" sx={getProductLevelTagSx(detailApplication.orderData.productLevel)} />
                <Chip label={detailApplication.orderData.orderType || '-'} size="small" variant="outlined" />
                <Chip label={detailApplication.status} size="small" color={statusColor[detailApplication.status]} variant="outlined" />
              </Box>
            </DialogCloseTitle>
            <DialogContent dividers>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
                <SnapshotField label="客户名称">{detailApplication.orderData.customerName}</SnapshotField>
                <SnapshotField label="产品名称">{detailApplication.orderData.productName || detailApplication.orderData.productLevel || '-'}</SnapshotField>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>产品等级</Typography>
                  <Chip label={detailApplication.orderData.productLevel || '-'} size="small" sx={getProductLevelTagSx(detailApplication.orderData.productLevel)} />
                </Box>
                <SnapshotField label="实付金额" strong>
                  {formatCurrency(detailApplication.orderData.actualAmount || detailApplication.orderData.amount)}
                </SnapshotField>
                <SnapshotField label="官方收款渠道">{detailApplication.orderData.officialPaymentChannel || '-'}</SnapshotField>
                <SnapshotField label="销售顾问">{detailApplication.orderData.salesName || detailApplication.orderData.owner}</SnapshotField>
                <SnapshotField label="资源归属">
                  {normalizeResourceOwnership(detailApplication.orderData.resourceOwnership || detailApplication.orderData.sourceType)}
                </SnapshotField>
                <SnapshotField label="销售负责人">{detailApplication.orderData.owner}</SnapshotField>
                <SnapshotField label="线索录入人">{detailApplication.orderData.leadInputBy || '-'}</SnapshotField>
                <SnapshotField label="线索贡献人">{detailApplication.orderData.leadContributorName || '-'}</SnapshotField>
                <SnapshotField label="正式订单号">{detailApplication.orderNo || '-'}</SnapshotField>
                <SnapshotField label="提交人">{detailApplication.applicantName}</SnapshotField>
                <SnapshotField label="提交时间">{formatDate(detailApplication.submittedAt, 'yyyy-MM-dd HH:mm:ss')}</SnapshotField>
                <SnapshotField label="审核人">{detailApplication.reviewerName || '-'}</SnapshotField>
                <SnapshotField label="审核时间">{formatDate(detailApplication.reviewedAt, 'yyyy-MM-dd HH:mm:ss')}</SnapshotField>
                <SnapshotField label="申请原因">{detailApplication.reason || '-'}</SnapshotField>
                <SnapshotField label="备注">{detailApplication.orderData.notes || '-'}</SnapshotField>
              </Box>

              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ mb: 1, color: '#6b7280' }}>付款记录</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>金额</TableCell>
                      <TableCell>付款时间</TableCell>
                      <TableCell>付款订单号</TableCell>
                      <TableCell>付款截图</TableCell>
                      <TableCell>成交路径截图</TableCell>
                      <TableCell>备注</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detailApplication.orderData.payments?.length ? (
                      detailApplication.orderData.payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>{formatCurrency(payment.amount)}</TableCell>
                          <TableCell>{formatDate(payment.paidAt, 'yyyy-MM-dd HH:mm:ss')}</TableCell>
                          <TableCell>{payment.paymentOrderNo || '-'}</TableCell>
                          <TableCell>
                            {payment.attachments?.length
                              ? <BusinessAttachmentLinks attachments={payment.attachments} />
                              : <AttachmentPreviewLink title="付款截图" fileName={payment.voucherName} src={payment.voucherPreview} />}
                          </TableCell>
                          <TableCell>
                            {detailApplication.orderData.dealEvidenceAttachments?.length
                              ? <BusinessAttachmentLinks attachments={detailApplication.orderData.dealEvidenceAttachments} />
                              : (
                                <AttachmentPreviewLink
                                  title="成交路径截图"
                                  fileName={detailApplication.orderData.dealEvidenceName}
                                  src={detailApplication.orderData.dealEvidencePreview}
                                />
                              )}
                          </TableCell>
                          <TableCell>{payment.remark || '-'}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ color: '#9ca3af', py: 3 }}>暂无付款记录</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <Divider sx={{ my: 2 }} />
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, color: '#6b7280' }}>审核记录</Typography>
                {detailApplication.reviewLogs.length ? (
                  detailApplication.reviewLogs.map((log) => (
                    <Typography key={log.id} variant="body2" sx={{ color: '#6b7280', lineHeight: 1.9 }}>
                      {formatDate(log.createdAt)} {log.operatorName} {reviewActionText[log.action]}{log.reason ? `：${log.reason}` : ''}
                    </Typography>
                  ))
                ) : (
                  <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无审核记录</Typography>
                )}
              </Box>
            </DialogContent>
            <DialogActions sx={{ px: 2.5, py: 1.5 }}>
              <Button onClick={() => setDetailApplication(null)}>关闭</Button>
              {reviewer && detailApplication.status === ORDER_APPLICATION_STATUSES.PENDING_REVIEW && (
                <>
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => {
                      const target = detailApplication;
                      setDetailApplication(null);
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
                      setDetailApplication(null);
                      openReturnDialog(target);
                    }}
                  >
                    退回修改
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => {
                      const target = detailApplication;
                      setDetailApplication(null);
                      openApproveDialog(target);
                    }}
                  >
                    审核入库
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
