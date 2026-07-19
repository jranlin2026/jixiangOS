import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
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
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import BlockIcon from '@mui/icons-material/Block';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useNavigate } from 'react-router-dom';
import { productApi, recoveryOrderApi, settingsApi } from '../../api';
import { formatCurrency, formatDate, formatEmployeeNameWithPosition, formatPaginationRows } from '../../shared/utils/formatters';
import { getProductLevelColor, getProductLevelTagSx, ROUTES } from '../../shared/utils/constants';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import TableViewSettingsDialog, { type TableViewColumnConfig } from '../../shared/components/TableViewSettingsDialog';
import { useTableViewConfig } from '../../shared/hooks/useTableViewConfig';
import { canReviewRecoveryOrders, hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import type { RecoveryOrder, RecoveryOrderFilters, RecoveryOrderInput, RecoveryOrderStatus } from '../../types/recoveryOrder';
import { isRecoveryOrderDeletionLocked } from '../../shared/utils/recoveryOrderDeletion';
import type { User } from '../../types/settings';
import type { AfterSalesSourceConfig } from '../../types/settings';
import type { BusinessAttachment } from '../../types/businessAttachment';
import type { Product } from '../../types/product';
import useAuthStore from '../../store/useAuthStore';
import AttachmentPreviewLink from '../../shared/components/AttachmentPreview';
import BusinessAttachmentPicker from '../../shared/components/BusinessAttachmentPicker';
import BusinessAttachmentLinks from '../../shared/components/BusinessAttachmentLinks';

const shell = {
  ink: '#0f172a',
  muted: '#64748b',
  line: '#dbe4ee',
  soft: '#f8fafc',
  blue: '#2563eb',
  green: '#059669',
  amber: '#b45309',
  red: '#dc2626',
};

function toDateTimeInputValue(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Date(safeDate.getTime() - safeDate.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const emptyForm = {
  customerName: '',
  customerPhone: '',
  customerWechat: '',
  thirdPartyOrderNo: '',
  sourcePlatform: '',
  sourcePlatformId: '',
  sourcePlatformName: '',
  sourceShopId: '',
  sourceShopName: '',
  originalProduct: '',
  originalAmount: '',
  recoveryAmount: '',
  recoveryAt: toDateTimeInputValue(),
  paymentVoucher: '',
  paymentVoucherName: '',
  paymentVoucherPreview: '',
  chatEvidence: '',
  chatEvidenceName: '',
  chatEvidencePreview: '',
  paymentAttachments: [] as BusinessAttachment[],
  chatAttachments: [] as BusinessAttachment[],
  recoveryUserId: '',
  remark: '',
};

type RecoveryOrderForm = typeof emptyForm;

function getStatusSx(status: RecoveryOrderStatus) {
  if (status === '已分账' || status === '待分账') return { bgcolor: '#ecfdf5', color: shell.green };
  if (status === '审核驳回') return { bgcolor: '#fff1f2', color: shell.red };
  if (status === '退回修改') return { bgcolor: '#eff6ff', color: shell.blue };
  return { bgcolor: '#fff7ed', color: shell.amber };
}

interface RecoveryOrderTabProps {
  mode: 'list' | 'review';
  createSignal?: number;
  viewSettingsSignal?: number;
}

type ReviewAction = {
  type: 'approve' | 'return' | 'reject';
  row: RecoveryOrder;
} | null;

type RecoveryOrderColumnId =
  | 'recoveryNo'
  | 'customerName'
  | 'customerPhone'
  | 'customerWechat'
  | 'thirdPartyOrderNo'
  | 'originalProduct'
  | 'originalAmount'
  | 'recoveryAmount'
  | 'recoveryUserName'
  | 'recoveryAt'
  | 'status'
  | 'createdAt'
  | 'actions';

const RECOVERY_ORDER_COLUMNS: Array<TableViewColumnConfig & { id: RecoveryOrderColumnId }> = [
  { id: 'recoveryNo', label: '挽回订单号' },
  { id: 'customerName', label: '客户' },
  { id: 'customerPhone', label: '手机号' },
  { id: 'customerWechat', label: '微信' },
  { id: 'thirdPartyOrderNo', label: '第三方订单' },
  { id: 'originalProduct', label: '原产品' },
  { id: 'originalAmount', label: '原付款' },
  { id: 'recoveryAmount', label: '挽回金额' },
  { id: 'recoveryUserName', label: '挽回人员' },
  { id: 'recoveryAt', label: '挽回时间' },
  { id: 'status', label: '状态' },
  { id: 'createdAt', label: '创建时间' },
  { id: 'actions', label: '操作' },
];

const DEFAULT_VISIBLE_COLUMNS = RECOVERY_ORDER_COLUMNS.map((column) => column.id);
const RECOVERY_ORDER_LIST_COLUMNS = RECOVERY_ORDER_COLUMNS.filter((column) => column.id !== 'status');
const DEFAULT_LIST_VISIBLE_COLUMNS = RECOVERY_ORDER_LIST_COLUMNS.map((column) => column.id);
const RECOVERY_REVIEW_STATUSES: RecoveryOrderStatus[] = ['待审核', '退回修改'];
const RECOVERY_LIST_STATUSES: RecoveryOrderStatus[] = ['待分账', '已分账'];

function isRecoveryOrderLocked(row: RecoveryOrder): boolean {
  return row.status === '已分账' || ['待确认', '待发放', '已撤回'].includes(row.settlementStatus || '未分账');
}

const RecoveryOrderTab: React.FC<RecoveryOrderTabProps> = ({ mode, createSignal = 0, viewSettingsSignal = 0 }) => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const canCreate = hasPermission(currentUser, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE);
  const canReviewAction = canReviewRecoveryOrders(currentUser);
  const canEdit = hasPermission(currentUser, PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT);
  const canDelete = hasPermission(currentUser, PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE, 'delete');
  const canViewHistory = hasPermission(currentUser, PERMISSION_KEYS.AFTER_SALES_RECOVERY_HISTORY);
  const [rows, setRows] = useState<RecoveryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sourceConfigs, setSourceConfigs] = useState<AfterSalesSourceConfig[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RecoveryOrderForm>(emptyForm);
  const [editingOrder, setEditingOrder] = useState<RecoveryOrder | null>(null);
  const [message, setMessage] = useState<{ type: 'success'; text: string } | null>(null);
  const [errorDialog, setErrorDialog] = useState<{ title: string; text: string } | null>(null);
  const [detailOrder, setDetailOrder] = useState<RecoveryOrder | null>(null);
  const [historyOrder, setHistoryOrder] = useState<RecoveryOrder | null>(null);
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState<RecoveryOrder | null>(null);
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [approvedOrder, setApprovedOrder] = useState<RecoveryOrder | null>(null);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const handledCreateSignalRef = React.useRef(createSignal);
  const handledViewSettingsSignalRef = React.useRef(viewSettingsSignal);
  const tableColumns = mode === 'list' ? RECOVERY_ORDER_LIST_COLUMNS : RECOVERY_ORDER_COLUMNS;
  const defaultVisibleColumns = mode === 'list' ? DEFAULT_LIST_VISIBLE_COLUMNS : DEFAULT_VISIBLE_COLUMNS;

  const {
    viewConfig,
    visibleColumns,
    visibleColumnIds,
    toggleColumn,
    reorderColumn,
    setFrozenColumnCount,
    resetViewConfig,
  } = useTableViewConfig(`after_sales_recovery_${mode}_table_view`, tableColumns, defaultVisibleColumns);

  const filters = useMemo<RecoveryOrderFilters>(() => ({
    search,
    status: '全部',
    statuses: mode === 'review'
      ? RECOVERY_REVIEW_STATUSES
      : RECOVERY_LIST_STATUSES,
    scopeDomain: mode === 'review' ? 'recoveryOrderApplications' : 'recoveryOrders',
    page: page + 1,
    pageSize: rowsPerPage,
  }), [mode, page, rowsPerPage, search]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [listRes, usersRes, productsRes, sourceRes] = await Promise.all([
        recoveryOrderApi.fetchRecoveryOrders(filters),
        settingsApi.fetchAssignableUsers(),
        productApi.getProducts(),
        settingsApi.fetchAfterSalesSourceConfigs(),
      ]);
      if (listRes.code === 0) {
        setRows(listRes.data.items);
        setTotal(listRes.data.pagination.total);
      } else {
        setLoadError(listRes.message || '售后订单加载失败');
      }
      if (usersRes.code === 0) setUsers(usersRes.data);
      if (productsRes.code === 0) setProducts([...productsRes.data].sort((a, b) => a.sortOrder - b.sortOrder));
      if (sourceRes.code === 0) setSourceConfigs(sourceRes.data);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '售后订单加载失败');
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [search]);

  useEffect(() => {
    if (mode !== 'list' || createSignal <= 0) return;
    if (handledCreateSignalRef.current === createSignal) return;
    handledCreateSignalRef.current = createSignal;
    openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSignal]);

  useEffect(() => {
    if (viewSettingsSignal <= 0) return;
    if (handledViewSettingsSignalRef.current === viewSettingsSignal) return;
    handledViewSettingsSignalRef.current = viewSettingsSignal;
    setViewSettingsOpen(true);
  }, [viewSettingsSignal]);

  const activeUsers = users.filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active');
  const productOptions = useMemo(() => [...products].sort((a, b) => a.sortOrder - b.sortOrder), [products]);
  const platformOptions = useMemo(() => sourceConfigs.filter((item) => !item.parentId && (item.isActive || item.id === form.sourcePlatformId)).sort((a, b) => a.sortOrder - b.sortOrder), [form.sourcePlatformId, sourceConfigs]);
  const shopOptions = useMemo(() => sourceConfigs.filter((item) => item.parentId === form.sourcePlatformId && (item.isActive || item.id === form.sourceShopId)).sort((a, b) => a.sortOrder - b.sortOrder), [form.sourcePlatformId, form.sourceShopId, sourceConfigs]);
  const canResubmitReturnedOrder = useCallback((row: RecoveryOrder) => (
    row.status === '退回修改'
    && Boolean(currentUser)
    && (row.createdBy === currentUser?.id || row.recoveryUserId === currentUser?.id)
  ), [currentUser]);

  const showErrorDialog = useCallback((text: string, title = '操作失败') => {
    setErrorDialog({ title, text });
  }, []);

  const openCreate = () => {
    setMessage(null);
    setEditingOrder(null);
    const self = currentUser
      ? activeUsers.find((user) => user.id === currentUser.id)
      : undefined;
    setForm({ ...emptyForm, recoveryAt: toDateTimeInputValue(), recoveryUserId: self?.id || currentUser?.id || '' });
    setOpen(true);
  };

  const loadRecoveryDetail = async (row: RecoveryOrder) => {
    const response = await recoveryOrderApi.fetchRecoveryOrderById(
      row.id,
      mode === 'review' ? 'recoveryOrderApplications' : 'recoveryOrders',
    );
    if (response.code === 0 && response.data) return response.data;
    showErrorDialog(response.message || '售后挽回订单详情加载失败');
    return null;
  };

  const openDetail = async (row: RecoveryOrder) => {
    setDetailOrder(row);
    const detail = await loadRecoveryDetail(row);
    if (!detail) {
      setDetailOrder((current) => current?.id === row.id ? null : current);
      return;
    }
    setDetailOrder((current) => current?.id === row.id ? detail : current);
  };

  const openEdit = async (row: RecoveryOrder) => {
    if (isRecoveryOrderLocked(row)) {
      showErrorDialog('已分账的售后挽回订单不能修改');
      return;
    }
    setMessage(null);
    const detail = await loadRecoveryDetail(row);
    if (!detail) return;
    setEditingOrder(detail);
    setForm({
      customerName: detail.customerName || '',
      customerPhone: detail.customerPhone || '',
      customerWechat: detail.customerWechat || '',
      thirdPartyOrderNo: detail.thirdPartyOrderNo || '',
      sourcePlatform: detail.sourcePlatform || '',
      sourcePlatformId: detail.sourcePlatformId || '',
      sourcePlatformName: detail.sourcePlatformName || detail.sourcePlatform || '',
      sourceShopId: detail.sourceShopId || '',
      sourceShopName: detail.sourceShopName || '',
      originalProduct: detail.originalProduct || '',
      originalAmount: String(detail.originalAmount || ''),
      recoveryAmount: String(detail.recoveryAmount || ''),
      recoveryAt: toDateTimeInputValue(detail.recoveryAt || detail.createdAt),
      paymentVoucher: detail.paymentVoucher || '',
      paymentVoucherName: detail.paymentVoucherName || detail.paymentVoucher || '',
      paymentVoucherPreview: detail.paymentVoucherPreview || '',
      chatEvidence: detail.chatEvidence || '',
      chatEvidenceName: detail.chatEvidenceName || detail.chatEvidence || '',
      chatEvidencePreview: detail.chatEvidencePreview || '',
      paymentAttachments: detail.paymentAttachments || [],
      chatAttachments: detail.chatAttachments || [],
      recoveryUserId: detail.recoveryUserId || '',
      remark: detail.remark || '',
    });
    setOpen(true);
  };

  const handleProductChange = (productName: string) => {
    const product = productOptions.find((item) => item.name === productName);
    setForm((prev) => ({
      ...prev,
      originalProduct: product?.name || productName,
      originalAmount: product && !prev.originalAmount ? String(product.price || '') : prev.originalAmount,
    }));
  };

  const handleCreate = async () => {
    if (!currentUser) return;
    const recoveryUser = activeUsers.find((user) => user.id === form.recoveryUserId);
    const input: RecoveryOrderInput = {
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      customerWechat: form.customerWechat,
      thirdPartyOrderNo: form.thirdPartyOrderNo,
      sourcePlatform: form.sourcePlatform,
      sourcePlatformId: form.sourcePlatformId,
      sourcePlatformName: form.sourcePlatformName,
      sourceShopId: form.sourceShopId,
      sourceShopName: form.sourceShopName,
      originalProduct: form.originalProduct,
      originalAmount: Number(form.originalAmount) || 0,
      recoveryAmount: Number(form.recoveryAmount) || 0,
      recoveryAt: form.recoveryAt ? new Date(form.recoveryAt).toISOString() : undefined,
      paymentVoucher: form.paymentVoucher,
      paymentVoucherName: form.paymentVoucherName,
      paymentVoucherPreview: form.paymentVoucherPreview,
      chatEvidence: form.chatEvidence,
      chatEvidenceName: form.chatEvidenceName,
      chatEvidencePreview: form.chatEvidencePreview,
      paymentAttachments: form.paymentAttachments,
      chatAttachments: form.chatAttachments,
      recoveryUserId: recoveryUser?.id || currentUser.id,
      recoveryUserName: recoveryUser?.name || currentUser.name,
      remark: form.remark,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
    };
    const res = editingOrder
      ? await recoveryOrderApi.updateRecoveryOrder(editingOrder.id, input)
      : await recoveryOrderApi.createRecoveryOrder(input);
    if (res.code !== 0) {
      showErrorDialog(
        res.message || (editingOrder ? '修改售后挽回订单失败' : '新建售后挽回订单失败'),
        '无法提交',
      );
      return;
    }
    setOpen(false);
    setEditingOrder(null);
    setMessage({
      type: 'success',
      text: editingOrder
        ? '已修改售后挽回订单，并重新提交审核'
        : '已提交售后挽回订单，待财务审核通过后进入售后挽回订单列表',
    });
    await load();
    navigate(`${ROUTES.AFTER_SALES}?tab=recovery-review`);
  };

  const handleDelete = async (row: RecoveryOrder) => {
    const isSettled = isRecoveryOrderDeletionLocked(row);
    if (isSettled) {
      showErrorDialog('该售后挽回订单仍有活动分账，请先在财务中心处理');
      return;
    }
    setDeleteConfirmOrder(row);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmOrder) return;
    const res = await recoveryOrderApi.deleteRecoveryOrder(deleteConfirmOrder.id);
    if (res.code !== 0) {
      showErrorDialog(res.message || '删除售后挽回订单失败');
      return;
    }
    setDeleteConfirmOrder(null);
    setMessage({ type: 'success', text: '已删除售后挽回订单' });
    await load();
  };

  const closeReviewDialog = () => {
    setReviewAction(null);
    setReviewReason('');
  };

  const handleReviewSubmit = async () => {
    if (!currentUser || !reviewAction) return;
    let res;
    if (reviewAction.type === 'approve') {
      res = await recoveryOrderApi.approveRecoveryOrder(reviewAction.row.id, currentUser.id, currentUser.name);
    } else if (reviewAction.type === 'return') {
      res = await recoveryOrderApi.returnRecoveryOrder(reviewAction.row.id, currentUser.id, currentUser.name, reviewReason);
    } else {
      res = await recoveryOrderApi.rejectRecoveryOrder(reviewAction.row.id, currentUser.id, currentUser.name, reviewReason);
    }
    if (res.code !== 0) {
      showErrorDialog(res.message || '审核操作失败');
      return;
    }
    const nextOrder = res.data || reviewAction.row;
    if (reviewAction.type === 'approve') {
      setApprovedOrder(nextOrder);
      setMessage({ type: 'success', text: '已审核通过，待财务进行售后挽回分账' });
    } else if (reviewAction.type === 'return') {
      setMessage({ type: 'success', text: '已退回修改，可在售后挽回审核台修改后重新提交审核' });
    } else {
      setMessage({ type: 'success', text: '已驳回挽回订单，可在售后挽回订单列表中查看' });
    }
    closeReviewDialog();
    await load();
  };

  const renderCell = (row: RecoveryOrder, columnId: RecoveryOrderColumnId) => {
    switch (columnId) {
      case 'recoveryNo':
        return (
          <Typography
            component="button"
            type="button"
            variant="body2"
            onClick={() => void openDetail(row)}
            sx={{
              p: 0,
              border: 0,
              bgcolor: 'transparent',
              font: 'inherit',
              fontWeight: 900,
              color: shell.blue,
              cursor: 'pointer',
              textAlign: 'left',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {row.recoveryNo}
          </Typography>
        );
      case 'customerName':
        return <Typography variant="body2" sx={{ fontWeight: 800 }}>{row.customerName}</Typography>;
      case 'customerPhone':
        return row.customerPhone || '-';
      case 'customerWechat':
        return row.customerWechat || '-';
      case 'thirdPartyOrderNo':
        return row.thirdPartyOrderNo;
      case 'originalProduct':
        return row.originalProduct;
      case 'originalAmount':
        return formatCurrency(row.originalAmount);
      case 'recoveryAmount':
        return <Typography variant="body2" sx={{ fontWeight: 900, color: shell.green }}>{formatCurrency(row.recoveryAmount)}</Typography>;
      case 'recoveryUserName':
        return row.recoveryUserName;
      case 'recoveryAt':
        return formatDate(row.recoveryAt || row.createdAt, 'yyyy-MM-dd HH:mm');
      case 'status':
        return (
          <Box>
            <Chip size="small" label={row.status} sx={{ ...getStatusSx(row.status), fontWeight: 900 }} />
          </Box>
        );
      case 'createdAt':
        return formatDate(row.createdAt, 'yyyy-MM-dd HH:mm');
      case 'actions':
        if (mode === 'review') {
          if (row.status === '退回修改') {
            const canResubmit = canEdit || canResubmitReturnedOrder(row);
            return canResubmit ? (
              <Stack
                direction="row"
                spacing={0.25}
                justifyContent="center"
                sx={{ minWidth: 148, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}
              >
                <Tooltip title="修改并重新提交">
                  <IconButton
                    aria-label="修改并重新提交"
                    size="small"
                    sx={{ color: '#0f766e' }}
                    onClick={() => openEdit(row)}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            ) : (
              <Typography variant="body2" sx={{ color: shell.muted }}>-</Typography>
            );
          }
          return (
            <Stack
              direction="row"
              spacing={0.25}
              justifyContent="center"
              sx={{ minWidth: 148, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}
            >
              {canDelete && (
                <Tooltip title="删除">
                  <IconButton
                    size="small"
                    sx={{ color: shell.red }}
                    onClick={() => handleDelete(row)}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {canReviewAction && (
                <>
                  <Tooltip title="通过">
                    <IconButton size="small" sx={{ color: shell.green }} onClick={() => setReviewAction({ type: 'approve', row })}>
                      <CheckCircleOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="退回修改">
                    <IconButton aria-label="退回修改" size="small" color="info" onClick={() => setReviewAction({ type: 'return', row })}>
                      <ReplayIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="驳回终止">
                    <IconButton aria-label="驳回终止" size="small" color="error" onClick={() => setReviewAction({ type: 'reject', row })}>
                      <BlockIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Stack>
          );
        }
        return (
          <Stack
            direction="row"
            spacing={0.25}
            justifyContent="center"
            sx={{ minWidth: 80, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}
          >
            <Tooltip title="查看">
              <IconButton size="small" sx={{ color: shell.blue }} onClick={() => void openDetail(row)}>
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {canEdit && !isRecoveryOrderLocked(row) && (
              <Tooltip title="编辑">
                <IconButton
                  size="small"
                  sx={{ color: '#0f766e' }}
                  onClick={() => openEdit(row)}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {canViewHistory && (
              <Tooltip title="历史">
                <IconButton
                  size="small"
                  sx={{ color: shell.green }}
                  onClick={() => setHistoryOrder(row)}
                >
                  <HistoryIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {canDelete && !isRecoveryOrderDeletionLocked(row) && (
              <Tooltip title="删除">
                <IconButton
                  size="small"
                  sx={{ color: shell.red }}
                  onClick={() => handleDelete(row)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
        );
      default:
        return null;
    }
  };

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      {message && (
        <Alert severity={message.type} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}
      {loadError && (
        <Alert severity="error">
          售后订单加载失败：{loadError}。当前列表未更新，请重试。
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 2, mt: 0.5, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="搜索客户/订单号"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ width: 240 }}
        />
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: '6px 6px 0 0' }}>
        <Table sx={{ minWidth: 1360 }}>
          <TableHead>
            <TableRow>
              {visibleColumns.map((column) => (
                <TableCell
                  key={column.id}
                  align={column.id === 'actions' ? 'center' : 'left'}
                  sx={{
                    ...(column.id === 'actions' ? {
                      minWidth: mode === 'review' ? 176 : 156,
                      width: mode === 'review' ? 176 : 156,
                      whiteSpace: 'nowrap',
                      ...(mode === 'review' ? {
                        position: 'sticky',
                        right: 0,
                        zIndex: 4,
                        bgcolor: '#f8fafc',
                        boxShadow: `-1px 0 0 ${shell.line}`,
                      } : {}),
                    } : {}),
                    ...(['recoveryAt', 'createdAt'].includes(column.id) ? { minWidth: mode === 'review' ? 170 : 150, whiteSpace: 'nowrap' } : {}),
                  }}
                >
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} hover>
                {visibleColumns.map((column) => (
                  <TableCell
                    key={column.id}
                    align={column.id === 'actions' ? 'center' : 'left'}
                    sx={{
                      ...(column.id === 'actions' ? {
                        minWidth: mode === 'review' ? 176 : 156,
                        width: mode === 'review' ? 176 : 156,
                        whiteSpace: 'nowrap',
                        ...(mode === 'review' ? {
                          position: 'sticky',
                          right: 0,
                          zIndex: 3,
                          bgcolor: '#fff',
                          boxShadow: `-1px 0 0 ${shell.line}`,
                        } : {}),
                      } : {}),
                      ...(['recoveryAt', 'createdAt'].includes(column.id) ? { minWidth: mode === 'review' ? 170 : 150, whiteSpace: 'nowrap' } : {}),
                    }}
                  >
                    {renderCell(row, column.id as RecoveryOrderColumnId)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={visibleColumns.length || 1} align="center" sx={{ py: 6, color: '#9ca3af' }}>
                  {loading ? '加载中...' : mode === 'review' ? '暂无待审核售后挽回订单' : '暂无售后挽回订单'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={Math.min(page, Math.max(Math.ceil(total / rowsPerPage) - 1, 0))}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={[10, 20, 50]}
        onPageChange={(_, nextPage) => setPage(nextPage)}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(Number(event.target.value));
          setPage(0);
        }}
        labelRowsPerPage="每页条数"
        labelDisplayedRows={formatPaginationRows}
        sx={{ border: `1px solid ${shell.line}`, borderTop: 0, bgcolor: '#fff' }}
      />

      <Dialog open={open} onClose={() => { setOpen(false); setEditingOrder(null); }} maxWidth="md" fullWidth>
        <DialogTitle>{editingOrder ? '编辑售后挽回订单' : '新建售后挽回订单'}</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2, pt: 1 }}>
            <TextField label="客户姓名" value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required />
            <TextField label="客户手机号" value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} />
            <TextField label="客户微信" value={form.customerWechat} onChange={(event) => setForm({ ...form, customerWechat: event.target.value })} />
            <TextField label="第三方平台订单号" value={form.thirdPartyOrderNo} onChange={(event) => setForm({ ...form, thirdPartyOrderNo: event.target.value })} required />
            <TextField select label="来源平台" value={form.sourcePlatformId} onChange={(event) => {
              const platform = sourceConfigs.find((item) => item.id === event.target.value);
              setForm({ ...form, sourcePlatformId: platform?.id || '', sourcePlatformName: platform?.name || '', sourcePlatform: platform?.name || '', sourceShopId: '', sourceShopName: '' });
            }}>
              <MenuItem value="">未选择</MenuItem>
              {platformOptions.map((platform) => <MenuItem key={platform.id} value={platform.id}>{platform.name}{platform.isActive ? '' : '（已停用）'}</MenuItem>)}
            </TextField>
            <TextField select label="来源店铺" value={form.sourceShopId} onChange={(event) => {
              const shop = sourceConfigs.find((item) => item.id === event.target.value);
              setForm({ ...form, sourceShopId: shop?.id || '', sourceShopName: shop?.name || '' });
            }} disabled={!form.sourcePlatformId}>
              <MenuItem value="">未选择</MenuItem>
              {shopOptions.map((shop) => <MenuItem key={shop.id} value={shop.id}>{shop.name}{shop.isActive ? '' : '（已停用）'}</MenuItem>)}
            </TextField>
            <TextField select label="原购买产品" value={form.originalProduct} onChange={(event) => handleProductChange(event.target.value)} required>
              {productOptions.map((product) => (
                <MenuItem key={product.id} value={product.name}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: getProductLevelColor(product.level) }} />
                    {product.name}
                  </Box>
                </MenuItem>
              ))}
              {form.originalProduct && !productOptions.some((product) => product.name === form.originalProduct) && (
                <MenuItem value={form.originalProduct}>{form.originalProduct}</MenuItem>
              )}
            </TextField>
            <TextField label="原付款金额" type="number" value={form.originalAmount} onChange={(event) => setForm({ ...form, originalAmount: event.target.value })} />
            <TextField label="挽回成交金额" type="number" value={form.recoveryAmount} onChange={(event) => setForm({ ...form, recoveryAmount: event.target.value })} required />
            <TextField label="挽回时间" type="datetime-local" value={form.recoveryAt} onChange={(event) => setForm({ ...form, recoveryAt: event.target.value })} required InputLabelProps={{ shrink: true }} inputProps={{ step: 1 }} />
            <TextField select label="挽回人员" value={form.recoveryUserId} onChange={(event) => setForm({ ...form, recoveryUserId: event.target.value })} required>
              {activeUsers.map((user) => <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
            </TextField>
            <Box sx={{ gridColumn: { md: '1 / -1' } }}>
              <BusinessAttachmentPicker title="挽回凭证" description="用于上传付款、聊天或其他挽回过程截图，可多选、拖拽或直接粘贴。" value={form.paymentAttachments} onChange={(paymentAttachments) => setForm((current) => ({ ...current, paymentAttachments }))} category="recovery-payment-proof" draftKey={editingOrder?.id || `recovery-new-${currentUser?.id || 'unknown'}`} maxCount={8} />
            </Box>
            <TextField label="备注" value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} multiline minRows={3} sx={{ gridColumn: { md: '1 / -1' } }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpen(false); setEditingOrder(null); }}>取消</Button>
          <Button variant="contained" onClick={handleCreate}>{editingOrder ? '保存并提交审核' : '提交审核'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(detailOrder)} onClose={() => setDetailOrder(null)} maxWidth="md" fullWidth>
        {detailOrder && (
          <>
            <DialogCloseTitle onClose={() => setDetailOrder(null)}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>{detailOrder.recoveryNo}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>{detailOrder.originalProduct}</Typography>
                {mode === 'review' && (
                  <Chip label={detailOrder.status} size="small" sx={{ ...getStatusSx(detailOrder.status), fontWeight: 700 }} />
                )}
              </Box>
            </DialogCloseTitle>
            <DialogContent dividers>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>客户名称</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>{detailOrder.customerName}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>客户手机号</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>{detailOrder.customerPhone || '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>客户微信</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>{detailOrder.customerWechat || '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>第三方平台订单号</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>{detailOrder.thirdPartyOrderNo}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>原产品</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>{detailOrder.originalProduct}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>产品等级</Typography>
                  {(() => {
                    const product = productOptions.find((item) => item.name === detailOrder.originalProduct);
                    return product ? <Chip label={product.level} size="small" sx={getProductLevelTagSx(product.level)} /> : <Typography variant="body1">-</Typography>;
                  })()}
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>原付款金额</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700, color: '#1a1a2e' }}>{formatCurrency(detailOrder.originalAmount)}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>挽回成交金额</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 700, color: shell.green }}>{formatCurrency(detailOrder.recoveryAmount)}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>来源平台</Typography>
                  <Typography variant="body1">{[detailOrder.sourcePlatformName || detailOrder.sourcePlatform, detailOrder.sourceShopName].filter(Boolean).join(' / ') || '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>挽回人员</Typography>
                  <Typography variant="body1">{detailOrder.recoveryUserName}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>挽回时间</Typography>
                  <Typography variant="body1">{formatDate(detailOrder.recoveryAt || detailOrder.createdAt, 'yyyy-MM-dd HH:mm:ss')}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>审核人</Typography>
                  <Typography variant="body1">{detailOrder.auditorName || '-'}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>创建时间</Typography>
                  <Typography variant="body1">{formatDate(detailOrder.createdAt, 'yyyy-MM-dd HH:mm:ss')}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>审核时间</Typography>
                  <Typography variant="body1">{detailOrder.auditedAt ? formatDate(detailOrder.auditedAt, 'yyyy-MM-dd HH:mm:ss') : '-'}</Typography>
                </Box>
                <Box sx={{ gridColumn: { md: '1 / -1' } }}>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>备注</Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{detailOrder.remark || '-'}</Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ mb: 1, color: '#6b7280' }}>凭证记录</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>挽回凭证</TableCell>
                      <TableCell>审核说明</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>
                        {[...(detailOrder.paymentAttachments || []), ...(detailOrder.chatAttachments || [])].length
                          ? <BusinessAttachmentLinks attachments={[...(detailOrder.paymentAttachments || []), ...(detailOrder.chatAttachments || [])]} />
                          : <AttachmentPreviewLink title="挽回凭证" fileName={detailOrder.paymentVoucherName || detailOrder.paymentVoucher || detailOrder.chatEvidenceName || detailOrder.chatEvidence} src={detailOrder.paymentVoucherPreview || detailOrder.chatEvidencePreview} />}
                      </TableCell>
                      <TableCell>{detailOrder.auditReason || '-'}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </DialogContent>
          </>
        )}
      </Dialog>

      <Dialog open={Boolean(historyOrder)} onClose={() => setHistoryOrder(null)} maxWidth="sm" fullWidth>
        <DialogTitle>售后挽回订单历史</DialogTitle>
        <DialogContent dividers>
          {historyOrder && (
            <Stack spacing={1.25}>
              <Box sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 1.25, bgcolor: shell.soft }}>
                <Typography variant="body2" sx={{ fontWeight: 900 }}>{historyOrder.recoveryNo}</Typography>
                <Typography variant="caption" sx={{ color: shell.muted }}>{historyOrder.customerName} - {historyOrder.thirdPartyOrderNo}</Typography>
              </Box>
              {[
                {
                  title: '创建售后挽回订单',
                  time: historyOrder.createdAt,
                  by: historyOrder.createdByName,
                  note: '提交售后挽回事实，等待审核。',
                },
                historyOrder.auditedAt ? {
                  title: historyOrder.status === '审核驳回' ? '审核驳回' : historyOrder.status === '退回修改' ? '退回修改' : '审核通过',
                  time: historyOrder.auditedAt,
                  by: historyOrder.auditorName || '-',
                  note: historyOrder.auditReason || (historyOrder.status === '已分账' || historyOrder.status === '待分账' ? '进入售后挽回分账。' : '-'),
                } : null,
                historyOrder.status === '已分账' ? {
                  title: '售后挽回分账完成',
                  time: historyOrder.updatedAt,
                  by: historyOrder.auditorName || '-',
                  note: `已生成 ${historyOrder.commissionIds?.length || 0} 条提成记录。`,
                } : null,
              ].filter(Boolean).map((item, index) => {
                const event = item as { title: string; time: string; by: string; note: string };
                return (
                  <Box key={`${event.title}-${index}`} sx={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 1.25 }}>
                    <Typography variant="caption" sx={{ color: shell.muted }}>{formatDate(event.time, 'MM-dd HH:mm')}</Typography>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 900 }}>{event.title}</Typography>
                      <Typography variant="caption" sx={{ color: shell.muted }}>{event.by}</Typography>
                      <Typography variant="body2" sx={{ color: shell.ink, mt: 0.25 }}>{event.note}</Typography>
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOrder(null)}>关闭</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(reviewAction)} onClose={closeReviewDialog} maxWidth="xs" fullWidth>
        <DialogTitle>
          {reviewAction?.type === 'approve' ? '确认审核通过' : reviewAction?.type === 'return' ? '退回修改' : '驳回终止'}
        </DialogTitle>
        <DialogContent dividers>
          {reviewAction && (
            <Stack spacing={1.25}>
              <Alert severity={reviewAction.type === 'approve' ? 'info' : reviewAction.type === 'return' ? 'warning' : 'error'}>
                {reviewAction.type === 'approve'
                  ? '通过后，该售后挽回订单会进入财务中心的“售后挽回分账”，不会进入订单分账。'
                  : reviewAction.type === 'return'
                    ? '退回后，创建人可按原因修改后重新提交。'
                    : '驳回后，该售后挽回订单终止，不进入分账。'}
              </Alert>
              <Box sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 1, bgcolor: shell.soft }}>
                <Typography variant="body2">挽回订单：{reviewAction.row.recoveryNo}</Typography>
                <Typography variant="body2">客户：{reviewAction.row.customerName}</Typography>
                <Typography variant="body2">第三方订单：{reviewAction.row.thirdPartyOrderNo}</Typography>
                <Typography variant="body2">挽回金额：{formatCurrency(reviewAction.row.recoveryAmount)}</Typography>
              </Box>
              {reviewAction.type !== 'approve' && (
                <TextField
                  label={reviewAction.type === 'return' ? '退回原因' : '驳回原因'}
                  value={reviewReason}
                  onChange={(event) => setReviewReason(event.target.value)}
                  multiline
                  minRows={3}
                  fullWidth
                  required
                />
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReviewDialog}>取消</Button>
          <Button
            color={reviewAction?.type === 'reject' ? 'error' : reviewAction?.type === 'return' ? 'warning' : 'primary'}
            variant="contained"
            disabled={(reviewAction?.type === 'return' || reviewAction?.type === 'reject') && !reviewReason.trim()}
            onClick={handleReviewSubmit}
          >
            {reviewAction?.type === 'approve' ? '确认通过' : reviewAction?.type === 'return' ? '确认退回修改' : '确认驳回终止'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(approvedOrder)} onClose={() => setApprovedOrder(null)} maxWidth="xs" fullWidth>
        <DialogTitle>审核通过</DialogTitle>
        <DialogContent dividers>
          {approvedOrder && (
            <Stack spacing={1}>
              <Alert severity="success">售后挽回订单已进入“待分账”。</Alert>
              <Typography variant="body2">挽回订单：{approvedOrder.recoveryNo}</Typography>
              <Typography variant="body2">挽回金额：{formatCurrency(approvedOrder.recoveryAmount)}</Typography>
              <Typography variant="body2" sx={{ color: shell.muted }}>
                下一步由财务在“售后挽回分账”里选择人员、提成角色和提成方案。
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApprovedOrder(null)}>关闭</Button>
          <Button
            variant="contained"
            onClick={() => {
              setApprovedOrder(null);
              navigate(`${ROUTES.FINANCE}?tab=recovery-settlement`);
            }}
          >
            去售后挽回分账
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteConfirmOrder)} onClose={() => setDeleteConfirmOrder(null)} maxWidth="sm" fullWidth>
        <DialogTitle>删除售后挽回订单</DialogTitle>
        <DialogContent dividers>
          {deleteConfirmOrder && (
            <Stack spacing={1.25}>
              <Alert severity="warning">
                {deleteConfirmOrder.settlementStatus === '已撤回'
                  ? '该挽回单的提成已经撤回。删除后订单会从售后挽回列表移除，财务中心仍会保留已撤回分账和操作记录。'
                  : '删除后，该售后挽回订单将从订单列表中移除。'}
              </Alert>
              <Box sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 1.25, bgcolor: shell.soft }}>
                <Typography variant="body2" sx={{ fontWeight: 900 }}>{deleteConfirmOrder.recoveryNo}</Typography>
                <Typography variant="body2" sx={{ color: shell.muted }}>
                  {deleteConfirmOrder.customerName} · {deleteConfirmOrder.thirdPartyOrderNo || '-'}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  挽回金额：<Box component="span" sx={{ color: shell.green, fontWeight: 900 }}>{formatCurrency(deleteConfirmOrder.recoveryAmount)}</Box>
                </Typography>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOrder(null)}>取消</Button>
          <Button color="error" variant="contained" onClick={confirmDelete}>确认删除</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(errorDialog)} onClose={() => setErrorDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{errorDialog?.title || '操作失败'}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: shell.ink }}>
            {errorDialog?.text}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setErrorDialog(null)}>确定</Button>
        </DialogActions>
      </Dialog>

      <TableViewSettingsDialog
        open={viewSettingsOpen}
        title={mode === 'review' ? '售后挽回审核台视图设置' : '售后挽回订单列表视图设置'}
        description="勾选后会显示在售后挽回列表中，设置会保存在当前浏览器。"
        columns={tableColumns}
        visibleColumnIds={visibleColumnIds}
        columnOrder={viewConfig.columnOrder}
        frozenColumnCount={viewConfig.frozenColumnCount}
        maxFrozenColumnCount={visibleColumns.length}
        onClose={() => setViewSettingsOpen(false)}
        onToggleColumn={toggleColumn}
        onReorderColumn={reorderColumn}
        onFrozenColumnCountChange={setFrozenColumnCount}
        onReset={resetViewConfig}
      />
    </Box>
  );
};

export default RecoveryOrderTab;
