import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
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
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EditIcon from '@mui/icons-material/Edit';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import SortIcon from '@mui/icons-material/Sort';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { businessExportApi, commissionApi, commissionPayoutApi, commissionRuleApi, customerApi, orderApi, settingsApi } from '../../api';
import { getProductLevelRowSx, getProductLevelTagSx, normalizeResourceOwnership } from '../../shared/utils/constants';
import {
  buildCommissionPayoutPlanSnapshot,
  getCommissionTierBucketKey,
  isCommissionPendingHandling,
  isRecoveryCommission,
} from '../../shared/utils/commissionConfiguration';
import { getSettlementRowActionVisibility } from '../../shared/settlementListActions';
import { formatCurrency, formatDate, formatEmployeeNameWithPosition, formatPaginationRows } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import ResizableHeaderCell, {
  readColumnWidths,
  resetColumnWidths,
  resizeColumnWidths,
  writeColumnWidths,
  type ColumnWidthMap,
} from '../../shared/components/ResizableTable';
import CommissionRuleConfig from './CommissionRuleConfig';
import OrderDetail from '../Orders/OrderDetail';
import CustomerDetail from '../Customers/CustomerDetail';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../shared/utils/permissions';
import type {
  Commission,
  CommissionAdjustmentInput,
  CommissionCreatableOrderSummary,
  CommissionOrderSummary,
  CommissionOrderSummaryFilters,
  CommissionOrderSummaryStatus,
  CommissionOrderSummaryStatusCounts,
  CommissionOperationLog,
  CommissionPayoutPlan,
  CommissionPayoutWorkspace,
  CommissionRole,
  CommissionRoleConfig,
  MonthlyCommissionRoleSummary,
  MonthlyCommissionPayout,
} from '../../types/commission';
import type { Department } from '../../types/department';
import type { Customer } from '../../types/customer';
import type { Order } from '../../types/order';
import type { Position } from '../../types/position';
import type { User } from '../../types/settings';
import { ModuleTabs, moduleRadius, moduleTablePaperSx, moduleTableSx, moduleTokens, StatusSegmentBar } from '../../shared/components/ModuleShell';
import {
  getActiveCommissions,
  getCommissionSplitAmountPresentation,
  getCommissionSplitLineAmountText,
} from '../../shared/utils/financeSettlementPresentation';
import BusinessExportDialog, { type BusinessExportDialogRequest } from '../../shared/components/BusinessExportDialog';
import { buildBusinessExportBrowserRequest, unwrapBusinessExportResponse } from '../../shared/utils/businessExportPageRequest';
import AttachmentPreviewLink from '../../shared/components/AttachmentPreview';
import BusinessAttachmentLinks from '../../shared/components/BusinessAttachmentLinks';
import { getOrderSettlementEvidenceStatus, getOrderSettlementRisks } from '../../shared/utils/orderSettlementPresentation';
import SettlementStatusChip from '../../shared/components/SettlementStatusChip';
import OperationFeedbackDialog from '../../shared/components/OperationFeedbackDialog';
import { SettlementCompactDetailItem, SettlementDetailCard } from '../../shared/components/SettlementDetailUi';
import SettlementOperationTimeline from '../../shared/components/SettlementOperationTimeline';
import { SETTLEMENT_STATUSES } from '../../shared/utils/settlementStatus';
import {
  DataTableEmptyState,
  DataTableDesktopScroller,
  DataTableMobileScroller,
  DataTableWorkspace,
  DataTableWorkspaceFooter,
} from '../../shared/components/DataTableWorkspace';
import { downloadMineCommissionStatement } from './mineCommissionExport';
import {
  buildMineCommissionIdentity,
  buildMineTieredCommissionItems,
  countsTowardMineTierBase,
  getMineCommissionBusinessTime,
  resolveMineTierSnapshot,
} from './mineCommissionPresentation';

const ORDER_STATUS_OPTIONS: Array<{ value: CommissionOrderSummaryStatus | '全部'; label: string; important?: boolean }> = [
  { value: '全部', label: '全部' },
  ...SETTLEMENT_STATUSES.map((value) => ({ value, label: value, important: value === '待处理' })),
];

const DEFAULT_ORDER_STATUS_COUNTS: CommissionOrderSummaryStatusCounts = {
  全部: 0,
  待处理: 0,
  待确认: 0,
  待发放: 0,
  已发放: 0,
  已撤回: 0,
};

type FinanceMonthlyReportColumnId =
  | 'department'
  | 'businessComposition'
  | 'formalOrderPaidAmount'
  | 'recoveryBusinessAmount'
  | 'totalAmount'
  | 'pendingConfirmAmount'
  | 'pendingPayAmount'
  | 'paidAmount'
  | 'correctionOriginalPaidAmount'
  | 'correctionEntitlementAmount'
  | 'correctionDelta'
  | 'statusDistribution';

type FinanceMonthlyReportColumnMeta = {
  id: FinanceMonthlyReportColumnId;
  label: string;
  width: number;
  align?: 'left' | 'right' | 'center';
  group: '业务数据' | '提成状态' | '更正与差额';
};

const FINANCE_MONTHLY_REPORT_VIEW_STORAGE_KEY = 'aaos_finance_monthly_report_view_v1';
const FINANCE_MONTHLY_REPORT_COLUMNS: FinanceMonthlyReportColumnMeta[] = [
  { id: 'department', label: '部门', width: 130, group: '业务数据' },
  { id: 'businessComposition', label: '业务构成', width: 150, group: '业务数据' },
  { id: 'formalOrderPaidAmount', label: '正式订单实付', width: 150, align: 'right', group: '业务数据' },
  { id: 'recoveryBusinessAmount', label: '挽回成交额', width: 140, align: 'right', group: '业务数据' },
  { id: 'totalAmount', label: '本月提成总额', width: 150, align: 'right', group: '提成状态' },
  { id: 'pendingConfirmAmount', label: '待确认', width: 120, align: 'right', group: '提成状态' },
  { id: 'pendingPayAmount', label: '待发放', width: 120, align: 'right', group: '提成状态' },
  { id: 'paidAmount', label: '已发放', width: 120, align: 'right', group: '提成状态' },
  { id: 'correctionOriginalPaidAmount', label: '更正原已发', width: 140, align: 'right', group: '更正与差额' },
  { id: 'correctionEntitlementAmount', label: '更正后应得', width: 140, align: 'right', group: '更正与差额' },
  { id: 'correctionDelta', label: '补发 / 追回', width: 160, align: 'right', group: '更正与差额' },
  { id: 'statusDistribution', label: '状态分布', width: 280, group: '提成状态' },
];
const DEFAULT_FINANCE_MONTHLY_REPORT_VISIBLE_COLUMNS = FINANCE_MONTHLY_REPORT_COLUMNS.map((column) => column.id);

function readFinanceMonthlyReportView(): FinanceMonthlyReportColumnId[] {
  try {
    const raw = localStorage.getItem(FINANCE_MONTHLY_REPORT_VIEW_STORAGE_KEY);
    if (!raw) return [...DEFAULT_FINANCE_MONTHLY_REPORT_VISIBLE_COLUMNS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_FINANCE_MONTHLY_REPORT_VISIBLE_COLUMNS];
    const validIds = new Set(DEFAULT_FINANCE_MONTHLY_REPORT_VISIBLE_COLUMNS);
    const normalized = parsed.filter((id): id is FinanceMonthlyReportColumnId => typeof id === 'string' && validIds.has(id as FinanceMonthlyReportColumnId));
    return normalized.length ? normalized : [...DEFAULT_FINANCE_MONTHLY_REPORT_VISIBLE_COLUMNS];
  } catch {
    return [...DEFAULT_FINANCE_MONTHLY_REPORT_VISIBLE_COLUMNS];
  }
}

type OrderSplitColumnId =
  | 'orderNo'
  | 'status'
  | 'customerName'
  | 'thirdPartyOrderNo'
  | 'productName'
  | 'productLevel'
  | 'orderAmount'
  | 'officialPaymentChannel'
  | 'paymentDate'
  | 'salesOwner'
  | 'createdByName'
  | 'splitDetails'
  | 'totalCommissionAmount'
  | 'orderType'
  | 'resourceOwnership'
  | 'leadSourceFull'
  | 'leadInputBy'
  | 'leadContributorName'
  | 'paymentOrderNo'
  | 'notes'
  | 'createdAt'
  | 'updatedAt'
  | 'performanceAmount'
  | 'pendingAssignCount'
  | 'exceptionCount'
  | 'settlementOperator'
  | 'confirmedAt'
  | 'paidAt'
  | 'withdrawReason';

type OrderSplitColumnMeta = {
  id: OrderSplitColumnId;
  label: string;
  defaultWidth: number;
};

const ORDER_SPLIT_VIEW_STORAGE_KEY = 'aaos_commission_order_split_view_v5';
const ORDER_SPLIT_WIDTH_STORAGE_KEY = 'aaos_commission_order_split_widths_v4';

const ORDER_SPLIT_COLUMNS: OrderSplitColumnMeta[] = [
  { id: 'orderNo', label: '订单号', defaultWidth: 170 },
  { id: 'status', label: '分账状态', defaultWidth: 120 },
  { id: 'customerName', label: '客户', defaultWidth: 150 },
  { id: 'thirdPartyOrderNo', label: '第三方平台订单', defaultWidth: 180 },
  { id: 'productName', label: '产品名称', defaultWidth: 180 },
  { id: 'productLevel', label: '产品等级', defaultWidth: 140 },
  { id: 'orderAmount', label: '实付金额', defaultWidth: 130 },
  { id: 'officialPaymentChannel', label: '官方收款渠道', defaultWidth: 160 },
  { id: 'paymentDate', label: '付款时间', defaultWidth: 180 },
  { id: 'salesOwner', label: '销售负责人', defaultWidth: 130 },
  { id: 'createdByName', label: '订单创建人', defaultWidth: 140 },
  { id: 'splitDetails', label: '分账明细', defaultWidth: 330 },
  { id: 'totalCommissionAmount', label: '分账总额', defaultWidth: 130 },
  { id: 'orderType', label: '订单类型', defaultWidth: 140 },
  { id: 'resourceOwnership', label: '资源归属', defaultWidth: 120 },
  { id: 'leadSourceFull', label: '线索来源', defaultWidth: 180 },
  { id: 'leadInputBy', label: '线索录入人', defaultWidth: 140 },
  { id: 'leadContributorName', label: '线索贡献人', defaultWidth: 150 },
  { id: 'paymentOrderNo', label: '付款订单号', defaultWidth: 180 },
  { id: 'notes', label: '备注', defaultWidth: 220 },
  { id: 'createdAt', label: '订单创建时间', defaultWidth: 180 },
  { id: 'updatedAt', label: '分账更新时间', defaultWidth: 180 },
  { id: 'performanceAmount', label: '业绩计算金额', defaultWidth: 140 },
  { id: 'pendingAssignCount', label: '待分配人数', defaultWidth: 120 },
  { id: 'exceptionCount', label: '已撤回人数', defaultWidth: 120 },
  { id: 'settlementOperator', label: '分账经办人', defaultWidth: 140 },
  { id: 'confirmedAt', label: '确认时间', defaultWidth: 180 },
  { id: 'paidAt', label: '发放时间', defaultWidth: 180 },
  { id: 'withdrawReason', label: '撤回原因', defaultWidth: 220 },
];

const DEFAULT_ORDER_SPLIT_VISIBLE_COLUMNS: OrderSplitColumnId[] = [
  'orderNo',
  'status',
  'customerName',
  'thirdPartyOrderNo',
  'productName',
  'productLevel',
  'orderAmount',
  'officialPaymentChannel',
  'paymentDate',
  'salesOwner',
  'createdByName',
  'splitDetails',
  'totalCommissionAmount',
];

const DEFAULT_ORDER_SPLIT_COLUMN_ORDER = ORDER_SPLIT_COLUMNS.map((column) => column.id);
const DEFAULT_ORDER_SPLIT_COLUMN_WIDTHS = ORDER_SPLIT_COLUMNS.reduce<ColumnWidthMap>((result, column) => {
  result[column.id] = column.defaultWidth;
  return result;
}, {});

type OrderSplitViewConfig = {
  visibleColumnIds: OrderSplitColumnId[];
  columnOrder: OrderSplitColumnId[];
  frozenColumnCount: number;
};

function normalizeOrderSplitColumnIds(ids: unknown, fallback: OrderSplitColumnId[]): OrderSplitColumnId[] {
  if (!Array.isArray(ids)) return [...fallback];
  const validIds = new Set(ORDER_SPLIT_COLUMNS.map((column) => column.id));
  const normalized = ids.filter((id): id is OrderSplitColumnId => typeof id === 'string' && validIds.has(id as OrderSplitColumnId));
  return normalized.length ? normalized : [...fallback];
}

function readOrderSplitViewConfig(): OrderSplitViewConfig {
  try {
    const raw = localStorage.getItem(ORDER_SPLIT_VIEW_STORAGE_KEY);
    if (!raw) {
      return {
        visibleColumnIds: [...DEFAULT_ORDER_SPLIT_VISIBLE_COLUMNS],
        columnOrder: [...DEFAULT_ORDER_SPLIT_COLUMN_ORDER],
        frozenColumnCount: 0,
      };
    }
    const parsed = JSON.parse(raw) as Partial<OrderSplitViewConfig>;
    const storedOrder = normalizeOrderSplitColumnIds(parsed.columnOrder, DEFAULT_ORDER_SPLIT_COLUMN_ORDER);
    const missingIds = DEFAULT_ORDER_SPLIT_COLUMN_ORDER.filter((id) => !storedOrder.includes(id));
    const storedVisibleIds = normalizeOrderSplitColumnIds(parsed.visibleColumnIds, DEFAULT_ORDER_SPLIT_VISIBLE_COLUMNS);
    const newDefaultVisibleIds = missingIds.filter((id) => (
      DEFAULT_ORDER_SPLIT_VISIBLE_COLUMNS.includes(id) && !storedVisibleIds.includes(id)
    ));
    return {
      visibleColumnIds: [...storedVisibleIds, ...newDefaultVisibleIds],
      columnOrder: [...storedOrder, ...missingIds],
      frozenColumnCount: Math.max(0, Math.min(Number(parsed.frozenColumnCount) || 0, ORDER_SPLIT_COLUMNS.length)),
    };
  } catch {
    return {
      visibleColumnIds: [...DEFAULT_ORDER_SPLIT_VISIBLE_COLUMNS],
      columnOrder: [...DEFAULT_ORDER_SPLIT_COLUMN_ORDER],
      frozenColumnCount: 0,
    };
  }
}

function getPayoutStatusColor(status: MonthlyCommissionPayout['status']): 'default' | 'success' | 'error' | 'warning' | 'info' {
  if (status === '已发放') return 'success';
  if (status === '待确认') return 'info';
  if (status === '待发放') return 'warning';
  return 'default';
}

function getCommissionStatusColor(status: Commission['status'] | '待处理' | '无应发'): 'default' | 'primary' | 'success' | 'error' | 'warning' | 'info' {
  if (status === '已发放') return 'success';
  if (status === '待发放') return 'primary';
  if (status === '待处理') return 'warning';
  if (status === '待确认') return 'info';
  return 'default';
}

function getCommissionDisplayStatus(commission: Commission): Commission['status'] | '待处理' {
  if (commission.status !== '待确认') return commission.status;
  return isCommissionPendingHandling(commission) ? '待处理' : commission.status;
}

function escapeCsvValue(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

const CUSTOM_PAYOUT_PLAN_ID = '__custom_amount__';
const CUSTOM_PAYOUT_PLAN_NAME = '自定义金额';

const MONTHLY_PAYOUT_COLUMN_WIDTHS = {
  expand: 48,
  employee: 150,
  department: 130,
  orderCount: 90,
  monthlyPaidAmount: 120,
  totalAmount: 120,
  pendingConfirmAmount: 110,
  pendingPayAmount: 110,
  paidAmount: 110,
  withdrawnAmount: 110,
  status: 100,
};

const MONTHLY_PAYOUT_TABLE_WIDTH = Object.values(MONTHLY_PAYOUT_COLUMN_WIDTHS).reduce((sum, width) => sum + width, 0);

type MinePayoutCategory = 'all' | 'tiered' | 'ordinary' | 'recovery';

const MINE_COMMISSION_CATEGORY_COLORS: Record<Exclude<MinePayoutCategory, 'all'>, string> = {
  tiered: '#2563EB',
  ordinary: '#0F766E',
  recovery: '#7C3AED',
};

const getMineCommissionCategoryRowSx = (category: Exclude<MinePayoutCategory, 'all'>) => {
  const color = MINE_COMMISSION_CATEGORY_COLORS[category];
  return {
    bgcolor: `${color}08`,
    '&.MuiTableRow-hover:hover': {
      bgcolor: `${color}12`,
    },
  };
};

const getMineCommissionCategoryCardSx = (category: Exclude<MinePayoutCategory, 'all'>) => {
  const color = MINE_COMMISSION_CATEGORY_COLORS[category];
  return {
    bgcolor: `${color}08`,
    borderTop: `1px solid ${color}18`,
    '&:hover': {
      bgcolor: `${color}12`,
    },
  };
};

type MineCommissionDisplayRow = {
  id: string;
  category: Exclude<MinePayoutCategory, 'all'>;
  typeLabel: string;
  sourceLabel: string;
  title: string;
  subtitle: string;
  role: string;
  businessAt: string;
  performanceAmount: number;
  calculationText: string;
  commissionAmount: number;
  status: Commission['status'] | '待处理' | '无应发';
  commissions: Commission[];
  tierSnapshot?: Commission['tierSnapshot'];
};

const monthlyPayoutOwnerKey = (row: MonthlyCommissionPayout) => row.ownerId || row.owner;

const monthlyPayoutStatusDistribution = (row: MonthlyCommissionPayout) => ([
  { label: '待处理', count: row.statusCounts?.pendingHandling || 0, color: 'default' as const },
  { label: '待确认', count: row.statusCounts?.pendingConfirm || 0, color: 'info' as const },
  { label: '待发放', count: row.statusCounts?.pendingPay || 0, color: 'warning' as const },
  { label: '已发放', count: row.statusCounts?.paid || 0, color: 'success' as const },
  { label: '已撤回', count: row.statusCounts?.withdrawn || 0, color: 'default' as const },
]).filter((item) => item.count > 0);

interface CommissionProps {
  embedded?: boolean;
  initialTab?: 0 | 1 | 2;
  payoutScope?: 'all' | 'mine';
  payoutMode?: 'finance' | 'mine';
  hideEmbeddedOrderSplitViewButton?: boolean;
  orderSplitViewTrigger?: number;
  orderSplitCreateTrigger?: number;
  orderSplitExportTrigger?: number;
  orderSplitInitialSearch?: string;
  hideEmbeddedFinanceMonthlyViewButton?: boolean;
  financeMonthlyViewTrigger?: number;
}

function OrderPaymentEvidence({ order }: { order: Order }) {
  if (!order.payments.length) return <Typography variant="body2" sx={{ color: '#94a3b8' }}>暂无付款记录</Typography>;
  return (
    <Stack spacing={0.75}>
      {order.payments.map((payment, index) => (
        <Box
          key={payment.id || `${payment.paidAt}-${index}`}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '130px 110px minmax(120px, 1fr) minmax(150px, 1.2fr)' },
            gap: 1,
            alignItems: 'center',
            px: 1,
            py: 0.8,
            border: '1px solid #e5e7eb',
            borderRadius: 1,
            bgcolor: '#f8fafc',
          }}
        >
          <Typography variant="caption" sx={{ color: '#475569' }}>{payment.paidAt ? formatDate(payment.paidAt, 'yyyy-MM-dd HH:mm') : '-'}</Typography>
          <Typography variant="body2" sx={{ color: '#19142C', fontWeight: 900 }}>{formatCurrency(payment.amount)}</Typography>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#475569' }}>
              {payment.paymentMethod || (payment as typeof payment & { method?: string }).method || '-'}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: '#64748b', overflowWrap: 'anywhere' }}>
              {payment.paymentOrderNo || '-'}
            </Typography>
          </Box>
          <Box sx={{ minWidth: 0 }}>
            {payment.attachments?.length
              ? <BusinessAttachmentLinks attachments={payment.attachments} />
              : <AttachmentPreviewLink title="付款凭证" fileName={payment.voucherName} src={payment.voucherPreview} />}
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

function OrderSettlementBusinessPaymentSummary({
  summary,
  order,
  loading,
  formatPerson,
  onViewCustomer,
  onViewOrder,
}: {
  summary: CommissionOrderSummary;
  order: Order | null;
  loading: boolean;
  formatPerson: (id?: string, name?: string) => string;
  onViewCustomer: () => void;
  onViewOrder: () => void;
}) {
  const paymentTotal = order?.payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0) || 0;
  const sourceText = summary.leadSourceFull || summary.sourceType || '-';
  return (
    <Box
      data-testid="order-settlement-business-payment-summary"
      sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 1.5 }}
    >
      <SettlementDetailCard
        title="源业务资料"
        action={!summary.sourceOrderDeleted ? (
            <Stack direction="row" spacing={0.5}>
              <Button size="small" variant="text" onClick={onViewCustomer}>客户资料</Button>
              <Button size="small" variant="text" onClick={onViewOrder}>订单资料</Button>
            </Stack>
          ) : undefined}
      >
        {loading ? (
          <Typography variant="body2" sx={{ color: '#64748b', py: 3 }}>正在加载正式订单资料...</Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, columnGap: 2, rowGap: 0.1 }}>
            <SettlementCompactDetailItem label="客户">{summary.customerName || '-'}</SettlementCompactDetailItem>
            <SettlementCompactDetailItem label="订单类型">{summary.orderType || '-'}</SettlementCompactDetailItem>
            <SettlementCompactDetailItem label="产品">{summary.productName || order?.productName || summary.productLevel || '-'}</SettlementCompactDetailItem>
            <SettlementCompactDetailItem label="产品等级">{summary.productLevel || '-'}</SettlementCompactDetailItem>
            <SettlementCompactDetailItem label="第三方订单">{summary.thirdPartyOrderNo || '-'}</SettlementCompactDetailItem>
            <SettlementCompactDetailItem label="资源归属">{summary.resourceOwnership || '-'}</SettlementCompactDetailItem>
            <SettlementCompactDetailItem label="线索来源">{sourceText}</SettlementCompactDetailItem>
            <SettlementCompactDetailItem label="销售负责人">{formatPerson(summary.salesId, summary.salesName || summary.salesOwner)}</SettlementCompactDetailItem>
            <SettlementCompactDetailItem label="线索贡献人">
              {summary.leadContributorName
                ? formatPerson(undefined, summary.leadContributorName)
                : '-'}
            </SettlementCompactDetailItem>
            <SettlementCompactDetailItem label="订单创建人">{formatPerson(summary.createdById, summary.createdByName)}</SettlementCompactDetailItem>
            <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
              <SettlementCompactDetailItem label="备注">{summary.notes || '-'}</SettlementCompactDetailItem>
            </Box>
          </Box>
        )}
      </SettlementDetailCard>

      <SettlementDetailCard title="付款资料">
        {loading ? (
          <Typography variant="body2" sx={{ color: '#64748b', py: 3 }}>正在加载付款及凭证资料...</Typography>
        ) : order ? (
          <Stack spacing={1}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, columnGap: 2, rowGap: 0.1 }}>
              <SettlementCompactDetailItem label="订单实付">{formatCurrency(order.actualAmount)}</SettlementCompactDetailItem>
              <SettlementCompactDetailItem label="付款合计">{formatCurrency(paymentTotal)}</SettlementCompactDetailItem>
              <SettlementCompactDetailItem label="收款渠道">{summary.officialPaymentChannel || order.officialPaymentChannel || '-'}</SettlementCompactDetailItem>
              <SettlementCompactDetailItem label="付款笔数">{`${order.payments.length} 笔`}</SettlementCompactDetailItem>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ display: 'block', color: '#64748b', fontWeight: 700, mb: 0.5 }}>付款记录</Typography>
              <OrderPaymentEvidence order={order} />
            </Box>
            <SettlementCompactDetailItem label="成交凭证">
              {order.dealEvidenceAttachments?.length
                ? <BusinessAttachmentLinks attachments={order.dealEvidenceAttachments} />
                : <AttachmentPreviewLink title="成交路径 / 聊天记录" fileName={order.dealEvidenceName} src={order.dealEvidencePreview} />}
            </SettlementCompactDetailItem>
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ color: '#64748b', py: 3 }}>
            {summary.sourceOrderDeleted ? '源订单已删除，付款资料不可用。' : '未能加载付款资料，请关闭后重试。'}
          </Typography>
        )}
      </SettlementDetailCard>
    </Box>
  );
}

const Commission: React.FC<CommissionProps> = ({
  embedded = false,
  initialTab = 0,
  payoutScope = 'all',
  payoutMode = 'finance',
  hideEmbeddedOrderSplitViewButton = false,
  orderSplitViewTrigger = 0,
  orderSplitCreateTrigger = 0,
  orderSplitExportTrigger = 0,
  orderSplitInitialSearch = '',
  hideEmbeddedFinanceMonthlyViewButton = false,
  financeMonthlyViewTrigger = 0,
}) => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const canManageOrderSettlement = hasPermission(currentUser, PERMISSION_KEYS.FINANCE_SETTLEMENT, 'write');
  const canExportFinanceMonthlyReport = hasPermission(currentUser, PERMISSION_KEYS.FINANCE_PAYOUT_REPORT_EXPORT);
  const canCleanupDeletedOrderSettlement = isSuperAdmin(currentUser);
  const [tabValue, setTabValue] = useState(initialTab);
  const lastOrderSplitViewTriggerRef = useRef(orderSplitViewTrigger);
  const lastOrderSplitCreateTriggerRef = useRef(orderSplitCreateTrigger);
  const lastOrderSplitExportTriggerRef = useRef(orderSplitExportTrigger);
  const lastFinanceMonthlyViewTriggerRef = useRef(financeMonthlyViewTrigger);
  const [orderRows, setOrderRows] = useState<CommissionOrderSummary[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderPagination, setOrderPagination] = useState({ page: 1, pageSize: 10, total: 0 });
  const [orderFilters, setOrderFilters] = useState({
    search: orderSplitInitialSearch,
    status: '全部' as CommissionOrderSummaryStatus | '全部',
    ownerId: '',
    salesId: '',
    role: '' as CommissionRole | '',
    month: '',
    startDate: '',
    endDate: '',
    sortBy: 'createdAt' as 'createdAt' | 'paymentDate',
    sortDirection: 'desc' as 'asc' | 'desc',
  });
  const [orderStatusCounts, setOrderStatusCounts] = useState<CommissionOrderSummaryStatusCounts>(DEFAULT_ORDER_STATUS_COUNTS);
  const [orderSplitViewOpen, setOrderSplitViewOpen] = useState(false);
  const [orderSplitExportOpen, setOrderSplitExportOpen] = useState(false);
  const [orderSplitViewConfig, setOrderSplitViewConfig] = useState<OrderSplitViewConfig>(() => readOrderSplitViewConfig());
  const [orderSplitColumnWidths, setOrderSplitColumnWidths] = useState<ColumnWidthMap>(() => (
    readColumnWidths(ORDER_SPLIT_WIDTH_STORAGE_KEY, DEFAULT_ORDER_SPLIT_COLUMN_WIDTHS)
  ));
  const [draggedOrderSplitColumnId, setDraggedOrderSplitColumnId] = useState<OrderSplitColumnId | null>(null);
  const [dragOverOrderSplitColumnId, setDragOverOrderSplitColumnId] = useState<OrderSplitColumnId | null>(null);

  const [payoutPeriod, setPayoutPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [payoutRows, setPayoutRows] = useState<MonthlyCommissionPayout[]>([]);
  const [financePeriodSummary, setFinancePeriodSummary] = useState<CommissionPayoutWorkspace['summary'] | null>(null);
  const [selectedFinancePayoutOwnerKey, setSelectedFinancePayoutOwnerKey] = useState('');
  const [expandedPayoutOwners, setExpandedPayoutOwners] = useState<Set<string>>(new Set());
  const [expandedMinePayoutGroups, setExpandedMinePayoutGroups] = useState<Set<string>>(new Set());
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [minePayoutCategory, setMinePayoutCategory] = useState<MinePayoutCategory>('all');
  const [mineDetailPage, setMineDetailPage] = useState(0);
  const [mineDetailPageSize, setMineDetailPageSize] = useState(10);
  const [financeMonthlyPage, setFinanceMonthlyPage] = useState(0);
  const [financeMonthlyPageSize, setFinanceMonthlyPageSize] = useState(10);
  const [financeMonthlyViewOpen, setFinanceMonthlyViewOpen] = useState(false);
  const [financeMonthlyVisibleColumnIds, setFinanceMonthlyVisibleColumnIds] = useState<FinanceMonthlyReportColumnId[]>(() => readFinanceMonthlyReportView());
  const [mineCalculationDetailPage, setMineCalculationDetailPage] = useState(0);
  const [mineCalculationDetailPageSize, setMineCalculationDetailPageSize] = useState(10);
  const [mineDetailRow, setMineDetailRow] = useState<MineCommissionDisplayRow | null>(null);
  const [mineExporting, setMineExporting] = useState(false);
  const [financeReportOpen, setFinanceReportOpen] = useState(false);
  const [financeReportScope, setFinanceReportScope] = useState<'all' | 'department' | 'employee'>('all');
  const [financeReportDepartmentId, setFinanceReportDepartmentId] = useState('');
  const [financeReportOwnerId, setFinanceReportOwnerId] = useState('');
  const [financeReportReason, setFinanceReportReason] = useState('');
  const [financeReportIncludeWithdrawn, setFinanceReportIncludeWithdrawn] = useState(true);
  const [financeReportExporting, setFinanceReportExporting] = useState(false);
  const [financeReportError, setFinanceReportError] = useState('');

  const [commissionRoleConfigs, setCommissionRoleConfigs] = useState<CommissionRoleConfig[]>([]);
  const [payoutPlans, setPayoutPlans] = useState<CommissionPayoutPlan[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [createSplitOpen, setCreateSplitOpen] = useState(false);
  const [creatableOrderRows, setCreatableOrderRows] = useState<CommissionCreatableOrderSummary[]>([]);
  const [creatableOrderLoading, setCreatableOrderLoading] = useState(false);
  const [creatableOrderSearch, setCreatableOrderSearch] = useState('');
  const [selectedCreatableOrderId, setSelectedCreatableOrderId] = useState('');

  const [splitOrderId, setSplitOrderId] = useState('');
  const [splitRows, setSplitRows] = useState<CommissionAdjustmentInput[]>([]);
  const [splitReason, setSplitReason] = useState('');
  const [splitSaving, setSplitSaving] = useState(false);
  const [summaryDetail, setSummaryDetail] = useState<CommissionOrderSummary | null>(null);
  const [deleteSummary, setDeleteSummary] = useState<CommissionOrderSummary | null>(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [reopenSummary, setReopenSummary] = useState<CommissionOrderSummary | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenLoading, setReopenLoading] = useState(false);
  const [detailEditMode, setDetailEditMode] = useState(false);
  const [detailActionLoading, setDetailActionLoading] = useState(false);
  const [detailActionReason, setDetailActionReason] = useState('');
  const [settlementActionMessage, setSettlementActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [orderDetail, setOrderDetail] = useState<Order | null>(null);
  const [settlementOrderDetail, setSettlementOrderDetail] = useState<Order | null>(null);
  const [settlementOrderLoading, setSettlementOrderLoading] = useState(false);
  const [operationLogs, setOperationLogs] = useState<CommissionOperationLog[]>([]);
  const [customerDetail, setCustomerDetail] = useState<Customer | null>(null);

  const activeEmployees = useMemo(() => employees.filter((item) => item.isActive), [employees]);
  const activeRoleConfigs = useMemo(() => commissionRoleConfigs.filter((item) => item.isActive), [commissionRoleConfigs]);
  const activePayoutPlans = useMemo(() => payoutPlans.filter((item) => item.isActive), [payoutPlans]);
  const selectedCreatableOrder = useMemo(() => (
    creatableOrderRows.find((order) => order.orderId === selectedCreatableOrderId) || null
  ), [creatableOrderRows, selectedCreatableOrderId]);
  const monthlyPayoutSummary = useMemo(() => payoutRows.reduce((summary, row) => ({
    orderCount: summary.orderCount + row.orderCount,
    monthlyPaidAmount: summary.monthlyPaidAmount + row.monthlyPaidAmount,
    totalAmount: summary.totalAmount + row.totalAmount,
    pendingConfirmAmount: summary.pendingConfirmAmount + row.pendingConfirmAmount,
    pendingPayAmount: summary.pendingPayAmount + row.pendingPayAmount,
    paidAmount: summary.paidAmount + row.paidAmount,
    exceptionAmount: summary.exceptionAmount + (row.exceptionAmount || 0),
    withdrawnAmount: summary.withdrawnAmount + (row.withdrawnAmount || 0),
    chargebackAmount: 0,
  }), {
    orderCount: 0,
    monthlyPaidAmount: 0,
    totalAmount: 0,
    pendingConfirmAmount: 0,
    pendingPayAmount: 0,
    paidAmount: 0,
    exceptionAmount: 0,
    withdrawnAmount: 0,
    chargebackAmount: 0,
  }), [payoutRows]);
  const selectedFinancePayoutRow = useMemo(() => (
    payoutRows.find((row) => monthlyPayoutOwnerKey(row) === selectedFinancePayoutOwnerKey)
    || payoutRows[0]
    || null
  ), [payoutRows, selectedFinancePayoutOwnerKey]);
  const financeMonthlyTotalPages = Math.max(1, Math.ceil(payoutRows.length / financeMonthlyPageSize));
  const currentFinanceMonthlyPage = Math.min(financeMonthlyPage, financeMonthlyTotalPages - 1);
  const visibleFinancePayoutRows = payoutRows.slice(
    currentFinanceMonthlyPage * financeMonthlyPageSize,
    (currentFinanceMonthlyPage + 1) * financeMonthlyPageSize,
  );
  const visibleFinanceMonthlyColumns = FINANCE_MONTHLY_REPORT_COLUMNS.filter((column) => (
    financeMonthlyVisibleColumnIds.includes(column.id)
  ));
  const financeMonthlyTableMinWidth = 180 + 132 + visibleFinanceMonthlyColumns.reduce((sum, column) => sum + column.width, 0);

  const toggleFinanceMonthlyColumn = (columnId: FinanceMonthlyReportColumnId) => {
    setFinanceMonthlyVisibleColumnIds((current) => {
      const next = current.includes(columnId)
        ? current.filter((id) => id !== columnId)
        : [...current, columnId];
      const normalized = next.length ? next : [columnId];
      localStorage.setItem(FINANCE_MONTHLY_REPORT_VIEW_STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    });
  };

  const resetFinanceMonthlyView = () => {
    const next = [...DEFAULT_FINANCE_MONTHLY_REPORT_VISIBLE_COLUMNS];
    localStorage.setItem(FINANCE_MONTHLY_REPORT_VIEW_STORAGE_KEY, JSON.stringify(next));
    setFinanceMonthlyVisibleColumnIds(next);
  };

  useEffect(() => {
    setFinanceMonthlyPage(0);
  }, [payoutPeriod, payoutMode]);
  useEffect(() => {
    const firstVisibleRow = visibleFinancePayoutRows[0];
    if (payoutMode !== 'finance') return;
    if (!firstVisibleRow) {
      if (selectedFinancePayoutOwnerKey) setSelectedFinancePayoutOwnerKey('');
      return;
    }
    const selectedIsVisible = visibleFinancePayoutRows.some(
      (row) => monthlyPayoutOwnerKey(row) === selectedFinancePayoutOwnerKey,
    );
    if (!selectedIsVisible) setSelectedFinancePayoutOwnerKey(monthlyPayoutOwnerKey(firstVisibleRow));
  }, [currentFinanceMonthlyPage, financeMonthlyPageSize, payoutMode, payoutRows, selectedFinancePayoutOwnerKey]);
  useEffect(() => {
    setMineCalculationDetailPage(0);
  }, [mineDetailRow?.id]);

  const mineCalculationDetailRows = mineDetailRow?.commissions || [];
  const mineCalculationDetailTotalPages = Math.max(1, Math.ceil(mineCalculationDetailRows.length / mineCalculationDetailPageSize));
  const currentMineCalculationDetailPage = Math.min(mineCalculationDetailPage, mineCalculationDetailTotalPages - 1);
  const visibleMineCalculationDetailRows = mineCalculationDetailRows.slice(
    currentMineCalculationDetailPage * mineCalculationDetailPageSize,
    (currentMineCalculationDetailPage + 1) * mineCalculationDetailPageSize,
  );

  const findDepartment = (departmentId?: string) => departments.find((item) => item.id === departmentId);
  const getDepartmentName = (departmentId?: string) => findDepartment(departmentId)?.name || '';
  const getOwnerDepartment = (user?: User) => {
    if (!user) return undefined;
    const directDepartment = findDepartment(user.departmentId);
    if (directDepartment) return directDepartment;
    const position = positions.find((item) => item.id === user.positionId || item.name === user.positionName);
    return findDepartment(position?.departmentId);
  };
  const findEmployeeForDisplay = (ownerId?: string, ownerName?: string) => {
    const normalizedOwnerName = ownerName?.trim();
    return activeEmployees.find((user) => (
      user.id === ownerId || Boolean(normalizedOwnerName && user.name === normalizedOwnerName)
    ));
  };
  const formatEmployeeDisplayName = (user?: User | null, fallbackName?: string) => {
    const name = user?.name || fallbackName?.trim() || '';
    if (!name) return '待分配';
    return formatEmployeeNameWithPosition(user || { name });
  };
  const formatOwnerDisplayName = (ownerId?: string, ownerName?: string) => (
    formatEmployeeDisplayName(findEmployeeForDisplay(ownerId, ownerName), ownerName)
  );
  const filterPayoutRowsForScope = (rows: MonthlyCommissionPayout[]) => {
    if (payoutScope !== 'mine') return rows;
    const currentName = currentUser?.name?.trim();
    const currentId = currentUser?.id;
    if (!currentId && !currentName) return [];
    return rows.filter((row) => (
      row.ownerId === currentId
      || Boolean(currentName && row.owner === currentName)
    ));
  };
  const orderedOrderSplitColumns = useMemo(() => {
    const byId = new Map(ORDER_SPLIT_COLUMNS.map((column) => [column.id, column]));
    return orderSplitViewConfig.columnOrder
      .map((id) => byId.get(id))
      .filter((column): column is OrderSplitColumnMeta => Boolean(column));
  }, [orderSplitViewConfig.columnOrder]);
  const visibleOrderSplitColumns = useMemo(() => (
    orderedOrderSplitColumns.filter((column) => orderSplitViewConfig.visibleColumnIds.includes(column.id))
  ), [orderedOrderSplitColumns, orderSplitViewConfig.visibleColumnIds]);
  const frozenColumnCount = Math.min(orderSplitViewConfig.frozenColumnCount, visibleOrderSplitColumns.length);
  const orderSplitTableMinWidth = visibleOrderSplitColumns.reduce((sum, column) => (
    sum + (orderSplitColumnWidths[column.id] || column.defaultWidth)
  ), 170);

  const roleOptionsForSplit = (currentRole: CommissionRole) => {
    const options = activeRoleConfigs.slice();
    if (currentRole && !options.some((item) => item.name === currentRole)) {
      const current = commissionRoleConfigs.find((item) => item.name === currentRole);
      return current ? [current, ...options] : [{ id: currentRole, name: currentRole, code: currentRole, isActive: false, sortOrder: 999, createdAt: '', updatedAt: '' }, ...options];
    }
    return options;
  };

  const planOptionsForSplit = (currentPlanId?: string) => {
    const options = activePayoutPlans.slice();
    if (currentPlanId && currentPlanId !== CUSTOM_PAYOUT_PLAN_ID && !options.some((item) => item.id === currentPlanId)) {
      const current = payoutPlans.find((item) => item.id === currentPlanId);
      if (current) return [current, ...options];
    }
    return options;
  };

  const findPayoutPlanForRow = (row: CommissionAdjustmentInput) => (
    payoutPlans.find((item) => item.id === row.payoutPlanId)
    || (row.payoutPlanName
      ? payoutPlans.find((item) => (
        item.name === row.payoutPlanName
        && item.commissionType === row.ruleCalculationType
      ))
      : undefined)
  );

  const isCustomPayoutRow = (row: CommissionAdjustmentInput) => (
    row.payoutPlanId === CUSTOM_PAYOUT_PLAN_ID
    || row.payoutPlanName === CUSTOM_PAYOUT_PLAN_NAME
  );

  const formatPayoutPlanValue = (
    plan?: Pick<CommissionPayoutPlan, 'commissionType' | 'commissionValue' | 'tiers'>,
  ) => {
    if (!plan) return '未选择方案';
    if (plan.commissionType === 'tiered_percentage') {
      const tiers = plan.tiers || [];
      return tiers.length ? `月度累计阶梯 · ${tiers.length} 档` : '月度累计阶梯';
    }
    if (plan.commissionType === 'percentage') return `按业绩金额 ${plan.commissionValue}%`;
    return `固定金额 ${formatCurrency(plan.commissionValue)}`;
  };

  const applyPayoutPlanToSplitRow = (
    row: CommissionAdjustmentInput,
    planId?: string,
  ): CommissionAdjustmentInput => {
    if (planId === CUSTOM_PAYOUT_PLAN_ID) {
      return {
        ...row,
        payoutPlanId: CUSTOM_PAYOUT_PLAN_ID,
        payoutPlanName: CUSTOM_PAYOUT_PLAN_NAME,
        payoutPlanVersion: undefined,
        payoutPlanSnapshot: undefined,
        ruleCalculationType: 'fixed',
        commissionRate: 0,
        commissionAmount: Number(row.commissionAmount || 0),
        tierSnapshot: undefined,
        calculationNote: row.calculationNote || '财务自定义金额分账',
      };
    }
    const plan = planId ? payoutPlans.find((item) => item.id === planId) : undefined;
    if (!plan) {
      return {
        ...row,
        payoutPlanId: undefined,
        payoutPlanName: undefined,
        payoutPlanVersion: undefined,
        payoutPlanSnapshot: undefined,
      };
    }
    const performanceAmount = Number(
      row.performanceAmount
      || selectedCreatableOrder?.orderAmount
      || summaryDetail?.orderAmount
      || 0,
    );
    if (plan.commissionType === 'tiered_percentage') {
      return {
        ...row,
        payoutPlanId: plan.id,
        payoutPlanName: plan.name,
        payoutPlanVersion: plan.version,
        payoutPlanSnapshot: buildCommissionPayoutPlanSnapshot(plan),
        ruleCalculationType: plan.commissionType,
        commissionRate: 0,
        commissionAmount: 0,
        performanceAmount,
        tierSnapshot: {
          tiers: plan.tiers || [],
          baseAmount: performanceAmount,
          gapToNext: 0,
        },
        calculationNote: plan.description || '月度累计阶梯提成，按角色与方案版本汇总月度业绩',
      };
    }
    if (plan.commissionType === 'percentage') {
      const rate = Number(plan.commissionValue || 0) / 100;
      return {
        ...row,
        payoutPlanId: plan.id,
        payoutPlanName: plan.name,
        payoutPlanVersion: plan.version,
        payoutPlanSnapshot: buildCommissionPayoutPlanSnapshot(plan),
        ruleCalculationType: plan.commissionType,
        commissionRate: rate,
        commissionAmount: Math.round(performanceAmount * rate * 100) / 100,
        performanceAmount,
        tierSnapshot: undefined,
        calculationNote: plan.description || `按业绩金额 ${plan.commissionValue}% 计算`,
      };
    }
    return {
      ...row,
      payoutPlanId: plan.id,
      payoutPlanName: plan.name,
      payoutPlanVersion: plan.version,
      payoutPlanSnapshot: buildCommissionPayoutPlanSnapshot(plan),
      ruleCalculationType: plan.commissionType,
      commissionRate: 0,
      commissionAmount: Number(plan.commissionValue || 0),
      performanceAmount,
      tierSnapshot: undefined,
      calculationNote: plan.description || `固定提成 ${formatCurrency(plan.commissionValue)}`,
    };
  };

  const fetchSettlementOptions = async () => {
    const [rolesRes, plansRes, directoryRes] = await Promise.all([
      commissionRuleApi.getCommissionRoleConfigs(),
      commissionRuleApi.getCommissionPayoutPlans(),
      settingsApi.fetchAssignableDirectory(),
    ]);
    if (rolesRes.code === 0) setCommissionRoleConfigs(rolesRes.data);
    if (plansRes.code === 0) setPayoutPlans(plansRes.data);
    if (directoryRes.code === 0) {
      setEmployees(directoryRes.data.users);
      setDepartments(directoryRes.data.departments);
      setPositions(directoryRes.data.positions);
    }
  };

  const buildOrderSummaryFilters = (status = orderFilters.status): CommissionOrderSummaryFilters => ({
    search: orderFilters.search || undefined,
    status,
    ownerId: orderFilters.ownerId || undefined,
    salesId: orderFilters.salesId || undefined,
    role: orderFilters.role || undefined,
    month: orderFilters.month || undefined,
    startDate: orderFilters.startDate || undefined,
    endDate: orderFilters.endDate || undefined,
    sortBy: orderFilters.sortBy,
    sortDirection: orderFilters.sortDirection,
    page: orderPagination.page,
    pageSize: orderPagination.pageSize,
  });

  const fetchOrderSummaries = async () => {
    setOrderLoading(true);
    try {
      const res = await commissionApi.fetchCommissionOrderSummaries(buildOrderSummaryFilters());
      if (res.code === 0) {
        setOrderRows(res.data.items);
        setOrderPagination((prev) => ({
          ...prev,
          page: res.data.pagination.page,
          pageSize: res.data.pagination.pageSize,
          total: res.data.pagination.total,
        }));
      }
    } finally {
      setOrderLoading(false);
    }
  };

  const fetchOrderStatusCounts = async () => {
    const res = await commissionApi.fetchCommissionOrderSummaryStatusCounts(buildOrderSummaryFilters('全部'));
    if (res.code === 0) setOrderStatusCounts(res.data);
  };

  const fetchCreatableOrders = async (search = creatableOrderSearch) => {
    setCreatableOrderLoading(true);
    try {
      const res = await commissionApi.fetchCreatableCommissionOrders({
        search: search || undefined,
        page: 1,
        pageSize: 50,
      });
      if (res.code === 0) {
        setCreatableOrderRows(res.data.items);
        setSelectedCreatableOrderId((current) => (
          current && res.data.items.some((order) => order.orderId === current) ? current : ''
        ));
      }
    } finally {
      setCreatableOrderLoading(false);
    }
  };

  const fetchMonthlyPayouts = async (period = payoutPeriod) => {
    if (!period) return;
    setPayoutLoading(true);
    try {
      if (payoutMode === 'finance') {
        setFinancePeriodSummary(null);
        setPayoutRows([]);
        const res = await commissionPayoutApi.fetchPeriodWorkspace(period);
        if (res.code === 0 && res.data) {
          const rows: MonthlyCommissionPayout[] = res.data.employees.map((employee) => ({
            period,
            owner: employee.owner,
            ownerId: employee.ownerId,
            department: employee.department,
            departmentId: employee.departmentId,
            orderCount: employee.orderCount,
            monthlyPaidAmount: 0,
            formalOrderPaidAmount: employee.formalOrderPaidAmount,
            recoveryBusinessAmount: employee.recoveryBusinessAmount,
            formalOrderCount: employee.formalOrderCount,
            recoveryOrderCount: employee.recoveryOrderCount,
            statusCounts: employee.statusCounts,
            pendingConfirmAmount: employee.pendingConfirmAmount,
            pendingPayAmount: employee.pendingPayAmount,
            paidAmount: employee.paidAmount,
            exceptionAmount: 0,
            withdrawnAmount: employee.withdrawnAmount,
            chargebackAmount: 0,
            totalAmount: employee.totalAmount,
            correctionOriginalPaidAmount: employee.correctionOriginalPaidAmount,
            correctionEntitlementAmount: employee.correctionEntitlementAmount,
            correctionSupplementAmount: employee.correctionSupplementAmount,
            correctionRecoverAmount: employee.correctionRecoverAmount,
            pendingCorrectionSupplementAmount: employee.pendingCorrectionSupplementAmount,
            pendingCorrectionRecoverAmount: employee.pendingCorrectionRecoverAmount,
            status: employee.pendingConfirmAmount > 0
              ? '待确认'
              : employee.pendingPayAmount > 0
                ? '待发放'
                : employee.paidAmount > 0
                  ? '已发放'
                  : '无应发',
            commissions: employee.commissions,
          }));
          setFinancePeriodSummary(res.data.summary);
          setPayoutRows(filterPayoutRowsForScope(rows));
        }
        return;
      }
      const res = await commissionApi.fetchMonthlyCommissionPayouts(period);
      if (res.code === 0) {
        setFinancePeriodSummary(null);
        setPayoutRows(filterPayoutRowsForScope(res.data));
      }
    } finally {
      setPayoutLoading(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([fetchOrderSummaries(), fetchOrderStatusCounts(), fetchMonthlyPayouts()]);
  };

  useEffect(() => {
    fetchSettlementOptions();
  }, []);

  useEffect(() => {
    fetchOrderSummaries();
  }, [orderFilters, orderPagination.page, orderPagination.pageSize]);

  useEffect(() => {
    fetchOrderStatusCounts();
  }, [
    orderFilters.search,
    orderFilters.ownerId,
    orderFilters.salesId,
    orderFilters.role,
    orderFilters.month,
    orderFilters.startDate,
    orderFilters.endDate,
  ]);

  useEffect(() => {
    localStorage.setItem(ORDER_SPLIT_VIEW_STORAGE_KEY, JSON.stringify(orderSplitViewConfig));
  }, [orderSplitViewConfig]);

  useEffect(() => {
    writeColumnWidths(ORDER_SPLIT_WIDTH_STORAGE_KEY, orderSplitColumnWidths);
  }, [orderSplitColumnWidths]);

  useEffect(() => {
    fetchMonthlyPayouts(payoutPeriod);
  }, [payoutPeriod]);

  useEffect(() => {
    if (!createSplitOpen) return;
    fetchCreatableOrders(creatableOrderSearch);
  }, [createSplitOpen, creatableOrderSearch]);

  useEffect(() => {
    if (orderSplitViewTrigger <= 0) return;
    if (lastOrderSplitViewTriggerRef.current === orderSplitViewTrigger) return;
    lastOrderSplitViewTriggerRef.current = orderSplitViewTrigger;
    setOrderSplitViewOpen(true);
  }, [orderSplitViewTrigger]);

  useEffect(() => {
    if (orderSplitCreateTrigger <= 0) return;
    if (lastOrderSplitCreateTriggerRef.current === orderSplitCreateTrigger) return;
    lastOrderSplitCreateTriggerRef.current = orderSplitCreateTrigger;
    openCreateSplitDialog();
  }, [orderSplitCreateTrigger]);

  useEffect(() => {
    if (orderSplitExportTrigger <= 0) return;
    if (lastOrderSplitExportTriggerRef.current === orderSplitExportTrigger) return;
    lastOrderSplitExportTriggerRef.current = orderSplitExportTrigger;
    setOrderSplitExportOpen(true);
  }, [orderSplitExportTrigger]);

  useEffect(() => {
    if (financeMonthlyViewTrigger <= 0) return;
    if (lastFinanceMonthlyViewTriggerRef.current === financeMonthlyViewTrigger) return;
    lastFinanceMonthlyViewTriggerRef.current = financeMonthlyViewTrigger;
    setFinanceMonthlyViewOpen(true);
  }, [financeMonthlyViewTrigger]);

  const handleExportOrderSettlements = async (request: BusinessExportDialogRequest) => {
    const response = await businessExportApi.exportOrderSettlements(buildBusinessExportBrowserRequest(
      buildOrderSummaryFilters(),
      { ...request, columnIds: visibleOrderSplitColumns.map((column) => column.id) },
    ));
    return unwrapBusinessExportResponse(response);
  };

  const updateOrderFilter = (key: keyof typeof orderFilters, value: string) => {
    setOrderPagination((prev) => ({ ...prev, page: 1 }));
    setOrderFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleOrderPaymentDateSort = () => {
    setOrderPagination((prev) => ({ ...prev, page: 1 }));
    setOrderFilters((prev) => ({
      ...prev,
      sortBy: 'paymentDate',
      sortDirection: prev.sortBy === 'paymentDate' && prev.sortDirection === 'desc' ? 'asc' : 'desc',
    }));
  };

  const handleResetOrderFilters = () => {
    setOrderPagination((prev) => ({ ...prev, page: 1 }));
    setOrderFilters({
      search: '',
      status: '全部',
      ownerId: '',
      salesId: '',
      role: '',
      month: '',
      startDate: '',
      endDate: '',
      sortBy: 'createdAt',
      sortDirection: 'desc',
    });
  };

  const handleOrderPageChange = (_: React.MouseEvent<HTMLButtonElement> | null, page: number) => {
    setOrderPagination((prev) => ({ ...prev, page: page + 1 }));
  };

  const handleOrderRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setOrderPagination((prev) => ({ ...prev, page: 1, pageSize: Number(event.target.value) }));
  };

  const getFrozenLeft = (columnIndex: number) => visibleOrderSplitColumns.slice(0, columnIndex).reduce((sum, column) => (
    sum + (orderSplitColumnWidths[column.id] || column.defaultWidth)
  ), 0);

  const getFrozenColumnSx = (columnIndex: number, isHead = false) => (
    columnIndex < frozenColumnCount
      ? {
        position: 'sticky',
        left: getFrozenLeft(columnIndex),
        zIndex: isHead ? 5 : 3,
        bgcolor: isHead ? '#f8fafc' : '#fff',
        boxShadow: '1px 0 0 #e5e7eb',
      }
      : {}
  );

  const handleResizeOrderSplitColumn = (columnId: string, delta: number) => {
    setOrderSplitColumnWidths((prev) => resizeColumnWidths(prev, columnId, delta));
  };

  const toggleOrderSplitColumn = (columnId: OrderSplitColumnId) => {
    setOrderSplitViewConfig((prev) => {
      const isVisible = prev.visibleColumnIds.includes(columnId);
      if (isVisible && prev.visibleColumnIds.length <= 1) return prev;
      return {
        ...prev,
        visibleColumnIds: isVisible
          ? prev.visibleColumnIds.filter((id) => id !== columnId)
          : [...prev.visibleColumnIds, columnId],
      };
    });
  };

  const reorderOrderSplitColumn = (sourceId: OrderSplitColumnId, targetId: OrderSplitColumnId) => {
    if (sourceId === targetId) return;
    setOrderSplitViewConfig((prev) => {
      const nextOrder = [...prev.columnOrder];
      const sourceIndex = nextOrder.indexOf(sourceId);
      const targetIndex = nextOrder.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      const [moved] = nextOrder.splice(sourceIndex, 1);
      nextOrder.splice(targetIndex, 0, moved);
      return { ...prev, columnOrder: nextOrder };
    });
  };

  const handleOrderSplitColumnDragStart = (event: React.DragEvent<HTMLDivElement>, columnId: OrderSplitColumnId) => {
    setDraggedOrderSplitColumnId(columnId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnId);

    const rowElement = event.currentTarget.closest('[data-order-split-column-row="true"]') as HTMLElement | null;
    if (!rowElement) return;
    const rowRect = rowElement.getBoundingClientRect();
    const dragPreview = rowElement.cloneNode(true) as HTMLElement;
    dragPreview.style.position = 'absolute';
    dragPreview.style.top = '-9999px';
    dragPreview.style.left = '-9999px';
    dragPreview.style.width = `${rowRect.width}px`;
    dragPreview.style.background = '#fff';
    dragPreview.style.border = '1px solid #90caf9';
    dragPreview.style.borderRadius = '8px';
    dragPreview.style.boxShadow = '0 14px 32px rgba(15, 23, 42, 0.22)';
    dragPreview.style.opacity = '0.96';
    dragPreview.style.pointerEvents = 'none';
    dragPreview.style.zIndex = '9999';
    document.body.appendChild(dragPreview);
    event.dataTransfer.setDragImage(dragPreview, 24, Math.min(24, rowRect.height / 2));
    window.setTimeout(() => {
      dragPreview.remove();
    }, 0);
  };

  const handleOrderSplitColumnDrop = (event: React.DragEvent<HTMLDivElement>, targetId: OrderSplitColumnId) => {
    event.preventDefault();
    const sourceId = (event.dataTransfer.getData('text/plain') || draggedOrderSplitColumnId) as OrderSplitColumnId | null;
    if (sourceId) reorderOrderSplitColumn(sourceId, targetId);
    setDraggedOrderSplitColumnId(null);
    setDragOverOrderSplitColumnId(null);
  };

  const clearOrderSplitColumnDrag = () => {
    setDraggedOrderSplitColumnId(null);
    setDragOverOrderSplitColumnId(null);
  };

  const resetOrderSplitView = () => {
    setOrderSplitViewConfig({
      visibleColumnIds: [...DEFAULT_ORDER_SPLIT_VISIBLE_COLUMNS],
      columnOrder: [...DEFAULT_ORDER_SPLIT_COLUMN_ORDER],
      frozenColumnCount: 0,
    });
    setOrderSplitColumnWidths(resetColumnWidths(DEFAULT_ORDER_SPLIT_COLUMN_WIDTHS));
  };

  const buildNewSplitRow = (orderId: string, orderAmount: number): CommissionAdjustmentInput => (
    applyPayoutPlanToSplitRow({
      orderId,
      role: activeRoleConfigs[0]?.name || '销售',
      owner: '',
      ownerId: '',
      department: '',
      departmentId: '',
      commissionAmount: 0,
      commissionRate: 0,
      performanceAmount: orderAmount,
      calculationNote: '财务人工新增分账',
      ruleCalculationType: 'fixed',
    }, activePayoutPlans[0]?.id)
  );

  const openCreateSplitDialog = () => {
    if (!canManageOrderSettlement) return;
    setCreateSplitOpen(true);
    setCreatableOrderSearch('');
    setSelectedCreatableOrderId('');
    setSplitOrderId('');
    setSplitRows([]);
    setSplitReason('');
  };

  const closeCreateSplitDialog = () => {
    setCreateSplitOpen(false);
    setCreatableOrderSearch('');
    setSelectedCreatableOrderId('');
    setSplitOrderId('');
    setSplitRows([]);
    setSplitReason('');
  };

  const handleSelectCreatableOrder = (orderId: string) => {
    const order = creatableOrderRows.find((item) => item.orderId === orderId);
    setSelectedCreatableOrderId(orderId);
    setSplitOrderId(orderId);
    setSplitReason('');
    setSplitRows(order ? [buildNewSplitRow(order.orderId, order.orderAmount)] : []);
  };

  const resetSettlementDetailForms = () => {
    setDetailEditMode(false);
    setDetailActionReason('');
  };

  const closeSettlementDetail = () => {
    setSummaryDetail(null);
    setSettlementOrderDetail(null);
    setSettlementOrderLoading(false);
    resetSettlementDetailForms();
  };

  const canAdjustSettlementSummary = (summary: CommissionOrderSummary) => (
    !summary.sourceOrderDeleted && !['已发放', '已撤回'].includes(summary.status)
  );

  const canReopenSettlementSummary = (summary: CommissionOrderSummary) => (
    canManageOrderSettlement && !summary.sourceOrderDeleted && summary.status === '已撤回'
  );

  const getAdjustDisabledReason = (summary: CommissionOrderSummary) => {
    if (summary.sourceOrderDeleted) return '源订单已删除，只能查看明细和历史';
    if (summary.status === '已发放') return '已发放提成不能直接调整，第一版不支持系统内冲销，请财务线下处理';
    if (summary.status === '已撤回') return '提成已撤回，可使用重新分账创建新轮次';
    return '调整分账';
  };

  const canResetOrCleanupOrderSplitSummary = (summary: CommissionOrderSummary) => (
    summary.commissions.length > 0
    && (
      summary.sourceOrderDeleted
        ? canCleanupDeletedOrderSettlement
          && summary.commissions.every((commission) => ['已撤回', '已取消', '已冲销'].includes(commission.status))
        : ['待处理', '待确认'].includes(summary.status)
          && summary.commissions.every((commission) => commission.status === '待确认')
    )
  );

  const getResetOrCleanupOrderSplitDisabledReason = (summary: CommissionOrderSummary) => {
    if (summary.sourceOrderDeleted) {
      if (!canCleanupDeletedOrderSettlement) return '仅超级管理员可以清理废弃记录';
      if (!summary.commissions.length) return '没有可清理的废弃分账';
      if (!summary.commissions.every((commission) => ['已撤回', '已取消', '已冲销'].includes(commission.status))) return '仍有活动提成，请先撤回或完成财务处理';
      return '清理废弃记录';
    }
    if (!summary.commissions.length) return '该订单没有可重置的分账';
    if (!['待处理', '待确认'].includes(summary.status)) return '已进入发放链路，请使用撤回流程';
    if (!summary.commissions.every((commission) => commission.status === '待确认')) return '仅待确认阶段的分账可重置';
    return '重置订单分账';
  };

  const loadOperationLogs = async (orderId: string) => {
    const res = await commissionApi.fetchCommissionOperationLogs(orderId);
    if (res.code === 0) {
      setOperationLogs(res.data.filter((log) => !['发起冲销', '退款待冲销', '冲销处理完成'].includes(log.action)));
    }
  };

  const mapCommissionToSplitRow = (item: Commission): CommissionAdjustmentInput => {
    const employee = activeEmployees.find((user) => user.id === item.ownerId || user.name === item.owner);
    const ownerDepartment = getOwnerDepartment(employee);
    return {
      id: item.id,
      orderId: item.orderId,
      role: item.role,
      owner: employee?.name || '',
      ownerId: employee?.id || '',
      department: ownerDepartment?.name || item.department || '',
      departmentId: ownerDepartment?.id || item.departmentId || '',
      paymentDate: item.paymentDate,
      commissionAmount: item.commissionAmount,
      commissionRate: item.commissionRate,
      performanceAmount: item.performanceAmount || item.orderAmount,
      calculationNote: item.calculationNote || item.formulaText || '',
      commissionRuleId: item.commissionRuleId,
      payoutPlanId: item.payoutPlanId || (item.payoutPlanName === CUSTOM_PAYOUT_PLAN_NAME ? CUSTOM_PAYOUT_PLAN_ID : undefined),
      payoutPlanName: item.payoutPlanName,
      ruleCalculationType: item.ruleCalculationType || (item.commissionRate > 0 ? 'percentage' : 'fixed'),
      tierSnapshot: item.tierSnapshot,
    };
  };

  const openSettlementDetail = async (summary: CommissionOrderSummary, options?: { edit?: boolean }) => {
    if (options?.edit && !canManageOrderSettlement) return;
    let sourceOrderDeleted = summary.sourceOrderDeleted;
    setSummaryDetail(summary);
    setSettlementOrderDetail(null);
    setSettlementOrderLoading(!summary.sourceOrderDeleted);
    resetSettlementDetailForms();
    await Promise.all([
      loadOperationLogs(summary.orderId),
      summary.sourceOrderDeleted
        ? Promise.resolve()
        : orderApi.fetchOrderById(summary.orderId).then((res) => {
          if (res.code === 0) {
            setSettlementOrderDetail(res.data);
            return;
          }
          sourceOrderDeleted = true;
          const deletedSummary = { ...summary, sourceOrderDeleted: true };
          setSummaryDetail(deletedSummary);
          setOrderRows((rows) => rows.map((row) => (row.orderId === summary.orderId ? deletedSummary : row)));
        }).finally(() => setSettlementOrderLoading(false)),
    ]);
    if (options?.edit && !sourceOrderDeleted && canAdjustSettlementSummary(summary)) {
      const res = await commissionApi.fetchCommissionsByOrder(summary.orderId);
      if (res.code !== 0) return;
      const activeRows = getActiveCommissions(res.data).map(mapCommissionToSplitRow);
      setSplitOrderId(summary.orderId);
      setSplitRows(activeRows.length ? activeRows : [buildNewSplitRow(summary.orderId, summary.orderAmount)]);
      setSplitReason('');
      setDetailEditMode(true);
    }
  };

  const reloadSettlementDetail = async (orderId: string) => {
    const res = await commissionApi.fetchCommissionOrderSummaries({ pageSize: 500 });
    if (res.code !== 0) return;
    const nextSummary = res.data.items.find((item) => item.orderId === orderId) || null;
    setSummaryDetail(nextSummary);
    setSettlementOrderLoading(Boolean(nextSummary && !nextSummary.sourceOrderDeleted));
    await Promise.all([
      loadOperationLogs(orderId),
      nextSummary && !nextSummary.sourceOrderDeleted
        ? orderApi.fetchOrderById(orderId).then((orderRes) => {
          setSettlementOrderDetail(orderRes.code === 0 ? orderRes.data : null);
        }).finally(() => setSettlementOrderLoading(false))
        : Promise.resolve().then(() => {
          setSettlementOrderDetail(null);
          setSettlementOrderLoading(false);
        }),
    ]);
  };

  const renderSplitDetails = (summary: CommissionOrderSummary) => {
    const activeRows = getActiveCommissions(summary.commissions);
    const rows = activeRows.slice(0, 2);
    return (
      <Stack spacing={0.6} sx={{ py: 0.5 }}>
        {rows.map((item) => (
          <Typography
            key={item.id}
            variant="caption"
            sx={{ color: '#374151', lineHeight: 1.6, overflowWrap: 'anywhere' }}
          >
            {item.role}：{formatOwnerDisplayName(item.ownerId, item.owner)} · {getCommissionSplitLineAmountText(item)}
          </Typography>
        ))}
        {activeRows.length > 2 && (
          <Button
            size="small"
            onClick={() => openSettlementDetail(summary)}
            sx={{ alignSelf: 'flex-start', minWidth: 0, px: 0.5, py: 0, lineHeight: 1.4 }}
          >
            查看全部 {activeRows.length} 人
          </Button>
        )}
        {!activeRows.length && <Typography variant="caption" sx={{ color: '#9ca3af' }}>暂无分账</Typography>}
      </Stack>
    );
  };

  const getSourceOrderDeletedReason = (summary: CommissionOrderSummary) => (
    summary.sourceOrderDeleted ? '源订单已删除，仅可查看分账和历史' : ''
  );

  const renderOrderSplitCell = (summary: CommissionOrderSummary, columnId: OrderSplitColumnId) => {
    switch (columnId) {
      case 'orderNo':
        if (summary.sourceOrderDeleted) {
          return (
            <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
              <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700, overflowWrap: 'anywhere' }}>
                {summary.orderNo}
              </Typography>
              <Chip label="源订单已删除" size="small" color="default" sx={{ height: 22 }} />
            </Stack>
          );
        }
        return (
          <Button
            variant="text"
            size="small"
            onClick={() => viewOrder(summary)}
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
              {summary.orderNo}
            </Box>
          </Button>
        );
      case 'customerName':
        if (summary.sourceOrderDeleted) {
          return (
            <Typography variant="body2" sx={{ color: '#374151', fontWeight: 500, overflowWrap: 'anywhere' }}>
              {summary.customerName || '-'}
            </Typography>
          );
        }
        return summary.customerName ? (
          <Button
            variant="text"
            size="small"
            onClick={() => viewCustomer(summary)}
            sx={{
              minWidth: 0,
              maxWidth: '100%',
              p: 0,
              fontWeight: 500,
              lineHeight: 1.4,
              textAlign: 'left',
              textTransform: 'none',
              justifyContent: 'flex-start',
            }}
          >
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {summary.customerName}
            </Box>
          </Button>
        ) : '-';
      case 'productName':
        return summary.productName || summary.productLevel || '-';
      case 'productLevel':
        return (
          <Chip
            label={summary.productLevel || '-'}
            size="small"
            sx={getProductLevelTagSx(summary.productLevel)}
          />
        );
      case 'orderType':
        return summary.orderType ? <Chip label={summary.orderType} size="small" variant="outlined" /> : '-';
      case 'orderAmount':
        return formatCurrency(summary.orderAmount);
      case 'resourceOwnership':
        return summary.resourceOwnership ? normalizeResourceOwnership(summary.resourceOwnership) : '-';
      case 'leadSourceFull':
        return summary.leadSourceFull || '-';
      case 'paymentDate':
        return summary.paymentDate ? formatDate(summary.paymentDate, 'yyyy-MM-dd HH:mm') : '-';
      case 'salesOwner':
        return summary.salesOwner || summary.salesName || '-';
      case 'createdByName':
        return summary.createdByName || '-';
      case 'leadInputBy':
        return summary.leadInputBy || '-';
      case 'leadContributorName':
        return summary.leadContributorName || '-';
      case 'officialPaymentChannel':
        return summary.officialPaymentChannel || '-';
      case 'thirdPartyOrderNo':
        return summary.thirdPartyOrderNo || '-';
      case 'paymentOrderNo':
        return summary.paymentOrderNo || '-';
      case 'notes':
        return summary.notes || '-';
      case 'createdAt':
        return summary.createdAt ? formatDate(summary.createdAt, 'yyyy-MM-dd HH:mm') : '-';
      case 'updatedAt':
        return summary.updatedAt ? formatDate(summary.updatedAt, 'yyyy-MM-dd HH:mm') : '-';
      case 'splitDetails':
        return renderSplitDetails(summary);
      case 'totalCommissionAmount': {
        const amountPresentation = getCommissionSplitAmountPresentation(summary.commissions);
        return (
          <Stack spacing={0.15}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, color: amountPresentation.kind === 'pending_tiered' ? '#b45309' : '#d32f2f' }}
            >
              {amountPresentation.primaryText.replace(/^共\s*/, '')}
            </Typography>
            {amountPresentation.secondaryText && (
              <Typography variant="caption" sx={{ color: '#6b7280', lineHeight: 1.35 }}>
                {amountPresentation.secondaryText}
              </Typography>
            )}
          </Stack>
        );
      }
      case 'performanceAmount':
        return summary.performanceAmount === undefined ? '-' : formatCurrency(summary.performanceAmount);
      case 'pendingAssignCount':
        return summary.pendingAssignCount ? <Chip label={summary.pendingAssignCount} size="small" color="warning" /> : '0';
      case 'exceptionCount':
        return summary.exceptionCount ? <Chip label={summary.exceptionCount} size="small" color="error" /> : '0';
      case 'settlementOperator':
        return summary.settlementOperator || '-';
      case 'confirmedAt':
        return summary.confirmedAt ? formatDate(summary.confirmedAt, 'yyyy-MM-dd HH:mm') : '-';
      case 'paidAt':
        return summary.paidAt ? formatDate(summary.paidAt, 'yyyy-MM-dd HH:mm') : '-';
      case 'withdrawReason':
        return summary.withdrawReason || '-';
      case 'status':
        return <SettlementStatusChip status={summary.status} />;
      default:
        return '-';
    }
  };

  const beginDetailAdjust = async () => {
    if (!canManageOrderSettlement) return;
    if (!summaryDetail || !canAdjustSettlementSummary(summaryDetail)) return;
    const res = await commissionApi.fetchCommissionsByOrder(summaryDetail.orderId);
    if (res.code !== 0) return;
    const activeRows = getActiveCommissions(res.data).map(mapCommissionToSplitRow);
    setSplitOrderId(summaryDetail.orderId);
    setSplitRows(activeRows.length ? activeRows : [buildNewSplitRow(summaryDetail.orderId, summaryDetail.orderAmount)]);
    setSplitReason('');
    setDetailEditMode(true);
  };

  const recalcSplitRow = (row: CommissionAdjustmentInput): CommissionAdjustmentInput => {
    if (isCustomPayoutRow(row)) {
      return {
        ...row,
        ruleCalculationType: 'fixed',
        commissionRate: 0,
        tierSnapshot: undefined,
      };
    }
    const plan = findPayoutPlanForRow(row);
    const calculationType = row.ruleCalculationType || 'fixed';
    const performanceAmount = Number(row.performanceAmount || 0);
    if (calculationType === 'tiered_percentage') {
      return {
        ...row,
        commissionRate: 0,
        commissionAmount: 0,
        tierSnapshot: {
          tiers: plan?.tiers || row.tierSnapshot?.tiers || [],
          baseAmount: performanceAmount,
          gapToNext: row.tierSnapshot?.gapToNext || 0,
        },
      };
    }
    if (calculationType === 'percentage') {
      const commissionRate = plan ? Number(plan.commissionValue || 0) / 100 : Number(row.commissionRate || 0);
      return {
        ...row,
        commissionRate,
        commissionAmount: Math.round(performanceAmount * commissionRate * 100) / 100,
      };
    }
    return {
      ...row,
      commissionRate: 0,
      commissionAmount: plan ? Number(plan.commissionValue || 0) : row.commissionAmount,
    };
  };

  const updateSplitRow = <K extends keyof CommissionAdjustmentInput>(index: number, key: K, value: CommissionAdjustmentInput[K]) => {
    setSplitRows((prev) => prev.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, [key]: value };
      if (key === 'payoutPlanId') return applyPayoutPlanToSplitRow(next, value as string);
      return key === 'ruleCalculationType' || key === 'commissionRate' || key === 'performanceAmount'
        ? recalcSplitRow(next)
        : next;
    }));
  };

  const handleSplitOwnerChange = (index: number, ownerId: string) => {
    const employee = activeEmployees.find((item) => item.id === ownerId);
    const ownerDepartment = getOwnerDepartment(employee);
    setSplitRows((prev) => prev.map((row, rowIndex) => (
      rowIndex === index
        ? {
          ...row,
          ownerId,
          owner: employee?.name || '',
          departmentId: ownerDepartment?.id || '',
          department: ownerDepartment?.name || '',
        }
        : row
    )));
  };

  const handleAddSplitRow = () => {
    const orderAmount = selectedCreatableOrder?.orderAmount || splitRows[0]?.performanceAmount || summaryDetail?.orderAmount || 0;
    setSplitRows((prev) => [
      ...prev,
      buildNewSplitRow(splitOrderId, orderAmount),
    ]);
  };

  const canDeleteSplitRow = (row: CommissionAdjustmentInput) => {
    if (createSplitOpen) return true;
    if (splitRows.length <= 1) return false;
    if (!row.id) return true;
    const existing = summaryDetail?.commissions.find((commission) => commission.id === row.id);
    return !existing || existing.status === '待确认';
  };

  const handleSaveSplitRows = async () => {
    if (!canManageOrderSettlement) return;
    setSplitSaving(true);
    try {
      const res = await commissionApi.saveOrderCommissionAdjustments(splitOrderId, splitRows, splitReason);
      if (res.code === 0) {
        setDetailEditMode(false);
        if (createSplitOpen) closeCreateSplitDialog();
        await refreshAll();
        if (summaryDetail) await reloadSettlementDetail(splitOrderId);
        setSettlementActionMessage({ type: 'success', text: '分账调整已保存，当前状态为待确认' });
      } else {
        setSettlementActionMessage({ type: 'error', text: res.message || '保存分账调整失败' });
      }
    } catch (error) {
      setSettlementActionMessage({ type: 'error', text: error instanceof Error ? error.message : '保存分账调整失败' });
    } finally {
      setSplitSaving(false);
    }
  };

  const openDeleteOrderSplitDialog = (summary: CommissionOrderSummary) => {
    if (summary.sourceOrderDeleted ? !canCleanupDeletedOrderSettlement : !canManageOrderSettlement) return;
    setDeleteSummary(summary);
    setDeleteReason('');
  };

  const closeDeleteOrderSplitDialog = () => {
    if (deleteLoading) return;
    setDeleteSummary(null);
    setDeleteReason('');
  };

  const confirmDeleteOrderSplit = async () => {
    if (!deleteSummary || !deleteReason.trim()) return;
    if (deleteSummary.sourceOrderDeleted ? !canCleanupDeletedOrderSettlement : !canManageOrderSettlement) return;
    const deletingOrderId = deleteSummary.orderId;
    const shouldCleanupDeletedSource = deleteSummary.sourceOrderDeleted;
    const openDetailSummary = summaryDetail?.orderId === deletingOrderId ? summaryDetail : null;
    setDeleteLoading(true);
    try {
      const res = shouldCleanupDeletedSource
        ? await commissionApi.cleanupDeletedSourceOrderCommissions(deletingOrderId, deleteReason)
        : await commissionApi.resetOrderCommissions(deletingOrderId, deleteReason);
      if (res.code === 0) {
        setSettlementActionMessage({ type: 'success', text: shouldCleanupDeletedSource ? '废弃分账记录已清理' : '订单分账已重置，可重新处理分账' });
        setDeleteSummary(null);
        setDeleteReason('');
        if (openDetailSummary) {
          if (shouldCleanupDeletedSource) {
            closeSettlementDetail();
          } else {
            const resetSummary: CommissionOrderSummary = {
              ...openDetailSummary,
              status: '待处理',
              totalCommissionAmount: 0,
              pendingAssignCount: 0,
              exceptionCount: 0,
              settlementOperator: undefined,
              confirmedAt: undefined,
              paidAt: undefined,
              withdrawReason: undefined,
              splitSummary: [],
              commissions: [],
            };
            setSummaryDetail(resetSummary);
          }
          resetSettlementDetailForms();
        }
        await refreshAll();
        if (openDetailSummary && !shouldCleanupDeletedSource) await loadOperationLogs(deletingOrderId);
      } else {
        setSettlementActionMessage({ type: 'error', text: res.message || (shouldCleanupDeletedSource ? '清理废弃分账失败' : '重置订单分账失败') });
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmReopenOrderSplit = async () => {
    if (!reopenSummary || !reopenReason.trim() || !canReopenSettlementSummary(reopenSummary)) return;
    setReopenLoading(true);
    try {
      const response = await commissionApi.reopenOrderCommissions(reopenSummary.orderId, reopenReason);
      if (response.code === 0) {
        const orderId = reopenSummary.orderId;
        const keepDetailOpen = summaryDetail?.orderId === orderId;
        setReopenSummary(null);
        setReopenReason('');
        await refreshAll();
        if (keepDetailOpen) await reloadSettlementDetail(orderId);
        setSettlementActionMessage({ type: 'success', text: '已进入新一轮待处理分账，旧轮次继续只读保留' });
      } else {
        setSettlementActionMessage({ type: 'error', text: response.message || '重新分账失败' });
      }
    } finally {
      setReopenLoading(false);
    }
  };

  const confirmOrderFromDetail = async () => {
    if (!canManageOrderSettlement) return;
    if (!summaryDetail || summaryDetail.sourceOrderDeleted) return;
    setDetailActionLoading(true);
    try {
      const res = await commissionApi.confirmOrderCommissions(summaryDetail.orderId, '订单分账确认');
      if (res.code === 0) {
        await refreshAll();
        await reloadSettlementDetail(summaryDetail.orderId);
        setSettlementActionMessage({ type: 'success', text: '分账已确认并进入待发放' });
      } else {
        setSettlementActionMessage({ type: 'error', text: res.message || '确认分账失败' });
      }
    } catch (error) {
      setSettlementActionMessage({ type: 'error', text: error instanceof Error ? error.message : '确认分账失败' });
    } finally {
      setDetailActionLoading(false);
    }
  };

  const withdrawOrderFromDetail = async () => {
    if (!canManageOrderSettlement) return;
    if (!summaryDetail || !detailActionReason.trim()) return;
    setDetailActionLoading(true);
    try {
      const res = await commissionApi.withdrawOrderCommissions(summaryDetail.orderId, detailActionReason);
      if (res.code === 0) {
        setDetailActionReason('');
        await refreshAll();
        await reloadSettlementDetail(summaryDetail.orderId);
        setSettlementActionMessage({ type: 'success', text: '提成已撤回，原分账轮次已只读保留' });
      } else {
        setSettlementActionMessage({ type: 'error', text: res.message || '撤回提成失败' });
      }
    } finally {
      setDetailActionLoading(false);
    }
  };

  const viewOrder = async (summary: CommissionOrderSummary) => {
    const res = await orderApi.fetchOrderById(summary.orderId);
    if (res.code === 0) setOrderDetail(res.data);
  };

  const viewCustomer = async (summary: CommissionOrderSummary) => {
    const orderRes = await orderApi.fetchOrderById(summary.orderId);
    const order = orderRes.code === 0 ? orderRes.data : null;
    let customer: Customer | null = null;

    if (order?.customerId) {
      const customerRes = await customerApi.fetchCustomerById(order.customerId);
      if (customerRes.code === 0) customer = customerRes.data;
    }

    if (!customer) {
      const customerRes = await customerApi.fetchCustomers({ search: summary.customerName, pageSize: 20 });
      if (customerRes.code === 0) {
        customer = customerRes.data.items.find(
          (item) => item.company === summary.customerName || item.name === summary.customerName,
        ) || customerRes.data.items[0] || null;
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

    setCustomerDetail({
      ...customer,
      orderCount: relatedOrders.length,
      totalSpent: relatedOrders.reduce((sum, item) => sum + (Number(item.actualAmount) || 0), 0),
    });
  };

  const exportMonthlyStatement = async () => {
    if (payoutMode === 'mine') {
      setMineExporting(true);
      try {
        await downloadMineCommissionStatement(
          payoutPeriod,
          payoutRows,
          currentUser?.name || payoutRows[0]?.owner || '员工',
          payoutPlans,
        );
      } finally {
        setMineExporting(false);
      }
      return;
    }
    setFinanceReportError('');
    setFinanceReportOpen(true);
  };

  const financeReportRows = payoutRows.filter((row) => (
    financeReportScope === 'all'
    || (financeReportScope === 'department' && (row.departmentId === financeReportDepartmentId || row.department === financeReportDepartmentId))
    || (financeReportScope === 'employee' && (row.ownerId === financeReportOwnerId || row.owner === financeReportOwnerId))
  ));

  const submitFinanceMonthlyReport = async () => {
    setFinanceReportExporting(true);
    setFinanceReportError('');
    try {
      await commissionPayoutApi.downloadMonthlyReport({
        period: payoutPeriod,
        reason: financeReportReason.trim(),
        scope: financeReportScope,
        departmentId: financeReportScope === 'department' ? financeReportDepartmentId : undefined,
        ownerId: financeReportScope === 'employee' ? financeReportOwnerId : undefined,
        includeWithdrawn: financeReportIncludeWithdrawn,
      });
      setFinanceReportOpen(false);
      setFinanceReportReason('');
    } catch (reportError) {
      setFinanceReportError(reportError instanceof Error ? reportError.message : '提成月度报告导出失败');
    } finally {
      setFinanceReportExporting(false);
    }
  };

  const exportFinanceEmployeeStatement = async (row: MonthlyCommissionPayout) => {
    setMineExporting(true);
    try {
      await downloadMineCommissionStatement(
        payoutPeriod,
        [row],
        formatOwnerDisplayName(row.ownerId, row.owner),
        payoutPlans,
      );
    } finally {
      setMineExporting(false);
    }
  };

  const getDisplayCommissionAmount = (commission: Commission, tierSnapshot?: Commission['tierSnapshot']) => {
    if (commission.status === '已发放') return commission.commissionAmount;
    if (commission.ruleCalculationType !== 'tiered_percentage') return commission.commissionAmount;
    const rate = tierSnapshot?.currentTier?.rate ?? commission.tierSnapshot?.currentTier?.rate ?? Number(commission.commissionRate || 0) * 100;
    if (!rate) return commission.commissionAmount;
    return Math.round(Number(commission.performanceAmount || commission.orderAmount || 0) * rate) / 100;
  };

  const countsTowardTieredMonthlyBase = (commission: Commission) => (
    countsTowardMineTierBase(commission)
  );

  const buildTierSnapshotForSummary = (commissions: Commission[]) => {
    const localNow = new Date();
    const currentPeriod = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}`;
    return resolveMineTierSnapshot(commissions, payoutPlans, payoutPeriod === currentPeriod);
  };

  const buildRoleSummariesFromCommissions = (sourceCommissions: Commission[]): MonthlyCommissionRoleSummary[] => {
    const roleBucketMap = new Map<string, { role: CommissionRole; isTiered: boolean; commissions: Commission[] }>();
    sourceCommissions.forEach((commission) => {
      const isTiered = commission.ruleCalculationType === 'tiered_percentage';
      const key = isTiered ? getCommissionTierBucketKey(commission) : `${commission.role}::simple`;
      const existing = roleBucketMap.get(key);
      if (existing) {
        existing.commissions.push(commission);
      } else {
        roleBucketMap.set(key, { role: commission.role, isTiered, commissions: [commission] });
      }
    });
    return Array.from(roleBucketMap.values()).map(({ role, isTiered, commissions }) => {
      const tierSnapshot = isTiered ? buildTierSnapshotForSummary(commissions) : undefined;
      const pendingConfirmAmount = commissions
        .filter((commission) => commission.status === '待确认' && !isCommissionPendingHandling(commission))
        .reduce((sum, commission) => sum + getDisplayCommissionAmount(commission, tierSnapshot), 0);
      const pendingPayAmount = commissions
        .filter((commission) => commission.status === '待发放')
        .reduce((sum, commission) => sum + getDisplayCommissionAmount(commission, tierSnapshot), 0);
      const paidAmount = commissions
        .filter((commission) => commission.status === '已发放')
        .reduce((sum, commission) => sum + getDisplayCommissionAmount(commission, tierSnapshot), 0);
      const withdrawnAmount = commissions
        .filter((commission) => ['已撤回', '待冲销', '已冲销'].includes(commission.status))
        .reduce((sum, commission) => sum + getDisplayCommissionAmount(commission, tierSnapshot), 0);
      const status: MonthlyCommissionPayout['status'] = pendingConfirmAmount > 0
        ? '待确认'
        : pendingPayAmount > 0
          ? '待发放'
          : paidAmount > 0
            ? '已发放'
            : '无应发';
      return {
        role,
        payoutPlanId: isTiered ? commissions[0]?.payoutPlanSnapshot?.id || commissions[0]?.payoutPlanId : undefined,
        payoutPlanName: isTiered ? commissions[0]?.payoutPlanSnapshot?.name || commissions[0]?.payoutPlanName : undefined,
        payoutPlanVersion: isTiered ? commissions[0]?.payoutPlanSnapshot?.version || commissions[0]?.payoutPlanVersion : undefined,
        orderCount: new Set(commissions.map((commission) => commission.orderId)).size,
        monthlyPaidAmount: isTiered
          ? commissions
            .filter(countsTowardTieredMonthlyBase)
            .reduce((sum, commission) => sum + Number(commission.performanceAmount || commission.orderAmount || 0), 0)
          : commissions.reduce((sum, commission) => sum + Number(commission.orderAmount || 0), 0),
        pendingConfirmAmount,
        pendingPayAmount,
        paidAmount,
        exceptionAmount: 0,
        withdrawnAmount,
        chargebackAmount: 0,
        totalAmount: pendingConfirmAmount + pendingPayAmount + paidAmount,
        status,
        isTiered,
        tierSnapshot,
        commissions,
      };
    }).sort((a, b) => Number(b.isTiered) - Number(a.isTiered) || b.totalAmount - a.totalAmount || a.role.localeCompare(b.role, 'zh-CN'));
  };

  const getRoleSummariesForPayoutRow = (row: MonthlyCommissionPayout): MonthlyCommissionRoleSummary[] => {
    const sourceCommissions = row.roleSummaries?.length
      ? row.roleSummaries.flatMap((summary) => summary.commissions)
      : row.commissions;
    return buildRoleSummariesFromCommissions(sourceCommissions);
  };

  const formatTierBrief = (summary: MonthlyCommissionRoleSummary) => {
    const current = summary.tierSnapshot?.currentTier;
    if (!summary.isTiered) return '';
    if (!current) return '阶梯方案待月报结算';
    const range = current.maxAmount === undefined
      ? `${formatCurrency(current.minAmount)} 以上`
      : `${formatCurrency(current.minAmount)} - ${formatCurrency(current.maxAmount)}`;
    const nextText = summary.tierSnapshot?.gapToNext
      ? `，距下一档还差 ${formatCurrency(summary.tierSnapshot.gapToNext)}`
      : '，已到最高档';
    return `当前 ${range} · ${current.rate}%${nextText}`;
  };

  const renderPayoutRoleSummary = (summary: MonthlyCommissionRoleSummary, compact = false) => {
    const currentTier = summary.tierSnapshot?.currentTier;
    const nextTier = summary.tierSnapshot?.nextTier;
    const tierMax = currentTier?.maxAmount;
    const tierRange = currentTier
      ? tierMax === undefined
        ? `${formatCurrency(currentTier.minAmount)} 以上`
        : `${formatCurrency(currentTier.minAmount)} - ${formatCurrency(tierMax)}`
      : '待月报结算';
    const tierGapText = nextTier
      ? `还差 ${formatCurrency(summary.tierSnapshot?.gapToNext || 0)} 到 ${nextTier.rate}%`
      : currentTier
        ? '已到最高档'
        : '阶梯方案待结算';
    const roleNote = summary.isTiered ? formatTierBrief(summary) : '按所选提成方案逐笔结算，不参与月度阶梯';
    const metricItems = [
      { label: '待确认', value: summary.pendingConfirmAmount, color: '#d97706' },
      { label: '待发放', value: summary.pendingPayAmount, color: '#7447F5' },
      { label: '已发放', value: summary.paidAmount, color: '#16a34a' },
      { label: '已撤回', value: summary.withdrawnAmount, color: '#6b7280' },
    ];
    const metrics = (
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 0.8, mt: 1.1 }}>
        {metricItems.map((item) => (
          <Box key={item.label} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, px: 1, py: 0.8, bgcolor: '#f8fafc' }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#64748b', lineHeight: 1.2 }}>{item.label}</Typography>
            <Typography variant="body2" sx={{ color: item.color, fontWeight: 900, mt: 0.25 }}>
              {formatCurrency(item.value)}
            </Typography>
          </Box>
        ))}
      </Box>
    );

    return (
      <Box
        key={`${summary.role}:${summary.payoutPlanId || 'simple'}:${summary.payoutPlanVersion || 1}`}
        sx={{
          border: summary.isTiered ? '1px solid #DDD2FF' : '1px solid #E8E4F1',
          borderRadius: 1,
          bgcolor: '#fff',
          overflow: 'hidden',
        }}
      >
        {summary.isTiered ? (
          <Box
            sx={{
              px: compact ? 1.4 : 1.6,
              py: compact ? 1.2 : 1.35,
              bgcolor: '#eff6ff',
              borderBottom: '1px solid #DDD2FF',
            }}
          >
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.25}
              sx={{ alignItems: { xs: 'stretch', md: 'flex-start' }, justifyContent: 'space-between' }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mb: 0.55 }}>
                  <Chip label={summary.role} size="small" color="primary" sx={{ height: 22, fontWeight: 800 }} />
                  <Typography variant="caption" sx={{ color: '#475569', fontWeight: 800 }}>{summary.orderCount} 单</Typography>
                  <Chip label="阶梯提成视图" size="small" variant="outlined" color="primary" sx={{ height: 22, bgcolor: '#fff' }} />
                </Stack>
                <Typography variant="body2" sx={{ color: '#1e3a8a', fontWeight: 800, overflowWrap: 'anywhere' }}>
                  {roleNote}
                </Typography>
              </Box>
              <Box sx={{ textAlign: { xs: 'left', md: 'right' }, flexShrink: 0 }}>
                <Typography variant="caption" sx={{ color: '#475569', display: 'block' }}>本角色应发</Typography>
                <Typography variant={compact ? 'h6' : 'h5'} sx={{ color: '#19142C', fontWeight: 900, lineHeight: 1.15 }}>
                  {formatCurrency(summary.totalAmount)}
                </Typography>
              </Box>
            </Stack>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(150px, 1fr))' }, gap: 0.8, mt: 1.15 }}>
              {[
                { label: '阶梯业绩', value: formatCurrency(summary.monthlyPaidAmount), helper: `只统计「${summary.payoutPlanName || '月度阶梯方案'}」的业绩` },
                { label: '当前档位', value: currentTier ? `${currentTier.rate}%` : '-', helper: tierRange },
                { label: '下一档', value: tierGapText, helper: nextTier ? `下一档 ${nextTier.rate}%` : '当前阶梯状态' },
              ].map((item) => (
                <Box key={item.label} sx={{ border: '1px solid #DDD2FF', borderRadius: 1, px: 1, py: 0.85, bgcolor: '#fff' }}>
                  <Typography variant="caption" sx={{ display: 'block', color: '#64748b', lineHeight: 1.2 }}>{item.label}</Typography>
                  <Typography variant="body2" sx={{ color: '#19142C', fontWeight: 900, mt: 0.25, overflowWrap: 'anywhere' }}>
                    {item.value}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', overflowWrap: 'anywhere', display: 'block', mt: 0.1 }}>
                    {item.helper}
                  </Typography>
                </Box>
              ))}
            </Box>

            {metrics}
          </Box>
        ) : (
          <Box
            sx={{
              px: compact ? 1.4 : 1.6,
              py: compact ? 1.15 : 1.3,
              bgcolor: '#fff',
              borderBottom: '1px solid #eef2f7',
            }}
          >
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.25}
              sx={{ alignItems: { xs: 'stretch', md: 'flex-start' }, justifyContent: 'space-between' }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mb: 0.55 }}>
                  <Chip label={summary.role} size="small" color="default" sx={{ height: 22, fontWeight: 800 }} />
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 800 }}>{summary.orderCount} 单</Typography>
                  <Chip label="普通结算视图" size="small" variant="outlined" sx={{ height: 22, bgcolor: '#fff' }} />
                </Stack>
                <Box sx={{ border: '1px solid #e5e7eb', borderRadius: 1, px: 1, py: 0.85, bgcolor: '#f8fafc', maxWidth: 620 }}>
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 0.25 }}>结算说明</Typography>
                  <Typography variant="body2" sx={{ color: '#334155', fontWeight: 800, overflowWrap: 'anywhere' }}>
                    {roleNote}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ textAlign: { xs: 'left', md: 'right' }, flexShrink: 0 }}>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>本角色应发</Typography>
                <Typography variant={compact ? 'h6' : 'h5'} sx={{ color: '#111827', fontWeight: 900, lineHeight: 1.15 }}>
                  {formatCurrency(summary.totalAmount)}
                </Typography>
              </Box>
            </Stack>
            {metrics}
          </Box>
        )}

        <Stack spacing={0.7} sx={{ p: compact ? 1 : 1.25, bgcolor: '#f8fafc' }}>
          {summary.commissions.map((commission) => renderPayoutCommissionDetail(commission, compact, summary.tierSnapshot))}
        </Stack>
      </Box>
    );
  };

  const renderPayoutCommissionDetail = (commission: Commission, compact = false, tierSnapshot?: Commission['tierSnapshot']) => {
    const note = commission.auditReason || commission.adjustReason || commission.calculationNote || '-';
    const formulaText = commission.formulaText || commission.payoutPlanName || commission.calculationNote || '-';
    const displayCommissionAmount = getDisplayCommissionAmount(commission, tierSnapshot);
    const sourceLabel = isRecoveryCommission(commission)
      ? '售后挽回分账'
      : '正式订单分账';

    return (
      <Box
        key={commission.id}
        sx={{
          border: '1px solid #e5e7eb',
          borderRadius: 1,
          bgcolor: '#fff',
          px: compact ? 1.15 : 1.35,
          py: compact ? 0.95 : 1.1,
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              md: compact
                ? 'minmax(190px, 1fr) minmax(110px, 0.65fr) minmax(260px, 1.45fr) minmax(130px, 0.65fr)'
                : 'minmax(210px, 1fr) minmax(120px, 0.65fr) minmax(280px, 1.45fr) minmax(140px, 0.65fr)',
            },
            gap: { xs: 0.9, md: 1.4 },
            alignItems: 'start',
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#64748b', mb: 0.25 }}>订单 / 客户</Typography>
            <Typography variant="body2" sx={{ color: '#111827', fontWeight: 900, overflowWrap: 'anywhere', lineHeight: 1.35 }}>
              {commission.orderNo}
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', overflowWrap: 'anywhere', display: 'block' }}>
              {commission.customerName || '-'}{compact ? '' : ` · ${commission.role}`}
            </Typography>
            <Chip
              label={sourceLabel}
              size="small"
              sx={{
                mt: 0.6,
                height: 22,
                bgcolor: sourceLabel === '售后挽回分账' ? '#ecfdf5' : '#eff6ff',
                color: sourceLabel === '售后挽回分账' ? '#047857' : '#7447F5',
                fontWeight: 800,
              }}
            />
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#64748b', mb: 0.25 }}>实付金额</Typography>
            <Typography variant="body2" sx={{ color: '#0f766e', fontWeight: 900 }}>
              {formatCurrency(commission.orderAmount)}
            </Typography>
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#64748b', mb: 0.25 }}>计算说明 / 备注</Typography>
            <Typography variant="body2" sx={{ color: '#334155', fontWeight: 700, overflowWrap: 'anywhere', lineHeight: 1.35 }}>
              {formulaText}
            </Typography>
            {note && note !== formulaText && (
              <Typography variant="caption" sx={{ color: '#64748b', overflowWrap: 'anywhere', display: 'block', mt: 0.2 }}>
                {note}
              </Typography>
            )}
          </Box>

          <Box sx={{ minWidth: 0, textAlign: { xs: 'left', md: 'right' } }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#64748b', mb: 0.25 }}>提成金额</Typography>
            <Typography variant="body2" sx={{ color: '#111827', fontWeight: 900, mb: 0.45 }}>
              {formatCurrency(displayCommissionAmount)}
            </Typography>
            <Chip label={commission.status} size="small" color={getCommissionStatusColor(commission.status)} />
          </Box>
        </Box>
      </Box>
    );
  };

  const getMineCommissionStatusLabel = (status: Commission['status']) => (
    status === '待冲销' || status === '已冲销' || status === '已取消' ? '已撤回' : status
  );

  const getCommissionSourceMeta = (commission: Commission) => {
    const isAfterSales = commission.sourceBusinessType === 'after_sales_recovery'
      || commission.sourceBusinessType === 'refund_recovery'
      || Boolean(commission.sourceRecoveryOrderId);
    return isAfterSales
      ? {
        key: 'after_sales_recovery',
        title: '售后挽回分账',
        description: '来自售后挽回订单的提成，独立于正式订单业绩。',
        rowLabel: '售后挽回单',
        chipBg: '#ecfdf5',
        chipColor: '#047857',
      }
      : {
        key: 'formal_order',
        title: '正式订单分账',
        description: '来自订单审核通过后的正式订单分账。',
        rowLabel: '正式订单',
        chipBg: '#eff6ff',
        chipColor: '#7447F5',
      };
  };

  const toggleMinePayoutGroup = (groupKey: string) => {
    setExpandedMinePayoutGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const renderMinePayoutDetailTable = (
    summary: MonthlyCommissionRoleSummary,
    sourceRowLabel: string,
    tierSnapshot?: Commission['tierSnapshot'],
  ) => (
    <TableContainer sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflowX: 'auto', bgcolor: '#fff' }}>
      <Table size="small" sx={{ minWidth: 920 }}>
        <TableHead>
          <TableRow>
            <TableCell>订单号 / 客户</TableCell>
            <TableCell width={120}>来源</TableCell>
            <TableCell width={130}>实付金额</TableCell>
            <TableCell>计算说明</TableCell>
            <TableCell width={130} align="right">提成金额</TableCell>
            <TableCell width={110} align="center">状态</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {summary.commissions.map((commission) => {
            const note = commission.formulaText || commission.calculationNote || commission.payoutPlanName || '-';
            const extraNote = commission.auditReason || commission.adjustReason || '';
            const displayCommissionAmount = getDisplayCommissionAmount(commission, tierSnapshot);
            const displayStatus = getMineCommissionStatusLabel(commission.status);
            return (
              <TableRow key={commission.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 900, color: '#111827', overflowWrap: 'anywhere' }}>
                    {commission.orderNo}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block', overflowWrap: 'anywhere' }}>
                    {commission.customerName || '-'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={sourceRowLabel}
                    size="small"
                    sx={{
                      height: 22,
                      bgcolor: getCommissionSourceMeta(commission).chipBg,
                      color: getCommissionSourceMeta(commission).chipColor,
                      fontWeight: 800,
                    }}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ color: '#0f766e', fontWeight: 900 }}>
                    {formatCurrency(commission.orderAmount)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ color: '#334155', fontWeight: 700, overflowWrap: 'anywhere' }}>
                    {note}
                  </Typography>
                  {extraNote && (
                    <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 0.25, overflowWrap: 'anywhere' }}>
                      {extraNote}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" sx={{ color: '#111827', fontWeight: 900 }}>
                    {formatCurrency(displayCommissionAmount)}
                  </Typography>
                </TableCell>
                <TableCell align="center">
                  <Chip label={displayStatus} size="small" color={getCommissionStatusColor(displayStatus)} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderMinePayoutGroup = (
    sourceKey: string,
    sourceLabel: string,
    sourceRowLabel: string,
    summary: MonthlyCommissionRoleSummary,
  ) => {
    const groupKey = `${sourceKey}:${summary.role}:${summary.isTiered ? `${summary.payoutPlanId || 'tiered'}:v${summary.payoutPlanVersion || 1}` : 'simple'}`;
    const expanded = expandedMinePayoutGroups.has(groupKey);
    const title = summary.isTiered
      ? `${summary.role} · ${summary.payoutPlanName || '月度阶梯提成'}`
      : `${summary.role} · 普通提成订单`;
    const currentTier = summary.tierSnapshot?.currentTier;
    const nextTier = summary.tierSnapshot?.nextTier;
    const tierRange = currentTier
      ? currentTier.maxAmount === undefined
        ? `${formatCurrency(currentTier.minAmount)} 以上`
        : `${formatCurrency(currentTier.minAmount)} - ${formatCurrency(currentTier.maxAmount)}`
      : '待结算';
    const tierNextText = nextTier
      ? `下一档 ${nextTier.rate}% · 还差 ${formatCurrency(summary.tierSnapshot?.gapToNext || 0)}`
      : currentTier
        ? '已到最高档'
        : '阶梯方案待结算';
    const metricItems = [
      { label: '待确认', value: summary.pendingConfirmAmount, color: '#7447F5' },
      { label: '待发放', value: summary.pendingPayAmount, color: '#d97706' },
      { label: '已发放', value: summary.paidAmount, color: '#16a34a' },
      { label: '已撤回', value: summary.withdrawnAmount, color: '#6b7280' },
    ];

    return (
      <Box key={groupKey} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
        <Box
          onClick={() => toggleMinePayoutGroup(groupKey)}
          sx={{
            px: 1.25,
            py: 1,
            cursor: 'pointer',
            bgcolor: summary.isTiered ? '#eff6ff' : '#fff',
            borderLeft: summary.isTiered ? '3px solid #7447F5' : '3px solid #cbd5e1',
            '&:hover': { bgcolor: summary.isTiered ? '#dbeafe' : '#f8fafc' },
          }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between' }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minWidth: 0 }}>
              <IconButton size="small" sx={{ flexShrink: 0 }}>
                {expanded ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
              </IconButton>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 900, color: '#19142C', overflowWrap: 'anywhere' }}>
                    {title}
                  </Typography>
                  <Chip label={sourceLabel} size="small" sx={{ height: 22, bgcolor: '#f8fafc', fontWeight: 800 }} />
                  <Chip label={`${summary.orderCount} 单`} size="small" variant="outlined" sx={{ height: 22, bgcolor: '#fff' }} />
                </Stack>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 0.25 }}>
                  {summary.isTiered ? `阶梯 GMV ${formatCurrency(summary.monthlyPaidAmount)} · 当前 ${tierRange}${currentTier ? ` · ${currentTier.rate}%` : ''}` : '按订单提成方案或自定义金额结算，不参与阶梯 GMV'}
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={2.2} sx={{ alignItems: 'center', justifyContent: { xs: 'flex-start', md: 'flex-end' }, flexWrap: 'wrap', rowGap: 0.5 }}>
              <Box>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>实付合计</Typography>
                <Typography variant="body2" sx={{ color: '#0f766e', fontWeight: 900 }}>
                  {formatCurrency(summary.monthlyPaidAmount)}
                </Typography>
              </Box>
              <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>应发提成</Typography>
                <Typography variant="body2" sx={{ color: '#111827', fontWeight: 900 }}>
                  {formatCurrency(summary.totalAmount)}
                </Typography>
              </Box>
            </Stack>
          </Stack>
        </Box>
        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Box sx={{ p: 1.25, bgcolor: '#f8fafc', borderTop: '1px solid #e5e7eb' }}>
            {summary.isTiered && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(160px, 1fr))' }, gap: 0.8, mb: 1 }}>
                {[
                  { label: '阶梯业绩', value: formatCurrency(summary.monthlyPaidAmount), helper: '只统计本组阶梯订单' },
                  { label: '当前档位', value: currentTier ? `${currentTier.rate}%` : '-', helper: tierRange },
                  { label: '本组预估提成', value: formatCurrency(summary.totalAmount), helper: tierNextText },
                ].map((item) => (
                  <Box key={item.label} sx={{ border: '1px solid #DDD2FF', borderRadius: 1, px: 1, py: 0.85, bgcolor: '#fff' }}>
                    <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>{item.label}</Typography>
                    <Typography variant="body2" sx={{ color: '#19142C', fontWeight: 900, mt: 0.2 }}>{item.value}</Typography>
                    <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mt: 0.1, overflowWrap: 'anywhere' }}>{item.helper}</Typography>
                  </Box>
                ))}
              </Box>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 0.8, mb: 1 }}>
              {metricItems.map((item) => (
                <Box key={item.label} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, px: 1, py: 0.75, bgcolor: '#fff' }}>
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>{item.label}</Typography>
                  <Typography variant="body2" sx={{ color: item.color, fontWeight: 900 }}>{formatCurrency(item.value)}</Typography>
                </Box>
              ))}
            </Box>
            {renderMinePayoutDetailTable(summary, sourceRowLabel, summary.tierSnapshot)}
          </Box>
        </Collapse>
      </Box>
    );
  };

  const renderMinePayoutRoleSections = () => {
    const sourceGroups = new Map<string, {
      title: string;
      description: string;
      rowLabel: string;
      commissions: Commission[];
    }>();

    payoutRows.forEach((row) => {
      const rowCommissions = row.roleSummaries?.length
        ? row.roleSummaries.flatMap((summary) => summary.commissions)
        : row.commissions;
      rowCommissions.forEach((commission) => {
        const meta = getCommissionSourceMeta(commission);
        const existing = sourceGroups.get(meta.key);
        if (existing) {
          existing.commissions.push(commission);
        } else {
          sourceGroups.set(meta.key, {
            title: meta.title,
            description: meta.description,
            rowLabel: meta.rowLabel,
            commissions: [commission],
          });
        }
      });
    });

    return (
      <Stack spacing={1.25}>
        {['formal_order', 'after_sales_recovery']
          .map((sourceKey) => {
            const group = sourceGroups.get(sourceKey);
            if (!group?.commissions.length) return null;
            const summaries = buildRoleSummariesFromCommissions(group.commissions);
            const totalAmount = summaries.reduce((sum, summary) => sum + summary.totalAmount, 0);
            const orderCount = new Set(group.commissions.map((commission) => commission.orderId || commission.orderNo)).size;
            return (
              <Box key={sourceKey} sx={{ border: '1px solid #E8E4F1', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                <Box sx={{ px: 1.4, py: 1.05, bgcolor: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', md: 'center' }, justifyContent: 'space-between' }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ color: '#19142C', fontWeight: 900 }}>
                        {group.title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#64748b', display: 'block', overflowWrap: 'anywhere' }}>
                        {group.description}
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={0.8} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                      <Chip label={`${orderCount} 单`} size="small" sx={{ height: 24, bgcolor: '#F1EDFF', color: '#7447F5', fontWeight: 800 }} />
                      <Chip label={`应发 ${formatCurrency(totalAmount)}`} size="small" sx={{ height: 24, bgcolor: '#ecfdf5', color: '#047857', fontWeight: 800 }} />
                    </Stack>
                  </Stack>
                </Box>
                <Stack spacing={0.8} sx={{ p: 1 }}>
                  {summaries.map((summary) => renderMinePayoutGroup(sourceKey, group.title, group.rowLabel, summary))}
                </Stack>
              </Box>
            );
          })}
      </Stack>
    );
  };

  const getMinePayoutCategory = (commission: Commission): Exclude<MinePayoutCategory, 'all'> => {
    const isRecovery = commission.sourceBusinessType === 'after_sales_recovery'
      || commission.sourceBusinessType === 'refund_recovery'
      || Boolean(commission.sourceRecoveryOrderId);
    if (isRecovery) return 'recovery';
    if (commission.ruleCalculationType === 'tiered_percentage') return 'tiered';
    return 'ordinary';
  };

  const buildMineTierSummaryRows = (sourceRows: MonthlyCommissionPayout[] = payoutRows): MineCommissionDisplayRow[] => {
    const commissions = sourceRows.flatMap((row) => row.commissions);
    const tieredCommissions = commissions.filter((commission) => getMinePayoutCategory(commission) === 'tiered');
    return buildRoleSummariesFromCommissions(tieredCommissions)
      .filter((summary) => summary.isTiered)
      .map((summary): MineCommissionDisplayRow => {
        const currentTier = summary.tierSnapshot?.currentTier;
        const nextTier = summary.tierSnapshot?.nextTier;
        const range = currentTier
          ? currentTier.maxAmount === undefined
            ? `${formatCurrency(currentTier.minAmount)} 以上`
            : `${formatCurrency(currentTier.minAmount)} - ${formatCurrency(currentTier.maxAmount)}`
          : '待结算';
        return {
          id: `tiered:${summary.role}:${summary.payoutPlanId || 'legacy'}:v${summary.payoutPlanVersion || 1}`,
          category: 'tiered',
          typeLabel: '月度阶梯提成',
          sourceLabel: '正式订单',
          title: summary.payoutPlanName || '月度阶梯提成',
          subtitle: `${summary.orderCount} 个订单参与月度累计`,
          role: summary.role,
          businessAt: summary.commissions
            .map(getMineCommissionBusinessTime)
            .sort((left, right) => Date.parse(right) - Date.parse(left))[0] || '',
          performanceAmount: summary.monthlyPaidAmount,
          calculationText: currentTier
            ? `当前 ${range} · ${currentTier.rate}%${nextTier ? ` · 距下一档 ${formatCurrency(summary.tierSnapshot?.gapToNext || 0)}` : ' · 已到最高档'}`
            : '阶梯方案待月度结算',
          commissionAmount: summary.totalAmount,
          status: summary.status === '无应发' && summary.withdrawnAmount > 0 ? '已撤回' : summary.status,
          commissions: summary.commissions,
          tierSnapshot: summary.tierSnapshot,
        };
      });
  };

  const buildMineCommissionDisplayRows = (sourceRows: MonthlyCommissionPayout[] = payoutRows): MineCommissionDisplayRow[] => {
    const commissions = sourceRows.flatMap((row) => row.commissions);
    const tieredRows = buildMineTierSummaryRows(sourceRows).flatMap((summary) => {
      const currentTier = summary.tierSnapshot?.currentTier;
      const nextTier = summary.tierSnapshot?.nextTier;
      const range = currentTier
        ? currentTier.maxAmount === undefined
          ? `${formatCurrency(currentTier.minAmount)} 以上`
          : `${formatCurrency(currentTier.minAmount)} - ${formatCurrency(currentTier.maxAmount)}`
        : '待结算';
      return buildMineTieredCommissionItems(summary.commissions).map(({ commission, identity }): MineCommissionDisplayRow => ({
        id: commission.id,
        category: 'tiered',
        typeLabel: '月度阶梯提成',
        sourceLabel: '正式订单',
        title: identity.primary,
        subtitle: identity.secondary,
        role: commission.role,
        businessAt: getMineCommissionBusinessTime(commission),
        performanceAmount: Number(commission.performanceAmount || commission.orderAmount || 0),
        calculationText: currentTier
          ? `本月累计 ${formatCurrency(summary.tierSnapshot?.baseAmount || 0)} 命中 ${range} · ${currentTier.rate}%${nextTier ? ` · 距下一档 ${formatCurrency(summary.tierSnapshot?.gapToNext || 0)}` : ''}`
          : '阶梯方案待月度结算',
        commissionAmount: getDisplayCommissionAmount(commission, summary.tierSnapshot),
        status: getMineCommissionStatusLabel(commission.status),
        commissions: [commission],
        tierSnapshot: summary.tierSnapshot,
      }));
    });
    const individualRows = commissions
      .filter((commission) => getMinePayoutCategory(commission) !== 'tiered')
      .map((commission): MineCommissionDisplayRow => {
        const category = getMinePayoutCategory(commission);
        const identity = buildMineCommissionIdentity({
          kind: 'individual',
          customerName: commission.customerName,
          orderNo: commission.orderNo,
        });
        return {
          id: commission.id,
          category,
          typeLabel: category === 'recovery' ? '售后挽回提成' : '普通订单提成',
          sourceLabel: category === 'recovery' ? '售后挽回' : '正式订单',
          title: identity.primary,
          subtitle: identity.secondary,
          role: commission.role,
          businessAt: getMineCommissionBusinessTime(commission),
          performanceAmount: Number(commission.performanceAmount || commission.orderAmount || 0),
          calculationText: commission.formulaText || commission.calculationNote || commission.payoutPlanName || '-',
          commissionAmount: getDisplayCommissionAmount(commission),
          status: getMineCommissionStatusLabel(commission.status),
          commissions: [commission],
        };
      });
    return [...tieredRows, ...individualRows].sort((left, right) => (
      Date.parse(right.businessAt) - Date.parse(left.businessAt)
      || right.commissionAmount - left.commissionAmount
    ));
  };

  const renderMineTierPanel = (row: MineCommissionDisplayRow, isCurrentPeriod: boolean) => {
    const snapshot = row.tierSnapshot;
    if (!snapshot) return null;
    const currentTier = snapshot.currentTier;
    const nextTier = snapshot.nextTier;
    const progress = currentTier
      ? nextTier && nextTier.minAmount > currentTier.minAmount
        ? Math.min(100, Math.max(0, ((snapshot.baseAmount - currentTier.minAmount) / (nextTier.minAmount - currentTier.minAmount)) * 100))
        : 100
      : 0;
    const range = currentTier
      ? currentTier.maxAmount === undefined
        ? `${formatCurrency(currentTier.minAmount)} 以上`
        : `${formatCurrency(currentTier.minAmount)} - ${formatCurrency(currentTier.maxAmount)}`
      : '尚未进入有效档位';
    return (
      <Paper key={row.id} elevation={0} sx={{ border: '1px solid #DDD2FF', borderRadius: 1.5, overflow: 'hidden', bgcolor: '#fff' }}>
        <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.5, bgcolor: '#FAF9FD', borderBottom: '1px solid #dbeafe' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between">
            <Box>
              <Typography variant="subtitle1" fontWeight={900} color="#1d4ed8">正式订单月度阶梯提成</Typography>
              <Typography variant="caption" color="text.secondary">{row.role} · {row.commissions.length} 笔提成参与本月累计</Typography>
            </Box>
            <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
              <Typography variant="caption" color="text.secondary">{isCurrentPeriod ? '当前预计阶梯提成' : '最终阶梯提成'}</Typography>
              <Typography variant="h5" fontWeight={900} color="#1d4ed8">{formatCurrency(row.commissionAmount)}</Typography>
            </Box>
          </Stack>
        </Box>
        <Box sx={{ p: { xs: 1.5, md: 2 } }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
            {[
              { label: '月度阶梯业绩', value: formatCurrency(snapshot.baseAmount) },
              { label: '当前档位', value: currentTier ? `${currentTier.rate}%` : '-' },
              { label: '当前档位范围', value: range },
              { label: nextTier ? '距离下一档' : '档位进度', value: nextTier ? formatCurrency(snapshot.gapToNext) : '已到最高档' },
            ].map((item) => (
              <Box key={item.label} sx={{ minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" display="block">{item.label}</Typography>
                <Typography variant="body1" fontWeight={900} sx={{ mt: 0.25, overflowWrap: 'anywhere' }}>{item.value}</Typography>
              </Box>
            ))}
          </Box>
          <Box sx={{ mt: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
              <Typography variant="caption" color="text.secondary">{currentTier ? `当前 ${currentTier.rate}%` : '等待进入首档'}</Typography>
              <Typography variant="caption" color="primary.main" fontWeight={800}>
                {nextTier ? `下一档 ${nextTier.rate}% · 还差 ${formatCurrency(snapshot.gapToNext)}` : '已到最高档'}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{ mt: 0.75, height: 8, borderRadius: 4, bgcolor: '#dbeafe', '& .MuiLinearProgress-bar': { borderRadius: 4 } }}
            />
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.75 }}>
              {(snapshot.tiers || []).slice(0, 6).map((tier) => (
                <Typography key={`${tier.minAmount}-${tier.rate}`} variant="caption" color={tier.rate === currentTier?.rate ? 'primary.main' : 'text.secondary'} fontWeight={tier.rate === currentTier?.rate ? 900 : 500}>
                  {tier.rate}%<Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}> · {formatCurrency(tier.minAmount)}</Box>
                </Typography>
              ))}
            </Stack>
          </Box>
          <Box sx={{ mt: 1.5, px: 1.25, py: 1, bgcolor: '#f8fafc', borderRadius: 1 }}>
            <Typography variant="body2" fontWeight={800}>
              {formatCurrency(snapshot.baseAmount)} × {currentTier?.rate || 0}% = {formatCurrency(row.commissionAmount)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {isCurrentPeriod ? '当前为预计金额，按最新启用的阶梯方案和本月业绩实时计算。' : '历史月份按结算时保存的阶梯规则快照展示。'}
            </Typography>
          </Box>
        </Box>
      </Paper>
    );
  };

  const renderMinePayoutWorkspace = (sourceRows: MonthlyCommissionPayout[] = payoutRows) => {
    const allCommissions = sourceRows.flatMap((row) => row.commissions);
    const displayRows = buildMineCommissionDisplayRows(sourceRows);
    const filteredRows = minePayoutCategory === 'all'
      ? displayRows
      : displayRows.filter((row) => row.category === minePayoutCategory);
    const maxMineDetailPage = Math.max(0, Math.ceil(filteredRows.length / mineDetailPageSize) - 1);
    const currentMineDetailPage = Math.min(mineDetailPage, maxMineDetailPage);
    const paginatedRows = filteredRows.slice(
      currentMineDetailPage * mineDetailPageSize,
      (currentMineDetailPage + 1) * mineDetailPageSize,
    );
    const uniqueOrders = new Map<string, number>();
    allCommissions.forEach((commission) => {
      const key = commission.orderId || commission.orderNo;
      uniqueOrders.set(key, Math.max(uniqueOrders.get(key) || 0, Number(commission.orderAmount || 0)));
    });
    const orderPaidAmount = [...uniqueOrders.values()].reduce((sum, amount) => sum + amount, 0);
    const localNow = new Date();
    const currentPeriod = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}`;
    const isCurrentPeriod = payoutPeriod === currentPeriod;
    const tierRows = buildMineTierSummaryRows(sourceRows);
    const displayedAmounts = displayRows.reduce((summary, row) => {
      row.commissions.forEach((commission) => {
        const amount = getDisplayCommissionAmount(commission, row.tierSnapshot);
        const status = getMineCommissionStatusLabel(commission.status);
        if (status === '待确认') summary.pendingConfirmAmount += amount;
        else if (status === '待发放') summary.pendingPayAmount += amount;
        else if (status === '已发放') summary.paidAmount += amount;
        else if (status === '已撤回') summary.withdrawnAmount += amount;
      });
      return summary;
    }, {
      pendingConfirmAmount: 0,
      pendingPayAmount: 0,
      paidAmount: 0,
      withdrawnAmount: 0,
    });
    const displayedTotalAmount = displayedAmounts.pendingConfirmAmount
      + displayedAmounts.pendingPayAmount
      + displayedAmounts.paidAmount;
    const categoryCounts = {
      all: allCommissions.length,
      tiered: allCommissions.filter((commission) => getMinePayoutCategory(commission) === 'tiered').length,
      ordinary: allCommissions.filter((commission) => getMinePayoutCategory(commission) === 'ordinary').length,
      recovery: allCommissions.filter((commission) => getMinePayoutCategory(commission) === 'recovery').length,
    };
    const categoryTabs: Array<{ value: MinePayoutCategory; label: string }> = [
      { value: 'all', label: `全部 ${categoryCounts.all}笔` },
      { value: 'tiered', label: `月度阶梯 ${categoryCounts.tiered}笔` },
      { value: 'ordinary', label: `普通提成 ${categoryCounts.ordinary}笔` },
      { value: 'recovery', label: `售后挽回 ${categoryCounts.recovery}笔` },
    ];

    return (
      <Stack spacing={2}>
        <Paper elevation={0} sx={{ border: '1px solid #E8E4F1', borderRadius: 1.5, p: { xs: 1.5, md: 2.25 }, bgcolor: '#fff' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
            <Box>
              <Typography variant="body2" color="text.secondary">{isCurrentPeriod ? '本月预计提成' : '本月应发提成'}</Typography>
              <Typography variant="h3" sx={{ mt: 0.4, fontWeight: 900, color: '#19142C', fontSize: { xs: '2.1rem', md: '2.65rem' } }}>
                {formatCurrency(displayedTotalAmount)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {allCommissions.length} 笔提成 · {uniqueOrders.size} 个业务订单
              </Typography>
            </Box>
            <Box sx={{ minWidth: { md: 230 }, textAlign: { xs: 'left', md: 'right' } }}>
              <Typography variant="body2" color="text.secondary">关联订单实付</Typography>
              <Typography variant="h5" fontWeight={800} color="#475569" sx={{ mt: 0.4 }}>{formatCurrency(orderPaidAmount)}</Typography>
              <Typography variant="caption" color="text.secondary">仅作为提成计算依据</Typography>
            </Box>
          </Stack>
          <Box sx={{ mt: 2, pt: 1.75, borderTop: '1px solid #e5e7eb', display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}>
            {[
              { label: '待确认', value: displayedAmounts.pendingConfirmAmount, color: '#7447F5' },
              { label: '待发放', value: displayedAmounts.pendingPayAmount, color: '#d97706' },
              { label: '已发放', value: displayedAmounts.paidAmount, color: '#16a34a' },
              { label: '已撤回', value: displayedAmounts.withdrawnAmount, color: '#64748b' },
            ].map((item, index) => (
              <Box key={item.label} sx={{ px: { xs: 0.5, md: 1.5 }, borderLeft: { md: index ? '1px solid #e5e7eb' : 'none' } }}>
                <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                <Typography variant="h6" fontWeight={900} sx={{ color: item.color }}>{formatCurrency(item.value)}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>

        {tierRows.map((row) => renderMineTierPanel(row, isCurrentPeriod))}

        <Paper elevation={0} sx={{ border: '1px solid #E8E4F1', borderRadius: 1.5, overflow: 'hidden', bgcolor: '#fff' }}>
          <Tabs
            value={minePayoutCategory}
            onChange={(_, value: MinePayoutCategory) => {
              setMinePayoutCategory(value);
              setMineDetailPage(0);
            }}
            variant="scrollable"
            scrollButtons="auto"
            sx={{ px: 1, borderBottom: '1px solid #e5e7eb', minHeight: 48, '& .MuiTab-root': { minHeight: 48, fontWeight: 800 } }}
          >
            {categoryTabs.map((tab) => <Tab key={tab.value} value={tab.value} label={tab.label} />)}
          </Tabs>
          <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.5 }}>
            <Typography variant="h6" fontWeight={900}>提成明细</Typography>
            <Typography variant="body2" color="text.secondary">按业务成交时间倒序，查看每笔提成的客户、订单、业绩金额、计算方案和当前状态。</Typography>
          </Box>
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            {paginatedRows.map((row) => (
              <Box key={row.id} sx={{ ...getMineCommissionCategoryCardSx(row.category), p: 1.5 }}>
                <Stack direction="row" justifyContent="space-between" spacing={1}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" color="text.secondary">{row.typeLabel} · {row.role}</Typography>
                    <Typography variant="h6" fontWeight={900} color={row.status === '已发放' ? 'success.main' : row.status === '待发放' ? 'warning.main' : 'primary.main'}>
                      {formatCurrency(row.commissionAmount)}
                    </Typography>
                  </Box>
                  <Chip size="small" label={row.status} color={getCommissionStatusColor(row.status)} />
                </Stack>
                <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Box><Typography variant="caption" color="text.secondary">客户</Typography><Typography variant="body2" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{row.title}</Typography></Box>
                  <Box><Typography variant="caption" color="text.secondary">订单号</Typography><Typography variant="body2" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{row.subtitle}</Typography></Box>
                  <Box><Typography variant="caption" color="text.secondary">业绩金额</Typography><Typography variant="body2" fontWeight={800}>{formatCurrency(row.performanceAmount)}</Typography></Box>
                  <Box><Typography variant="caption" color="text.secondary">业务成交时间</Typography><Typography variant="body2" fontWeight={800}>{row.businessAt ? formatDate(row.businessAt, 'yyyy-MM-dd HH:mm') : '-'}</Typography></Box>
                </Box>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>{row.calculationText}</Typography>
                <Button fullWidth size="small" variant="outlined" startIcon={<VisibilityIcon />} sx={{ mt: 1.25 }} onClick={() => setMineDetailRow(row)}>
                  查看计算详情
                </Button>
              </Box>
            ))}
          </Box>
          <TableContainer sx={{ display: { xs: 'none', md: 'block' }, borderTop: '1px solid #e5e7eb' }}>
            <Table size="small" sx={[moduleTableSx, { minWidth: 1240 }]}>
              <TableHead><TableRow>
                <TableCell>提成类型</TableCell>
                <TableCell>客户</TableCell>
                <TableCell>订单号</TableCell>
                <TableCell>业务成交时间</TableCell>
                <TableCell>角色</TableCell>
                <TableCell align="right">业绩金额</TableCell>
                <TableCell>计算方案</TableCell>
                <TableCell align="right">提成金额</TableCell>
                <TableCell align="center">状态</TableCell>
                <TableCell align="center">操作</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {paginatedRows.map((row) => (
                  <TableRow key={row.id} hover sx={getMineCommissionCategoryRowSx(row.category)}>
                    <TableCell><Typography variant="body2" fontWeight={900}>{row.typeLabel}</Typography></TableCell>
                    <TableCell><Typography variant="body2" fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{row.title}</Typography></TableCell>
                    <TableCell><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{row.subtitle}</Typography></TableCell>
                    <TableCell>{row.businessAt ? formatDate(row.businessAt, 'yyyy-MM-dd HH:mm') : '-'}</TableCell>
                    <TableCell>{row.role}</TableCell>
                    <TableCell align="right">{formatCurrency(row.performanceAmount)}</TableCell>
                    <TableCell sx={{ maxWidth: 280 }}><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{row.calculationText}</Typography></TableCell>
                    <TableCell align="right"><Typography variant="body2" fontWeight={900} color={row.status === '已发放' ? 'success.main' : row.status === '待发放' ? 'warning.main' : 'primary.main'}>{formatCurrency(row.commissionAmount)}</Typography></TableCell>
                    <TableCell align="center"><Chip size="small" label={row.status} color={getCommissionStatusColor(row.status)} /></TableCell>
                    <TableCell align="center">
                      <Tooltip title="查看详情">
                        <IconButton
                          size="small"
                          color="primary"
                          aria-label="查看详情"
                          onClick={() => setMineDetailRow(row)}
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {!filteredRows.length && <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>当前分类暂无提成明细</Box>}
          {filteredRows.length > 0 && (
            <TablePagination
              component="div"
              count={filteredRows.length}
              page={currentMineDetailPage}
              rowsPerPage={mineDetailPageSize}
              rowsPerPageOptions={[10, 20, 50]}
              onPageChange={(_event, page) => setMineDetailPage(page)}
              onRowsPerPageChange={(event) => {
                setMineDetailPageSize(Number(event.target.value));
                setMineDetailPage(0);
              }}
              labelRowsPerPage="每页条数"
              labelDisplayedRows={formatPaginationRows}
              sx={{ borderTop: '1px solid #e5e7eb', bgcolor: '#fff' }}
            />
          )}
        </Paper>
      </Stack>
    );
  };

  const renderSplitSummaryCard = (commission: Commission) => {
    const note = commission.calculationNote || commission.formulaText || '-';
    const performanceAmount = commission.performanceAmount || commission.orderAmount;
    const planName = commission.payoutPlanName
      || (commission.commissionRuleId ? '历史记录未保存方案快照' : '未匹配提成方案');
    const planSummary = commission.payoutPlanName
      ? formatPayoutPlanValue({
        commissionType: commission.ruleCalculationType || 'fixed',
        commissionValue: commission.ruleCalculationType === 'percentage'
          ? Math.round(Number(commission.commissionRate || 0) * 10000) / 100
          : commission.commissionAmount,
        tiers: commission.tierSnapshot?.tiers,
      })
      : (commission.commissionRuleId ? '-' : '需要财务核对规则和金额');
    const displayStatus = getCommissionDisplayStatus(commission);
    const statusColor = getCommissionStatusColor(displayStatus);

    return (
      <Box
        key={commission.id}
        sx={{
          border: '1px solid #e5e7eb',
          borderRadius: 1,
          bgcolor: '#fff',
          minHeight: 250,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ px: 1.35, py: 1.15, borderBottom: '1px solid #eef2f7', bgcolor: '#f8fafc' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
              <Stack spacing={0.5} alignItems="flex-start">
                <Chip label={commission.role} size="small" color="primary" sx={{ height: 22, mt: 0.1 }} />
                <Chip label={`第 ${commission.settlementVersion || 1} 轮`} size="small" variant="outlined" sx={{ height: 20 }} />
              </Stack>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ color: '#111827', fontWeight: 900, overflowWrap: 'anywhere', lineHeight: 1.35 }}>
                  {formatOwnerDisplayName(commission.ownerId, commission.owner)}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', overflowWrap: 'anywhere', display: 'block' }}>
                  {commission.department || '-'}
                </Typography>
              </Box>
            </Stack>
            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
              <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>提成</Typography>
              <Typography variant="h6" sx={{ color: '#dc2626', fontWeight: 900, lineHeight: 1.2 }}>
                {formatCurrency(commission.commissionAmount)}
              </Typography>
            </Box>
          </Stack>
        </Box>

        <Stack spacing={1.05} sx={{ p: 1.35, flex: 1 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>业绩金额</Typography>
              <Typography variant="body2" sx={{ color: '#111827', fontWeight: 800 }}>
                {formatCurrency(performanceAmount)}
              </Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>状态</Typography>
              <Chip label={displayStatus} size="small" color={statusColor} />
            </Box>
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>提成方案</Typography>
            <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700, overflowWrap: 'anywhere' }}>
              {planName}
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b', overflowWrap: 'anywhere', display: 'block' }}>
              {planSummary}
            </Typography>
          </Box>

          <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>说明</Typography>
            <Typography variant="body2" sx={{ color: '#374151', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {note}
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 'auto' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>分账来源</Typography>
              <Typography variant="caption" sx={{ color: '#374151', fontWeight: 700 }}>
                {commission.isManualAdjusted ? '人工调整' : (commission.sourceType || (commission.commissionRuleId ? '系统规则' : '-'))}
              </Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mb: 0.25 }}>凭证状态</Typography>
              <Typography variant="caption" sx={{ color: '#374151', fontWeight: 700 }}>
                {commission.evidenceStatus || '-'}
              </Typography>
            </Box>
          </Box>
        </Stack>
      </Box>
    );
  };

  const renderOrderSettlementRisks = (summary: CommissionOrderSummary) => {
    const risks = getOrderSettlementRisks(summary, settlementOrderDetail);
    return (
      <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
        <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid #eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ color: '#19142C', fontWeight: 900 }}>财务核对</Typography>
          <Chip
            size="small"
            label={settlementOrderLoading ? '核对中' : (risks.length ? `${risks.length} 项需关注` : '核对通过')}
            color={settlementOrderLoading ? 'default' : (risks.some((risk) => risk.severity === 'error') ? 'error' : risks.length ? 'warning' : 'success')}
          />
        </Box>
        <Stack spacing={0.75} sx={{ p: 1.25 }}>
          {settlementOrderLoading ? (
            <Typography variant="body2" sx={{ color: '#64748b' }}>正在核对付款金额、凭证、退款状态和分账规则...</Typography>
          ) : risks.length ? risks.map((risk, index) => (
            <Box
              key={`${risk.severity}-${index}-${risk.message}`}
              sx={{
                px: 1.25,
                py: 0.85,
                borderRadius: 1,
                border: `1px solid ${risk.severity === 'error' ? '#fecaca' : '#fde68a'}`,
                bgcolor: risk.severity === 'error' ? '#fef2f2' : '#fffbeb',
              }}
            >
              <Typography variant="body2" sx={{ color: risk.severity === 'error' ? '#991b1b' : '#92400e', fontWeight: 700 }}>
                {risk.message}
              </Typography>
            </Box>
          )) : (
            <Typography variant="body2" sx={{ color: '#047857', fontWeight: 700 }}>
              订单金额、付款凭证、退款状态及分账规则核对通过。
            </Typography>
          )}
        </Stack>
      </Paper>
    );
  };

  const getOperationStatusTransition = (action: CommissionOperationLog['action']) => {
    const transitions: Partial<Record<CommissionOperationLog['action'], string>> = {
      调整分账: '待确认 → 待确认',
      确认分账: '待确认 → 待发放',
      重置分账: '待确认 → 待处理',
      重新分账: '已撤回 → 待处理',
      撤回提成: '未发放 → 已撤回',
      发放提成: '待发放 → 已发放',
      清理废弃分账: '源订单已删除 → 已清理',
    };
    return transitions[action] || '-';
  };

  const buildOrderSettlementEvents = () => operationLogs.map((log) => {
    const splitSnapshot = log.splitSnapshot || [];
    const amountText = log.totalCommissionAmount === undefined ? '-' : formatCurrency(log.totalCommissionAmount);
    return {
      id: log.id,
      action: log.action,
      summary: `${splitSnapshot.length || log.commissionCount || 0} 个角色 · 合计 ${amountText}`,
      operator: log.operator,
      operatedAt: formatDate(log.operatedAt, 'yyyy-MM-dd HH:mm'),
      roundLabel: log.settlementVersion ? `第 ${log.settlementVersion} 轮` : '历史记录',
      statusTransition: getOperationStatusTransition(log.action),
      reason: log.reason,
      changes: splitSnapshot.length
        ? splitSnapshot.map((item) => ({
          label: item.role,
          value: `${formatOwnerDisplayName(item.ownerId, item.owner)}${item.department ? ` / ${item.department}` : ''} · ${formatCurrency(item.commissionAmount)} · ${item.status}`,
        }))
        : [{ label: '历史记录', value: '历史记录仅保留操作结果，暂无人员变更明细。' }],
    };
  });

  const togglePayoutExpanded = (ownerKey: string) => {
    setExpandedPayoutOwners((prev) => {
      const next = new Set(prev);
      if (next.has(ownerKey)) next.delete(ownerKey);
      else next.add(ownerKey);
      return next;
    });
  };

  const renderOrderStatusBar = () => (
    <StatusSegmentBar
      value={orderFilters.status}
      onChange={(value) => updateOrderFilter('status', value)}
      size="small"
      sx={{ mb: 1.25 }}
      items={ORDER_STATUS_OPTIONS.map((item) => ({
        value: item.value,
        label: item.label,
        count: orderStatusCounts[item.value] || 0,
        tone: item.value === '待处理' ? 'amber'
          : item.value === '待确认' || item.value === '待发放' ? 'blue'
            : item.value === '已发放' ? 'green'
              : item.value === '已撤回' ? 'gray'
                : 'blue',
      }))}
    />
  );

  const renderOrderToolbar = () => (
    <Stack direction="row" spacing={1.25} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
      <TextField
        placeholder="搜索订单号/客户/第三方订单/付款单号"
        value={orderFilters.search}
        onChange={(event) => updateOrderFilter('search', event.target.value)}
        size="small"
        sx={{ minWidth: 240 }}
      />
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel>销售负责人</InputLabel>
        <Select value={orderFilters.salesId} label="销售负责人" onChange={(event) => updateOrderFilter('salesId', event.target.value)}>
          <MenuItem value="">全部</MenuItem>
          {activeEmployees.map((employee) => (
            <MenuItem key={employee.id} value={employee.id}>{formatEmployeeDisplayName(employee)}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>提成角色</InputLabel>
        <Select value={orderFilters.role} label="提成角色" onChange={(event) => updateOrderFilter('role', event.target.value)}>
          <MenuItem value="">全部</MenuItem>
          {activeRoleConfigs.map((role) => <MenuItem key={role.id} value={role.name}>{role.name}</MenuItem>)}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>提成人员</InputLabel>
        <Select value={orderFilters.ownerId} label="提成人员" onChange={(event) => updateOrderFilter('ownerId', event.target.value)}>
          <MenuItem value="">全部</MenuItem>
          {activeEmployees.map((employee) => (
            <MenuItem key={employee.id} value={employee.id}>{formatEmployeeDisplayName(employee)}</MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        label="付款开始"
        type="date"
        value={orderFilters.startDate}
        onChange={(event) => updateOrderFilter('startDate', event.target.value)}
        size="small"
        InputLabelProps={{ shrink: true }}
      />
      <TextField
        label="付款结束"
        type="date"
        value={orderFilters.endDate}
        onChange={(event) => updateOrderFilter('endDate', event.target.value)}
        size="small"
        InputLabelProps={{ shrink: true }}
      />
      <Button variant="outlined" startIcon={<SortIcon />} onClick={handleOrderPaymentDateSort}>
        {orderFilters.sortBy === 'paymentDate'
          ? `付款时间${orderFilters.sortDirection === 'asc' ? '升序' : '降序'}`
          : '按付款时间排序'}
      </Button>
      <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={handleResetOrderFilters}>
        重置
      </Button>
    </Stack>
  );

  const renderOrderSplitTable = () => (
    <DataTableWorkspace>
      <DataTableDesktopScroller sx={{ display: 'block' }}>
        <Table
          stickyHeader
          size="small"
          sx={[
            moduleTableSx,
            {
              tableLayout: 'fixed',
              minWidth: orderSplitTableMinWidth + 150,
              '& .MuiTableCell-root': { py: 1, height: 44, fontSize: 13 },
            },
          ]}
        >
          <TableHead>
            <TableRow>
              {visibleOrderSplitColumns.map((column, columnIndex) => (
                <ResizableHeaderCell
                  key={column.id}
                  columnId={column.id}
                  width={orderSplitColumnWidths[column.id] || column.defaultWidth}
                  onResize={handleResizeOrderSplitColumn}
                  sx={getFrozenColumnSx(columnIndex, true)}
                >
                  {column.label}
                </ResizableHeaderCell>
              ))}
              <TableCell
                align="center"
                sx={{
                  position: 'sticky',
                  right: 0,
                  zIndex: 5,
                  bgcolor: '#f8fafc',
                  width: 150,
                  minWidth: 150,
                  boxShadow: '-1px 0 0 #e5e7eb',
                }}
              >
                操作
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orderRows.map((summary) => {
              const actionVisibility = getSettlementRowActionVisibility(summary.status, Boolean(summary.sourceOrderDeleted));
              return (
              <TableRow key={summary.orderId} hover>
                {visibleOrderSplitColumns.map((column, columnIndex) => (
                  <TableCell
                    key={`${summary.orderId}-${column.id}`}
                    sx={{
                      width: orderSplitColumnWidths[column.id] || column.defaultWidth,
                      minWidth: orderSplitColumnWidths[column.id] || column.defaultWidth,
                      maxWidth: orderSplitColumnWidths[column.id] || column.defaultWidth,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: column.id === 'splitDetails' ? 'normal' : 'nowrap',
                      verticalAlign: column.id === 'splitDetails' ? 'top' : 'middle',
                      ...getFrozenColumnSx(columnIndex),
                    }}
                  >
                    {renderOrderSplitCell(summary, column.id)}
                  </TableCell>
                ))}
                <TableCell
                  align="center"
                  sx={{
                    position: 'sticky',
                    right: 0,
                    zIndex: 4,
                    bgcolor: '#fff',
                    width: 150,
                    minWidth: 150,
                    boxShadow: '-1px 0 0 #e5e7eb',
                  }}
                >
                  <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'center' }}>
                    <Tooltip title="查看分账">
                      <IconButton size="small" color="primary" onClick={() => openSettlementDetail(summary)} aria-label="查看分账">
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {canManageOrderSettlement && (
                      <>
                    {actionVisibility.showAdjust && <Tooltip title={getAdjustDisabledReason(summary)}>
                      <span>
                        <IconButton
                          size="small"
                          color="primary"
                          disabled={!canAdjustSettlementSummary(summary)}
                          onClick={() => openSettlementDetail(summary, { edit: true })}
                          aria-label="调整分账"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>}
                    {actionVisibility.showReopen && (
                      <Tooltip title="重新分账">
                        <span>
                          <IconButton
                            size="small"
                            color="primary"
                            disabled={!canReopenSettlementSummary(summary)}
                            onClick={() => { setReopenSummary(summary); setReopenReason(''); }}
                            aria-label="重新分账"
                          >
                            <RestartAltIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                    {actionVisibility.showResetOrCleanup && <Tooltip title={getResetOrCleanupOrderSplitDisabledReason(summary)}>
                      <span>
                        <IconButton
                          size="small"
                          color={summary.sourceOrderDeleted ? 'error' : 'warning'}
                          disabled={!canResetOrCleanupOrderSplitSummary(summary)}
                          onClick={() => openDeleteOrderSplitDialog(summary)}
                          aria-label={summary.sourceOrderDeleted ? '清理废弃记录' : '重置订单分账'}
                        >
                          {summary.sourceOrderDeleted
                            ? <DeleteSweepIcon fontSize="small" />
                            : <RestartAltIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>}
                      </>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!orderRows.length && <DataTableEmptyState label={orderLoading ? '加载中...' : '暂无订单分账'} />}
      </DataTableDesktopScroller>
      <DataTableMobileScroller>
        {orderRows.map((summary) => (
          <Paper key={summary.orderId} elevation={0} sx={{ p: 1.5, border: '1px solid #e5e7eb', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ minWidth: 0 }}><Typography variant="subtitle2" noWrap sx={{ fontWeight: 850 }}>{renderOrderSplitCell(summary, 'orderNo')}</Typography><Typography variant="caption" color="text.secondary">{renderOrderSplitCell(summary, 'customerName')}</Typography></Box>
              {renderOrderSplitCell(summary, 'status')}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1.25 }}>
              <Box><Typography variant="caption" color="text.secondary">产品</Typography><Typography variant="body2">{renderOrderSplitCell(summary, 'productName')}</Typography></Box>
              <Box><Typography variant="caption" color="text.secondary">实付金额</Typography><Typography variant="body2">{renderOrderSplitCell(summary, 'orderAmount')}</Typography></Box>
            </Box>
            <Button size="small" startIcon={<VisibilityIcon />} onClick={() => openSettlementDetail(summary)} sx={{ mt: 1 }}>查看分账</Button>
          </Paper>
        ))}
        {!orderRows.length && <Typography sx={{ py: 5, textAlign: 'center', color: '#9ca3af' }}>{orderLoading ? '加载中...' : '暂无订单分账'}</Typography>}
      </DataTableMobileScroller>
      <DataTableWorkspaceFooter>
      <TablePagination
        component="div"
        count={orderPagination.total}
        page={Math.max((orderPagination.page || 1) - 1, 0)}
        rowsPerPage={orderPagination.pageSize || 10}
        rowsPerPageOptions={[10, 20, 50, 100]}
        onPageChange={handleOrderPageChange}
        onRowsPerPageChange={handleOrderRowsPerPageChange}
        labelRowsPerPage="每页条数"
        labelDisplayedRows={formatPaginationRows}
        sx={{
          border: '1px solid #e5e7eb',
          borderTop: 0,
          bgcolor: '#fff',
          '& .MuiTablePagination-toolbar': { minHeight: 48 },
        }}
      />
      </DataTableWorkspaceFooter>
    </DataTableWorkspace>
  );

  const renderEditorFieldLabel = (label: string) => (
    <Typography variant="caption" sx={{ display: 'block', color: '#64748b', fontWeight: 700, mb: 0.5 }}>
      {label}
    </Typography>
  );

  const editorInputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: '#fff',
    },
    '& input': {
      fontWeight: 600,
    },
  };

  const renderDetailSplitEditor = () => (
    <Stack spacing={1.25}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(280px, 320px))' },
          gap: 1.25,
          alignItems: 'stretch',
          justifyContent: 'start',
        }}
      >
        {splitRows.map((row, index) => {
          const planText = isCustomPayoutRow(row)
            ? `${CUSTOM_PAYOUT_PLAN_NAME} · 手工 ${formatCurrency(Number(row.commissionAmount || 0))}`
            : `${row.payoutPlanName || findPayoutPlanForRow(row)?.name || '未选择方案'} · ${formatPayoutPlanValue(findPayoutPlanForRow(row) || {
              commissionType: row.ruleCalculationType || 'fixed',
              commissionValue: row.ruleCalculationType === 'percentage'
                ? Math.round(Number(row.commissionRate || 0) * 10000) / 100
                : Number(row.commissionAmount || 0),
              tiers: row.tierSnapshot?.tiers,
            })}`;
          return (
            <Paper
              key={row.id || `detail-card-${index}`}
              elevation={0}
              sx={{
                border: '1px solid #E8E4F1',
                borderRadius: 1,
                bgcolor: '#fff',
                overflow: 'hidden',
                minHeight: 270,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Box sx={{ px: 1.35, py: 1.1, borderBottom: '1px solid #eef2f7', bgcolor: '#f8fafc' }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', mb: 0.35 }}>
                      <Chip label={row.role || `角色 ${index + 1}`} size="small" color="primary" sx={{ height: 22 }} />
                      <Typography variant="caption" sx={{ color: '#64748b' }}>
                        分账 {index + 1}
                      </Typography>
                    </Stack>
                    <Typography variant="body2" sx={{ color: '#111827', fontWeight: 800, overflowWrap: 'anywhere' }}>
                      {row.owner || '未选择人员'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      {row.department || '部门自动带出'}
                    </Typography>
                  </Box>
                  <Tooltip title={canDeleteSplitRow(row) ? '删除此条未确认分账' : '仅待确认阶段的分账可直接删除'}>
                    <span>
                      <IconButton
                        size="small"
                        color="error"
                        disabled={!canDeleteSplitRow(row)}
                        onClick={() => setSplitRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}
                        aria-label="删除分账人员"
                        sx={{ width: 30, height: 30 }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Box>

              <Stack spacing={1.05} sx={{ p: 1.35, flex: 1 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    {renderEditorFieldLabel('角色')}
                    <FormControl size="small" fullWidth>
                      <Select
                        value={row.role}
                        onChange={(event) => updateSplitRow(index, 'role', event.target.value as CommissionRole)}
                        aria-label="提成角色"
                        sx={{ bgcolor: '#fff' }}
                      >
                        {roleOptionsForSplit(row.role).map((role) => (
                          <MenuItem key={role.id} value={role.name}>{role.name}{role.isActive ? '' : '（已停用）'}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    {renderEditorFieldLabel('人员')}
                    <FormControl size="small" fullWidth>
                      <Select
                        value={row.ownerId || ''}
                        onChange={(event) => handleSplitOwnerChange(index, event.target.value)}
                        displayEmpty
                        aria-label="人员"
                        renderValue={(value) => {
                          if (!value) return '选择员工';
                          const employee = activeEmployees.find((item) => item.id === value);
                          return formatEmployeeDisplayName(employee, row.owner);
                        }}
                        sx={{ bgcolor: '#fff' }}
                      >
                        <MenuItem value="">选择员工</MenuItem>
                        {activeEmployees.map((employee) => (
                          <MenuItem key={employee.id} value={employee.id}>{formatEmployeeDisplayName(employee)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    {renderEditorFieldLabel('部门')}
                    <TextField
                      size="small"
                      value={row.department || ''}
                      placeholder="自动带出"
                      InputProps={{ readOnly: true }}
                      fullWidth
                      sx={editorInputSx}
                    />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    {renderEditorFieldLabel('业绩金额')}
                    <TextField
                      size="small"
                      type="number"
                      value={row.performanceAmount || 0}
                      onChange={(event) => updateSplitRow(index, 'performanceAmount', Number(event.target.value))}
                      fullWidth
                      sx={editorInputSx}
                    />
                  </Box>
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  {renderEditorFieldLabel('提成方案')}
                  <FormControl size="small" fullWidth>
                    <Select
                      value={row.payoutPlanId || ''}
                      onChange={(event) => updateSplitRow(index, 'payoutPlanId', event.target.value as CommissionAdjustmentInput['payoutPlanId'])}
                      displayEmpty
                      aria-label="提成方案"
                      renderValue={(value) => {
                        if (!value) return '选择提成方案';
                        return findPayoutPlanForRow(row)?.name || row.payoutPlanName || CUSTOM_PAYOUT_PLAN_NAME;
                      }}
                      sx={{ bgcolor: '#fff' }}
                    >
                      <MenuItem value="">选择提成方案</MenuItem>
                      <MenuItem value={CUSTOM_PAYOUT_PLAN_ID}>{CUSTOM_PAYOUT_PLAN_NAME} · 手工填写金额</MenuItem>
                      {!planOptionsForSplit(row.payoutPlanId).length && <MenuItem value="" disabled>请先配置提成方案</MenuItem>}
                      {planOptionsForSplit(row.payoutPlanId).map((plan) => (
                        <MenuItem key={plan.id} value={plan.id}>
                          {plan.name}{plan.isActive ? '' : '（已停用）'} · {formatPayoutPlanValue(plan)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Typography variant="caption" sx={{ display: 'block', color: '#64748b', mt: 0.45, overflowWrap: 'anywhere' }}>
                    {planText}
                  </Typography>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, alignItems: 'end' }}>
                  <Box sx={{ minWidth: 0 }}>
                    {renderEditorFieldLabel(isCustomPayoutRow(row) ? '自定义金额' : row.ruleCalculationType === 'tiered_percentage' ? '提成金额' : '方案金额')}
                    <TextField
                      size="small"
                      type={row.ruleCalculationType === 'tiered_percentage' ? 'text' : 'number'}
                      value={row.ruleCalculationType === 'tiered_percentage' ? '' : row.commissionAmount}
                      onChange={(event) => updateSplitRow(index, 'commissionAmount', Number(event.target.value))}
                      InputProps={{ readOnly: !isCustomPayoutRow(row) }}
                      placeholder={row.ruleCalculationType === 'tiered_percentage' ? '月报自动结算' : undefined}
                      fullWidth
                      sx={editorInputSx}
                    />
                  </Box>
                  <Box sx={{ minWidth: 0, textAlign: 'right' }}>
                    <Typography variant="caption" sx={{ display: 'block', color: '#64748b' }}>
                      当前提成
                    </Typography>
                    <Typography variant="h6" sx={{ color: '#dc2626', fontWeight: 900, lineHeight: 1.3 }}>
                      {row.ruleCalculationType === 'tiered_percentage' ? '月报结算' : formatCurrency(Number(row.commissionAmount || 0))}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ minWidth: 0 }}>
                  {renderEditorFieldLabel('说明')}
                  <TextField
                    size="small"
                    value={row.calculationNote || ''}
                    onChange={(event) => updateSplitRow(index, 'calculationNote', event.target.value)}
                    placeholder="可选"
                    fullWidth
                    sx={editorInputSx}
                  />
                </Box>
              </Stack>
            </Paper>
          );
        })}
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' } }}>
        <Button startIcon={<AddIcon />} onClick={handleAddSplitRow}>新增分账</Button>
        <TextField
          label="调整原因"
          value={splitReason}
          onChange={(event) => setSplitReason(event.target.value)}
          size="small"
          required
          sx={{ minWidth: { xs: 'auto', sm: 300 } }}
        />
      </Stack>
      {!createSplitOpen && (
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          <Button onClick={() => setDetailEditMode(false)}>取消编辑</Button>
          <Button
            variant="contained"
            disabled={splitSaving || !splitReason.trim() || splitRows.length === 0 || splitRows.some((row) => !row.ownerId || !row.payoutPlanId)}
            onClick={handleSaveSplitRows}
          >
            {splitSaving ? '保存中...' : '保存调整'}
          </Button>
        </Stack>
      )}
    </Stack>
  );

  const renderSettlementDetailActions = () => {
    if (!summaryDetail) return null;
    if (!canManageOrderSettlement) {
      return <Typography variant="body2" sx={{ color: '#64748b' }}>当前账号只能查看分账信息。</Typography>;
    }
    if (summaryDetail.sourceOrderDeleted) {
      return (
        <Stack spacing={1.25}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>源订单已删除，仅保留分账明细和历史记录，不允许继续调整或重新分账。</Typography>
          {canCleanupDeletedOrderSettlement && (
            <Button
              variant="contained"
              color="error"
              startIcon={<DeleteSweepIcon />}
              disabled={!canResetOrCleanupOrderSplitSummary(summaryDetail)}
              onClick={() => openDeleteOrderSplitDialog(summaryDetail)}
            >
              清理废弃记录
            </Button>
          )}
          {!canResetOrCleanupOrderSplitSummary(summaryDetail) && (
            <Typography variant="caption" sx={{ color: '#b45309' }}>{getResetOrCleanupOrderSplitDisabledReason(summaryDetail)}</Typography>
          )}
        </Stack>
      );
    }

    if (summaryDetail.status === '已撤回') {
      return (
        <Stack spacing={1.25}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>本轮提成已撤回并永久保留。重新分账会创建新轮次，不会覆盖旧记录。</Typography>
          <Button
            variant="contained"
            startIcon={<RestartAltIcon />}
            onClick={() => { setReopenSummary(summaryDetail); setReopenReason(''); }}
          >
            重新分账
          </Button>
        </Stack>
      );
    }

    if (summaryDetail.status === '待处理') {
      return (
        <Stack spacing={1.25}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>先在左侧调整分账，补齐人员或异常信息后，再进入确认流程。</Typography>
          <Button variant="contained" startIcon={<EditIcon />} onClick={beginDetailAdjust}>处理分账</Button>
        </Stack>
      );
    }

    if (summaryDetail.status === '待确认') {
      return (
        <Stack spacing={1.25}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>确认后，本订单提成会进入待发放。</Typography>
          <Button variant="outlined" startIcon={<EditIcon />} onClick={beginDetailAdjust}>调整分账</Button>
          <Button
            variant="outlined"
            color="warning"
            startIcon={<RestartAltIcon />}
            onClick={() => { setDeleteSummary(summaryDetail); setDeleteReason(''); }}
          >
            重置分账
          </Button>
          <Button variant="contained" color="success" onClick={confirmOrderFromDetail} disabled={detailActionLoading}>确认分账</Button>
          <TextField label="撤回原因" value={detailActionReason} onChange={(event) => setDetailActionReason(event.target.value)} size="small" placeholder="例如：线下调整、规则错误" fullWidth />
          <Button color="error" variant="outlined" onClick={withdrawOrderFromDetail} disabled={detailActionLoading || !detailActionReason.trim()}>撤回提成</Button>
        </Stack>
      );
    }

    if (summaryDetail.status === '待发放') {
      return (
        <Stack spacing={1.25}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>未发放提成可直接撤回，撤回后不进入月度发放。</Typography>
          <TextField label="撤回原因" value={detailActionReason} onChange={(event) => setDetailActionReason(event.target.value)} size="small" placeholder="例如：线下调整、金额错误" fullWidth />
          <Button color="error" variant="contained" onClick={withdrawOrderFromDetail} disabled={detailActionLoading || !detailActionReason.trim()}>撤回提成</Button>
        </Stack>
      );
    }

    if (summaryDetail.status === '已发放') {
      return (
        <Box sx={{ bgcolor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 1, p: 1.5 }}>
          <Typography variant="body2" sx={{ color: '#64748b' }}>提成已发放，第一版不支持系统内冲销，请财务线下处理。</Typography>
        </Box>
      );
    }

    return <Typography variant="body2" sx={{ color: '#64748b' }}>当前状态无需处理。</Typography>;
  };

  const renderFinanceMonthlyCell = (row: MonthlyCommissionPayout, columnId: FinanceMonthlyReportColumnId) => {
    switch (columnId) {
      case 'department':
        return row.department || '-';
      case 'businessComposition':
        return (
          <>
            <Typography variant="body2">正式 {row.formalOrderCount || 0} 笔</Typography>
            <Typography variant="caption" color="text.secondary">挽回 {row.recoveryOrderCount || 0} 笔</Typography>
          </>
        );
      case 'formalOrderPaidAmount':
        return formatCurrency(row.formalOrderPaidAmount || 0);
      case 'recoveryBusinessAmount':
        return formatCurrency(row.recoveryBusinessAmount || 0);
      case 'totalAmount':
        return <Typography fontWeight={900}>{formatCurrency(row.totalAmount)}</Typography>;
      case 'pendingConfirmAmount':
        return <Typography fontWeight={row.pendingConfirmAmount > 0 ? 900 : 500} color={row.pendingConfirmAmount > 0 ? 'info.main' : 'text.primary'}>{formatCurrency(row.pendingConfirmAmount)}</Typography>;
      case 'pendingPayAmount':
        return <Typography fontWeight={row.pendingPayAmount > 0 ? 900 : 500} color={row.pendingPayAmount > 0 ? 'warning.main' : 'text.primary'}>{formatCurrency(row.pendingPayAmount)}</Typography>;
      case 'paidAmount':
        return <Typography fontWeight={row.paidAmount > 0 ? 900 : 500} color={row.paidAmount > 0 ? 'success.main' : 'text.primary'}>{formatCurrency(row.paidAmount)}</Typography>;
      case 'correctionOriginalPaidAmount':
        return formatCurrency(row.correctionOriginalPaidAmount || 0);
      case 'correctionEntitlementAmount':
        return <Typography fontWeight={(row.correctionEntitlementAmount || 0) > 0 ? 900 : 500}>{formatCurrency(row.correctionEntitlementAmount || 0)}</Typography>;
      case 'correctionDelta':
        return <Typography variant="body2" color="secondary.main">{formatCurrency(row.correctionSupplementAmount || 0)} / {formatCurrency(row.correctionRecoverAmount || 0)}</Typography>;
      case 'statusDistribution':
        return (
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5, maxWidth: 280 }}>
            {monthlyPayoutStatusDistribution(row).map((item) => (
              <Chip key={item.label} label={`${item.label} ${item.count}`} size="small" color={item.color} variant={item.label === '已撤回' ? 'outlined' : 'filled'} />
            ))}
          </Stack>
        );
      default:
        return '-';
    }
  };

  const renderMonthlyPayout = () => (
    <>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mb: 2, alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
          <TextField
            label={payoutMode === 'mine' ? '我的提成月份' : '统计月份'}
            type="month"
            value={payoutPeriod}
            onChange={(event) => setPayoutPeriod(event.target.value)}
            size="small"
            InputLabelProps={{ shrink: true }}
          />
          {(payoutMode === 'mine' || canExportFinanceMonthlyReport) && (
            <Tooltip title={payoutRows.length ? (payoutMode === 'mine' ? '导出当前月份的提成汇总与逐笔明细' : '导出六张工作表的财务提成核对包') : '暂无可导出的提成数据'}>
              <span>
                <Button
                  variant="outlined"
                  startIcon={<FileDownloadIcon />}
                  disabled={!payoutRows.length || mineExporting}
                  onClick={() => void exportMonthlyStatement()}
                >
                  {payoutMode === 'mine' ? (mineExporting ? '导出中...' : '导出提成明细') : '导出财务核对表'}
                </Button>
              </span>
            </Tooltip>
          )}
        </Stack>
        {payoutMode === 'finance' && !hideEmbeddedFinanceMonthlyViewButton && (
          <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setFinanceMonthlyViewOpen(true)} sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, whiteSpace: 'nowrap' }}>
            视图设置
          </Button>
        )}
      </Stack>

      {payoutMode === 'mine' ? (
        payoutRows.length
          ? renderMinePayoutWorkspace()
          : (
            <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, py: 6, textAlign: 'center', color: '#9ca3af' }}>
              {payoutLoading ? '加载中...' : '暂无我的提成数据'}
            </Paper>
          )
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1, mb: 1.5 }}>
            {(payoutMode === 'finance' ? [
              { label: '正式订单实付总额', display: formatCurrency(financePeriodSummary?.formalOrderPaidAmount || 0), color: '#0f766e' },
              { label: '售后挽回成交额', display: formatCurrency(financePeriodSummary?.recoveryBusinessAmount || 0), color: '#7c3aed' },
              { label: '本月提成总额', display: formatCurrency(financePeriodSummary?.totalCommissionAmount || 0), color: '#111827' },
              { label: '待处理', display: `${financePeriodSummary?.pendingHandlingCount || 0} 笔`, color: '#64748b' },
              { label: '待确认', display: formatCurrency(financePeriodSummary?.pendingConfirmAmount || 0), color: '#7447F5' },
              { label: '待发放', display: formatCurrency(financePeriodSummary?.pendingPayAmount || 0), color: '#d97706' },
              { label: '已发放', display: formatCurrency(financePeriodSummary?.paidAmount || 0), color: '#16a34a' },
              { label: '待补发差额', display: formatCurrency(financePeriodSummary?.pendingCorrectionSupplementAmount || 0), color: '#7c3aed' },
              { label: '待追回差额', display: formatCurrency(financePeriodSummary?.pendingCorrectionRecoverAmount || 0), color: '#dc2626' },
              { label: '已撤回', display: formatCurrency(financePeriodSummary?.withdrawnAmount || 0), color: '#6b7280' },
            ] : [
              { label: '阶梯核算业绩', display: formatCurrency(monthlyPayoutSummary.monthlyPaidAmount), color: '#0f766e' },
              { label: '本月提成总额', display: formatCurrency(monthlyPayoutSummary.totalAmount), color: '#111827' },
              { label: '待确认', display: formatCurrency(monthlyPayoutSummary.pendingConfirmAmount), color: '#7447F5' },
              { label: '待发放', display: formatCurrency(monthlyPayoutSummary.pendingPayAmount), color: '#d97706' },
              { label: '已发放', display: formatCurrency(monthlyPayoutSummary.paidAmount), color: '#16a34a' },
              { label: '已撤回', display: formatCurrency(monthlyPayoutSummary.withdrawnAmount), color: '#6b7280' },
            ]).map((item) => (
              <Box key={item.label} sx={{ border: `1px solid ${moduleTokens.softLine}`, borderRadius: moduleRadius, px: 1.25, py: 0.85, bgcolor: '#fff' }}>
                <Typography variant="caption" sx={{ color: '#6b7280' }}>{item.label}</Typography>
                <Typography variant="subtitle1" sx={{ color: item.color, fontWeight: 800, lineHeight: 1.25 }}>
                  {item.display}
                </Typography>
              </Box>
            ))}
          </Box>
          <Paper elevation={0} sx={{ border: '1px solid #E8E4F1', borderRadius: 1.5, overflow: 'hidden', bgcolor: '#fff', mb: 2 }}>
            <Box sx={{ px: { xs: 1.5, md: 2 }, py: 1.5, borderBottom: '1px solid #e5e7eb' }}>
              <Typography variant="h6" fontWeight={900}>员工月度报告</Typography>
              <Typography variant="body2" color="text.secondary">先选择员工，再按“我的提成”相同口径核对阶梯、普通与售后挽回提成。</Typography>
            </Box>
            <Box sx={{ display: { xs: 'block', md: 'none' } }}>
              {visibleFinancePayoutRows.map((row) => {
                const ownerKey = monthlyPayoutOwnerKey(row);
                const selected = monthlyPayoutOwnerKey(selectedFinancePayoutRow || row) === ownerKey;
                return (
                  <Box key={ownerKey} sx={{ p: 1.5, borderBottom: '1px solid #e5e7eb', bgcolor: selected ? '#eff6ff' : '#fff' }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={900}>{formatOwnerDisplayName(row.ownerId, row.owner)}</Typography>
                        <Typography variant="caption" color="text.secondary">{row.orderCount} 个订单</Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">{row.orderCount} 笔业务</Typography>
                    </Stack>
                    <Box sx={{ mt: 1.25, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                      {FINANCE_MONTHLY_REPORT_COLUMNS.filter((column) => financeMonthlyVisibleColumnIds.includes(column.id)).map((column) => (
                        <Box key={column.id} sx={{ minWidth: 0, gridColumn: column.id === 'statusDistribution' ? '1 / -1' : 'auto' }}>
                          <Typography variant="caption" color="text.secondary">{column.label}</Typography>
                          <Box sx={{ mt: 0.2 }}>{renderFinanceMonthlyCell(row, column.id)}</Box>
                        </Box>
                      ))}
                    </Box>
                    <Button fullWidth size="small" variant={selected ? 'contained' : 'outlined'} startIcon={<VisibilityIcon />} sx={{ mt: 1.25 }} onClick={() => setSelectedFinancePayoutOwnerKey(ownerKey)}>
                      {selected ? '正在查看' : '查看月报'}
                    </Button>
                  </Box>
                );
              })}
            </Box>
            <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
              <Table size="small" sx={[moduleTableSx, { minWidth: Math.max(720, financeMonthlyTableMinWidth), tableLayout: 'fixed' }]}>
                <TableHead><TableRow>
                  <TableCell sx={{ position: 'sticky', left: 0, zIndex: 5, width: 180, minWidth: 180, bgcolor: '#f8fafc', boxShadow: '1px 0 0 #e5e7eb', whiteSpace: 'nowrap' }}>员工</TableCell>
                  {visibleFinanceMonthlyColumns.map((column) => (
                    <TableCell key={column.id} align={column.align} sx={{ width: column.width, minWidth: column.width, whiteSpace: 'nowrap' }}>{column.label}</TableCell>
                  ))}
                  <TableCell
                    data-testid="finance-monthly-sticky-action"
                    align="center"
                    sx={{ position: 'sticky', right: 0, zIndex: 5, width: 132, minWidth: 132, bgcolor: '#f8fafc', boxShadow: '-1px 0 0 #e5e7eb', whiteSpace: 'nowrap' }}
                  >操作</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {visibleFinancePayoutRows.map((row) => {
                    const ownerKey = monthlyPayoutOwnerKey(row);
                    const selected = monthlyPayoutOwnerKey(selectedFinancePayoutRow || row) === ownerKey;
                    return (
                      <TableRow key={ownerKey} hover selected={selected} sx={{ '& td:first-of-type': { borderLeft: selected ? '4px solid #7447F5' : '4px solid transparent' } }}>
                        <TableCell sx={{ position: 'sticky', left: 0, zIndex: 4, width: 180, minWidth: 180, bgcolor: selected ? '#eff6ff' : '#fff', boxShadow: '1px 0 0 #e5e7eb', whiteSpace: 'nowrap' }}><Typography fontWeight={900} noWrap>{formatOwnerDisplayName(row.ownerId, row.owner)}</Typography></TableCell>
                        {visibleFinanceMonthlyColumns.map((column) => (
                          <TableCell key={column.id} align={column.align} sx={{ width: column.width, minWidth: column.width, overflow: 'hidden' }}>
                            {renderFinanceMonthlyCell(row, column.id)}
                          </TableCell>
                        ))}
                        <TableCell align="center" sx={{ position: 'sticky', right: 0, zIndex: 4, width: 132, minWidth: 132, bgcolor: selected ? '#eff6ff' : '#fff', boxShadow: '-1px 0 0 #e5e7eb', whiteSpace: 'nowrap' }}><Button size="small" startIcon={<VisibilityIcon />} sx={{ whiteSpace: 'nowrap' }} onClick={() => setSelectedFinancePayoutOwnerKey(ownerKey)}>{selected ? '正在查看' : '查看月报'}</Button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {!payoutRows.length && <DataTableEmptyState label={payoutLoading ? '加载中...' : '暂无员工提成月报数据'} />}
            </TableContainer>
            <TablePagination
              component="div"
              count={payoutRows.length}
              page={currentFinanceMonthlyPage}
              rowsPerPage={financeMonthlyPageSize}
              rowsPerPageOptions={[10, 20, 50]}
              onPageChange={(_event, page) => setFinanceMonthlyPage(page)}
              onRowsPerPageChange={(event) => {
                setFinanceMonthlyPageSize(Number(event.target.value));
                setFinanceMonthlyPage(0);
              }}
              labelRowsPerPage="每页条数"
              labelDisplayedRows={formatPaginationRows}
              sx={{ borderTop: '1px solid #e5e7eb', bgcolor: '#fff' }}
            />
          </Paper>
          {selectedFinancePayoutRow && (
            <Stack spacing={1.5}>
              <Paper elevation={0} sx={{ px: { xs: 1.5, md: 2 }, py: 1.5, border: '1px solid #DDD2FF', borderRadius: 1.5, bgcolor: '#FAF9FD' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <Box>
                    <Typography variant="h6" fontWeight={900}>{formatOwnerDisplayName(selectedFinancePayoutRow.ownerId, selectedFinancePayoutRow.owner)} · {payoutPeriod} 月度报告</Typography>
                    <Typography variant="body2" color="text.secondary">{selectedFinancePayoutRow.department || '-'} · 与员工“我的提成”保持同一计算和展示口径</Typography>
                  </Box>
                  {canExportFinanceMonthlyReport && (
                    <Button variant="outlined" startIcon={<FileDownloadIcon />} disabled={mineExporting} onClick={() => void exportFinanceEmployeeStatement(selectedFinancePayoutRow)}>
                      {mineExporting ? '导出中...' : '导出员工明细'}
                    </Button>
                  )}
                </Stack>
              </Paper>
              <Paper elevation={0} sx={{ p: { xs: 1.5, md: 2 }, border: '1px solid #E8E4F1', borderRadius: 1.5 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 0.8 }}>
                  {[
                    { label: `正式订单 ${selectedFinancePayoutRow.formalOrderCount || 0} 笔`, value: formatCurrency(selectedFinancePayoutRow.formalOrderPaidAmount || 0), color: '#0f766e' },
                    { label: `售后挽回 ${selectedFinancePayoutRow.recoveryOrderCount || 0} 笔`, value: formatCurrency(selectedFinancePayoutRow.recoveryBusinessAmount || 0), color: '#7c3aed' },
                    { label: '本月提成总额', value: formatCurrency(selectedFinancePayoutRow.totalAmount), color: '#111827' },
                    { label: '待确认', value: formatCurrency(selectedFinancePayoutRow.pendingConfirmAmount), color: '#7447F5' },
                    { label: '待发放', value: formatCurrency(selectedFinancePayoutRow.pendingPayAmount), color: '#d97706' },
                    { label: '已发放', value: formatCurrency(selectedFinancePayoutRow.paidAmount), color: '#16a34a' },
                    { label: '更正原已发', value: formatCurrency(selectedFinancePayoutRow.correctionOriginalPaidAmount || 0), color: '#475569' },
                    { label: '更正后应得', value: formatCurrency(selectedFinancePayoutRow.correctionEntitlementAmount || 0), color: '#7c3aed' },
                    { label: '待补发 / 待追回', value: `${formatCurrency(selectedFinancePayoutRow.pendingCorrectionSupplementAmount || 0)} / ${formatCurrency(selectedFinancePayoutRow.pendingCorrectionRecoverAmount || 0)}`, color: '#dc2626' },
                  ].map((item) => (
                    <Box key={item.label} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, px: 1.1, py: 0.9, bgcolor: '#f8fafc' }}>
                      <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                      <Typography fontWeight={900} sx={{ color: item.color }}>{item.value}</Typography>
                    </Box>
                  ))}
                </Box>
                <Stack direction="row" spacing={0.6} sx={{ mt: 1.1, flexWrap: 'wrap', rowGap: 0.6 }}>
                  {monthlyPayoutStatusDistribution(selectedFinancePayoutRow).map((item) => (
                    <Chip key={item.label} label={`${item.label} ${item.count}笔`} size="small" color={item.color} variant={item.label === '已撤回' ? 'outlined' : 'filled'} />
                  ))}
                </Stack>
              </Paper>
              {renderMinePayoutWorkspace([selectedFinancePayoutRow])}
            </Stack>
          )}
        </>
      )}
    </>
  );

  return (
    <Box sx={{
      p: embedded ? 0 : 3,
      ...(embedded && tabValue === 0 ? {
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      } : {}),
    }}>
      {!embedded && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 2 }}>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>财务结算台</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
                订单分账负责确认每笔提成，提成发放负责实际付款，员工提成月报仅用于统计与对账。
              </Typography>
            </Box>
            {tabValue === 0 && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setOrderSplitViewOpen(true)}>
                  视图设置
                </Button>
                {canManageOrderSettlement && (
                  <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateSplitDialog}>
                    新建订单分账
                  </Button>
                )}
              </Stack>
            )}
          </Box>

          <ModuleTabs value={tabValue} onChange={(_event, value) => setTabValue(value)}>
            <Tab label="订单分账台" />
            <Tab label="员工提成月报" />
            <Tab label="规则配置" />
          </ModuleTabs>
        </>
      )}
      {embedded && tabValue === 0 && !hideEmbeddedOrderSplitViewButton && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setOrderSplitViewOpen(true)}>
            视图设置
          </Button>
            {canManageOrderSettlement && (
              <Button variant="contained" startIcon={<AddIcon />} onClick={openCreateSplitDialog}>
                新建订单分账
              </Button>
            )}
          </Stack>
        </Box>
      )}

      {tabValue === 0 && (
        <>
          {renderOrderStatusBar()}
          {renderOrderToolbar()}
          {renderOrderSplitTable()}
        </>
      )}

      {tabValue === 1 && renderMonthlyPayout()}

      {tabValue === 2 && <CommissionRuleConfig />}

      <Dialog
        open={financeReportOpen}
        onClose={() => { if (!financeReportExporting) setFinanceReportOpen(false); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogCloseTitle onClose={() => { if (!financeReportExporting) setFinanceReportOpen(false); }}>导出财务提成月度核对表</DialogCloseTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">
              将生成包含“月度核对总览、员工汇总、逐笔明细、正式订单阶梯核对、发放与撤销记录、异常与口径说明”的Excel财务核对包。
            </Alert>
            <TextField label="统计月份" value={payoutPeriod} size="small" fullWidth InputProps={{ readOnly: true }} />
            <FormControl size="small" fullWidth>
              <InputLabel>导出范围</InputLabel>
              <Select
                label="导出范围"
                value={financeReportScope}
                onChange={(event) => {
                  setFinanceReportScope(event.target.value as 'all' | 'department' | 'employee');
                  setFinanceReportDepartmentId('');
                  setFinanceReportOwnerId('');
                }}
              >
                <MenuItem value="all">全部员工</MenuItem>
                <MenuItem value="department">指定部门</MenuItem>
                <MenuItem value="employee">指定员工</MenuItem>
              </Select>
            </FormControl>
            {financeReportScope === 'department' && (
              <FormControl size="small" fullWidth>
                <InputLabel>选择部门</InputLabel>
                <Select label="选择部门" value={financeReportDepartmentId} onChange={(event) => setFinanceReportDepartmentId(event.target.value)}>
                  {departments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            {financeReportScope === 'employee' && (
              <FormControl size="small" fullWidth>
                <InputLabel>选择员工</InputLabel>
                <Select label="选择员工" value={financeReportOwnerId} onChange={(event) => setFinanceReportOwnerId(event.target.value)}>
                  {activeEmployees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{formatEmployeeDisplayName(employee)}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1.5, py: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Checkbox checked={financeReportIncludeWithdrawn} onChange={(event) => setFinanceReportIncludeWithdrawn(event.target.checked)} />
                <Box>
                  <Typography variant="body2" fontWeight={800}>包含已撤回及历史发放记录</Typography>
                  <Typography variant="caption" color="text.secondary">建议保持勾选，便于财务追溯旧分账轮次和历史发放留痕。
                  </Typography>
                </Box>
              </Stack>
            </Box>
            <TextField
              label="导出原因 *"
              value={financeReportReason}
              onChange={(event) => setFinanceReportReason(event.target.value)}
              placeholder="例如：2026年7月员工提成与工资发放核对"
              multiline
              minRows={2}
              inputProps={{ maxLength: 500 }}
              fullWidth
            />
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f8fafc' }}>
              <Typography variant="body2" fontWeight={800}>预计导出 {financeReportRows.length} 名员工的月度提成</Typography>
              <Typography variant="caption" color="text.secondary">实际逐笔数量、异常数量和发放记录以服务端生成时的完整数据为准。</Typography>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFinanceReportOpen(false)} disabled={financeReportExporting}>取消</Button>
          <Button
            variant="contained"
            startIcon={<FileDownloadIcon />}
            disabled={financeReportExporting || !financeReportReason.trim() || (financeReportScope === 'department' && !financeReportDepartmentId) || (financeReportScope === 'employee' && !financeReportOwnerId)}
            onClick={() => void submitFinanceMonthlyReport()}
          >
            {financeReportExporting ? '生成中...' : '生成并下载Excel'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(financeReportError)} onClose={() => setFinanceReportError('')} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setFinanceReportError('')}>月度报告导出失败</DialogCloseTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="error">{financeReportError}</Alert>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.75 }}>处理建议</Typography>
              <Typography variant="body2" color="text.secondary">
                请核对统计月份、导出范围和网络连接后重试；如果重复出现，请记录统计月份并联系系统管理员。
              </Typography>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setFinanceReportError('')}>知道了</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(mineDetailRow)} onClose={() => setMineDetailRow(null)} maxWidth="lg" fullWidth>
        <DialogCloseTitle onClose={() => setMineDetailRow(null)}>
          {mineDetailRow ? `${mineDetailRow.typeLabel} · 计算详情` : '提成计算详情'}
        </DialogCloseTitle>
        <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
          {mineDetailRow && (
            <Stack spacing={2}>
              <Paper elevation={0} sx={{ border: '1px solid #E8E4F1', borderRadius: 1.5, p: 2, bgcolor: '#fff' }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1.5 }}>
                  {[
                    { label: '提成类型', value: mineDetailRow.typeLabel },
                    { label: '客户', value: mineDetailRow.title },
                    { label: '订单号', value: mineDetailRow.subtitle },
                    {
                      label: '提成方案',
                      value: mineDetailRow.commissions[0]?.payoutPlanSnapshot?.name
                        || mineDetailRow.commissions[0]?.payoutPlanName
                        || '自定义方案',
                    },
                    {
                      label: '方案版本',
                      value: mineDetailRow.commissions[0]?.payoutPlanSnapshot?.version
                        || mineDetailRow.commissions[0]?.payoutPlanVersion
                        ? `v${mineDetailRow.commissions[0]?.payoutPlanSnapshot?.version || mineDetailRow.commissions[0]?.payoutPlanVersion}`
                        : '未记录',
                    },
                    { label: '业绩金额', value: formatCurrency(mineDetailRow.performanceAmount) },
                    { label: '提成金额', value: formatCurrency(mineDetailRow.commissionAmount) },
                  ].map((item) => (
                    <Box key={item.label} sx={{ minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                      <Typography variant="body1" fontWeight={900} sx={{ mt: 0.25, overflowWrap: 'anywhere' }}>{item.value}</Typography>
                    </Box>
                  ))}
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                  {mineDetailRow.calculationText}
                </Typography>
              </Paper>

              {mineDetailRow.tierSnapshot && (
                <Alert severity="info" variant="outlined">
                  月度阶梯提成按照当月参与累计的业绩总额确定统一档位；下表每笔提成均按当前月度档位计算，月末结算后保留规则快照。
                </Alert>
              )}

              <Paper elevation={0} sx={{ border: '1px solid #E8E4F1', borderRadius: 1.5, overflow: 'hidden', bgcolor: '#fff' }}>
                <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #e5e7eb' }}>
                  <Typography variant="subtitle1" fontWeight={900}>参与计算明细</Typography>
                  <Typography variant="caption" color="text.secondary">共 {mineDetailRow.commissions.length} 笔</Typography>
                </Box>
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table size="small" sx={[moduleTableSx, { minWidth: 1000 }]}>
                    <TableHead>
                      <TableRow>
                        <TableCell>客户</TableCell>
                        <TableCell>订单号</TableCell>
                        <TableCell>角色</TableCell>
                        <TableCell>业务成交时间</TableCell>
                        <TableCell align="right">业绩金额</TableCell>
                        <TableCell>计算说明</TableCell>
                        <TableCell align="right">提成金额</TableCell>
                        <TableCell align="center">状态</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {visibleMineCalculationDetailRows.map((commission) => (
                        <TableRow key={commission.id} hover>
                          <TableCell><Typography variant="body2" fontWeight={800}>{commission.customerName || '未命名客户'}</Typography></TableCell>
                          <TableCell><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{commission.orderNo || '-'}</Typography></TableCell>
                          <TableCell>{commission.role}</TableCell>
                          <TableCell>{commission.paymentDate ? formatDate(commission.paymentDate, 'yyyy-MM-dd HH:mm') : '-'}</TableCell>
                          <TableCell align="right">{formatCurrency(Number(commission.performanceAmount || commission.orderAmount || 0))}</TableCell>
                          <TableCell sx={{ maxWidth: 320 }}>
                            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
                              {commission.formulaText || commission.calculationNote || commission.payoutPlanName || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight={900}>
                              {formatCurrency(getDisplayCommissionAmount(commission, mineDetailRow.tierSnapshot))}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              size="small"
                              label={getMineCommissionStatusLabel(commission.status)}
                              color={getCommissionStatusColor(getMineCommissionStatusLabel(commission.status))}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination
                  component="div"
                  count={mineCalculationDetailRows.length}
                  page={currentMineCalculationDetailPage}
                  rowsPerPage={mineCalculationDetailPageSize}
                  rowsPerPageOptions={[10, 20, 50]}
                  onPageChange={(_event, page) => setMineCalculationDetailPage(page)}
                  onRowsPerPageChange={(event) => {
                    setMineCalculationDetailPageSize(Number(event.target.value));
                    setMineCalculationDetailPage(0);
                  }}
                  labelRowsPerPage="每页条数"
                  labelDisplayedRows={formatPaginationRows}
                  sx={{ borderTop: '1px solid #e5e7eb', bgcolor: '#fff' }}
                />
              </Paper>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMineDetailRow(null)}>关闭</Button>
        </DialogActions>
      </Dialog>

      <BusinessExportDialog
        open={orderSplitExportOpen}
        title="导出订单分账"
        expectedCount={orderPagination.total}
        currentColumnCount={visibleOrderSplitColumns.length}
        onClose={() => setOrderSplitExportOpen(false)}
        onRequestExport={handleExportOrderSettlements}
      />

      <OperationFeedbackDialog
        open={Boolean(settlementActionMessage)}
        severity={settlementActionMessage?.type}
        message={settlementActionMessage?.text || ''}
        onClose={() => setSettlementActionMessage(null)}
      />

      <Dialog open={createSplitOpen} onClose={closeCreateSplitDialog} maxWidth="lg" fullWidth>
        <DialogCloseTitle onClose={closeCreateSplitDialog}>新建订单分账</DialogCloseTitle>
        <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
          <Stack spacing={2}>
            <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, p: 2 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} sx={{ alignItems: { xs: 'stretch', md: 'center' } }}>
                <TextField
                  label="搜索可新建分账订单"
                  placeholder="订单号/客户"
                  value={creatableOrderSearch}
                  onChange={(event) => setCreatableOrderSearch(event.target.value)}
                  size="small"
                  sx={{ minWidth: { xs: 'auto', md: 260 } }}
                />
                <FormControl size="small" sx={{ minWidth: { xs: 'auto', md: 360 }, flex: 1 }}>
                  <InputLabel shrink>选择订单</InputLabel>
                  <Select
                    value={selectedCreatableOrderId}
                    label="选择订单"
                    onChange={(event) => handleSelectCreatableOrder(event.target.value)}
                    displayEmpty
                    renderValue={(value) => {
                      if (!value) return creatableOrderLoading ? '加载中...' : '选择一笔未生成分账的已确认订单';
                      const order = creatableOrderRows.find((item) => item.orderId === value);
                      return order ? `${order.orderNo} / ${order.customerName} / ${formatCurrency(order.orderAmount)}` : '选择订单';
                    }}
                  >
                    {creatableOrderRows.map((order) => (
                      <MenuItem key={order.orderId} value={order.orderId}>
                        {order.orderNo} / {order.customerName} / {formatCurrency(order.orderAmount)}
                      </MenuItem>
                    ))}
                    {!creatableOrderRows.length && (
                      <MenuItem value="" disabled>
                        {creatableOrderLoading ? '加载中...' : '暂无可新建分账的订单'}
                      </MenuItem>
                    )}
                  </Select>
                </FormControl>
                <Button variant="outlined" onClick={() => fetchCreatableOrders()} disabled={creatableOrderLoading}>
                  刷新
                </Button>
              </Stack>
              <Typography variant="caption" sx={{ display: 'block', color: '#64748b', mt: 1 }}>
                仅显示已确认且当前没有有效分账的订单。
              </Typography>
            </Paper>

            {selectedCreatableOrder ? (
              <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, p: 2 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1, mb: 2 }}>
                  {[
                    { label: '订单号', value: selectedCreatableOrder.orderNo },
                    { label: '客户', value: selectedCreatableOrder.customerName },
                    { label: '实付金额', value: formatCurrency(selectedCreatableOrder.orderAmount) },
                    { label: '付款日期', value: formatDate(selectedCreatableOrder.paymentDate, 'yyyy-MM-dd HH:mm:ss') },
                  ].map((item) => (
                    <Box key={item.label} sx={{ bgcolor: '#fff', border: '1px solid #e5e7eb', borderRadius: 1, px: 1.25, py: 1 }}>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>{item.label}</Typography>
                      <Typography variant="body2" sx={{ color: '#111827', fontWeight: 800, overflowWrap: 'anywhere' }}>{item.value}</Typography>
                    </Box>
                  ))}
                </Box>
                {renderDetailSplitEditor()}
              </Paper>
            ) : (
              <Paper elevation={0} sx={{ border: '1px dashed #cbd5e1', borderRadius: 1, p: 3, textAlign: 'center', color: '#64748b' }}>
                <Typography variant="body2">先选择一笔订单，再填写分账人员和金额。</Typography>
              </Paper>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreateSplitDialog} disabled={splitSaving}>取消</Button>
          <Button
            variant="contained"
            disabled={splitSaving || !splitReason.trim() || splitRows.length === 0 || splitRows.some((row) => !row.ownerId || !row.payoutPlanId)}
            onClick={handleSaveSplitRows}
          >
            {splitSaving ? '保存中...' : '保存分账'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(deleteSummary)} onClose={closeDeleteOrderSplitDialog} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={closeDeleteOrderSplitDialog}>{deleteSummary?.sourceOrderDeleted ? '清理废弃记录' : '重置订单分账'}</DialogCloseTitle>
        <DialogContent dividers>
          {deleteSummary && (
            <Stack spacing={1.25}>
              <Alert severity="warning">
                {deleteSummary.sourceOrderDeleted
                  ? '清理后该记录将从财务订单分账列表隐藏，底层业务、提成及清理审计留痕仍保留。'
                  : '重置后会清空该订单当前保存的人员分账明细，并退回到“待处理”状态，之后可重新处理分账。'}
              </Alert>
              <Box sx={{ border: `1px solid ${moduleTokens.line}`, borderRadius: moduleRadius, p: 1.25, bgcolor: moduleTokens.subtle }}>
                <Typography variant="body2" sx={{ fontWeight: 900 }}>{deleteSummary.orderNo}</Typography>
                <Typography variant="body2" sx={{ color: moduleTokens.muted }}>
                  {deleteSummary.customerName} · {deleteSummary.thirdPartyOrderNo || '-'}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  实付金额：<Box component="span" sx={{ color: moduleTokens.green, fontWeight: 900 }}>{formatCurrency(deleteSummary.orderAmount)}</Box>
                </Typography>
              </Box>
              <TextField
                label={deleteSummary.sourceOrderDeleted ? '清理原因' : '重置原因'}
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder={deleteSummary.sourceOrderDeleted ? '例如：源订单已废弃，清理财务列表残留' : '例如：人员选错、方案错误，需要重新分账'}
                required
                fullWidth
                multiline
                minRows={3}
                autoFocus
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteOrderSplitDialog} disabled={deleteLoading}>取消</Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmDeleteOrderSplit}
            disabled={deleteLoading || !deleteReason.trim()}
          >
            {deleteLoading ? (deleteSummary?.sourceOrderDeleted ? '清理中...' : '重置中...') : (deleteSummary?.sourceOrderDeleted ? '确认清理' : '确认重置')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(reopenSummary)}
        onClose={() => { if (!reopenLoading) { setReopenSummary(null); setReopenReason(''); } }}
        maxWidth="sm"
        fullWidth
      >
        <DialogCloseTitle onClose={() => { if (!reopenLoading) { setReopenSummary(null); setReopenReason(''); } }}>重新分账</DialogCloseTitle>
        <DialogContent dividers>
          {reopenSummary && (
            <Stack spacing={1.25}>
              <Alert severity="warning">重新分账会保留已撤回轮次作为只读历史，并将订单退回“待处理”。保存新分账时会创建新的分账轮次。</Alert>
              <Box sx={{ border: `1px solid ${moduleTokens.line}`, borderRadius: moduleRadius, p: 1.25, bgcolor: moduleTokens.subtle }}>
                <Typography variant="body2" sx={{ fontWeight: 900 }}>{reopenSummary.orderNo}</Typography>
                <Typography variant="body2" sx={{ color: moduleTokens.muted }}>{reopenSummary.customerName} · {reopenSummary.thirdPartyOrderNo || '-'}</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>实付金额：<Box component="span" sx={{ color: moduleTokens.green, fontWeight: 900 }}>{formatCurrency(reopenSummary.orderAmount)}</Box></Typography>
              </Box>
              <TextField label="重新分账原因" value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} multiline minRows={3} required fullWidth autoFocus />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setReopenSummary(null); setReopenReason(''); }} disabled={reopenLoading}>取消</Button>
          <Button variant="contained" onClick={() => void confirmReopenOrderSplit()} disabled={reopenLoading || !reopenReason.trim()}>{reopenLoading ? '处理中...' : '确认重新分账'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(summaryDetail)}
        onClose={closeSettlementDetail}
        maxWidth={false}
        fullWidth
        PaperProps={{ sx: { width: '1480px', maxWidth: 'calc(100% - 32px)' } }}
      >
        <DialogCloseTitle onClose={closeSettlementDetail}>订单分账处理</DialogCloseTitle>
        <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
          {summaryDetail && (
            <Stack spacing={1.5}>
              <Paper
                elevation={0}
                sx={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 1,
                  bgcolor: '#fff',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', lg: 'minmax(320px, 1.4fr) repeat(4, minmax(110px, 0.65fr))' },
                    gap: 0,
                    alignItems: 'stretch',
                  }}
                >
                  <Box sx={{ px: 2, py: 1.5, borderRight: { lg: '1px solid #e5e7eb' }, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, mb: 0.5 }}>
                      <Typography variant="h6" sx={{ color: '#19142C', fontWeight: 900, letterSpacing: 0 }}>
                        {summaryDetail.orderNo}
                      </Typography>
                      <SettlementStatusChip status={summaryDetail.status} />
                      {summaryDetail.sourceOrderDeleted && <Chip label="源订单已删除" size="small" />}
                    </Stack>
                    <Typography variant="body2" sx={{ color: '#64748b', overflowWrap: 'anywhere' }}>
                      {summaryDetail.customerName} · {summaryDetail.orderType || '-'} · {formatDate(summaryDetail.paymentDate, 'yyyy-MM-dd HH:mm:ss')}
                    </Typography>
                  </Box>
                  {[
                    { label: '实付金额', value: formatCurrency(summaryDetail.orderAmount), color: '#19142C' },
                    { label: '分账总额', value: formatCurrency(summaryDetail.totalCommissionAmount), color: '#d97706' },
                    { label: '提成角色', value: `${summaryDetail.splitSummary.length} 个`, color: '#7447F5' },
                    {
                      label: '凭证状态',
                      value: settlementOrderLoading ? '加载中' : getOrderSettlementEvidenceStatus(summaryDetail, settlementOrderDetail),
                      color: getOrderSettlementRisks(summaryDetail, settlementOrderDetail).length ? '#d97706' : '#059669',
                    },
                  ].map((item) => (
                    <Box
                      key={item.label}
                      sx={{
                        px: 1.5,
                        py: 1.5,
                        borderTop: { xs: '1px solid #e5e7eb', lg: 0 },
                        borderRight: { lg: '1px solid #e5e7eb' },
                      }}
                    >
                      <Typography variant="caption" sx={{ display: 'block', color: '#64748b', lineHeight: 1.2 }}>{item.label}</Typography>
                      <Typography variant="body2" sx={{ color: item.color, fontWeight: 900, mt: 0.35 }}>{item.value}</Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>

              <OrderSettlementBusinessPaymentSummary
                summary={summaryDetail}
                order={settlementOrderDetail}
                loading={settlementOrderLoading}
                formatPerson={formatOwnerDisplayName}
                onViewCustomer={() => void viewCustomer(summaryDetail)}
                onViewOrder={() => void viewOrder(summaryDetail)}
              />

              {renderOrderSettlementRisks(summaryDetail)}

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
                      <Typography variant="subtitle2" sx={{ color: '#19142C', fontWeight: 900 }}>
                        {detailEditMode ? '分账明细编辑' : '分账明细'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#64748b' }}>
                        按角色核对人员、方案和金额，确认无误后进入右侧操作。
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ p: 1.5, bgcolor: '#f8fafc' }}>
                    {detailEditMode ? (
                      renderDetailSplitEditor()
                    ) : (
                      <Stack spacing={1.5}>
                        {Array.from(summaryDetail.commissions.reduce((groups, commission) => {
                          const version = commission.settlementVersion || 1;
                          groups.set(version, [...(groups.get(version) || []), commission]);
                          return groups;
                        }, new Map<number, Commission[]>()).entries())
                          .sort(([left], [right]) => right - left)
                          .map(([version, commissions], groupIndex) => (
                            <Box key={version}>
                              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                <Typography variant="subtitle2" fontWeight={900}>第 {version} 轮分账</Typography>
                                <Chip size="small" label={groupIndex === 0 ? '当前/最新轮次' : '历史轮次'} color={groupIndex === 0 ? 'primary' : 'default'} variant={groupIndex === 0 ? 'filled' : 'outlined'} />
                              </Stack>
                              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(260px, 310px))' }, gap: 1.25, alignItems: 'stretch', justifyContent: 'start' }}>
                                {commissions.map((commission) => renderSplitSummaryCard(commission))}
                              </Box>
                            </Box>
                          ))}
                      </Stack>
                    )}
                  </Box>
                </Paper>

                <Stack
                  data-testid="order-settlement-detail-sidebar"
                  spacing={1.5}
                  sx={{ minWidth: 0, minHeight: 0, height: { xs: 'auto', lg: '100%' } }}
                >
                  <Paper elevation={0} sx={{ border: '1px solid #dbeafe', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                    <Box sx={{ px: 1.5, py: 1.1, borderBottom: '1px solid #dbeafe', bgcolor: '#FAF9FD' }}>
                      <Typography variant="subtitle2" sx={{ color: '#7447F5', fontWeight: 900 }}>当前动作</Typography>
                    </Box>
                    <Box sx={{ p: 1.5 }}>
                      {renderSettlementDetailActions()}
                    </Box>
                  </Paper>

                  <SettlementOperationTimeline compact events={buildOrderSettlementEvents()} />
                </Stack>
              </Box>
            </Stack>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={financeMonthlyViewOpen} onClose={() => setFinanceMonthlyViewOpen(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setFinanceMonthlyViewOpen(false)}>月度报告视图设置</DialogCloseTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" sx={{ color: '#64748b' }}>
              员工和操作始终固定显示。勾选中间需要核对的字段，设置会保存在当前浏览器，并同步用于移动端卡片。
            </Typography>
            {(['业务数据', '提成状态', '更正与差额'] as const).map((group) => (
              <Box key={group}>
                <Typography variant="subtitle2" sx={{ mb: 0.75, color: '#334155', fontWeight: 900 }}>{group}</Typography>
                <Box sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                  {FINANCE_MONTHLY_REPORT_COLUMNS.filter((column) => column.group === group).map((column, index) => (
                    <Box key={column.id} sx={{ display: 'flex', alignItems: 'center', minHeight: 46, px: 1, borderTop: index ? '1px solid #eef2f7' : 0 }}>
                      <Checkbox checked={financeMonthlyVisibleColumnIds.includes(column.id)} onChange={() => toggleFinanceMonthlyColumn(column.id)} sx={{ p: 0.75, mr: 0.5 }} />
                      <Typography variant="body2">{column.label}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetFinanceMonthlyView}>恢复默认</Button>
          <Button variant="contained" onClick={() => setFinanceMonthlyViewOpen(false)}>完成</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={orderSplitViewOpen} onClose={() => setOrderSplitViewOpen(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setOrderSplitViewOpen(false)}>订单分账台视图设置</DialogCloseTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>
              勾选后会显示在订单分账台中，设置会保存在当前浏览器。
            </Typography>
            <TextField
              label="固定前 N 列"
              type="number"
              size="small"
              value={orderSplitViewConfig.frozenColumnCount}
              onChange={(event) => {
                const nextValue = Math.max(0, Math.min(Number(event.target.value) || 0, visibleOrderSplitColumns.length));
                setOrderSplitViewConfig((prev) => ({ ...prev, frozenColumnCount: nextValue }));
              }}
              inputProps={{ min: 0, max: visibleOrderSplitColumns.length }}
              helperText="横向滚动时，前 N 个已显示字段会固定在左侧。"
              sx={{ maxWidth: 220 }}
            />
            <Box sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
              {orderedOrderSplitColumns.map((column, index) => {
                const isDragging = draggedOrderSplitColumnId === column.id;
                const isDragTarget = dragOverOrderSplitColumnId === column.id;
                return (
                  <Box
                    key={column.id}
                    data-order-split-column-row="true"
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      if (draggedOrderSplitColumnId && draggedOrderSplitColumnId !== column.id) {
                        setDragOverOrderSplitColumnId(column.id);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverOrderSplitColumnId === column.id) setDragOverOrderSplitColumnId(null);
                    }}
                    onDrop={(event) => handleOrderSplitColumnDrop(event, column.id)}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '28px 40px 1fr',
                      alignItems: 'center',
                      minHeight: 48,
                      px: 1.25,
                      borderTop: index === 0 ? 0 : '1px solid #eef2f7',
                      bgcolor: isDragTarget ? '#e3f2fd' : '#fff',
                      opacity: isDragging ? 0.38 : 1,
                      outline: isDragTarget ? '2px solid #90caf9' : '2px solid transparent',
                      outlineOffset: -2,
                      transform: isDragging ? 'scale(0.99)' : 'none',
                      transition: 'background-color 120ms ease, opacity 120ms ease, transform 120ms ease, outline-color 120ms ease',
                      '&:hover': {
                        bgcolor: isDragTarget ? '#e3f2fd' : '#f8fafc',
                      },
                      '&:hover .order-split-drag-handle': {
                        opacity: 1,
                      },
                    }}
                  >
                    <Tooltip title="拖动排序">
                      <Box
                        className="order-split-drag-handle"
                        draggable
                        onDragStart={(event) => handleOrderSplitColumnDragStart(event, column.id)}
                        onDragEnd={clearOrderSplitColumnDrag}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: isDragging ? '#1976d2' : '#94a3b8',
                          cursor: 'grab',
                          opacity: isDragging ? 1 : 0.35,
                          '&:active': { cursor: 'grabbing' },
                        }}
                      >
                        <DragIndicatorIcon fontSize="small" />
                      </Box>
                    </Tooltip>
                    <Checkbox
                      checked={orderSplitViewConfig.visibleColumnIds.includes(column.id)}
                      onChange={() => toggleOrderSplitColumn(column.id)}
                      disabled={orderSplitViewConfig.visibleColumnIds.length <= 1 && orderSplitViewConfig.visibleColumnIds.includes(column.id)}
                      sx={{ p: 0.75 }}
                    />
                    <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {column.label}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetOrderSplitView}>恢复默认</Button>
        </DialogActions>
      </Dialog>

      {orderDetail && (
        <OrderDetail order={orderDetail} open={Boolean(orderDetail)} onClose={() => setOrderDetail(null)} />
      )}

      {customerDetail && (
        <CustomerDetail
          customer={customerDetail}
          open={Boolean(customerDetail)}
          onClose={() => setCustomerDetail(null)}
          readOnly
        />
      )}
    </Box>
  );
};

export default Commission;
