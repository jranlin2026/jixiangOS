import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import UndoIcon from '@mui/icons-material/Undo';
import SearchIcon from '@mui/icons-material/Search';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SortIcon from '@mui/icons-material/Sort';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { businessExportApi, commissionApi, commissionRuleApi, recoveryOrderApi, settingsApi } from '../../api';
import { formatCurrency, formatDate, formatEmployeeNameWithPosition, formatPaginationRows } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import TableViewSettingsDialog, { type TableViewColumnConfig } from '../../shared/components/TableViewSettingsDialog';
import { useTableViewConfig } from '../../shared/hooks/useTableViewConfig';
import type { Commission, CommissionPayoutPlan, CommissionRoleConfig, SettlementStatus, SimpleCommissionRuleGroup } from '../../types/commission';
import type { RecoveryOrder, RecoveryOrderSettlementStatus, RecoverySettlementInput } from '../../types/recoveryOrder';
import type { Department } from '../../types/department';
import type { Position } from '../../types/position';
import type { User } from '../../types/settings';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../shared/utils/permissions';
import { isSuperAdminRoleName } from '../../shared/utils/roles';
import { moduleTablePaperSx, moduleTableSx, StatusSegmentBar } from '../../shared/components/ModuleShell';
import AttachmentPreviewLink from '../../shared/components/AttachmentPreview';
import BusinessAttachmentLinks from '../../shared/components/BusinessAttachmentLinks';
import { getActiveCommissions } from '../../shared/utils/financeSettlementPresentation';
import { getRecoveryEvidenceAttachments } from '../../shared/utils/recoveryEvidence';
import { buildCommissionPayoutPlanSnapshot } from '../../shared/utils/commissionConfiguration';
import BusinessExportDialog, { type BusinessExportDialogRequest } from '../../shared/components/BusinessExportDialog';
import { buildBusinessExportBrowserRequest, unwrapBusinessExportResponse } from '../../shared/utils/businessExportPageRequest';
import SettlementStatusChip from '../../shared/components/SettlementStatusChip';
import { SettlementCompactDetailItem, SettlementDetailCard } from '../../shared/components/SettlementDetailUi';
import { SETTLEMENT_STATUSES, normalizeSettlementStatus } from '../../shared/utils/settlementStatus';

const shell = {
  ink: '#0f172a',
  muted: '#64748b',
  line: '#dbe4ee',
  soft: '#f8fafc',
  blue: '#2563eb',
  green: '#059669',
  amber: '#b45309',
  red: '#dc2626',
  teal: '#0f766e',
};

const CUSTOM_PLAN_ID = '__custom_amount__';
const DEFAULT_RECOVERY_ROLE = '挽回人员';

function RecoveryEvidenceLinks({ order }: { order: RecoveryOrder }) {
  const attachments = getRecoveryEvidenceAttachments(order);
  if (attachments.length) return <BusinessAttachmentLinks attachments={attachments} />;
  if (!order.paymentVoucherPreview && !order.chatEvidencePreview) return <>-</>;
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      {order.paymentVoucherPreview && <AttachmentPreviewLink title="挽回凭证" fileName={order.paymentVoucherName || order.paymentVoucher} src={order.paymentVoucherPreview} />}
      {order.chatEvidencePreview && <AttachmentPreviewLink title="挽回凭证" fileName={order.chatEvidenceName || order.chatEvidence} src={order.chatEvidencePreview} />}
    </Stack>
  );
}

type RecoverySettlementFilterStatus = SettlementStatus | '全部';

type SettlementRow = {
  role: string;
  ownerId: string;
  payoutPlanId: string;
  commissionAmount: string;
  performanceAmount: string;
  calculationNote: string;
};

const emptyRow: SettlementRow = {
  role: DEFAULT_RECOVERY_ROLE,
  ownerId: '',
  payoutPlanId: CUSTOM_PLAN_ID,
  commissionAmount: '',
  performanceAmount: '',
  calculationNote: '',
};

type SettlementDetailRow = {
  id: string;
  role: string;
  owner: string;
  department: string;
  commissionAmount: number;
  performanceAmount: number;
  orderAmount: number;
  status: string;
  payoutPlanName: string;
  formulaText?: string;
  calculationNote?: string;
  isDefaultPreview?: boolean;
};

const STATUS_OPTIONS: Array<{ value: RecoverySettlementFilterStatus; label: string }> = [
  { value: '全部', label: '全部' },
  ...SETTLEMENT_STATUSES.map((value) => ({ value, label: value })),
];

type RecoverySettlementColumnId =
  | 'recoveryNo'
  | 'status'
  | 'customerName'
  | 'thirdPartyOrderNo'
  | 'sourcePlatformShop'
  | 'originalProduct'
  | 'originalProductLevel'
  | 'originalAmount'
  | 'recoveryAmount'
  | 'officialPaymentChannel'
  | 'paymentAt'
  | 'recoveryUserName'
  | 'createdByName'
  | 'splitDetails'
  | 'totalCommissionAmount'
  | 'customerPhone'
  | 'customerWechat'
  | 'customerMatchStatus'
  | 'sourcePlatform'
  | 'sourceShop'
  | 'paymentOrderNo'
  | 'recoveryAt'
  | 'assistUserName'
  | 'auditorName'
  | 'auditedAt'
  | 'remark'
  | 'createdAt'
  | 'updatedAt'
  | 'performanceAmount'
  | 'settlementHandledBy'
  | 'settlementConfirmedAt'
  | 'settlementPaidAt'
  | 'settlementWithdrawReason';

const RECOVERY_SETTLEMENT_COLUMN_WIDTHS: Record<RecoverySettlementColumnId, number> = {
  recoveryNo: 165,
  status: 105,
  customerName: 145,
  thirdPartyOrderNo: 170,
  sourcePlatformShop: 170,
  originalProduct: 160,
  originalProductLevel: 120,
  originalAmount: 110,
  recoveryAmount: 130,
  officialPaymentChannel: 160,
  paymentAt: 155,
  recoveryUserName: 120,
  createdByName: 140,
  splitDetails: 330,
  totalCommissionAmount: 130,
  customerPhone: 140,
  customerWechat: 140,
  customerMatchStatus: 140,
  sourcePlatform: 130,
  sourceShop: 130,
  paymentOrderNo: 170,
  recoveryAt: 145,
  assistUserName: 120,
  auditorName: 120,
  auditedAt: 140,
  remark: 220,
  createdAt: 155,
  updatedAt: 155,
  performanceAmount: 140,
  settlementHandledBy: 140,
  settlementConfirmedAt: 155,
  settlementPaidAt: 155,
  settlementWithdrawReason: 220,
};

const RECOVERY_ACTION_COLUMN_WIDTH = 112;

const RECOVERY_SETTLEMENT_COLUMNS: Array<TableViewColumnConfig & { id: RecoverySettlementColumnId }> = [
  { id: 'recoveryNo', label: '挽回订单号' },
  { id: 'status', label: '分账状态' },
  { id: 'customerName', label: '客户' },
  { id: 'thirdPartyOrderNo', label: '第三方平台订单' },
  { id: 'sourcePlatformShop', label: '来源平台 / 店铺' },
  { id: 'originalProduct', label: '原产品' },
  { id: 'originalProductLevel', label: '原产品等级' },
  { id: 'originalAmount', label: '原付款金额' },
  { id: 'recoveryAmount', label: '挽回成交金额' },
  { id: 'officialPaymentChannel', label: '官方收款渠道' },
  { id: 'paymentAt', label: '付款时间' },
  { id: 'recoveryUserName', label: '挽回人员' },
  { id: 'createdByName', label: '订单创建人' },
  { id: 'splitDetails', label: '分账明细' },
  { id: 'totalCommissionAmount', label: '分账总额' },
  { id: 'customerPhone', label: '手机号' },
  { id: 'customerWechat', label: '微信' },
  { id: 'customerMatchStatus', label: '客户匹配状态' },
  { id: 'sourcePlatform', label: '来源平台' },
  { id: 'sourceShop', label: '来源店铺' },
  { id: 'paymentOrderNo', label: '付款订单号' },
  { id: 'recoveryAt', label: '挽回成交时间' },
  { id: 'assistUserName', label: '协助人员' },
  { id: 'auditorName', label: '审核人' },
  { id: 'auditedAt', label: '审核时间' },
  { id: 'remark', label: '备注' },
  { id: 'createdAt', label: '创建时间' },
  { id: 'updatedAt', label: '更新时间' },
  { id: 'performanceAmount', label: '业绩计算金额' },
  { id: 'settlementHandledBy', label: '分账经办人' },
  { id: 'settlementConfirmedAt', label: '确认时间' },
  { id: 'settlementPaidAt', label: '发放时间' },
  { id: 'settlementWithdrawReason', label: '撤回原因' },
];

const DEFAULT_VISIBLE_COLUMNS: RecoverySettlementColumnId[] = [
  'recoveryNo',
  'status',
  'customerName',
  'thirdPartyOrderNo',
  'sourcePlatformShop',
  'originalProduct',
  'originalProductLevel',
  'originalAmount',
  'recoveryAmount',
  'officialPaymentChannel',
  'paymentAt',
  'recoveryUserName',
  'createdByName',
  'splitDetails',
  'totalCommissionAmount',
];

interface RecoverySettlementProps {
  viewSettingsTrigger?: number;
  createSettlementTrigger?: number;
  exportTrigger?: number;
  initialSearch?: string;
}

function formatPlan(plan: CommissionPayoutPlan): string {
  if (plan.commissionType === 'fixed') return `${plan.name} - 固定金额 ${formatCurrency(plan.commissionValue)}`;
  if (plan.commissionType === 'percentage') return `${plan.name} - 固定比例 ${plan.commissionValue}%`;
  return `${plan.name} - 阶梯提成`;
}

function getPlanAmount(plan: CommissionPayoutPlan | undefined, baseAmount: number): number {
  if (!plan) return 0;
  if (plan.commissionType === 'fixed') return plan.commissionValue;
  if (plan.commissionType === 'percentage') return Math.round(baseAmount * (plan.commissionValue / 100) * 100) / 100;
  return 0;
}

function getSettlementStatus(order: RecoveryOrder): SettlementStatus {
  return normalizeSettlementStatus(order.settlementStatus, '待处理');
}

function getStatusChipColor(status: RecoveryOrderSettlementStatus | string): 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info' {
  if (status === '待处理') return 'warning';
  if (status === '待确认') return 'info';
  if (status === '待发放') return 'primary';
  if (status === '已发放') return 'success';
  if (status === '已撤回') return 'default';
  return 'default';
}

function getStatusButtonColor(status: RecoverySettlementFilterStatus): 'primary' | 'warning' | 'info' | 'success' | 'inherit' {
  if (status === '待处理') return 'warning';
  if (status === '待确认') return 'info';
  if (status === '待发放') return 'primary';
  if (status === '已发放') return 'success';
  return 'primary';
}

function isSourceRecoveryDeleted(order: RecoveryOrder): boolean {
  return Boolean(order.deletedAt);
}

function getSourcePlatformShop(order: RecoveryOrder): string {
  return [order.sourcePlatformName || order.sourcePlatform, order.sourceShopName]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' / ');
}

function RecoverySettlementBusinessPaymentSummary({ order }: { order: RecoveryOrder }) {
  return (
    <Box
      data-testid="recovery-settlement-business-payment-summary"
      sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 1.5 }}
    >
      <SettlementDetailCard title="源业务资料" testId="recovery-source-business-card">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, columnGap: 2, rowGap: 0.1 }}>
          <SettlementCompactDetailItem label="客户">{order.customerName || '-'}</SettlementCompactDetailItem>
          <SettlementCompactDetailItem label="第三方平台订单">{order.thirdPartyOrderNo || '-'}</SettlementCompactDetailItem>
          <SettlementCompactDetailItem label="来源平台 / 店铺">{getSourcePlatformShop(order) || '-'}</SettlementCompactDetailItem>
          <SettlementCompactDetailItem label="原产品">{order.originalProduct || '-'}</SettlementCompactDetailItem>
          <SettlementCompactDetailItem label="原产品等级">{order.originalProductLevel || '-'}</SettlementCompactDetailItem>
          <SettlementCompactDetailItem label="原付款金额">{formatCurrency(order.originalAmount)}</SettlementCompactDetailItem>
          <SettlementCompactDetailItem label="挽回人员">{order.recoveryUserName || '-'}</SettlementCompactDetailItem>
          <SettlementCompactDetailItem label="订单创建人">{order.createdByName || '-'}</SettlementCompactDetailItem>
        </Box>
      </SettlementDetailCard>

      <SettlementDetailCard title="付款资料" testId="recovery-payment-card">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, columnGap: 2, rowGap: 0.1 }}>
          <SettlementCompactDetailItem label="挽回成交金额">{formatCurrency(order.recoveryAmount)}</SettlementCompactDetailItem>
          <SettlementCompactDetailItem label="官方收款渠道">{order.officialPaymentChannel || '-'}</SettlementCompactDetailItem>
          <SettlementCompactDetailItem label="付款订单号">{order.paymentOrderNo || '-'}</SettlementCompactDetailItem>
          <SettlementCompactDetailItem label="付款时间">{order.paymentAt ? formatDate(order.paymentAt, 'yyyy-MM-dd HH:mm') : '-'}</SettlementCompactDetailItem>
          <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
            <SettlementCompactDetailItem label="挽回凭证"><RecoveryEvidenceLinks order={order} /></SettlementCompactDetailItem>
          </Box>
        </Box>
      </SettlementDetailCard>
    </Box>
  );
}

const RecoverySettlement: React.FC<RecoverySettlementProps> = ({
  viewSettingsTrigger = 0,
  createSettlementTrigger = 0,
  exportTrigger = 0,
  initialSearch = '',
}) => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const canManageRecoverySettlement = hasPermission(currentUser, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'write');
  const canCleanupDeletedSettlement = isSuperAdmin(currentUser) || isSuperAdminRoleName(currentUser?.role);
  const [rows, setRows] = useState<RecoveryOrder[]>([]);
  const [settlementCounts, setSettlementCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState<RecoverySettlementFilterStatus>('全部');
  const [recoveryUserId, setRecoveryUserId] = useState('');
  const [recoveryStartDate, setRecoveryStartDate] = useState('');
  const [recoveryEndDate, setRecoveryEndDate] = useState('');
  const [sortBy, setSortBy] = useState<'updatedAt' | 'createdAt' | 'recoveryAt'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [roles, setRoles] = useState<CommissionRoleConfig[]>([]);
  const [plans, setPlans] = useState<CommissionPayoutPlan[]>([]);
  const [ruleGroups, setRuleGroups] = useState<SimpleCommissionRuleGroup[]>([]);
  const [settlementCommissions, setSettlementCommissions] = useState<Commission[]>([]);
  const [detailOrder, setDetailOrder] = useState<RecoveryOrder | null>(null);
  const [sourceDetailOrder, setSourceDetailOrder] = useState<RecoveryOrder | null>(null);
  const [sourceDetailLoading, setSourceDetailLoading] = useState(false);
  const [detailCommissions, setDetailCommissions] = useState<Commission[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState<RecoveryOrder | null>(null);
  const [settlementRows, setSettlementRows] = useState<SettlementRow[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [createSettlementOpen, setCreateSettlementOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [creatableRecoveryRows, setCreatableRecoveryRows] = useState<RecoveryOrder[]>([]);
  const [creatableRecoveryLoading, setCreatableRecoveryLoading] = useState(false);
  const [creatableRecoverySearch, setCreatableRecoverySearch] = useState('');
  const [selectedCreatableRecoveryId, setSelectedCreatableRecoveryId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<RecoveryOrder | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [withdrawTarget, setWithdrawTarget] = useState<RecoveryOrder | null>(null);
  const [withdrawReason, setWithdrawReason] = useState('');
  const handledViewSettingsTriggerRef = React.useRef(viewSettingsTrigger);
  const handledCreateSettlementTriggerRef = React.useRef(createSettlementTrigger);
  const handledExportTriggerRef = React.useRef(exportTrigger);
  const sourceDetailRequestRef = React.useRef(0);
  const loadRequestRef = React.useRef(0);

  const {
    viewConfig,
    visibleColumns,
    visibleColumnIds,
    toggleColumn,
    reorderColumn,
    setFrozenColumnCount,
    resetViewConfig,
  } = useTableViewConfig('finance_recovery_settlement_table_view_v2', RECOVERY_SETTLEMENT_COLUMNS, DEFAULT_VISIBLE_COLUMNS);

  const recoverySettlementTableWidth = useMemo(
    () => visibleColumns.reduce(
      (sum, column) => sum + RECOVERY_SETTLEMENT_COLUMN_WIDTHS[column.id as RecoverySettlementColumnId],
      RECOVERY_ACTION_COLUMN_WIDTH,
    ),
    [visibleColumns],
  );

  const activeUsers = useMemo(
    () => users.filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active'),
    [users],
  );
  const activeRoles = useMemo(() => roles.filter((role) => role.isActive), [roles]);
  const activePlans = useMemo(() => plans.filter((plan) => plan.isActive), [plans]);
  const selectedCreatableRecoveryOrder = useMemo(() => (
    creatableRecoveryRows.find((order) => order.id === selectedCreatableRecoveryId) || null
  ), [creatableRecoveryRows, selectedCreatableRecoveryId]);

  const getDefaultRecoveryOwnerId = useCallback((order: RecoveryOrder) => {
    const preferredIds = [order.recoveryUserId, order.createdBy].filter(Boolean);
    return preferredIds.find((id) => activeUsers.some((user) => user.id === id))
      || order.recoveryUserId
      || order.createdBy
      || '';
  }, [activeUsers]);

  const getDefaultSettlementRow = useCallback((order: RecoveryOrder): SettlementRow => {
    const recoveryRule = ruleGroups.find((group) => (
      group.isActive && group.businessSource === 'after_sales_recovery'
    ));
    const payout = recoveryRule?.payouts.find((item) => item.role === DEFAULT_RECOVERY_ROLE)
      || recoveryRule?.payouts[0];
    const plan = activePlans.find((item) => item.id === payout?.payoutPlanId);
    const performanceAmount = Number(order.recoveryAmount || 0);
    const configuredOwnerId = payout?.assigneeSource === 'recovery_assistant'
      ? order.assistUserId
      : payout?.assigneeSource === 'business_creator'
        ? order.createdBy
        : payout?.assigneeSource === 'manual'
          ? ''
          : order.recoveryUserId;
    return {
      ...emptyRow,
      role: payout?.role || DEFAULT_RECOVERY_ROLE,
      ownerId: payout?.assigneeSource === 'manual'
        ? ''
        : configuredOwnerId || getDefaultRecoveryOwnerId(order),
      payoutPlanId: plan?.id || CUSTOM_PLAN_ID,
      commissionAmount: String(plan ? getPlanAmount(plan, performanceAmount) : 0),
      performanceAmount: String(performanceAmount),
      calculationNote: plan
        ? `按售后挽回分账规则「${recoveryRule?.name}」自动带入，财务确认后保存。`
        : '默认带入挽回人员，财务确认方案和金额后保存。',
    };
  }, [activePlans, getDefaultRecoveryOwnerId, ruleGroups]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    const readyStatuses = ['待处理', '待确认', '待发放', '已发放', '已撤回'] as const;
    const [allRes, countsRes, directoryRes, rolesRes, plansRes, groupsRes, commissionRes] = await Promise.all([
      recoveryOrderApi.fetchRecoveryOrders({
        search,
        settlementStatuses: status === '全部' ? [...readyStatuses] : [status],
        includeDeleted: true,
        recoveryStartDate: recoveryStartDate || undefined,
        recoveryEndDate: recoveryEndDate || undefined,
        recoveryUserId: recoveryUserId || undefined,
        sortBy,
        sortDirection,
        page: page + 1,
        pageSize: rowsPerPage,
      }),
      recoveryOrderApi.fetchRecoverySettlementCounts({
        search,
        includeDeleted: true,
        recoveryStartDate: recoveryStartDate || undefined,
        recoveryEndDate: recoveryEndDate || undefined,
        recoveryUserId: recoveryUserId || undefined,
      }),
      settingsApi.fetchAssignableDirectory(),
      commissionRuleApi.getCommissionRoleConfigs({ isActive: true }),
      commissionRuleApi.getCommissionPayoutPlans(),
      commissionRuleApi.getSimpleCommissionRuleGroups(),
      commissionApi.fetchCommissions({ page: 1, pageSize: 5000 }),
    ]);
    if (requestId !== loadRequestRef.current) return;
    if (allRes.code === 0) {
      setRows(allRes.data.items);
      setTotal(allRes.data.pagination.total);
    }
    if (countsRes.code === 0) setSettlementCounts(countsRes.data.statusCounts);
    if (directoryRes.code === 0) {
      setUsers(directoryRes.data.users);
      setDepartments(directoryRes.data.departments);
      setPositions(directoryRes.data.positions);
    }
    if (rolesRes.code === 0) setRoles(rolesRes.data);
    if (plansRes.code === 0) setPlans(plansRes.data);
    if (groupsRes.code === 0) setRuleGroups(groupsRes.data);
    if (commissionRes.code === 0) setSettlementCommissions(commissionRes.data.items);
  }, [page, recoveryEndDate, recoveryStartDate, recoveryUserId, rowsPerPage, search, sortBy, sortDirection, status]);

  const applySettlementMutation = useCallback((previous: RecoveryOrder, next: RecoveryOrder) => {
    const previousStatus = getSettlementStatus(previous);
    const nextStatus = getSettlementStatus(next);
    setRows((current) => current
      .map((row) => (row.id === next.id ? next : row))
      .filter((row) => status === '全部' || getSettlementStatus(row) === status));
    setSettlementCounts((current) => {
      if (previousStatus === nextStatus) return current;
      return {
        ...current,
        [previousStatus]: Math.max(0, Number(current[previousStatus] || 0) - 1),
        [nextStatus]: Number(current[nextStatus] || 0) + 1,
      };
    });
  }, [status]);

  const getDepartmentName = (departmentId?: string) => {
    if (!departmentId) return '-';
    return departments.find((department) => department.id === departmentId)?.name || '-';
  };

  const getOwnerDepartmentName = (user?: User) => {
    if (!user) return '-';
    const directDepartmentName = getDepartmentName(user.departmentId);
    if (directDepartmentName !== '-') return directDepartmentName;
    const position = positions.find((item) => item.id === user.positionId || item.name === user.positionName);
    return getDepartmentName(position?.departmentId);
  };

  const getDetailRows = (order: RecoveryOrder): SettlementDetailRow[] => {
    if (detailCommissions.length) {
      return detailCommissions.map((commission) => ({
        id: commission.id,
        role: commission.role || DEFAULT_RECOVERY_ROLE,
        owner: commission.owner || '-',
        department: commission.department || '-',
        commissionAmount: Number(commission.commissionAmount || 0),
        performanceAmount: Number(commission.performanceAmount || commission.orderAmount || order.recoveryAmount || 0),
        orderAmount: Number(commission.orderAmount || order.recoveryAmount || 0),
        status: commission.status,
        payoutPlanName: commission.payoutPlanName || '自定义金额',
        formulaText: commission.formulaText,
        calculationNote: commission.calculationNote,
      }));
    }
    const ownerId = getDefaultRecoveryOwnerId(order);
    const owner = activeUsers.find((user) => user.id === ownerId);
    return [{
      id: `default-${order.id}`,
      role: DEFAULT_RECOVERY_ROLE,
      owner: owner?.name || order.recoveryUserName || order.createdByName || '-',
      department: getOwnerDepartmentName(owner),
      commissionAmount: 0,
      performanceAmount: Number(order.recoveryAmount || 0),
      orderAmount: Number(order.recoveryAmount || 0),
      status: '待处理',
      payoutPlanName: '待选择',
      formulaText: '默认带入挽回人员，财务确认方案和金额后保存。',
      isDefaultPreview: true,
    }];
  };

  const getSettlementCommissionsForOrder = (order: RecoveryOrder): Commission[] => {
    const commissionIds = new Set(order.commissionIds || []);
    return settlementCommissions.filter((commission) => (
      commission.sourceRecoveryOrderId === order.id
      || commission.orderId === order.id
      || commission.orderNo === order.recoveryNo
      || commissionIds.has(commission.id)
    ));
  };

  const getRowFinanceSummary = (order: RecoveryOrder) => {
    const all = getSettlementCommissionsForOrder(order);
    const active = getActiveCommissions(all);
    const paidDates = active
      .map((commission) => commission.paidAt)
      .filter((value): value is string => Boolean(value))
      .sort();
    return {
      active,
      totalCommissionAmount: Math.round(active.reduce((sum, item) => sum + Number(item.commissionAmount || 0), 0) * 100) / 100,
      performanceAmount: Math.max(0, ...active.map((item) => Number(item.performanceAmount || 0))),
      paidAt: order.settlementPaidAt || paidDates[paidDates.length - 1],
    };
  };

  const renderRowSplitDetails = (order: RecoveryOrder) => {
    const summary = getRowFinanceSummary(order);
    if (!summary.active.length) return '-';
    const visible = summary.active.slice(0, 2);
    return (
      <Stack spacing={0.4} sx={{ py: 0.25 }}>
        <Typography variant="caption" sx={{ color: '#374151', lineHeight: 1.55, overflowWrap: 'anywhere' }}>
          {visible.map((item) => `${item.role}：${item.owner || '-'} ${formatCurrency(item.commissionAmount)}`).join('｜')}
          {summary.active.length > 2 ? `｜另有 ${summary.active.length - 2} 人` : ''}
        </Typography>
        <Typography variant="caption" sx={{ color: shell.red, fontWeight: 800 }}>
          共 {formatCurrency(summary.totalCommissionAmount)}
        </Typography>
      </Stack>
    );
  };

  const fetchCreatableRecoveryOrders = useCallback(async (nextSearch = creatableRecoverySearch) => {
    setCreatableRecoveryLoading(true);
    try {
      const res = await recoveryOrderApi.fetchRecoveryOrders({
        search: nextSearch,
        statuses: ['待分账'],
        settlementStatus: '待处理',
        page: 1,
        pageSize: 100,
      });
      if (res.code !== 0) {
        setMessage({ type: 'error', text: res.message || '读取可新建售后挽回分账单失败' });
        setCreatableRecoveryRows([]);
        return;
      }
      const nextRows = res.data.items.filter((order) => getSettlementStatus(order) === '待处理');
      setCreatableRecoveryRows(nextRows);
      setSelectedCreatableRecoveryId((current) => (
        nextRows.some((order) => order.id === current) ? current : ''
      ));
    } finally {
      setCreatableRecoveryLoading(false);
    }
  }, [creatableRecoverySearch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [search, status]);

  useEffect(() => {
    if (viewSettingsTrigger <= 0) return;
    if (handledViewSettingsTriggerRef.current === viewSettingsTrigger) return;
    handledViewSettingsTriggerRef.current = viewSettingsTrigger;
    setViewSettingsOpen(true);
  }, [viewSettingsTrigger]);

  useEffect(() => {
    if (!canManageRecoverySettlement) return;
    if (createSettlementTrigger <= 0) return;
    if (handledCreateSettlementTriggerRef.current === createSettlementTrigger) return;
    handledCreateSettlementTriggerRef.current = createSettlementTrigger;
    setMessage(null);
    setSelectedCreatableRecoveryId('');
    setCreateSettlementOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageRecoverySettlement, createSettlementTrigger]);

  useEffect(() => {
    if (exportTrigger <= 0) return;
    if (handledExportTriggerRef.current === exportTrigger) return;
    handledExportTriggerRef.current = exportTrigger;
    setExportOpen(true);
  }, [exportTrigger]);

  const handleExportRecoverySettlements = async (request: BusinessExportDialogRequest) => {
    const readyStatuses = ['待处理', '待确认', '待发放', '已发放', '已撤回'] as const;
    const response = await businessExportApi.exportRecoverySettlements(buildBusinessExportBrowserRequest(
      {
        search: search || undefined,
        settlementStatuses: status === '全部' ? [...readyStatuses] : [status],
        includeDeleted: true,
        recoveryStartDate: recoveryStartDate || undefined,
        recoveryEndDate: recoveryEndDate || undefined,
        sortBy,
        sortDirection,
        page: page + 1,
        pageSize: rowsPerPage,
      },
      { ...request, columnIds: visibleColumns.map((column) => column.id) },
    ));
    return unwrapBusinessExportResponse(response);
  };

  const handleRecoveryTimeSort = () => {
    setSortDirection((current) => sortBy === 'recoveryAt' && current === 'desc' ? 'asc' : 'desc');
    setSortBy('recoveryAt');
    setPage(0);
  };

  const handleResetFilters = () => {
    setSearch('');
    setStatus('全部');
    setRecoveryUserId('');
    setRecoveryStartDate('');
    setRecoveryEndDate('');
    setSortBy('createdAt');
    setSortDirection('desc');
    setPage(0);
  };

  useEffect(() => {
    if (!createSettlementOpen) return;
    fetchCreatableRecoveryOrders(creatableRecoverySearch);
  }, [createSettlementOpen, creatableRecoverySearch, fetchCreatableRecoveryOrders]);

  const counts = useMemo(() => {
    const base = { 全部: 0, 待处理: 0, 待确认: 0, 待发放: 0, 已发放: 0, 已撤回: 0 };
    Object.entries(settlementCounts).forEach(([key, value]) => {
      if (key in base) base[key as keyof typeof base] = value;
    });
    base.全部 = Object.values(base).reduce((sum, value) => sum + value, 0);
    return base;
  }, [settlementCounts]);

  const loadRecoveryCommissions = async (order: RecoveryOrder): Promise<Commission[]> => {
    try {
      const commissionIds = new Set(order.commissionIds || []);
      const res = await commissionApi.fetchCommissions({ page: 1, pageSize: 500 });
      if (res.code !== 0) {
        setMessage({ type: 'error', text: res.message || '读取售后挽回分账明细失败' });
        return [];
      }
      return res.data.items.filter((commission) => (
        commission.sourceRecoveryOrderId === order.id
        || commission.orderId === order.id
        || commission.orderNo === order.recoveryNo
        || commissionIds.has(commission.id)
      ));
    } catch {
      setMessage({ type: 'error', text: '读取售后挽回分账明细失败' });
      return [];
    }
  };

  const openDetail = async (order: RecoveryOrder) => {
    setDetailOrder(order);
    setDetailCommissions([]);
    setDetailLoading(true);
    setWithdrawReason('');
    try {
      const items = await loadRecoveryCommissions(order);
      setDetailCommissions(items);
    } finally {
      setDetailLoading(false);
    }
  };

  const openSourceDetail = async (order: RecoveryOrder) => {
    const requestId = sourceDetailRequestRef.current + 1;
    sourceDetailRequestRef.current = requestId;
    setSourceDetailOrder(order);
    setSourceDetailLoading(true);
    try {
      const response = await recoveryOrderApi.fetchRecoveryOrderById(order.id, 'recoveryOrders');
      if (sourceDetailRequestRef.current !== requestId) return;
      if (response.code === 0 && response.data) {
        setSourceDetailOrder(response.data);
        return;
      }
      setMessage({ type: 'error', text: response.message || '售后挽回订单资料加载失败' });
      setSourceDetailOrder(null);
    } catch (error) {
      if (sourceDetailRequestRef.current !== requestId) return;
      setMessage({ type: 'error', text: error instanceof Error ? error.message : '售后挽回订单资料加载失败' });
      setSourceDetailOrder(null);
    } finally {
      if (sourceDetailRequestRef.current === requestId) setSourceDetailLoading(false);
    }
  };

  const closeSourceDetail = () => {
    sourceDetailRequestRef.current += 1;
    setSourceDetailOrder(null);
    setSourceDetailLoading(false);
  };

  const closeDetail = () => {
    setDetailOrder(null);
    setDetailCommissions([]);
    setWithdrawReason('');
  };

  const openSettlement = async (order: RecoveryOrder) => {
    if (!canManageRecoverySettlement) return;
    if (isSourceRecoveryDeleted(order)) {
      setMessage({ type: 'error', text: '源售后挽回订单已删除，分账与撤回记录永久保留为只读留痕' });
      return;
    }
    const rowStatus = getSettlementStatus(order);
    if (rowStatus !== '待处理' && rowStatus !== '待确认') {
      setMessage({ type: 'error', text: '只有待处理或待确认的售后挽回订单可以处理分账' });
      return;
    }
    setSelected(order);
    setReason(rowStatus === '待确认' ? order.auditReason || '' : '');
    if (rowStatus === '待确认') {
      const commissions = await loadRecoveryCommissions(order);
      if (commissions.length) {
        setSettlementRows(commissions.map((commission) => ({
          role: commission.role || DEFAULT_RECOVERY_ROLE,
          ownerId: commission.ownerId || '',
          payoutPlanId: commission.payoutPlanId || CUSTOM_PLAN_ID,
          commissionAmount: String(commission.commissionAmount || 0),
          performanceAmount: String(commission.performanceAmount || commission.orderAmount || order.recoveryAmount || 0),
          calculationNote: commission.calculationNote || commission.formulaText || '',
        })));
        return;
      }
    }
    setSettlementRows([getDefaultSettlementRow(order)]);
  };

  const updateRow = (index: number, patch: Partial<SettlementRow>) => {
    setSettlementRows((prev) => prev.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, ...patch };
      if ((patch.payoutPlanId || patch.performanceAmount) && selected) {
        const planId = patch.payoutPlanId || next.payoutPlanId;
        const plan = activePlans.find((item) => item.id === planId);
        const baseAmount = Number(next.performanceAmount || selected.recoveryAmount || 0);
        if (planId !== CUSTOM_PLAN_ID) next.commissionAmount = String(getPlanAmount(plan, baseAmount));
      }
      return next;
    }));
  };

  const addRow = () => setSettlementRows((prev) => [
    ...prev,
    { ...emptyRow, performanceAmount: String(selected?.recoveryAmount || 0) },
  ]);
  const removeRow = (index: number) => setSettlementRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));

  const submitSettlement = async () => {
    if (!canManageRecoverySettlement) return;
    if (!selected || !currentUser) return;
    const payload: RecoverySettlementInput[] = settlementRows.map((row) => {
      const plan = activePlans.find((item) => item.id === row.payoutPlanId);
      const roleConfig = activeRoles.find((item) => item.name === row.role);
      const isCustom = row.payoutPlanId === CUSTOM_PLAN_ID;
      return {
        role: row.role,
        roleId: roleConfig?.id,
        roleCode: roleConfig?.code,
        roleNameSnapshot: roleConfig?.name || row.role,
        ownerId: row.ownerId,
        payoutPlanId: isCustom ? undefined : row.payoutPlanId,
        payoutPlanName: isCustom ? '自定义金额' : plan?.name,
        payoutPlanVersion: isCustom ? undefined : plan?.version,
        payoutPlanSnapshot: !isCustom && plan ? buildCommissionPayoutPlanSnapshot(plan) : undefined,
        commissionAmount: Number(row.commissionAmount) || 0,
        performanceAmount: Number(row.performanceAmount) || selected.recoveryAmount,
        commissionRate: plan?.commissionType === 'percentage' ? plan.commissionValue / 100 : 0,
        calculationNote: row.calculationNote,
        ruleCalculationType: isCustom ? 'fixed' : plan?.commissionType,
        tierSnapshot: !isCustom && plan?.commissionType === 'tiered_percentage'
          ? { tiers: plan.tiers || [], baseAmount: Number(row.performanceAmount) || selected.recoveryAmount, gapToNext: 0 }
          : undefined,
      };
    });
    if (payload.some((row) => !row.role || !row.ownerId)) {
      setMessage({ type: 'error', text: '请完整选择提成角色和分账人员' });
      return;
    }
    setSaving(true);
    try {
      const res = await recoveryOrderApi.settleRecoveryOrder(selected.id, payload, reason, currentUser.id, currentUser.name);
      if (res.code !== 0) {
        setMessage({ type: 'error', text: res.message || '保存售后挽回分账失败' });
        return;
      }
      if (res.data && detailOrder?.id === res.data.id) {
        setDetailOrder(res.data);
        setDetailCommissions(await loadRecoveryCommissions(res.data));
      }
      if (res.data) applySettlementMutation(selected, res.data);
      setSelected(null);
      setMessage({ type: 'success', text: '售后挽回分账已保存，当前状态为待确认' });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const confirmSettlement = async (row: RecoveryOrder) => {
    if (!canManageRecoverySettlement) return;
    if (!currentUser) return;
    if (getSettlementStatus(row) !== '待确认') {
      setMessage({ type: 'error', text: '只有待确认的售后挽回分账可以确认' });
      return;
    }
    const res = await recoveryOrderApi.confirmRecoverySettlement(row.id, currentUser.name);
    if (res.code !== 0) {
      setMessage({ type: 'error', text: res.message || '确认售后挽回分账失败' });
      return;
    }
    if (res.data) applySettlementMutation(row, res.data);
    setSelected(null);
    closeDetail();
    setMessage({ type: 'success', text: '已确认售后挽回分账，进入待发放' });
    await load();
  };

  const withdrawSettlement = async (row: RecoveryOrder, nextWithdrawReason: string) => {
    if (!canManageRecoverySettlement) return;
    if (!currentUser) return;
    if (!['待确认', '待发放'].includes(getSettlementStatus(row))) {
      setMessage({ type: 'error', text: '只有待确认或待发放的售后挽回分账可以撤回' });
      return;
    }
    const res = await recoveryOrderApi.withdrawRecoverySettlement(row.id, nextWithdrawReason, currentUser.name);
    if (res.code !== 0) {
      setMessage({ type: 'error', text: res.message || '撤回售后挽回分账失败' });
      return;
    }
    if (res.data) applySettlementMutation(row, res.data);
    setSelected(null);
    closeDetail();
    setWithdrawTarget(null);
    setWithdrawReason('');
    setMessage({ type: 'success', text: '已撤回售后挽回分账' });
    await load();
  };

  const openResetSettlementDialog = (row: RecoveryOrder) => {
    if (isSourceRecoveryDeleted(row)) {
      if (!canCleanupDeletedSettlement) return;
      setDeleteTarget(row);
      setDeleteReason('');
      return;
    }
    if (!canManageRecoverySettlement) return;
    if (getSettlementStatus(row) !== '待确认') {
      setMessage({ type: 'error', text: '只有待确认的售后挽回分账可以删除' });
      return;
    }
    setDeleteTarget(row);
    setDeleteReason('');
  };

  const handleResetSettlement = async () => {
    if (!currentUser) return;
    if (!deleteTarget) return;
    const cleanupDeletedSource = isSourceRecoveryDeleted(deleteTarget);
    if (cleanupDeletedSource ? !canCleanupDeletedSettlement : !canManageRecoverySettlement) return;
    if (!deleteReason.trim()) {
      setMessage({ type: 'error', text: '请填写删除原因' });
      return;
    }
    const res = cleanupDeletedSource
      ? await recoveryOrderApi.cleanupDeletedRecoverySettlement(deleteTarget.id, deleteReason)
      : await recoveryOrderApi.resetRecoverySettlement(deleteTarget.id, currentUser.name, deleteReason);
    if (res.code !== 0) {
      setMessage({ type: 'error', text: res.message || (cleanupDeletedSource ? '清理废弃售后挽回分账失败' : '删除售后挽回分账失败') });
      return;
    }
    if (!cleanupDeletedSource && res.data) applySettlementMutation(deleteTarget, res.data);
    setDeleteTarget(null);
    setDeleteReason('');
    setMessage({
      type: 'success',
      text: cleanupDeletedSource ? '已清理废弃售后挽回分账' : '已删除售后挽回分账，订单已退回待处理',
    });
    await load();
  };

  const canAdjustSettlement = (row: RecoveryOrder) => {
    if (isSourceRecoveryDeleted(row)) return false;
    const settlementStatus = getSettlementStatus(row);
    return settlementStatus === '待处理' || settlementStatus === '待确认';
  };

  const getAdjustDisabledReason = (row: RecoveryOrder) => {
    if (isSourceRecoveryDeleted(row)) return '源售后挽回订单已删除，不可调整；超级管理员可使用清理操作移出列表';
    const settlementStatus = getSettlementStatus(row);
    if (settlementStatus === '待处理') return '处理分账';
    if (settlementStatus === '待确认') return '调整分账';
    if (settlementStatus === '待发放') return '已进入发放链路，不能直接调整';
    if (settlementStatus === '已撤回') return '提成已撤回，只能查看留痕';
    return '不可调整';
  };

  const canDeleteSettlement = (row: RecoveryOrder) => (
    isSourceRecoveryDeleted(row)
      ? canCleanupDeletedSettlement
      : canManageRecoverySettlement && getSettlementStatus(row) === '待确认'
  );

  const getDeleteDisabledReason = (row: RecoveryOrder) => (
    isSourceRecoveryDeleted(row)
      ? (canCleanupDeletedSettlement ? '清理废弃售后挽回分账' : '仅超级管理员可清理废弃分账')
      : (canDeleteSettlement(row) ? '删除售后挽回分账' : '仅待确认阶段的分账可直接删除')
  );

  const renderCell = (row: RecoveryOrder, columnId: RecoverySettlementColumnId) => {
    const settlementStatus = getSettlementStatus(row);
    switch (columnId) {
      case 'recoveryNo':
        return (
          <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
            <Typography
              component="button"
              type="button"
              variant="body2"
              onClick={() => void openSourceDetail(row)}
              sx={{
                p: 0,
                border: 0,
                bgcolor: 'transparent',
                font: 'inherit',
                fontWeight: 700,
                color: shell.blue,
                cursor: 'pointer',
                textAlign: 'left',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              {row.recoveryNo}
            </Typography>
            {isSourceRecoveryDeleted(row) && <Chip label="源挽回单已删除" size="small" sx={{ height: 22 }} />}
          </Stack>
        );
      case 'customerName':
        return <Typography variant="body2" sx={{ fontWeight: 500 }}>{row.customerName || '-'}</Typography>;
      case 'thirdPartyOrderNo':
        return row.thirdPartyOrderNo || '-';
      case 'sourcePlatformShop':
        return getSourcePlatformShop(row) || '-';
      case 'originalProduct':
        return row.originalProduct || '-';
      case 'originalProductLevel':
        return row.originalProductLevel ? <Chip size="small" label={row.originalProductLevel} variant="outlined" /> : '-';
      case 'originalAmount':
        return formatCurrency(row.originalAmount);
      case 'recoveryAmount':
        return <Typography variant="body2" sx={{ fontWeight: 900, color: shell.teal }}>{formatCurrency(row.recoveryAmount)}</Typography>;
      case 'officialPaymentChannel':
        return row.officialPaymentChannel || '-';
      case 'paymentAt':
        return row.paymentAt ? formatDate(row.paymentAt, 'yyyy-MM-dd HH:mm') : '-';
      case 'recoveryUserName':
        return row.recoveryUserName || '-';
      case 'createdByName':
        return row.createdByName || '-';
      case 'splitDetails':
        return renderRowSplitDetails(row);
      case 'totalCommissionAmount':
        return <Typography variant="body2" sx={{ fontWeight: 900, color: shell.red }}>{formatCurrency(getRowFinanceSummary(row).totalCommissionAmount)}</Typography>;
      case 'customerPhone':
        return row.customerPhone || '-';
      case 'customerWechat':
        return row.customerWechat || '-';
      case 'customerMatchStatus':
        return row.customerMatchStatus || '-';
      case 'sourcePlatform':
        return row.sourcePlatformName || row.sourcePlatform || '-';
      case 'sourceShop':
        return row.sourceShopName || '-';
      case 'paymentOrderNo':
        return row.paymentOrderNo || '-';
      case 'recoveryAt':
        return row.recoveryAt ? formatDate(row.recoveryAt, 'yyyy-MM-dd HH:mm') : '-';
      case 'assistUserName':
        return row.assistUserName || '-';
      case 'auditorName':
        return row.auditorName || '-';
      case 'status':
        return <SettlementStatusChip status={settlementStatus} />;
      case 'auditedAt':
        return row.auditedAt ? formatDate(row.auditedAt, 'yyyy-MM-dd HH:mm') : '-';
      case 'remark':
        return row.remark || '-';
      case 'createdAt':
        return row.createdAt ? formatDate(row.createdAt, 'yyyy-MM-dd HH:mm') : '-';
      case 'updatedAt':
        return row.updatedAt ? formatDate(row.updatedAt, 'yyyy-MM-dd HH:mm') : '-';
      case 'performanceAmount':
        return formatCurrency(getRowFinanceSummary(row).performanceAmount || row.recoveryAmount || 0);
      case 'settlementHandledBy':
        return row.settlementHandledBy || '-';
      case 'settlementConfirmedAt':
        return row.settlementConfirmedAt ? formatDate(row.settlementConfirmedAt, 'yyyy-MM-dd HH:mm') : '-';
      case 'settlementPaidAt': {
        const paidAt = getRowFinanceSummary(row).paidAt;
        return paidAt ? formatDate(paidAt, 'yyyy-MM-dd HH:mm') : '-';
      }
      case 'settlementWithdrawReason':
        return row.settlementWithdrawReason || (settlementStatus === '已撤回' ? row.auditReason : '') || '-';
      default:
        return null;
    }
  };

  const renderActions = (row: RecoveryOrder) => (
    <Stack direction="row" spacing={0.25} justifyContent="center">
      <Tooltip title="查看">
        <IconButton size="small" sx={{ color: shell.blue }} onClick={() => openDetail(row)} aria-label="查看分账">
          <VisibilityIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      {(canManageRecoverySettlement || canCleanupDeletedSettlement) && (
        <>
          <Tooltip title={getAdjustDisabledReason(row)}>
            <span>
              <IconButton
                size="small"
                sx={{ color: canAdjustSettlement(row) ? shell.blue : '#94a3b8' }}
                disabled={!canAdjustSettlement(row)}
                onClick={() => openSettlement(row)}
                aria-label="调整分账"
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={getDeleteDisabledReason(row)}>
            <span>
              <IconButton
                size="small"
                sx={{ color: canDeleteSettlement(row) ? shell.red : '#cbd5e1' }}
                disabled={!canDeleteSettlement(row)}
                onClick={() => openResetSettlementDialog(row)}
                aria-label={isSourceRecoveryDeleted(row) ? '清理废弃售后挽回分账' : '删除售后挽回分账'}
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </>
      )}
    </Stack>
  );

  const getFrozenColumnSx = (columnIndex: number, header = false) => {
    if (columnIndex >= viewConfig.frozenColumnCount) return {};
    const left = visibleColumns.slice(0, columnIndex).reduce((sum, column) => (
      sum + RECOVERY_SETTLEMENT_COLUMN_WIDTHS[column.id as RecoverySettlementColumnId]
    ), 0);
    return {
      position: 'sticky' as const,
      left,
      zIndex: header ? 6 : 3,
      bgcolor: header ? '#f1f5f9' : '#fff',
      boxShadow: columnIndex === viewConfig.frozenColumnCount - 1 ? '1px 0 0 #dbe4ee' : undefined,
    };
  };

  return (
    <Box sx={{ display: 'grid', gap: 0 }}>
      {message && <Alert severity={message.type} onClose={() => setMessage(null)}>{message.text}</Alert>}

      <StatusSegmentBar
        value={status}
        onChange={(value) => {
          setStatus(value);
          setPage(0);
        }}
        size="small"
        sx={{ mb: 1.25 }}
        items={STATUS_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
          count: counts[option.value as keyof typeof counts] || 0,
          tone: option.value === '待处理' ? 'amber'
            : option.value === '待确认' || option.value === '待发放' ? 'blue'
              : option.value === '已发放' ? 'green'
                : option.value === '已撤回' ? 'gray'
                  : 'blue',
        }))}
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} sx={{ mb: 1.25, flexWrap: 'wrap', rowGap: 1 }}>
          <TextField
            size="small"
            placeholder="搜索挽回单号、客户、第三方订单号"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: shell.muted }} /> }}
            sx={{ minWidth: 240 }}
          />
          <FormControl size="small" sx={{ minWidth: 170 }}>
            <InputLabel>挽回人员</InputLabel>
            <Select label="挽回人员" value={recoveryUserId} onChange={(event) => {
              setRecoveryUserId(event.target.value);
              setPage(0);
            }}>
              <MenuItem value="">全部</MenuItem>
              {activeUsers.map((user) => <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
            </Select>
          </FormControl>
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
          />
          <Button variant="outlined" startIcon={<SortIcon />} onClick={handleRecoveryTimeSort}>
            {sortBy === 'recoveryAt'
              ? `挽回成交时间${sortDirection === 'asc' ? '升序' : '降序'}`
              : '按挽回成交时间排序'}
          </Button>
          <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={handleResetFilters}>
            重置
          </Button>
      </Stack>

      <TableContainer component={Paper} elevation={0} sx={[moduleTablePaperSx, { borderRadius: '6px 6px 0 0', overflowX: 'auto' }]}>
        <Table
          size="small"
          sx={[
            moduleTableSx,
            {
              tableLayout: 'fixed',
              width: recoverySettlementTableWidth,
              minWidth: recoverySettlementTableWidth,
              '& .MuiTableCell-root': { py: 1, height: 44, fontSize: 13 },
            },
          ]}
        >
          <TableHead>
            <TableRow>
              {visibleColumns.map((column, columnIndex) => (
                <TableCell
                  key={column.id}
                  sx={{
                    width: RECOVERY_SETTLEMENT_COLUMN_WIDTHS[column.id as RecoverySettlementColumnId],
                    minWidth: RECOVERY_SETTLEMENT_COLUMN_WIDTHS[column.id as RecoverySettlementColumnId],
                    ...getFrozenColumnSx(columnIndex, true),
                  }}
                >
                  {column.label}
                </TableCell>
              ))}
              <TableCell
                align="center"
                sx={{
                  position: 'sticky',
                  right: 0,
                  zIndex: 7,
                  bgcolor: '#f1f5f9',
                  width: RECOVERY_ACTION_COLUMN_WIDTH,
                  minWidth: RECOVERY_ACTION_COLUMN_WIDTH,
                  boxShadow: '-1px 0 0 #dbe4ee',
                }}
              >
                操作
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} hover>
                {visibleColumns.map((column, columnIndex) => (
                  <TableCell
                    key={column.id}
                    sx={{
                      width: RECOVERY_SETTLEMENT_COLUMN_WIDTHS[column.id as RecoverySettlementColumnId],
                      minWidth: RECOVERY_SETTLEMENT_COLUMN_WIDTHS[column.id as RecoverySettlementColumnId],
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: column.id === 'splitDetails' ? 'normal' : 'nowrap',
                      verticalAlign: column.id === 'splitDetails' ? 'top' : 'middle',
                      ...getFrozenColumnSx(columnIndex),
                    }}
                  >
                    {renderCell(row, column.id as RecoverySettlementColumnId)}
                  </TableCell>
                ))}
                <TableCell
                  align="center"
                  sx={{
                    position: 'sticky',
                    right: 0,
                    zIndex: 4,
                    bgcolor: '#fff',
                    width: RECOVERY_ACTION_COLUMN_WIDTH,
                    minWidth: RECOVERY_ACTION_COLUMN_WIDTH,
                    boxShadow: '-1px 0 0 #dbe4ee',
                  }}
                >
                  {renderActions(row)}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + 1} align="center" sx={{ py: 3.5, color: '#9ca3af', height: 72 }}>
                  暂无售后挽回分账数据
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
        sx={{ border: `1px solid ${shell.line}`, borderTop: 0, bgcolor: '#fff', '& .MuiTablePagination-toolbar': { minHeight: 44 }, '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { my: 0 } }}
      />

      <Dialog open={Boolean(sourceDetailOrder)} onClose={closeSourceDetail} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={closeSourceDetail}>售后挽回订单资料</DialogCloseTitle>
        <DialogContent dividers>
          {sourceDetailOrder && (
            <Stack spacing={2}>
              {sourceDetailLoading && <Typography variant="body2" sx={{ color: shell.muted }}>正在加载完整资料...</Typography>}
              <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1.5, color: shell.ink, fontWeight: 900 }}>源业务资料</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                  {[
                    { label: '挽回订单号', value: sourceDetailOrder.recoveryNo },
                    { label: '客户名称', value: sourceDetailOrder.customerName },
                    { label: '客户匹配状态', value: sourceDetailOrder.customerMatchStatus || '-' },
                    { label: '客户手机号', value: sourceDetailOrder.customerPhone || '-' },
                    { label: '客户微信', value: sourceDetailOrder.customerWechat || '-' },
                    { label: '第三方平台订单号', value: sourceDetailOrder.thirdPartyOrderNo || '-' },
                    { label: '来源平台 / 店铺', value: getSourcePlatformShop(sourceDetailOrder) || '-' },
                    { label: '原购买产品', value: sourceDetailOrder.originalProduct || '-' },
                    { label: '原产品等级', value: sourceDetailOrder.originalProductLevel || '-' },
                    { label: '原付款金额', value: formatCurrency(sourceDetailOrder.originalAmount) },
                    { label: '挽回人员', value: sourceDetailOrder.recoveryUserName || '-' },
                    { label: '协助人员', value: sourceDetailOrder.assistUserName || '-' },
                    { label: '挽回成交时间', value: sourceDetailOrder.recoveryAt ? formatDate(sourceDetailOrder.recoveryAt, 'yyyy-MM-dd HH:mm') : '-' },
                    { label: '订单状态', value: sourceDetailOrder.status || '-' },
                    { label: '订单创建人', value: sourceDetailOrder.createdByName || '-' },
                    { label: '创建时间', value: formatDate(sourceDetailOrder.createdAt, 'yyyy-MM-dd HH:mm') },
                    { label: '审核人', value: sourceDetailOrder.auditorName || '-' },
                    { label: '审核时间', value: sourceDetailOrder.auditedAt ? formatDate(sourceDetailOrder.auditedAt, 'yyyy-MM-dd HH:mm') : '-' },
                  ].map((item) => (
                    <Box key={item.label}>
                      <Typography variant="body2" sx={{ color: shell.muted }}>{item.label}</Typography>
                      <Typography variant="body1" sx={{ color: shell.ink, fontWeight: 700, overflowWrap: 'anywhere' }}>{item.value}</Typography>
                    </Box>
                  ))}
                  <Box sx={{ gridColumn: { md: '1 / -1' } }}>
                    <Typography variant="body2" sx={{ color: shell.muted }}>备注</Typography>
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{sourceDetailOrder.remark || '-'}</Typography>
                  </Box>
                </Box>
              </Paper>

              <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1.5, color: shell.ink, fontWeight: 900 }}>付款资料</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 2 }}>
                  {[
                    { label: '挽回成交金额', value: formatCurrency(sourceDetailOrder.recoveryAmount) },
                    { label: '官方收款渠道', value: sourceDetailOrder.officialPaymentChannel || '-' },
                    { label: '付款订单号', value: sourceDetailOrder.paymentOrderNo || '-' },
                    { label: '付款时间', value: sourceDetailOrder.paymentAt ? formatDate(sourceDetailOrder.paymentAt, 'yyyy-MM-dd HH:mm') : '-' },
                  ].map((item) => (
                    <Box key={item.label}>
                      <Typography variant="body2" sx={{ color: shell.muted }}>{item.label}</Typography>
                      <Typography variant="body1" sx={{ color: shell.ink, fontWeight: 700, overflowWrap: 'anywhere' }}>{item.value}</Typography>
                    </Box>
                  ))}
                </Box>
                <Typography variant="subtitle2" sx={{ mb: 1, color: shell.muted }}>挽回凭证</Typography>
                <RecoveryEvidenceLinks order={sourceDetailOrder} />
              </Paper>
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(detailOrder) && !selected} onClose={closeDetail} maxWidth="xl" fullWidth>
        <DialogCloseTitle onClose={closeDetail}>售后挽回分账处理</DialogCloseTitle>
        <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
          {detailOrder && (
            <Stack spacing={1.5}>
              <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, bgcolor: '#fff', overflow: 'hidden' }}>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', lg: 'minmax(320px, 1.5fr) repeat(4, minmax(120px, 0.65fr))' },
                    alignItems: 'stretch',
                  }}
                >
                  <Box sx={{ px: 2, py: 1.5, borderRight: { lg: '1px solid #e5e7eb' }, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mb: 0.5 }}>
                      <Typography variant="h6" sx={{ color: shell.ink, fontWeight: 900, letterSpacing: 0 }}>
                        {detailOrder.recoveryNo}
                      </Typography>
                      <SettlementStatusChip status={getSettlementStatus(detailOrder)} />
                      {isSourceRecoveryDeleted(detailOrder) && <Chip label="源挽回单已删除" size="small" />}
                    </Stack>
                    <Typography variant="body2" sx={{ color: shell.muted, overflowWrap: 'anywhere' }}>
                      {detailOrder.customerName} · 售后挽回 · {detailOrder.auditedAt ? formatDate(detailOrder.auditedAt, 'yyyy-MM-dd HH:mm:ss') : '-'}
                    </Typography>
                  </Box>
                  {[
                    { label: '挽回成交金额', value: formatCurrency(detailOrder.recoveryAmount), color: shell.teal },
                    { label: '分账总额', value: formatCurrency(getDetailRows(detailOrder).reduce((sum, item) => sum + item.commissionAmount, 0)), color: '#d97706' },
                    { label: '提成角色', value: `${getDetailRows(detailOrder).length} 个`, color: shell.blue },
                    { label: '第三方订单', value: detailOrder.thirdPartyOrderNo || '-', color: shell.muted },
                  ].map((item) => (
                    <Box
                      key={item.label}
                      sx={{
                        px: 1.5,
                        py: 1.5,
                        borderTop: { xs: '1px solid #e5e7eb', lg: 0 },
                        borderRight: { lg: '1px solid #e5e7eb' },
                        minWidth: 0,
                      }}
                    >
                      <Typography variant="caption" sx={{ display: 'block', color: shell.muted, lineHeight: 1.2 }}>{item.label}</Typography>
                      <Typography variant="body2" sx={{ color: item.color, fontWeight: 900, mt: 0.35, overflowWrap: 'anywhere' }}>{item.value}</Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>

              <RecoverySettlementBusinessPaymentSummary order={detailOrder} />

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 360px' }, gap: 1.5, minHeight: '58vh' }}>
                <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
                  <Box
                    sx={{
                      px: 2,
                      py: 1.25,
                      borderBottom: '1px solid #eef2f7',
                      bgcolor: '#fff',
                      display: 'flex',
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      justifyContent: 'space-between',
                      gap: 1.5,
                      flexDirection: { xs: 'column', sm: 'row' },
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ color: shell.ink, fontWeight: 900 }}>分账明细</Typography>
                      <Typography variant="caption" sx={{ color: shell.muted }}>
                        按角色核对人员、方案和金额，售后挽回分账只保留在售后挽回链路。
                      </Typography>
                    </Box>
                    {canManageRecoverySettlement && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<EditIcon />}
                        disabled={isSourceRecoveryDeleted(detailOrder) || (getSettlementStatus(detailOrder) !== '待处理' && getSettlementStatus(detailOrder) !== '待确认')}
                        onClick={() => {
                          openSettlement(detailOrder);
                        }}
                        sx={{ whiteSpace: 'nowrap' }}
                      >
                        调整分账
                      </Button>
                    )}
                  </Box>

                  <Box sx={{ p: 1.5, bgcolor: '#f8fafc', minHeight: '48vh' }}>
                    {detailLoading ? (
                      <Typography variant="body2" sx={{ color: '#9ca3af' }}>正在读取分账明细...</Typography>
                    ) : (
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(260px, 320px))' },
                          gap: 1.25,
                          alignItems: 'stretch',
                          justifyContent: 'start',
                        }}
                      >
                        {getDetailRows(detailOrder).map((commission, index) => (
                          <Paper key={commission.id} elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                            <Box sx={{ px: 1.25, py: 1, borderBottom: '1px solid #eef2f7', bgcolor: '#fff' }}>
                              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                                <Box sx={{ minWidth: 0 }}>
                                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                                    <Chip label={commission.role || DEFAULT_RECOVERY_ROLE} size="small" color="primary" sx={{ fontWeight: 900 }} />
                                    <Typography variant="caption" sx={{ color: shell.muted }}>分账 {index + 1}</Typography>
                                  </Stack>
                                  <Typography variant="body2" sx={{ fontWeight: 900, color: shell.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {commission.owner || '-'}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: shell.muted }}>{commission.department || '-'}</Typography>
                                </Box>
                                <Box sx={{ textAlign: 'right' }}>
                                  <Typography variant="caption" sx={{ color: shell.muted }}>提成</Typography>
                                  <Typography variant="body2" sx={{ color: shell.red, fontWeight: 900 }}>
                                    {formatCurrency(commission.commissionAmount)}
                                  </Typography>
                                </Box>
                              </Stack>
                            </Box>

                            <Box sx={{ p: 1.25, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                              <Box>
                                <Typography variant="caption" sx={{ color: shell.muted }}>业绩金额</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 900 }}>{formatCurrency(commission.performanceAmount || commission.orderAmount || detailOrder.recoveryAmount)}</Typography>
                              </Box>
                              <Box>
                                <Typography variant="caption" sx={{ color: shell.muted }}>状态</Typography>
                                <Box sx={{ mt: 0.35 }}>
                                  <Chip
                                    size="small"
                                    label={commission.status}
                                    color={getStatusChipColor(commission.status)}
                                    sx={{ fontWeight: 900 }}
                                  />
                                </Box>
                              </Box>
                              <Box sx={{ gridColumn: '1 / -1' }}>
                                <Typography variant="caption" sx={{ color: shell.muted }}>提成方案</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 900 }}>{commission.payoutPlanName || '自定义金额'}</Typography>
                              </Box>
                              <Box sx={{ gridColumn: '1 / -1' }}>
                                <Typography variant="caption" sx={{ color: shell.muted }}>说明</Typography>
                                <Typography variant="body2" sx={{ color: shell.ink, whiteSpace: 'pre-wrap' }}>
                                  {commission.formulaText || commission.calculationNote || detailOrder.auditReason || '-'}
                                </Typography>
                              </Box>
                            </Box>
                          </Paper>
                        ))}
                      </Box>
                    )}
                  </Box>
                </Paper>

                <Stack spacing={1.5} sx={{ minWidth: 0 }}>
                  <Paper elevation={0} sx={{ border: '1px solid #dbeafe', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                    <Box sx={{ px: 1.5, py: 1.1, borderBottom: '1px solid #dbeafe', bgcolor: '#f8fbff' }}>
                      <Typography variant="subtitle2" sx={{ color: shell.blue, fontWeight: 900 }}>当前动作</Typography>
                    </Box>
                    <Stack spacing={1.25} sx={{ p: 1.5 }}>
                      <Typography variant="body2" sx={{ color: shell.muted }}>
                        {isSourceRecoveryDeleted(detailOrder)
                          ? '源售后挽回订单已删除，分账与撤回记录永久保留为只读留痕。'
                          : getSettlementStatus(detailOrder) === '待处理'
                          ? '先配置分账明细，保存后进入待确认。'
                          : getSettlementStatus(detailOrder) === '待确认'
                            ? '确认后，本单提成进入待发放。'
                            : getSettlementStatus(detailOrder) === '待发放'
                              ? '本单已进入发放链路，如有错误可撤回。'
                              : '本单提成已撤回，只保留历史记录。'}
                      </Typography>
                      {canManageRecoverySettlement && (
                        <>
                          {!isSourceRecoveryDeleted(detailOrder) && getSettlementStatus(detailOrder) === '待处理' && (
                            <Button
                              variant="contained"
                              startIcon={<EditIcon />}
                              onClick={() => {
                                openSettlement(detailOrder);
                              }}
                            >
                              处理分账
                            </Button>
                          )}
                          {!isSourceRecoveryDeleted(detailOrder) && getSettlementStatus(detailOrder) === '待确认' && (
                            <>
                              <Button variant="contained" color="success" startIcon={<CheckCircleOutlineIcon />} onClick={() => confirmSettlement(detailOrder)}>
                                确认分账
                              </Button>
                              <TextField
                                label="撤回原因"
                                value={withdrawReason}
                                onChange={(event) => setWithdrawReason(event.target.value)}
                                size="small"
                                placeholder="例如：线下调整、金额错误"
                                fullWidth
                              />
                              <Button
                                variant="outlined"
                                color="error"
                                onClick={() => withdrawSettlement(detailOrder, withdrawReason)}
                                disabled={!withdrawReason.trim()}
                              >
                                撤回提成
                              </Button>
                            </>
                          )}
                          {!isSourceRecoveryDeleted(detailOrder) && getSettlementStatus(detailOrder) === '待发放' && (
                            <>
                              <TextField
                                label="撤回原因"
                                value={withdrawReason}
                                onChange={(event) => setWithdrawReason(event.target.value)}
                                size="small"
                                placeholder="例如：线下调整、金额错误"
                                fullWidth
                              />
                              <Button
                                variant="contained"
                                color="error"
                                startIcon={<UndoIcon />}
                                onClick={() => withdrawSettlement(detailOrder, withdrawReason)}
                                disabled={!withdrawReason.trim()}
                              >
                                撤回提成
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </Stack>
                  </Paper>

                  <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                    <Box sx={{ px: 1.5, py: 1.1, borderBottom: '1px solid #eef2f7' }}>
                      <Typography variant="subtitle2" sx={{ color: shell.ink, fontWeight: 900 }}>处理记录</Typography>
                    </Box>
                    <Box sx={{ p: 1.5 }}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, mb: 1.5 }}>
                        {[
                          { label: '当前状态', value: getSettlementStatus(detailOrder) },
                          { label: '分账经办人', value: detailOrder.settlementHandledBy || '-' },
                          { label: '保存时间', value: detailOrder.settlementHandledAt ? formatDate(detailOrder.settlementHandledAt, 'yyyy-MM-dd HH:mm') : '-' },
                          { label: '确认时间', value: detailOrder.settlementConfirmedAt ? formatDate(detailOrder.settlementConfirmedAt, 'yyyy-MM-dd HH:mm') : '-' },
                          { label: '发放时间', value: getRowFinanceSummary(detailOrder).paidAt ? formatDate(getRowFinanceSummary(detailOrder).paidAt!, 'yyyy-MM-dd HH:mm') : '-' },
                          { label: '撤回人', value: detailOrder.settlementWithdrawnBy || '-' },
                          { label: '撤回时间', value: detailOrder.settlementWithdrawnAt ? formatDate(detailOrder.settlementWithdrawnAt, 'yyyy-MM-dd HH:mm') : '-' },
                          { label: '撤回原因', value: detailOrder.settlementWithdrawReason || (getSettlementStatus(detailOrder) === '已撤回' ? detailOrder.auditReason : '') || '-' },
                        ].map((item) => (
                          <Box key={item.label} sx={{ minWidth: 0 }}>
                            <Typography variant="caption" sx={{ color: shell.muted }}>{item.label}</Typography>
                            <Typography variant="body2" sx={{ color: shell.ink, fontWeight: 800, overflowWrap: 'anywhere' }}>{item.value}</Typography>
                          </Box>
                        ))}
                      </Box>
                      <Stack spacing={1.25} sx={{ maxHeight: '42vh', overflowY: 'auto', overflowX: 'hidden', pr: 0.5, minWidth: 0 }}>
                        {detailOrder.auditedAt && (
                          <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderLeft: `3px solid ${shell.green}`, borderRadius: 1, p: 1.1 }}>
                            <Stack direction="row" justifyContent="space-between" spacing={1}>
                              <Chip label="审核通过" size="small" color="success" sx={{ height: 22 }} />
                              <Typography variant="caption" sx={{ color: shell.muted }}>{formatDate(detailOrder.auditedAt, 'MM-dd HH:mm')}</Typography>
                            </Stack>
                            <Typography variant="body2" sx={{ mt: 0.75, color: shell.ink, fontWeight: 700 }}>
                              售后挽回订单已进入待处理
                            </Typography>
                            <Typography variant="caption" sx={{ color: shell.muted }}>{detailOrder.auditorName || '-'}</Typography>
                          </Paper>
                        )}
                        {(getSettlementStatus(detailOrder) === '待确认' || getSettlementStatus(detailOrder) === '待发放' || getSettlementStatus(detailOrder) === '已撤回') && (
                          <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderLeft: `3px solid ${shell.blue}`, borderRadius: 1, p: 1.1 }}>
                            <Stack direction="row" justifyContent="space-between" spacing={1}>
                              <Chip label={getSettlementStatus(detailOrder) === '待确认' ? '保存分账' : getSettlementStatus(detailOrder) === '待发放' ? '确认分账' : '撤回提成'} size="small" color="primary" sx={{ height: 22 }} />
                              <Typography variant="caption" sx={{ color: shell.muted }}>{formatDate(detailOrder.updatedAt, 'MM-dd HH:mm')}</Typography>
                            </Stack>
                            <Typography variant="body2" sx={{ mt: 0.75, color: shell.ink, fontWeight: 700 }}>
                              {getDetailRows(detailOrder).length} 个角色 · 合计 {formatCurrency(getDetailRows(detailOrder).reduce((sum, item) => sum + item.commissionAmount, 0))}
                            </Typography>
                            <Typography variant="caption" sx={{ color: shell.muted }}>{detailOrder.auditReason || '-'}</Typography>
                          </Paper>
                        )}
                        {!detailOrder.auditedAt && getSettlementStatus(detailOrder) === '待处理' && (
                          <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无分账修改记录</Typography>
                        )}
                      </Stack>
                    </Box>
                  </Paper>
                </Stack>
              </Box>
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={createSettlementOpen}
        onClose={() => setCreateSettlementOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogCloseTitle onClose={() => setCreateSettlementOpen(false)}>新建售后挽回分账</DialogCloseTitle>
        <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
          <Stack spacing={2}>
            <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, p: 2 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} sx={{ alignItems: { xs: 'stretch', md: 'center' } }}>
                <TextField
                  label="搜索可新建挽回分账单"
                  placeholder="挽回单号/客户/第三方订单"
                  value={creatableRecoverySearch}
                  onChange={(event) => setCreatableRecoverySearch(event.target.value)}
                  size="small"
                  sx={{ minWidth: { xs: 'auto', md: 280 } }}
                />
                <FormControl size="small" sx={{ minWidth: { xs: 'auto', md: 420 }, flex: 1 }}>
                  <InputLabel shrink>选择售后挽回单</InputLabel>
                  <Select
                    value={selectedCreatableRecoveryId}
                    label="选择售后挽回单"
                    onChange={(event) => setSelectedCreatableRecoveryId(event.target.value)}
                    displayEmpty
                    renderValue={(value) => {
                      if (!value) return creatableRecoveryLoading ? '加载中...' : '选择一笔待处理的售后挽回单';
                      const order = creatableRecoveryRows.find((item) => item.id === value);
                      return order
                        ? `${order.recoveryNo} / ${order.customerName} / ${formatCurrency(order.recoveryAmount)}`
                        : '选择售后挽回单';
                    }}
                  >
                    {creatableRecoveryRows.map((order) => (
                      <MenuItem key={order.id} value={order.id}>
                        {order.recoveryNo} / {order.customerName} / {order.thirdPartyOrderNo || '-'} / {formatCurrency(order.recoveryAmount)}
                      </MenuItem>
                    ))}
                    {!creatableRecoveryRows.length && (
                      <MenuItem value="" disabled>
                        {creatableRecoveryLoading ? '加载中...' : '暂无可新建分账的售后挽回单'}
                      </MenuItem>
                    )}
                  </Select>
                </FormControl>
                <Button variant="outlined" onClick={() => fetchCreatableRecoveryOrders()} disabled={creatableRecoveryLoading}>
                  刷新
                </Button>
              </Stack>
              <Typography variant="caption" sx={{ display: 'block', color: shell.muted, mt: 1 }}>
                仅显示审核通过、待处理且尚未保存售后挽回分账的订单。
              </Typography>
            </Paper>

            {selectedCreatableRecoveryOrder ? (
              <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, p: 2 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1 }}>
                  {[
                    { label: '挽回单号', value: selectedCreatableRecoveryOrder.recoveryNo },
                    { label: '客户', value: selectedCreatableRecoveryOrder.customerName },
                    { label: '挽回金额', value: formatCurrency(selectedCreatableRecoveryOrder.recoveryAmount) },
                    { label: '挽回人员', value: selectedCreatableRecoveryOrder.recoveryUserName || selectedCreatableRecoveryOrder.createdByName || '-' },
                    { label: '第三方订单', value: selectedCreatableRecoveryOrder.thirdPartyOrderNo || '-' },
                    { label: '原产品', value: selectedCreatableRecoveryOrder.originalProduct || '-' },
                    { label: '原付款', value: formatCurrency(selectedCreatableRecoveryOrder.originalAmount) },
                    { label: '审核时间', value: selectedCreatableRecoveryOrder.auditedAt ? formatDate(selectedCreatableRecoveryOrder.auditedAt, 'yyyy-MM-dd HH:mm:ss') : '-' },
                  ].map((item) => (
                    <Box key={item.label} sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: 1, px: 1.25, py: 1 }}>
                      <Typography variant="caption" sx={{ color: shell.muted }}>{item.label}</Typography>
                      <Typography variant="body2" sx={{ color: shell.ink, fontWeight: 800, overflowWrap: 'anywhere' }}>{item.value}</Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>
            ) : (
              <Paper elevation={0} sx={{ border: '1px dashed #cbd5e1', borderRadius: 1, p: 3, textAlign: 'center', color: shell.muted }}>
                <Typography variant="body2">先选择一笔售后挽回单，再进入分账处理。</Typography>
              </Paper>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateSettlementOpen(false)}>关闭</Button>
          {canManageRecoverySettlement && (
            <Button
              variant="contained"
              disabled={!selectedCreatableRecoveryOrder}
              onClick={() => {
                if (!selectedCreatableRecoveryOrder) return;
                setCreateSettlementOpen(false);
                openSettlement(selectedCreatableRecoveryOrder);
              }}
            >
              开始处理分账
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="xl" fullWidth>
        <DialogCloseTitle onClose={() => setSelected(null)}>售后挽回分账处理</DialogCloseTitle>
        <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
          {selected && (
            <Stack spacing={1.5}>
              <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, bgcolor: '#fff', overflow: 'hidden' }}>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', lg: 'minmax(320px, 1.5fr) repeat(4, minmax(120px, 0.65fr))' },
                    alignItems: 'stretch',
                  }}
                >
                  <Box sx={{ px: 2, py: 1.5, borderRight: { lg: '1px solid #e5e7eb' }, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mb: 0.5 }}>
                      <Typography variant="h6" sx={{ color: shell.ink, fontWeight: 900, letterSpacing: 0 }}>
                        {selected.recoveryNo}
                      </Typography>
                      <SettlementStatusChip status={getSettlementStatus(selected)} />
                    </Stack>
                    <Typography variant="body2" sx={{ color: shell.muted, overflowWrap: 'anywhere' }}>
                      {selected.customerName} · 售后挽回 · {selected.createdAt ? formatDate(selected.createdAt, 'yyyy-MM-dd HH:mm:ss') : '-'}
                    </Typography>
                  </Box>
                  {[
                    { label: '挽回成交金额', value: formatCurrency(selected.recoveryAmount), color: shell.teal },
                    { label: '分账总额', value: formatCurrency(settlementRows.reduce((sum, row) => sum + (Number(row.commissionAmount) || 0), 0)), color: '#d97706' },
                    { label: '提成角色', value: `${settlementRows.length} 个`, color: shell.blue },
                    { label: '第三方订单', value: selected.thirdPartyOrderNo || '-', color: shell.muted },
                  ].map((item) => (
                    <Box
                      key={item.label}
                      sx={{
                        px: 1.5,
                        py: 1.5,
                        borderTop: { xs: '1px solid #e5e7eb', lg: 0 },
                        borderRight: { lg: '1px solid #e5e7eb' },
                        minWidth: 0,
                      }}
                    >
                      <Typography variant="caption" sx={{ display: 'block', color: shell.muted, lineHeight: 1.2 }}>{item.label}</Typography>
                      <Typography variant="body2" sx={{ color: item.color, fontWeight: 900, mt: 0.35, overflowWrap: 'anywhere' }}>{item.value}</Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>

              <RecoverySettlementBusinessPaymentSummary order={selected} />

              <Box data-testid="recovery-settlement-editor" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 360px' }, gap: 1.5, minHeight: '58vh' }}>
                <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
                  <Box
                    sx={{
                      px: 2,
                      py: 1.25,
                      borderBottom: '1px solid #eef2f7',
                      bgcolor: '#fff',
                      display: 'flex',
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      justifyContent: 'space-between',
                      gap: 1.5,
                      flexDirection: { xs: 'column', sm: 'row' },
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ color: shell.ink, fontWeight: 900 }}>分账明细编辑</Typography>
                      <Typography variant="caption" sx={{ color: shell.muted }}>
                        按角色核对人员、方案和金额，保存后进入待确认，再由财务确认进入待发放。
                      </Typography>
                    </Box>
                    <Button size="small" variant="contained" startIcon={<EditIcon />} disabled sx={{ whiteSpace: 'nowrap' }}>
                      正在调整
                    </Button>
                  </Box>

                  <Box sx={{ p: 1.5, bgcolor: '#f8fafc', minHeight: '48vh' }}>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(320px, 320px))' },
                        gap: 1.25,
                        alignItems: 'stretch',
                        justifyContent: 'start',
                      }}
                    >
                      {settlementRows.map((row, index) => {
                        const selectedPlan = activePlans.find((plan) => plan.id === row.payoutPlanId);
                        const owner = activeUsers.find((user) => user.id === row.ownerId);
                        const isCustom = row.payoutPlanId === CUSTOM_PLAN_ID;
                        const planHelperText = isCustom
                          ? '自定义金额 · 手工填写提成金额'
                          : selectedPlan
                            ? formatPlan(selectedPlan)
                            : '请选择提成方案';
                        const inputSx = {
                          '& .MuiOutlinedInput-root': {
                            bgcolor: '#fff',
                            borderRadius: 1,
                          },
                          '& .MuiInputBase-input': {
                            fontWeight: 700,
                          },
                        };
                        const fieldLabel = (label: string) => (
                          <Typography variant="caption" sx={{ display: 'block', color: shell.muted, fontWeight: 800, mb: 0.35 }}>
                            {label}
                          </Typography>
                        );
                        return (
                          <Paper
                            key={`${index}-${row.role}`}
                            elevation={0}
                            sx={{
                              width: { xs: '100%', sm: 320 },
                              border: `1px solid ${shell.line}`,
                              borderRadius: 1,
                              overflow: 'hidden',
                              bgcolor: '#fff',
                            }}
                          >
                            <Box sx={{ px: 1.25, py: 1, borderBottom: '1px solid #eef2f7', bgcolor: '#f8fafc' }}>
                              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                                <Box sx={{ minWidth: 0 }}>
                                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                                    <Chip label={row.role || DEFAULT_RECOVERY_ROLE} size="small" color="primary" sx={{ fontWeight: 900 }} />
                                    <Typography variant="caption" sx={{ color: shell.muted }}>分账 {index + 1}</Typography>
                                  </Stack>
                                  <Typography variant="body2" sx={{ fontWeight: 900, color: shell.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {owner ? formatEmployeeNameWithPosition(owner) : '未选择人员'}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: shell.muted }}>{getOwnerDepartmentName(owner)}</Typography>
                                </Box>
                                <Tooltip title={settlementRows.length > 1 ? '删除' : '至少保留一条分账'}>
                                  <span>
                                    <IconButton
                                      size="small"
                                      sx={{ color: '#94a3b8' }}
                                      disabled={settlementRows.length <= 1}
                                      onClick={() => removeRow(index)}
                                    >
                                      <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              </Stack>
                            </Box>

                            <Box sx={{ p: 1.25, bgcolor: '#f8fafc' }}>
                              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                                <Box sx={{ minWidth: 0 }}>
                                  {fieldLabel('角色')}
                                  <FormControl size="small" fullWidth sx={inputSx}>
                                    <Select value={row.role} onChange={(event) => updateRow(index, { role: event.target.value })}>
                                      {activeRoles.map((role) => <MenuItem key={role.id} value={role.name}>{role.name}</MenuItem>)}
                                      {!activeRoles.some((role) => role.name === DEFAULT_RECOVERY_ROLE) && (
                                        <MenuItem value={DEFAULT_RECOVERY_ROLE}>{DEFAULT_RECOVERY_ROLE}</MenuItem>
                                      )}
                                    </Select>
                                  </FormControl>
                                </Box>
                                <Box sx={{ minWidth: 0 }}>
                                  {fieldLabel('人员')}
                                  <FormControl size="small" fullWidth sx={inputSx}>
                                    <Select
                                      value={row.ownerId}
                                      onChange={(event) => updateRow(index, { ownerId: event.target.value })}
                                      renderValue={(value) => {
                                        const selectedOwner = activeUsers.find((user) => user.id === value);
                                        return selectedOwner ? formatEmployeeNameWithPosition(selectedOwner) : '选择人员';
                                      }}
                                    >
                                      {activeUsers.map((user) => <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
                                    </Select>
                                  </FormControl>
                                </Box>
                                <Box sx={{ minWidth: 0 }}>
                                  {fieldLabel('部门')}
                                  <TextField
                                    size="small"
                                    value={getOwnerDepartmentName(owner)}
                                    disabled
                                    fullWidth
                                    sx={inputSx}
                                  />
                                </Box>
                                <Box sx={{ minWidth: 0 }}>
                                  {fieldLabel('业绩金额')}
                                  <TextField
                                    size="small"
                                    type="number"
                                    value={row.performanceAmount}
                                    onChange={(event) => updateRow(index, { performanceAmount: event.target.value })}
                                    fullWidth
                                    sx={inputSx}
                                  />
                                </Box>
                                <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
                                  {fieldLabel('提成方案')}
                                  <FormControl size="small" fullWidth sx={inputSx}>
                                    <Select
                                      value={row.payoutPlanId}
                                      onChange={(event) => updateRow(index, { payoutPlanId: event.target.value })}
                                    >
                                      <MenuItem value={CUSTOM_PLAN_ID}>自定义金额</MenuItem>
                                      {activePlans.map((plan) => <MenuItem key={plan.id} value={plan.id}>{formatPlan(plan)}</MenuItem>)}
                                    </Select>
                                  </FormControl>
                                  <Typography variant="caption" sx={{ color: shell.muted, display: 'block', mt: 0.5, lineHeight: 1.35 }}>
                                    {planHelperText}
                                  </Typography>
                                </Box>
                                <Box sx={{ minWidth: 0 }}>
                                  {fieldLabel(isCustom ? '方案金额' : '提成金额')}
                                  <TextField
                                    size="small"
                                    type="number"
                                    value={row.commissionAmount}
                                    onChange={(event) => updateRow(index, { commissionAmount: event.target.value })}
                                    disabled={!isCustom && selectedPlan?.commissionType !== 'tiered_percentage'}
                                    fullWidth
                                    sx={inputSx}
                                  />
                                </Box>
                                <Box sx={{ alignSelf: 'end', textAlign: 'right', pb: 0.25 }}>
                                  <Typography variant="caption" sx={{ color: shell.muted }}>当前提成</Typography>
                                  <Typography variant="h6" sx={{ color: shell.red, fontWeight: 900, lineHeight: 1.25 }}>
                                    {formatCurrency(Number(row.commissionAmount) || 0)}
                                  </Typography>
                                </Box>
                                <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
                                  {fieldLabel('说明')}
                                  <TextField
                                    size="small"
                                    value={row.calculationNote}
                                    onChange={(event) => updateRow(index, { calculationNote: event.target.value })}
                                    fullWidth
                                    placeholder="可选"
                                    sx={inputSx}
                                  />
                                </Box>
                              </Box>
                            </Box>
                          </Paper>
                        );
                      })}
                    </Box>

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, mt: 1.5 }}>
                      {canManageRecoverySettlement && (
                        <Button startIcon={<AddIcon />} onClick={addRow} sx={{ alignSelf: { xs: 'stretch', sm: 'center' } }}>新增分账</Button>
                      )}
                      <TextField
                        size="small"
                        label="调整原因"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        required
                        sx={{ width: { xs: '100%', md: 300 } }}
                      />
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 1.25 }}>
                      <Button onClick={() => setSelected(null)}>
                        取消编辑
                      </Button>
                      {canManageRecoverySettlement && (
                        <Button
                          variant="contained"
                          disabled={saving || !reason.trim() || settlementRows.length === 0 || settlementRows.some((row) => !row.ownerId || !row.payoutPlanId)}
                          onClick={submitSettlement}
                        >
                          {saving ? '保存中...' : '保存调整'}
                        </Button>
                      )}
                    </Stack>
                  </Box>
                </Paper>

                <Stack spacing={1.5} sx={{ minWidth: 0 }}>
                  <Paper elevation={0} sx={{ border: '1px solid #dbeafe', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                    <Box sx={{ px: 1.5, py: 1.1, borderBottom: '1px solid #dbeafe', bgcolor: '#f8fbff' }}>
                      <Typography variant="subtitle2" sx={{ color: shell.blue, fontWeight: 900 }}>当前动作</Typography>
                    </Box>
                    <Stack spacing={1.25} sx={{ p: 1.5 }}>
                      <Typography variant="body2" sx={{ color: shell.muted }}>
                        先在左侧调整分账，补齐人员、方案和金额后，再进入确认流程。
                      </Typography>
                    </Stack>
                  </Paper>

                  <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                    <Box sx={{ px: 1.5, py: 1.1, borderBottom: '1px solid #eef2f7' }}>
                      <Typography variant="subtitle2" sx={{ color: shell.ink, fontWeight: 900 }}>操作历史</Typography>
                    </Box>
                    <Box sx={{ p: 1.5 }}>
                      <Stack spacing={1.25} sx={{ maxHeight: '42vh', overflowY: 'auto', overflowX: 'hidden', pr: 0.5, minWidth: 0 }}>
                        {selected.auditedAt ? (
                          <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderLeft: `3px solid ${shell.green}`, borderRadius: 1, p: 1.1 }}>
                            <Stack direction="row" justifyContent="space-between" spacing={1}>
                              <Chip label="审核通过" size="small" color="success" sx={{ height: 22 }} />
                              <Typography variant="caption" sx={{ color: shell.muted }}>{formatDate(selected.auditedAt, 'MM-dd HH:mm')}</Typography>
                            </Stack>
                            <Typography variant="body2" sx={{ mt: 0.75, color: shell.ink, fontWeight: 700 }}>
                              售后挽回订单已进入待处理
                            </Typography>
                            <Typography variant="caption" sx={{ color: shell.muted }}>{selected.auditorName || '-'}</Typography>
                          </Paper>
                        ) : (
                          <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无分账修改记录</Typography>
                        )}
                      </Stack>
                    </Box>
                  </Paper>
                </Stack>
              </Box>
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteReason('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogCloseTitle
          onClose={() => {
            setDeleteTarget(null);
            setDeleteReason('');
          }}
        >
          {deleteTarget && isSourceRecoveryDeleted(deleteTarget) ? '清理废弃售后挽回分账' : '删除售后挽回分账'}
        </DialogCloseTitle>
        <DialogContent dividers>
          {deleteTarget && (
            <Stack spacing={1.25}>
              <Alert severity="warning">
                {isSourceRecoveryDeleted(deleteTarget)
                  ? '清理后该记录将从财务售后挽回分账列表隐藏，底层业务、提成及清理审计留痕仍保留。'
                  : '删除后会清空该挽回单已保存的提成记录，并退回到“待处理”状态。'}
              </Alert>
              <Box sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 1.25, bgcolor: shell.soft }}>
                <Typography variant="body2" sx={{ fontWeight: 900 }}>{deleteTarget.recoveryNo}</Typography>
                <Typography variant="body2" sx={{ color: shell.muted }}>{deleteTarget.customerName} · {deleteTarget.thirdPartyOrderNo}</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  挽回金额：<Box component="span" sx={{ color: shell.teal, fontWeight: 900 }}>{formatCurrency(deleteTarget.recoveryAmount)}</Box>
                </Typography>
              </Box>
              <TextField
                label={isSourceRecoveryDeleted(deleteTarget) ? '清理原因' : '删除原因'}
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder={isSourceRecoveryDeleted(deleteTarget) ? '例如：源单已废弃，清理财务列表残留' : '例如：人员选错、方案错误，需要重新处理'}
                multiline
                minRows={3}
                required
                fullWidth
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setDeleteTarget(null);
            setDeleteReason('');
          }}>
            取消
          </Button>
          {(canManageRecoverySettlement || canCleanupDeletedSettlement) && (
            <Button color="error" variant="contained" onClick={handleResetSettlement} disabled={!deleteReason.trim()}>
              {deleteTarget && isSourceRecoveryDeleted(deleteTarget) ? '确认清理' : '确认删除'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(withdrawTarget)} onClose={() => setWithdrawTarget(null)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setWithdrawTarget(null)}>撤回售后挽回提成</DialogCloseTitle>
        <DialogContent dividers>
          {withdrawTarget && (
            <Stack spacing={1.25}>
              <Alert severity="warning">
                撤回后，该挽回单关联的提成会标记为已撤回，不再进入发放。
              </Alert>
              <Box sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 1.25, bgcolor: shell.soft }}>
                <Typography variant="body2" sx={{ fontWeight: 900 }}>{withdrawTarget.recoveryNo}</Typography>
                <Typography variant="body2" sx={{ color: shell.muted }}>{withdrawTarget.customerName} · {withdrawTarget.thirdPartyOrderNo}</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  挽回金额：<Box component="span" sx={{ color: shell.teal, fontWeight: 900 }}>{formatCurrency(withdrawTarget.recoveryAmount)}</Box>
                </Typography>
              </Box>
              <TextField
                label="撤回原因"
                value={withdrawReason}
                onChange={(event) => setWithdrawReason(event.target.value)}
                multiline
                minRows={3}
                required
                fullWidth
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWithdrawTarget(null)}>取消</Button>
          {canManageRecoverySettlement && (
            <Button
              color="warning"
              variant="contained"
              disabled={!withdrawReason.trim() || !withdrawTarget}
              onClick={() => withdrawTarget && withdrawSettlement(withdrawTarget, withdrawReason)}
            >
              确认撤回
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <TableViewSettingsDialog
        open={viewSettingsOpen}
        title="售后挽回分账视图设置"
        description="勾选后会显示在售后挽回分账列表中，设置会保存在当前浏览器。"
        columns={RECOVERY_SETTLEMENT_COLUMNS}
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
        title="导出售后挽回分账"
        expectedCount={total}
        currentColumnCount={visibleColumns.length}
        onClose={() => setExportOpen(false)}
        onRequestExport={handleExportRecoverySettlements}
      />
    </Box>
  );
};

export default RecoverySettlement;
