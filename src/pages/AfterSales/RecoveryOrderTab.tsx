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
import PublishedWithChangesOutlinedIcon from '@mui/icons-material/PublishedWithChangesOutlined';
import HistoryIcon from '@mui/icons-material/History';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SortIcon from '@mui/icons-material/Sort';
import BlockIcon from '@mui/icons-material/Block';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useNavigate } from 'react-router-dom';
import { productApi, recoveryOrderApi, settingsApi } from '../../api';
import { businessExportApi } from '../../api/businessExportApi';
import { formatCurrency, formatDate, formatEmployeeNameWithPosition, formatPaginationRows } from '../../shared/utils/formatters';
import { getProductLevelColor, getProductLevelTagSx, OFFICIAL_PAYMENT_CHANNELS, ROUTES } from '../../shared/utils/constants';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import BusinessFormSection from '../../shared/components/BusinessFormSection';
import { BusinessDetailField, BusinessDetailSection } from '../../shared/components/BusinessDetailSection';
import TableViewSettingsDialog, { type TableViewColumnConfig } from '../../shared/components/TableViewSettingsDialog';
import { useTableViewConfig } from '../../shared/hooks/useTableViewConfig';
import { canReviewRecoveryOrders, hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import { isSuperAdmin } from '../../shared/utils/permissions';
import type { RecoveryOrder, RecoveryOrderCorrectionPrecheck, RecoveryOrderFilters, RecoveryOrderInput, RecoveryOrderStatus } from '../../types/recoveryOrder';
import { isRecoveryOrderDeletionLocked } from '../../shared/utils/recoveryOrderDeletion';
import type { User } from '../../types/settings';
import type { AfterSalesSourceConfig } from '../../types/settings';
import type { BusinessAttachment } from '../../types/businessAttachment';
import type { Product } from '../../types/product';
import useAuthStore from '../../store/useAuthStore';
import AttachmentPreviewLink from '../../shared/components/AttachmentPreview';
import BusinessAttachmentPicker from '../../shared/components/BusinessAttachmentPicker';
import BusinessAttachmentLinks from '../../shared/components/BusinessAttachmentLinks';
import { subscribePageRefresh } from '../../shared/utils/pageRefresh';
import { getRecoveryEvidenceAttachments } from '../../shared/utils/recoveryEvidence';
import {
  REVIEW_QUEUE_OPTIONS,
  getRecoveryOrderUnifiedReviewStatus,
  getRecoveryOrderReviewStatuses,
  type ReviewQueueView,
} from '../../shared/utils/reviewQueue';
import BusinessImportReviewControls from '../../shared/components/BusinessImportReviewControls';
import BusinessImportReviewPageCheckbox from '../../shared/components/BusinessImportReviewPageCheckbox';
import {
  isImportedPendingReviewRecord,
  toggleImportedReviewId,
  type BusinessImportReviewSelection,
} from '../../shared/utils/businessImportReviewModel';
import BusinessStatusChip from '../../shared/components/BusinessStatusChip';
import SettlementStatusChip from '../../shared/components/SettlementStatusChip';
import type { SettlementStatus } from '../../types/commission';
import { SETTLEMENT_STATUSES, normalizeSettlementStatus } from '../../shared/utils/settlementStatus';
import BusinessExportDialog, { type BusinessExportDialogRequest } from '../../shared/components/BusinessExportDialog';
import { buildBusinessExportBrowserRequest, unwrapBusinessExportResponse } from '../../shared/utils/businessExportPageRequest';

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

function localDateBoundaryIso(value: string, endOfDay = false): string | undefined {
  if (!value) return undefined;
  const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00.000';
  const date = new Date(`${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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
  originalProductId: '',
  originalProductLevel: '',
  originalAmount: '',
  recoveryAmount: '',
  recoveryAt: toDateTimeInputValue(),
  officialPaymentChannel: '',
  paymentOrderNo: '',
  paymentAt: '',
  recoveryAttachments: [] as BusinessAttachment[],
  recoveryUserId: '',
  assistUserId: '',
  remark: '',
};

type RecoveryOrderForm = typeof emptyForm;
type RecoveryFormMode = 'create' | 'review-edit' | 'metadata' | 'correction';

function getRecoveryOrderBusinessStatus(order: RecoveryOrder): SettlementStatus {
  return normalizeSettlementStatus(order.settlementStatus, '待处理');
}

function DetailField({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <BusinessDetailField label={label} wide={wide}>{children}</BusinessDetailField>;
}

interface RecoveryOrderTabProps {
  mode: 'list' | 'review';
  importBatchId?: string;
  refreshSignal?: number;
  onImportBatchClear?: () => void;
  createSignal?: number;
  viewSettingsSignal?: number;
  exportSignal?: number;
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
  | 'customerMatchStatus'
  | 'thirdPartyOrderNo'
  | 'sourcePlatformShop'
  | 'sourcePlatformName'
  | 'sourceShopName'
  | 'originalProduct'
  | 'originalProductLevel'
  | 'originalAmount'
  | 'recoveryAmount'
  | 'officialPaymentChannel'
  | 'paymentOrderNo'
  | 'paymentAt'
  | 'recoveryUserName'
  | 'assistUserName'
  | 'createdByName'
  | 'recoveryAt'
  | 'status'
  | 'auditorName'
  | 'auditedAt'
  | 'auditReason'
  | 'remark'
  | 'createdAt'
  | 'updatedAt'
  | 'importBatchId'
  | 'importRowNumber'
  | 'importedByName'
  | 'importedAt'
  | 'actions';

const RECOVERY_ORDER_LIST_COLUMNS: Array<TableViewColumnConfig & { id: RecoveryOrderColumnId }> = [
  { id: 'recoveryNo', label: '挽回订单号' },
  { id: 'status', label: '分账状态' },
  { id: 'customerName', label: '客户' },
  { id: 'thirdPartyOrderNo', label: '第三方平台订单' },
  { id: 'sourcePlatformShop', label: '来源平台 / 店铺' },
  { id: 'originalProduct', label: '原产品' },
  { id: 'originalProductLevel', label: '原产品等级' },
  { id: 'originalAmount', label: '原付款金额' },
  { id: 'recoveryAmount', label: '挽回成交金额' },
  { id: 'recoveryUserName', label: '挽回人员' },
  { id: 'createdByName', label: '订单创建人' },
  { id: 'recoveryAt', label: '挽回成交时间' },
  { id: 'createdAt', label: '创建时间' },
  { id: 'customerPhone', label: '手机号' },
  { id: 'customerWechat', label: '微信' },
  { id: 'customerMatchStatus', label: 'CRM识别状态' },
  { id: 'sourcePlatformName', label: '来源平台' },
  { id: 'sourceShopName', label: '来源店铺' },
  { id: 'officialPaymentChannel', label: '官方收款渠道' },
  { id: 'paymentOrderNo', label: '付款订单号' },
  { id: 'paymentAt', label: '付款时间' },
  { id: 'assistUserName', label: '协助人员' },
  { id: 'remark', label: '备注' },
  { id: 'updatedAt', label: '更新时间' },
  { id: 'importBatchId', label: '导入批次' },
  { id: 'importRowNumber', label: 'Excel 行号' },
  { id: 'importedByName', label: '导入人' },
  { id: 'importedAt', label: '导入时间' },
];

const RECOVERY_ORDER_REVIEW_COLUMNS: Array<TableViewColumnConfig & { id: RecoveryOrderColumnId }> = [
  { id: 'recoveryNo', label: '挽回订单号' },
  { id: 'status', label: '审核状态' },
  { id: 'customerName', label: '客户' },
  { id: 'thirdPartyOrderNo', label: '第三方平台订单' },
  { id: 'sourcePlatformShop', label: '来源平台 / 店铺' },
  { id: 'originalProduct', label: '原产品' },
  { id: 'originalAmount', label: '原付款金额' },
  { id: 'recoveryAmount', label: '挽回成交金额' },
  { id: 'recoveryUserName', label: '挽回人员' },
  { id: 'createdByName', label: '订单创建人' },
  { id: 'createdAt', label: '提交时间' },
  { id: 'auditorName', label: '审核人' },
  { id: 'auditedAt', label: '审核时间' },
  { id: 'auditReason', label: '退回 / 驳回原因' },
  { id: 'customerPhone', label: '手机号' },
  { id: 'customerWechat', label: '微信' },
  { id: 'customerMatchStatus', label: 'CRM识别状态' },
  { id: 'sourcePlatformName', label: '来源平台' },
  { id: 'sourceShopName', label: '来源店铺' },
  { id: 'originalProductLevel', label: '原产品等级' },
  { id: 'recoveryAt', label: '挽回成交时间' },
  { id: 'officialPaymentChannel', label: '官方收款渠道' },
  { id: 'paymentOrderNo', label: '付款订单号' },
  { id: 'paymentAt', label: '付款时间' },
  { id: 'assistUserName', label: '协助人员' },
  { id: 'remark', label: '备注' },
  { id: 'updatedAt', label: '更新时间' },
  { id: 'importBatchId', label: '导入批次' },
  { id: 'importRowNumber', label: 'Excel 行号' },
  { id: 'importedByName', label: '导入人' },
  { id: 'importedAt', label: '导入时间' },
];

const DEFAULT_LIST_VISIBLE_COLUMNS: RecoveryOrderColumnId[] = RECOVERY_ORDER_LIST_COLUMNS.slice(0, 13).map((column) => column.id);
const DEFAULT_REVIEW_VISIBLE_COLUMNS: RecoveryOrderColumnId[] = RECOVERY_ORDER_REVIEW_COLUMNS.slice(0, 14).map((column) => column.id);
const RECOVERY_LIST_STATUSES: RecoveryOrderStatus[] = ['待分账', '已分账'];
const RECOVERY_PROGRESS_OPTIONS = SETTLEMENT_STATUSES;

function isRecoveryOrderLocked(row: RecoveryOrder): boolean {
  return row.status === '已分账' || ['待确认', '待发放', '已撤回'].includes(row.settlementStatus || '未分账');
}

const RecoveryOrderTab: React.FC<RecoveryOrderTabProps> = ({
  mode,
  importBatchId = '',
  refreshSignal = 0,
  onImportBatchClear,
  createSignal = 0,
  viewSettingsSignal = 0,
  exportSignal = 0,
}) => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const canCreate = hasPermission(currentUser, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE);
  const canReviewAction = canReviewRecoveryOrders(currentUser);
  const canEdit = hasPermission(currentUser, PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT);
  const canCorrect = hasPermission(currentUser, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CORRECT, 'write');
  const canDelete = hasPermission(currentUser, PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE, 'delete');
  const canViewHistory = hasPermission(currentUser, PERMISSION_KEYS.AFTER_SALES_RECOVERY_HISTORY);
  const canCleanupReview = isSuperAdmin(currentUser);
  const [rows, setRows] = useState<RecoveryOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sourceConfigs, setSourceConfigs] = useState<AfterSalesSourceConfig[]>([]);
  const [search, setSearch] = useState('');
  const [recoveryProgress, setRecoveryProgress] = useState('');
  const [recoveryUserId, setRecoveryUserId] = useState('');
  const [recoveryStartDate, setRecoveryStartDate] = useState('');
  const [recoveryEndDate, setRecoveryEndDate] = useState('');
  const [sortBy, setSortBy] = useState<'updatedAt' | 'createdAt' | 'recoveryAt'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [reviewQueueView, setReviewQueueView] = useState<ReviewQueueView>('pending');
  const [reviewImportBatchId, setReviewImportBatchId] = useState(importBatchId);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RecoveryOrderForm>(emptyForm);
  const [editingOrder, setEditingOrder] = useState<RecoveryOrder | null>(null);
  const [formMode, setFormMode] = useState<RecoveryFormMode>('create');
  const [correctionReason, setCorrectionReason] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [correctionBlocker, setCorrectionBlocker] = useState<{ order: RecoveryOrder; precheck: RecoveryOrderCorrectionPrecheck } | null>(null);
  const [message, setMessage] = useState<{ type: 'success'; text: string } | null>(null);
  const [errorDialog, setErrorDialog] = useState<{ title: string; text: string } | null>(null);
  const [detailOrder, setDetailOrder] = useState<RecoveryOrder | null>(null);
  const [historyOrder, setHistoryOrder] = useState<RecoveryOrder | null>(null);
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState<RecoveryOrder | null>(null);
  const [cleanupReviewOrder, setCleanupReviewOrder] = useState<RecoveryOrder | null>(null);
  const [cleanupReviewReason, setCleanupReviewReason] = useState('');
  const [cleanupReviewSubmitting, setCleanupReviewSubmitting] = useState(false);
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [importSelection, setImportSelection] = useState<BusinessImportReviewSelection>({ mode: 'ids', ids: [] });
  const [approvedOrder, setApprovedOrder] = useState<RecoveryOrder | null>(null);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const loadRequestIdRef = React.useRef(0);
  const handledCreateSignalRef = React.useRef(createSignal);
  const handledViewSettingsSignalRef = React.useRef(viewSettingsSignal);
  const handledExportSignalRef = React.useRef(exportSignal);
  const tableColumns = mode === 'list' ? RECOVERY_ORDER_LIST_COLUMNS : RECOVERY_ORDER_REVIEW_COLUMNS;
  const defaultVisibleColumns = mode === 'list' ? DEFAULT_LIST_VISIBLE_COLUMNS : DEFAULT_REVIEW_VISIBLE_COLUMNS;

  const {
    viewConfig,
    visibleColumns,
    visibleColumnIds,
    toggleColumn,
    reorderColumn,
    setFrozenColumnCount,
    resetViewConfig,
  } = useTableViewConfig(`after_sales_recovery_${mode}_table_view_v2`, tableColumns, defaultVisibleColumns);

  const filters = useMemo<RecoveryOrderFilters>(() => ({
    search,
    status: '全部',
    statuses: mode === 'review'
      ? getRecoveryOrderReviewStatuses(reviewQueueView)
      : RECOVERY_LIST_STATUSES,
    settlementStatuses: mode === 'list' && recoveryProgress
      ? [recoveryProgress] as RecoveryOrderFilters['settlementStatuses']
      : undefined,
    recoveryUserId: recoveryUserId || undefined,
    includeDeleted: mode === 'review' && reviewQueueView === 'all',
    scopeDomain: mode === 'review' ? 'recoveryOrderApplications' : 'recoveryOrders',
    importBatchId: mode === 'review' ? reviewImportBatchId || undefined : undefined,
    recoveryStartDate: localDateBoundaryIso(recoveryStartDate),
    recoveryEndDate: localDateBoundaryIso(recoveryEndDate, true),
    sortBy,
    sortDirection,
    page: page + 1,
    pageSize: rowsPerPage,
  }), [mode, page, recoveryEndDate, recoveryProgress, recoveryStartDate, recoveryUserId, reviewImportBatchId, reviewQueueView, rowsPerPage, search, sortBy, sortDirection]);

  const handleRecoveryTimeSort = () => {
    setSortDirection((current) => sortBy === 'recoveryAt' && current === 'desc' ? 'asc' : 'desc');
    setSortBy('recoveryAt');
    setPage(0);
  };

  const handleResetFilters = () => {
    setSearch('');
    setRecoveryProgress('');
    setRecoveryUserId('');
    setRecoveryStartDate('');
    setRecoveryEndDate('');
    setSortBy('createdAt');
    setSortDirection('desc');
    if (mode === 'review') {
      setReviewQueueView('pending');
      setReviewImportBatchId('');
      onImportBatchClear?.();
    }
    setPage(0);
  };

  const load = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    setLoading(true);
    setLoadError('');
    try {
      const [listRes, usersRes, productsRes, sourceRes] = await Promise.all([
        recoveryOrderApi.fetchRecoveryOrders(filters),
        settingsApi.fetchAssignableUsers(),
        productApi.getProducts(),
        settingsApi.fetchAfterSalesSourceConfigs(),
      ]);
      if (requestId !== loadRequestIdRef.current) return;
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
      if (requestId !== loadRequestIdRef.current) return;
      setLoadError(error instanceof Error ? error.message : '售后订单加载失败');
    } finally {
      if (requestId === loadRequestIdRef.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
    const unsubscribe = subscribePageRefresh(() => { void load(); });
    return () => {
      unsubscribe();
      loadRequestIdRef.current += 1;
    };
  }, [load, refreshSignal]);

  useEffect(() => {
    setReviewImportBatchId(importBatchId);
    setPage(0);
  }, [importBatchId]);

  useEffect(() => {
    setImportSelection({ mode: 'ids', ids: [] });
  }, [mode, reviewImportBatchId, reviewQueueView, search]);

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

  useEffect(() => {
    if (mode !== 'list' || exportSignal <= 0) return;
    if (handledExportSignalRef.current === exportSignal) return;
    handledExportSignalRef.current = exportSignal;
    setExportOpen(true);
  }, [exportSignal, mode]);

  const handleExportRecoveryOrders = async (request: BusinessExportDialogRequest) => {
    const response = await businessExportApi.exportRecoveryOrders(buildBusinessExportBrowserRequest(
      filters,
      { ...request, columnIds: visibleColumns.map((column) => column.id) },
    ));
    return unwrapBusinessExportResponse(response);
  };

  const activeUsers = users.filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active');
  const productOptions = useMemo(() => [...products].sort((a, b) => a.sortOrder - b.sortOrder), [products]);
  const platformOptions = useMemo(() => sourceConfigs.filter((item) => !item.parentId && (item.isActive || item.id === form.sourcePlatformId)).sort((a, b) => a.sortOrder - b.sortOrder), [form.sourcePlatformId, sourceConfigs]);
  const shopOptions = useMemo(() => sourceConfigs.filter((item) => item.parentId === form.sourcePlatformId && (item.isActive || item.id === form.sourceShopId)).sort((a, b) => a.sortOrder - b.sortOrder), [form.sourcePlatformId, form.sourceShopId, sourceConfigs]);
  const canResubmitReturnedOrder = useCallback((row: RecoveryOrder) => (
    ['退回修改', '审核驳回'].includes(row.status)
    && Boolean(currentUser)
    && row.createdBy === currentUser?.id
  ), [currentUser]);

  const showErrorDialog = useCallback((text: string, title = '操作失败') => {
    setErrorDialog({ title, text });
  }, []);

  const openCreate = () => {
    setMessage(null);
    setEditingOrder(null);
    setFormMode('create');
    setCorrectionReason('');
    setSubmitAttempted(false);
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

  const openEdit = async (row: RecoveryOrder, nextMode: Exclude<RecoveryFormMode, 'create'> = mode === 'review' ? 'review-edit' : 'metadata') => {
    if (nextMode === 'correction') {
      const precheck = await recoveryOrderApi.precheckRecoveryOrderCorrection(row.id);
      if (precheck.code !== 0 || !precheck.data) {
        showErrorDialog(precheck.message || '售后挽回订单更正预检失败');
        return;
      }
      if (!precheck.data.allowed) {
        setDetailOrder(null);
        setCorrectionBlocker({ order: row, precheck: precheck.data });
        return;
      }
    } else if (nextMode === 'review-edit' && isRecoveryOrderLocked(row)) {
      showErrorDialog('已进入分账链路的售后挽回订单不能从审核台修改');
      return;
    }
    setMessage(null);
    const detail = await loadRecoveryDetail(row);
    if (!detail) return;
    setEditingOrder(detail);
    setFormMode(nextMode);
    setCorrectionReason('');
    setSubmitAttempted(false);
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
      originalProductId: detail.originalProductId || '',
      originalProductLevel: detail.originalProductLevel || '',
      originalAmount: String(detail.originalAmount || ''),
      recoveryAmount: String(detail.recoveryAmount || ''),
      recoveryAt: toDateTimeInputValue(detail.recoveryAt || detail.createdAt),
      officialPaymentChannel: detail.officialPaymentChannel || '',
      paymentOrderNo: detail.paymentOrderNo || '',
      paymentAt: detail.paymentAt ? toDateTimeInputValue(detail.paymentAt) : '',
      recoveryAttachments: getRecoveryEvidenceAttachments(detail),
      recoveryUserId: detail.recoveryUserId || '',
      assistUserId: detail.assistUserId || '',
      remark: detail.remark || '',
    });
    setOpen(true);
  };

  const handleProductChange = (productName: string) => {
    const product = productOptions.find((item) => item.name === productName);
    setForm((prev) => ({
      ...prev,
      originalProduct: product?.name || productName,
      originalProductId: product?.id || '',
      originalProductLevel: product?.level || '',
      originalAmount: product && !prev.originalAmount ? String(product.price || '') : prev.originalAmount,
    }));
  };

  const handleCreate = async () => {
    if (!currentUser) return;
    if (formMode !== 'metadata') {
      setSubmitAttempted(true);
      const missingContact = !form.customerPhone.trim() && !form.customerWechat.trim();
      if (
        !form.customerName.trim()
        || missingContact
        || !form.thirdPartyOrderNo.trim()
        || !form.originalProduct.trim()
        || Number(form.originalAmount) <= 0
        || Number(form.recoveryAmount) <= 0
        || !form.recoveryAt
        || !form.recoveryUserId
      ) {
        showErrorDialog('请完整填写客户联系方式、原订单信息和挽回信息', '无法提交');
        return;
      }
    }
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
      originalProductId: form.originalProductId,
      originalProductLevel: form.originalProductLevel,
      originalAmount: Number(form.originalAmount) || 0,
      recoveryAmount: Number(form.recoveryAmount) || 0,
      recoveryAt: form.recoveryAt ? new Date(form.recoveryAt).toISOString() : undefined,
      officialPaymentChannel: form.officialPaymentChannel as RecoveryOrderInput['officialPaymentChannel'],
      paymentOrderNo: form.paymentOrderNo,
      paymentAt: form.paymentAt ? new Date(form.paymentAt).toISOString() : undefined,
      recoveryAttachments: form.recoveryAttachments,
      recoveryUserId: recoveryUser?.id || currentUser.id,
      recoveryUserName: recoveryUser?.name || currentUser.name,
      assistUserId: form.assistUserId || undefined,
      remark: form.remark,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
    };
    const res = editingOrder
      ? formMode === 'metadata'
        ? await recoveryOrderApi.editRecoveryOrderMetadata(editingOrder.id, {
          sourcePlatform: input.sourcePlatform,
          sourcePlatformId: input.sourcePlatformId,
          sourcePlatformName: input.sourcePlatformName,
          sourceShopId: input.sourceShopId,
          sourceShopName: input.sourceShopName,
          paymentOrderNo: input.paymentOrderNo,
          recoveryAttachments: input.recoveryAttachments,
          remark: input.remark,
        })
        : formMode === 'correction'
          ? await recoveryOrderApi.correctRecoveryOrder(editingOrder.id, { reason: correctionReason, data: input })
          : await recoveryOrderApi.updateRecoveryOrder(editingOrder.id, input)
      : await recoveryOrderApi.createRecoveryOrder(input);
    if (res.code !== 0) {
      showErrorDialog(
        res.message || (formMode === 'correction'
          ? '售后挽回订单更正失败'
          : editingOrder ? '修改售后挽回订单失败' : '新建售后挽回订单失败'),
        '无法提交',
      );
      return;
    }
    setOpen(false);
    setEditingOrder(null);
    setMessage({
      type: 'success',
      text: formMode === 'metadata'
        ? '售后挽回订单补充资料已保存，不影响现有审核和分账状态'
        : formMode === 'correction'
          ? '售后挽回订单已更正，未发放分账已回退为待处理'
          : editingOrder
            ? '已修改售后挽回订单，并重新提交审核'
            : '已提交售后挽回订单，待财务审核通过后进入售后挽回订单列表',
    });
    await load();
    if (formMode === 'create' || formMode === 'review-edit') navigate(`${ROUTES.AFTER_SALES}?tab=recovery-review`);
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

  const cleanupDeletedRecoveryOrderReview = async () => {
    if (!cleanupReviewOrder) return;
    const reason = cleanupReviewReason.trim();
    if (!reason) return;
    setCleanupReviewSubmitting(true);
    try {
      const res = await recoveryOrderApi.cleanupDeletedRecoveryOrderReview(cleanupReviewOrder.id, reason);
      if (res.code !== 0) {
        showErrorDialog(res.message || '清理售后审核记录失败');
        return;
      }
      setCleanupReviewOrder(null);
      setCleanupReviewReason('');
      setMessage({ type: 'success', text: '已清理售后审核记录' });
      await load();
    } finally {
      setCleanupReviewSubmitting(false);
    }
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
      setMessage({ type: 'success', text: '已驳回挽回订单，可在审核台“已处理”中查看' });
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
      case 'customerMatchStatus':
        return row.crmIdentityStatus || row.customerMatchStatus || '-';
      case 'thirdPartyOrderNo':
        return row.thirdPartyOrderNo;
      case 'sourcePlatformShop':
        return [row.sourcePlatformName || row.sourcePlatform, row.sourceShopName].filter(Boolean).join(' / ') || '-';
      case 'sourcePlatformName':
        return row.sourcePlatformName || row.sourcePlatform || '-';
      case 'sourceShopName':
        return row.sourceShopName || '-';
      case 'originalProduct':
        return row.originalProduct;
      case 'originalProductLevel': {
        const level = row.originalProductLevel || productOptions.find((item) => item.name === row.originalProduct)?.level;
        return level ? <Chip label={level} size="small" sx={getProductLevelTagSx(level)} /> : '-';
      }
      case 'originalAmount':
        return formatCurrency(row.originalAmount);
      case 'recoveryAmount':
        return <Typography variant="body2" sx={{ fontWeight: 900, color: shell.green }}>{formatCurrency(row.recoveryAmount)}</Typography>;
      case 'recoveryUserName':
        return row.recoveryUserName;
      case 'assistUserName':
        return row.assistUserName || '-';
      case 'createdByName':
        return row.createdByName || '-';
      case 'recoveryAt':
        return formatDate(row.recoveryAt || row.createdAt, 'yyyy-MM-dd HH:mm');
      case 'status':
        {
          const unifiedStatus = getRecoveryOrderUnifiedReviewStatus(row.status, Boolean(row.deletedAt));
          const displayStatus = mode === 'review' ? unifiedStatus : getRecoveryOrderBusinessStatus(row);
          return (
          <Box>
              {mode === 'review'
              ? <BusinessStatusChip status={displayStatus} />
              : <SettlementStatusChip status={displayStatus} />}
          </Box>
          );
        }
      case 'officialPaymentChannel':
        return row.officialPaymentChannel || '-';
      case 'paymentOrderNo':
        return row.paymentOrderNo || '-';
      case 'paymentAt':
        return row.paymentAt ? formatDate(row.paymentAt, 'yyyy-MM-dd HH:mm') : '-';
      case 'auditorName':
        return row.auditorName || '-';
      case 'auditedAt':
        return row.auditedAt ? formatDate(row.auditedAt, 'yyyy-MM-dd HH:mm') : '-';
      case 'auditReason':
        return row.auditReason || '-';
      case 'remark':
        return row.remark || '-';
      case 'createdAt':
        return formatDate(row.createdAt, 'yyyy-MM-dd HH:mm');
      case 'updatedAt':
        return formatDate(row.updatedAt, 'yyyy-MM-dd HH:mm');
      case 'importBatchId':
        return row.importBatchId || '-';
      case 'importRowNumber':
        return row.importRowNumber || '-';
      case 'importedByName':
        return row.importedByName || '-';
      case 'importedAt':
        return row.importedAt ? formatDate(row.importedAt, 'yyyy-MM-dd HH:mm') : '-';
      case 'actions':
        if (mode === 'review') {
          if (['退回修改', '审核驳回'].includes(row.status) && !row.deletedAt) {
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
          if (row.status === '待审核' && !row.deletedAt) return (
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
          return (
            <Stack
              direction="row"
              spacing={0.25}
              justifyContent="center"
              sx={{ minWidth: 148, flexWrap: 'nowrap', whiteSpace: 'nowrap' }}
            >
              {canCleanupReview && (row.status === '审核驳回' || Boolean(row.deletedAt)) && (
                <Tooltip title={row.status === '审核驳回' ? '清理已驳回审核记录' : '清理已删除业务单的审核记录'}>
                  <IconButton
                    aria-label="清理售后审核记录"
                    size="small"
                    sx={{ color: shell.red }}
                    onClick={() => {
                      setCleanupReviewOrder(row);
                      setCleanupReviewReason('');
                    }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title="查看">
                <IconButton size="small" sx={{ color: shell.blue }} onClick={() => void openDetail(row)}>
                  <VisibilityIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              {canViewHistory ? (
                <Tooltip title="审核历史">
                  <IconButton size="small" sx={{ color: shell.green }} onClick={() => setHistoryOrder(row)}>
                    <HistoryIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
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
            {canEdit && (
              <Tooltip title="编辑资料">
                <IconButton
                  size="small"
                  sx={{ color: '#0f766e' }}
                  onClick={() => void openEdit(row, 'metadata')}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {canCorrect && (
              <Tooltip title="挽回单更正">
                <IconButton
                  size="small"
                  sx={{ color: shell.amber }}
                  onClick={() => void openEdit(row, 'correction')}
                >
                  <PublishedWithChangesOutlinedIcon fontSize="small" />
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

  const metadataOnly = formMode === 'metadata';
  const validateFullForm = submitAttempted && !metadataOnly;
  const customerErrorCount = validateFullForm
    ? Number(!form.customerName.trim()) + Number(!form.customerPhone.trim() && !form.customerWechat.trim())
    : 0;
  const originalOrderErrorCount = validateFullForm
    ? Number(!form.thirdPartyOrderNo.trim()) + Number(!form.originalProduct.trim()) + Number(Number(form.originalAmount) <= 0)
    : 0;
  const recoveryErrorCount = validateFullForm
    ? Number(Number(form.recoveryAmount) <= 0) + Number(!form.recoveryAt) + Number(!form.recoveryUserId)
    : 0;
  const recoveryFormTitle = formMode === 'correction'
    ? '售后挽回订单更正'
    : formMode === 'metadata'
      ? '编辑售后挽回订单资料'
      : editingOrder ? '修改售后挽回订单申请' : '新建售后挽回订单';
  const recoveryFormAction = formMode === 'correction'
    ? '确认更正并回退分账'
    : formMode === 'metadata'
      ? '保存资料'
      : editingOrder ? '保存并提交审核' : '提交审核';

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

      <Box sx={{ display: 'flex', gap: 2, mt: 0.5, mb: 1.5, flexWrap: 'wrap', alignItems: 'center', '& > *': { maxWidth: '100%' } }}>
        <TextField
          size="small"
          placeholder="搜索挽回单号/客户/手机/微信/第三方订单"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          sx={{ width: { xs: '100%', sm: 240 } }}
        />
        {mode === 'list' && (
          <TextField
            select
            size="small"
            label="分账状态"
            value={recoveryProgress}
            onChange={(event) => {
              setRecoveryProgress(event.target.value);
              setPage(0);
            }}
            sx={{ width: { xs: '100%', sm: 140 } }}
          >
            <MenuItem value="">全部</MenuItem>
            {RECOVERY_PROGRESS_OPTIONS.map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
          </TextField>
        )}
        <TextField
          select
          size="small"
          label="挽回人员"
          value={recoveryUserId}
          onChange={(event) => {
            setRecoveryUserId(event.target.value);
            setPage(0);
          }}
          sx={{ width: { xs: '100%', sm: 170 } }}
        >
          <MenuItem value="">全部</MenuItem>
          {activeUsers.map((user) => <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
        </TextField>
        {mode === 'review' && (
          <TextField
            select
            size="small"
            label="审核视图"
            value={reviewQueueView}
            onChange={(event) => {
              setReviewQueueView(event.target.value as ReviewQueueView);
              setPage(0);
            }}
            sx={{ width: { xs: '100%', sm: 150 } }}
          >
            {REVIEW_QUEUE_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </TextField>
        )}
        <TextField
          size="small"
          label="挽回成交开始"
          type="date"
          value={recoveryStartDate}
          onChange={(event) => {
            setRecoveryStartDate(event.target.value);
            setPage(0);
          }}
          InputLabelProps={{ shrink: true }}
          sx={{ width: { xs: '100%', sm: 176 } }}
        />
        <TextField
          size="small"
          label="挽回成交结束"
          type="date"
          value={recoveryEndDate}
          onChange={(event) => {
            setRecoveryEndDate(event.target.value);
            setPage(0);
          }}
          InputLabelProps={{ shrink: true }}
          sx={{ width: { xs: '100%', sm: 176 } }}
        />
        <Button variant="outlined" startIcon={<SortIcon />} onClick={handleRecoveryTimeSort}>
          {sortBy === 'recoveryAt'
            ? `挽回成交时间${sortDirection === 'asc' ? '升序' : '降序'}`
            : '按挽回成交时间排序'}
        </Button>
        <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={handleResetFilters}>
          重置
        </Button>
      </Box>

      {mode === 'review' && canReviewAction ? (
        <BusinessImportReviewControls
          module="recovery_orders"
          importBatchId={reviewImportBatchId}
          selection={importSelection}
          canReview={canReviewAction}
          onSelectionChange={setImportSelection}
          onRefresh={load}
        />
      ) : null}

      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: '6px 6px 0 0' }}>
        <Table sx={{ minWidth: 1360 }}>
          <TableHead>
            <TableRow>
              {mode === 'review' ? (
                <TableCell padding="checkbox">
                  <BusinessImportReviewPageCheckbox
                    module="recovery_orders"
                    canReview={canReviewAction}
                    records={rows}
                    selection={importSelection}
                    onSelectionChange={setImportSelection}
                    ariaLabel="选择当前页导入待审记录"
                  />
                </TableCell>
              ) : null}
              {visibleColumns.map((column) => (
                <TableCell
                  key={column.id}
                  align="left"
                  sx={{
                    ...(['recoveryAt', 'paymentAt', 'createdAt', 'auditedAt', 'updatedAt'].includes(column.id) ? { minWidth: 170, whiteSpace: 'nowrap' } : {}),
                  }}
                >
                  {column.label}
                </TableCell>
              ))}
              <TableCell align="center" sx={{ minWidth: mode === 'review' ? 176 : 156, width: mode === 'review' ? 176 : 156, whiteSpace: 'nowrap', position: 'sticky', right: 0, zIndex: 4, bgcolor: '#f8fafc', boxShadow: `-1px 0 0 ${shell.line}` }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} hover>
                {mode === 'review' ? (
                  <TableCell padding="checkbox">
                    <Checkbox
                      aria-label={`选择导入售后挽回订单 ${row.recoveryNo}`}
                      disabled={!canReviewAction
                        || importSelection.mode === 'batch'
                        || !isImportedPendingReviewRecord(row, 'recovery_orders')}
                      checked={importSelection.mode === 'batch'
                        ? row.importBatchId === importSelection.importBatchId
                          && isImportedPendingReviewRecord(row, 'recovery_orders')
                        : importSelection.ids.includes(row.id)}
                      onChange={() => {
                        if (!canReviewAction) return;
                        setImportSelection((selection) => toggleImportedReviewId(selection, row.id));
                      }}
                    />
                  </TableCell>
                ) : null}
                {visibleColumns.map((column) => (
                  <TableCell
                    key={column.id}
                    align="left"
                    sx={{
                      ...(['recoveryAt', 'paymentAt', 'createdAt', 'auditedAt', 'updatedAt'].includes(column.id) ? { minWidth: 170, whiteSpace: 'nowrap' } : {}),
                    }}
                  >
                    {renderCell(row, column.id as RecoveryOrderColumnId)}
                  </TableCell>
                ))}
                <TableCell align="center" sx={{ minWidth: mode === 'review' ? 176 : 156, width: mode === 'review' ? 176 : 156, whiteSpace: 'nowrap', position: 'sticky', right: 0, zIndex: 3, bgcolor: '#fff', boxShadow: `-1px 0 0 ${shell.line}` }}>{renderCell(row, 'actions')}</TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + (mode === 'review' ? 2 : 1)} align="center" sx={{ py: 6, color: '#9ca3af' }}>
                  {loading ? '加载中...' : mode === 'review'
                    ? reviewQueueView === 'pending'
                      ? '暂无待审核/退回修改售后挽回订单'
                      : '当前审核视图暂无记录'
                    : '暂无售后挽回订单'}
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

      <Dialog open={open} onClose={() => { setOpen(false); setEditingOrder(null); }} maxWidth="lg" fullWidth>
        <DialogCloseTitle onClose={() => { setOpen(false); setEditingOrder(null); }}>{recoveryFormTitle}</DialogCloseTitle>
        <DialogContent dividers>
          <Box sx={{ pt: 1 }}>
          {formMode === 'metadata' ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              资料编辑仅保存来源、付款订单号、挽回凭证和备注，不改变审核与分账状态。
            </Alert>
          ) : null}
          {formMode === 'correction' ? (
            <Stack spacing={1.5} sx={{ mb: 2 }}>
              <Alert severity="warning">
                更正会撤回未发放分账，并将该挽回单回退到财务“待处理”。已发放提成不能直接覆盖。
              </Alert>
              <TextField
                label="更正原因"
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
                required
                multiline
                minRows={2}
                placeholder="请说明录入错误、更正依据和需要调整的内容"
              />
            </Stack>
          ) : null}
          <BusinessFormSection
            step={1}
            title="客户信息"
            summary={`${form.customerName || '待填写客户'} / ${form.customerPhone || form.customerWechat || '待填写联系方式'}`}
            errorCount={customerErrorCount}
          >
            <Alert severity="info" sx={{ gridColumn: '1 / -1' }}>
              请仅填写已掌握的客户信息。系统只在后台按手机号和微信进行身份识别，不会向售后展示客户库资料；未识别记录在审核通过后会自动进入 CRM 待分配线索。
            </Alert>
            <TextField disabled={metadataOnly} label="客户姓名" value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required />
            <TextField disabled={metadataOnly} label="客户手机号" value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} />
            <TextField disabled={metadataOnly} label="客户微信" value={form.customerWechat} onChange={(event) => setForm({ ...form, customerWechat: event.target.value })} />
          </BusinessFormSection>

          <BusinessFormSection
            step={2}
            title="原订单信息"
            summary={[form.sourcePlatformName || form.sourcePlatform, form.sourceShopName, form.originalProduct, form.thirdPartyOrderNo].filter(Boolean).join(' / ') || '待填写原订单'}
            errorCount={originalOrderErrorCount}
          >
            <TextField disabled={metadataOnly} label="第三方平台订单号" value={form.thirdPartyOrderNo} onChange={(event) => setForm({ ...form, thirdPartyOrderNo: event.target.value })} required />
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
            <TextField disabled={metadataOnly} select label="原购买产品" value={form.originalProduct} onChange={(event) => handleProductChange(event.target.value)} required>
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
            <TextField disabled={metadataOnly} label="原付款金额" type="number" value={form.originalAmount} onChange={(event) => setForm({ ...form, originalAmount: event.target.value })} required inputProps={{ min: 0.01, step: 0.01 }} />
          </BusinessFormSection>

          <BusinessFormSection
            step={3}
            title="挽回信息"
            summary={Number(form.recoveryAmount) > 0 ? `挽回 ¥${Number(form.recoveryAmount).toLocaleString('zh-CN')} / ${activeUsers.find((user) => user.id === form.recoveryUserId)?.name || '待选择人员'}` : '待填写挽回信息'}
            errorCount={recoveryErrorCount}
          >
            <TextField disabled={metadataOnly} label="挽回成交金额" type="number" value={form.recoveryAmount} onChange={(event) => setForm({ ...form, recoveryAmount: event.target.value })} required />
            <TextField disabled={metadataOnly} label="挽回成交时间" type="datetime-local" value={form.recoveryAt} onChange={(event) => setForm({ ...form, recoveryAt: event.target.value })} required InputLabelProps={{ shrink: true }} inputProps={{ step: 1, max: toDateTimeInputValue() }} />
            <TextField disabled={metadataOnly} select label="挽回人员" value={form.recoveryUserId} onChange={(event) => setForm({ ...form, recoveryUserId: event.target.value })} required>
              {activeUsers.map((user) => <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
            </TextField>
            <TextField disabled={metadataOnly} select label="协助人员（选填）" value={form.assistUserId} onChange={(event) => setForm({ ...form, assistUserId: event.target.value })}>
              <MenuItem value="">无</MenuItem>
              {activeUsers.filter((user) => user.id !== form.recoveryUserId).map((user) => <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
            </TextField>
          </BusinessFormSection>

          <BusinessFormSection
            step={4}
            title="收款与凭证"
            summary={[form.officialPaymentChannel, form.paymentOrderNo, form.recoveryAttachments.length ? `${form.recoveryAttachments.length} 个凭证` : ''].filter(Boolean).join(' / ') || '待补充收款资料'}
          >
            <TextField disabled={metadataOnly} select label="官方收款渠道" value={form.officialPaymentChannel} onChange={(event) => setForm({ ...form, officialPaymentChannel: event.target.value })}>
              <MenuItem value="">未选择</MenuItem>
              {OFFICIAL_PAYMENT_CHANNELS.map((channel) => <MenuItem key={channel.value} value={channel.value}>{channel.label}</MenuItem>)}
            </TextField>
            <TextField label="付款订单号" value={form.paymentOrderNo} onChange={(event) => setForm({ ...form, paymentOrderNo: event.target.value })} />
            <TextField disabled={metadataOnly} label="付款时间" type="datetime-local" value={form.paymentAt} onChange={(event) => setForm({ ...form, paymentAt: event.target.value })} InputLabelProps={{ shrink: true }} inputProps={{ step: 1, max: toDateTimeInputValue() }} />
            <Box sx={{ gridColumn: { md: '1 / -1' } }}>
              <BusinessAttachmentPicker title="挽回凭证" description="用于留存付款事实、成交确认和沟通过程，可多选、拖拽或直接粘贴。最多 8 张。" value={form.recoveryAttachments} onChange={(recoveryAttachments) => setForm((current) => ({ ...current, recoveryAttachments }))} category="recovery-payment-proof" draftKey={editingOrder?.id || `recovery-new-${currentUser?.id || 'unknown'}`} maxCount={8} />
            </Box>
          </BusinessFormSection>

          <BusinessFormSection step={5} title="补充信息" summary={form.remark ? '已填写备注' : '无备注'}>
            <TextField label="备注" value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} multiline minRows={3} sx={{ gridColumn: { md: '1 / -1' } }} />
          </BusinessFormSection>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setOpen(false); setEditingOrder(null); }}>取消</Button>
          <Button variant="contained" onClick={handleCreate} disabled={formMode === 'correction' && !correctionReason.trim()}>{recoveryFormAction}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(detailOrder)} onClose={() => setDetailOrder(null)} maxWidth="md" fullWidth>
        {detailOrder && (
          <>
            <DialogCloseTitle onClose={() => setDetailOrder(null)}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>{detailOrder.recoveryNo}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>{detailOrder.originalProduct}</Typography>
                {mode === 'review'
                  ? (
                    <BusinessStatusChip
                      status={getRecoveryOrderUnifiedReviewStatus(detailOrder.status, Boolean(detailOrder.deletedAt))}
                    />
                  )
                  : <SettlementStatusChip status={getRecoveryOrderBusinessStatus(detailOrder)} />}
              </Box>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {mode === 'review'
                  && (canEdit || canResubmitReturnedOrder(detailOrder))
                  && ['退回修改', '审核驳回'].includes(detailOrder.status)
                  && !detailOrder.deletedAt ? (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditIcon />}
                    onClick={() => {
                      const target = detailOrder;
                      setDetailOrder(null);
                      void openEdit(target, 'review-edit');
                    }}
                  >
                    修改并重新提交
                  </Button>
                ) : null}
                {mode === 'list' && canEdit ? (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<EditIcon />}
                    onClick={() => {
                      const target = detailOrder;
                      setDetailOrder(null);
                      void openEdit(target, 'metadata');
                    }}
                  >
                    编辑资料
                  </Button>
                ) : null}
                {mode === 'list' && canCorrect ? (
                  <Button
                    size="small"
                    variant="outlined"
                    color="warning"
                    startIcon={<PublishedWithChangesOutlinedIcon />}
                    onClick={() => {
                      const target = detailOrder;
                      setDetailOrder(null);
                      void openEdit(target, 'correction');
                    }}
                  >
                    挽回单更正
                  </Button>
                ) : null}
                {canViewHistory ? (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<HistoryIcon />}
                    onClick={() => {
                      setHistoryOrder(detailOrder);
                      setDetailOrder(null);
                    }}
                  >
                    修改记录
                  </Button>
                ) : null}
              </Stack>
            </DialogCloseTitle>
            <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
              <BusinessDetailSection title="客户信息">
                <DetailField label="售后填报客户名称">{detailOrder.submittedCustomerName || detailOrder.customerName}</DetailField>
                <DetailField label="客户手机号">{detailOrder.customerPhone || '-'}</DetailField>
                <DetailField label="客户微信">{detailOrder.customerWechat || '-'}</DetailField>
                <DetailField label="CRM识别状态">{detailOrder.crmIdentityStatus || detailOrder.customerMatchStatus || '-'}</DetailField>
              </BusinessDetailSection>

              <BusinessDetailSection title="原订单与来源信息">
                <DetailField label="第三方平台订单号">{detailOrder.thirdPartyOrderNo || '-'}</DetailField>
                <DetailField label="来源平台">{detailOrder.sourcePlatformName || detailOrder.sourcePlatform || '-'}</DetailField>
                <DetailField label="来源店铺">{detailOrder.sourceShopName || '-'}</DetailField>
                <DetailField label="原产品">{detailOrder.originalProduct}</DetailField>
                <DetailField label="原产品等级">{(() => {
                  const level = detailOrder.originalProductLevel || productOptions.find((item) => item.name === detailOrder.originalProduct)?.level;
                  return level ? <Chip label={level} size="small" sx={getProductLevelTagSx(level)} /> : '-';
                })()}</DetailField>
                <DetailField label="原付款金额"><Typography sx={{ fontWeight: 700 }}>{formatCurrency(detailOrder.originalAmount)}</Typography></DetailField>
              </BusinessDetailSection>

              <BusinessDetailSection title="挽回成交信息">
                <DetailField label="挽回成交金额"><Typography sx={{ fontWeight: 700, color: shell.green }}>{formatCurrency(detailOrder.recoveryAmount)}</Typography></DetailField>
                <DetailField label="挽回成交时间">{formatDate(detailOrder.recoveryAt || detailOrder.createdAt, 'yyyy-MM-dd HH:mm:ss')}</DetailField>
                <DetailField label="官方收款渠道">{detailOrder.officialPaymentChannel || '-'}</DetailField>
                <DetailField label="付款订单号">{detailOrder.paymentOrderNo || '-'}</DetailField>
                <DetailField label="付款时间">{detailOrder.paymentAt ? formatDate(detailOrder.paymentAt, 'yyyy-MM-dd HH:mm:ss') : '-'}</DetailField>
                <DetailField label="挽回人员">{detailOrder.recoveryUserName}</DetailField>
                <DetailField label="协助人员">{detailOrder.assistUserName || '-'}</DetailField>
                <DetailField label="备注" wide><Typography sx={{ whiteSpace: 'pre-wrap' }}>{detailOrder.remark || '-'}</Typography></DetailField>
              </BusinessDetailSection>

              {detailOrder.importBatchId ? (
                <>
                  <BusinessDetailSection title="导入信息" defaultExpanded={false}>
                    <DetailField label="导入批次">{detailOrder.importBatchId}</DetailField>
                    <DetailField label="Excel 行号">{detailOrder.importRowNumber || '-'}</DetailField>
                    <DetailField label="导入人">{detailOrder.importedByName || '-'}</DetailField>
                    <DetailField label="导入时间">{detailOrder.importedAt ? formatDate(detailOrder.importedAt, 'yyyy-MM-dd HH:mm:ss') : '-'}</DetailField>
                    <DetailField label="目标订单创建人">{detailOrder.targetCreatorName || '-'}</DetailField>
                    <DetailField label="CRM识别状态">{detailOrder.crmIdentityStatus || detailOrder.customerMatchStatus || '-'}</DetailField>
                    <DetailField label="凭证状态">{getRecoveryEvidenceAttachments(detailOrder).length ? '已上传凭证' : '凭证缺失'}</DetailField>
                    <DetailField label="预检警告" wide>
                      {detailOrder.importWarnings?.length ? detailOrder.importWarnings.join('；') : '无'}
                    </DetailField>
                  </BusinessDetailSection>
                  {['待创建线索', '身份冲突'].includes(detailOrder.crmIdentityStatus || '') ? (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                      {detailOrder.crmIdentityStatus === '身份冲突'
                        ? '手机号或微信存在身份冲突，请退回修改后再审核。'
                        : '当前未识别现有客户或线索；审核通过时系统会再次查重，并自动沉淀为待分配线索。'}
                    </Alert>
                  ) : null}
                  {!getRecoveryEvidenceAttachments(detailOrder).length ? (
                    <Alert severity="warning" sx={{ mt: 2 }}>
                      该导入记录缺少挽回凭证，请审核人核验后再通过。
                    </Alert>
                  ) : null}
                </>
              ) : null}

              <BusinessDetailSection title="审核与系统信息" defaultExpanded={false}>
                <DetailField label="订单创建人">{detailOrder.createdByName || '-'}</DetailField>
                <DetailField label="审核状态">{getRecoveryOrderUnifiedReviewStatus(detailOrder.status, Boolean(detailOrder.deletedAt))}</DetailField>
                <DetailField label="审核人">{detailOrder.auditorName || '-'}</DetailField>
                <DetailField label="审核时间">{detailOrder.auditedAt ? formatDate(detailOrder.auditedAt, 'yyyy-MM-dd HH:mm:ss') : '-'}</DetailField>
                <DetailField label="创建时间">{formatDate(detailOrder.createdAt, 'yyyy-MM-dd HH:mm:ss')}</DetailField>
                <DetailField label="退回 / 驳回原因" wide>{detailOrder.auditReason || '-'}</DetailField>
              </BusinessDetailSection>

              <BusinessDetailSection title="付款与挽回凭证" columns={1}>
                <DetailField label="挽回凭证" wide>
                  {(() => {
                    const attachments = getRecoveryEvidenceAttachments(detailOrder);
                    if (attachments.length) return <BusinessAttachmentLinks attachments={attachments} />;
                    if (!detailOrder.paymentVoucherPreview && !detailOrder.chatEvidencePreview) return '-';
                    return (
                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        {detailOrder.paymentVoucherPreview && (
                          <AttachmentPreviewLink title="挽回凭证" fileName={detailOrder.paymentVoucherName || detailOrder.paymentVoucher} src={detailOrder.paymentVoucherPreview} />
                        )}
                        {detailOrder.chatEvidencePreview && (
                          <AttachmentPreviewLink title="挽回凭证" fileName={detailOrder.chatEvidenceName || detailOrder.chatEvidence} src={detailOrder.chatEvidencePreview} />
                        )}
                      </Stack>
                    );
                  })()}
                </DetailField>
              </BusinessDetailSection>
            </DialogContent>
          </>
        )}
      </Dialog>

      <Dialog open={Boolean(historyOrder)} onClose={() => setHistoryOrder(null)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setHistoryOrder(null)}>售后挽回订单修改记录</DialogCloseTitle>
        <DialogContent dividers>
          {historyOrder && (
            <Stack spacing={1.25}>
              <Box sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 1.25, bgcolor: shell.soft }}>
                <Typography variant="body2" sx={{ fontWeight: 900 }}>{historyOrder.recoveryNo}</Typography>
                <Typography variant="caption" sx={{ color: shell.muted }}>{historyOrder.customerName} - {historyOrder.thirdPartyOrderNo}</Typography>
              </Box>
              {(historyOrder.changeHistory?.length
                ? historyOrder.changeHistory.map((item) => ({
                  title: item.summary,
                  time: item.changedAt,
                  by: item.operator || '-',
                  note: [
                    item.reason ? `原因：${item.reason}` : '',
                    ...(item.changes || []).map((change) => `${change.label}：${change.before || '-'} → ${change.after || '-'}`),
                  ].filter(Boolean).join('；') || '已记录本次操作。',
                }))
                : [
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
                  historyOrder.deletedAt ? {
                    title: '删除业务单（保留审核留痕）',
                    time: historyOrder.deletedAt,
                    by: historyOrder.deletedBy || '-',
                    note: historyOrder.deleteReason || '业务单已删除，审核记录永久保留。',
                  } : null,
                ].filter(Boolean)
              ).map((item, index) => {
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

      <Dialog open={Boolean(correctionBlocker)} onClose={() => setCorrectionBlocker(null)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setCorrectionBlocker(null)}>暂不能更正售后挽回订单</DialogCloseTitle>
        <DialogContent dividers>
          {correctionBlocker ? (
            <Stack spacing={1.5}>
              <Alert severity="warning">{correctionBlocker.precheck.message}</Alert>
              <Box sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, p: 1.5, bgcolor: shell.soft }}>
                <Typography variant="body2">挽回订单：{correctionBlocker.order.recoveryNo}</Typography>
                <Typography variant="body2">当前分账状态：{correctionBlocker.precheck.settlementStatus}</Typography>
                <Typography variant="body2">关联提成：{correctionBlocker.precheck.commissionCount} 条</Typography>
                {correctionBlocker.precheck.commissionStatuses.length ? (
                  <Typography variant="body2">提成状态：{correctionBlocker.precheck.commissionStatuses.join('、')}</Typography>
                ) : null}
              </Box>
              {['payout_started', 'settlement_processing', 'unsupported_settlement_status'].includes(correctionBlocker.precheck.reasonCode || '') ? (
                <Alert severity="info">请先由财务人员处理或撤回相关分账，再返回售后挽回订单执行更正。</Alert>
              ) : null}
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCorrectionBlocker(null)}>关闭</Button>
          {correctionBlocker && hasPermission(currentUser, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'write') ? (
            <Button
              variant="contained"
              onClick={() => {
                const recoveryNo = correctionBlocker.order.recoveryNo;
                setCorrectionBlocker(null);
                navigate(`/finance?tab=recovery-settlement&search=${encodeURIComponent(recoveryNo)}`);
              }}
            >
              前往财务处理
            </Button>
          ) : null}
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
              <Alert severity="success">售后挽回订单的分账状态已进入“待处理”。</Alert>
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

      <Dialog
        open={Boolean(cleanupReviewOrder)}
        onClose={cleanupReviewSubmitting ? undefined : () => setCleanupReviewOrder(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>清理售后审核记录</DialogTitle>
        <DialogContent dividers>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {cleanupReviewOrder?.status === '审核驳回'
              ? '该申请已被驳回。清理后将从审核台隐藏，但仍保留清理人、原因和时间等审计留痕。'
              : '仅清理审核台中的残留显示。售后业务和财务追溯数据仍会保留，不会破坏已撤回分账记录。'}
          </Alert>
          {cleanupReviewOrder && (
            <Box sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 1.25, bgcolor: shell.soft, mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 900 }}>{cleanupReviewOrder.recoveryNo}</Typography>
              <Typography variant="body2" sx={{ color: shell.muted }}>
                {cleanupReviewOrder.customerName} · {cleanupReviewOrder.thirdPartyOrderNo || '-'}
              </Typography>
            </Box>
          )}
          <TextField
            label="清理原因"
            value={cleanupReviewReason}
            onChange={(event) => setCleanupReviewReason(event.target.value)}
            placeholder={cleanupReviewOrder?.status === '审核驳回'
              ? '例如：测试申请已驳回，清理审核台记录'
              : '例如：业务单已删除，清理审核台残留记录'}
            multiline
            minRows={3}
            required
            fullWidth
            autoFocus
            error={!cleanupReviewReason.trim()}
            helperText={!cleanupReviewReason.trim() ? '清理原因不能为空' : ' '}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCleanupReviewOrder(null)} disabled={cleanupReviewSubmitting}>取消</Button>
          <Button
            color="error"
            variant="contained"
            disabled={!cleanupReviewReason.trim() || cleanupReviewSubmitting}
            onClick={cleanupDeletedRecoveryOrderReview}
          >
            确认清理
          </Button>
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
      <BusinessExportDialog
        open={exportOpen}
        title="导出售后挽回订单"
        expectedCount={total}
        currentColumnCount={visibleColumns.length}
        onClose={() => setExportOpen(false)}
        onRequestExport={handleExportRecoveryOrders}
      />
    </Box>
  );
};

export default RecoveryOrderTab;
