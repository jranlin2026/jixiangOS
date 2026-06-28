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
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { commissionApi, commissionRuleApi, recoveryOrderApi, settingsApi } from '../../api';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import TableViewSettingsDialog, { type TableViewColumnConfig } from '../../shared/components/TableViewSettingsDialog';
import { useTableViewConfig } from '../../shared/hooks/useTableViewConfig';
import type { Commission, CommissionPayoutPlan, CommissionRoleConfig } from '../../types/commission';
import type { RecoveryOrder, RecoveryOrderSettlementStatus, RecoverySettlementInput } from '../../types/recoveryOrder';
import type { User } from '../../types/settings';
import useAuthStore from '../../store/useAuthStore';

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

type RecoverySettlementFilterStatus = RecoveryOrderSettlementStatus | '全部';

type SettlementRow = {
  role: string;
  ownerId: string;
  payoutPlanId: string;
  commissionAmount: string;
  performanceAmount: string;
  calculationNote: string;
};

const emptyRow: SettlementRow = {
  role: '售后',
  ownerId: '',
  payoutPlanId: CUSTOM_PLAN_ID,
  commissionAmount: '',
  performanceAmount: '',
  calculationNote: '',
};

const STATUS_OPTIONS: Array<{ value: RecoverySettlementFilterStatus; label: string; color: string }> = [
  { value: '全部', label: '全部', color: shell.blue },
  { value: '待分账', label: '待分账', color: shell.amber },
  { value: '已分账', label: '已分账', color: shell.green },
];

type RecoverySettlementColumnId =
  | 'recoveryNo'
  | 'customerName'
  | 'thirdPartyOrderNo'
  | 'originalProduct'
  | 'originalAmount'
  | 'recoveryAmount'
  | 'recoveryUserName'
  | 'status'
  | 'auditedAt'
  | 'actions';

const RECOVERY_SETTLEMENT_COLUMNS: Array<TableViewColumnConfig & { id: RecoverySettlementColumnId }> = [
  { id: 'recoveryNo', label: '挽回订单号' },
  { id: 'customerName', label: '客户' },
  { id: 'thirdPartyOrderNo', label: '第三方订单' },
  { id: 'originalProduct', label: '原产品' },
  { id: 'originalAmount', label: '原付款' },
  { id: 'recoveryAmount', label: '挽回金额' },
  { id: 'recoveryUserName', label: '挽回人员' },
  { id: 'status', label: '分账状态' },
  { id: 'auditedAt', label: '审核时间' },
  { id: 'actions', label: '操作' },
];

const DEFAULT_VISIBLE_COLUMNS = RECOVERY_SETTLEMENT_COLUMNS.map((column) => column.id);

interface RecoverySettlementProps {
  viewSettingsTrigger?: number;
  createSettlementTrigger?: number;
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

function getSettlementStatus(order: RecoveryOrder): RecoveryOrderSettlementStatus {
  return order.settlementStatus || (order.status === '已分账' ? '已分账' : order.status === '待分账' ? '待分账' : '未分账');
}

function getStatusChipSx(status: RecoveryOrderSettlementStatus) {
  if (status === '已分账') return { bgcolor: '#ecfdf5', color: shell.green };
  if (status === '待分账') return { bgcolor: '#fff7ed', color: shell.amber };
  return { bgcolor: '#eef4fb', color: shell.muted };
}

const RecoverySettlement: React.FC<RecoverySettlementProps> = ({
  viewSettingsTrigger = 0,
  createSettlementTrigger = 0,
}) => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const [rows, setRows] = useState<RecoveryOrder[]>([]);
  const [allRowsForCounts, setAllRowsForCounts] = useState<RecoveryOrder[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RecoverySettlementFilterStatus>('全部');
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<CommissionRoleConfig[]>([]);
  const [plans, setPlans] = useState<CommissionPayoutPlan[]>([]);
  const [detailOrder, setDetailOrder] = useState<RecoveryOrder | null>(null);
  const [detailCommissions, setDetailCommissions] = useState<Commission[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState<RecoveryOrder | null>(null);
  const [settlementRows, setSettlementRows] = useState<SettlementRow[]>([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecoveryOrder | null>(null);

  const {
    viewConfig,
    visibleColumns,
    visibleColumnIds,
    toggleColumn,
    reorderColumn,
    setFrozenColumnCount,
    resetViewConfig,
  } = useTableViewConfig('finance_recovery_settlement_table_view', RECOVERY_SETTLEMENT_COLUMNS, DEFAULT_VISIBLE_COLUMNS);

  const activeUsers = useMemo(
    () => users.filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active'),
    [users],
  );
  const activeRoles = useMemo(() => roles.filter((role) => role.isActive), [roles]);
  const activePlans = useMemo(() => plans.filter((plan) => plan.isActive), [plans]);

  const load = useCallback(async () => {
    const [allRes, usersRes, rolesRes, plansRes] = await Promise.all([
      recoveryOrderApi.fetchRecoveryOrders({
        search,
        settlementStatus: '全部',
        page: 1,
        pageSize: 10000,
      }),
      settingsApi.fetchUsers({ employmentStatus: 'active' }),
      commissionRuleApi.getCommissionRoleConfigs({ isActive: true }),
      commissionRuleApi.getCommissionPayoutPlans(),
    ]);
    if (allRes.code === 0) {
      const settlementReadyRows = allRes.data.items.filter((item) => {
        const rowStatus = getSettlementStatus(item);
        return rowStatus === '待分账' || rowStatus === '已分账';
      });
      const filteredRows = status === '全部'
        ? settlementReadyRows
        : settlementReadyRows.filter((item) => getSettlementStatus(item) === status);
      const start = page * rowsPerPage;
      setRows(filteredRows.slice(start, start + rowsPerPage));
      setTotal(filteredRows.length);
      setAllRowsForCounts(settlementReadyRows);
    }
    if (usersRes.code === 0) setUsers(usersRes.data);
    if (rolesRes.code === 0) setRoles(rolesRes.data);
    if (plansRes.code === 0) setPlans(plansRes.data);
  }, [page, rowsPerPage, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [search, status]);

  useEffect(() => {
    if (viewSettingsTrigger > 0) setViewSettingsOpen(true);
  }, [viewSettingsTrigger]);

  useEffect(() => {
    if (createSettlementTrigger <= 0) return;
    const waiting = rows.find((row) => getSettlementStatus(row) === '待分账')
      || allRowsForCounts.find((row) => getSettlementStatus(row) === '待分账');
    if (waiting) {
      openSettlement(waiting);
    } else {
      setMessage({ type: 'error', text: '当前没有待分账的售后挽回订单' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSettlementTrigger]);

  const counts = useMemo(() => {
    const base = { 全部: allRowsForCounts.length, 待分账: 0, 已分账: 0 };
    allRowsForCounts.forEach((row) => {
      const rowStatus = getSettlementStatus(row);
      if (rowStatus === '待分账' || rowStatus === '已分账') base[rowStatus] += 1;
    });
    return base;
  }, [allRowsForCounts]);

  const openDetail = async (order: RecoveryOrder) => {
    setDetailOrder(order);
    setDetailCommissions([]);
    setDetailLoading(true);
    try {
      const commissionIds = new Set(order.commissionIds || []);
      const res = await commissionApi.fetchCommissions({ page: 1, pageSize: 10000 });
      if (res.code !== 0) {
        setMessage({ type: 'error', text: res.message || '读取售后挽回分账明细失败' });
        return;
      }
      const items = res.data.items.filter((commission) => (
        commission.sourceRecoveryOrderId === order.id
        || commission.orderId === order.id
        || commission.orderNo === order.recoveryNo
        || commissionIds.has(commission.id)
      ));
      setDetailCommissions(items);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailOrder(null);
    setDetailCommissions([]);
  };

  const openSettlement = (order: RecoveryOrder) => {
    if (getSettlementStatus(order) !== '待分账') {
      setMessage({ type: 'error', text: '只有待分账的售后挽回订单可以处理分账' });
      return;
    }
    setSelected(order);
    setReason('');
    setSettlementRows([{
      ...emptyRow,
      ownerId: order.recoveryUserId,
      performanceAmount: String(order.recoveryAmount || 0),
    }]);
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

  const addRow = () => setSettlementRows((prev) => [...prev, { ...emptyRow, performanceAmount: String(selected?.recoveryAmount || 0) }]);
  const removeRow = (index: number) => setSettlementRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));

  const submitSettlement = async () => {
    if (!selected || !currentUser) return;
    const payload: RecoverySettlementInput[] = settlementRows.map((row) => {
      const plan = activePlans.find((item) => item.id === row.payoutPlanId);
      const isCustom = row.payoutPlanId === CUSTOM_PLAN_ID;
      return {
        role: row.role,
        ownerId: row.ownerId,
        payoutPlanId: isCustom ? undefined : row.payoutPlanId,
        payoutPlanName: isCustom ? '自定义金额' : plan?.name,
        commissionAmount: Number(row.commissionAmount) || 0,
        performanceAmount: Number(row.performanceAmount) || selected.recoveryAmount,
        commissionRate: plan?.commissionType === 'percentage' ? plan.commissionValue / 100 : 0,
        calculationNote: row.calculationNote,
        ruleCalculationType: isCustom ? 'fixed' : plan?.commissionType,
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
      setSelected(null);
      setMessage({ type: 'success', text: '售后挽回分账已保存，只进入售后挽回分账链路，员工可在我的提成查看' });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const openResetSettlementDialog = (row: RecoveryOrder) => {
    if (getSettlementStatus(row) !== '已分账') {
      setMessage({ type: 'error', text: '待分账记录不需要删除分账' });
      return;
    }
    setDeleteTarget(row);
  };

  const handleResetSettlement = async () => {
    if (!currentUser) return;
    if (!deleteTarget) return;
    const res = await recoveryOrderApi.resetRecoverySettlement(deleteTarget.id, currentUser.name);
    if (res.code !== 0) {
      setMessage({ type: 'error', text: res.message || '删除售后挽回分账失败' });
      return;
    }
    setDeleteTarget(null);
    setMessage({ type: 'success', text: '已删除售后挽回分账，订单已退回待分账' });
    await load();
  };

  const renderCell = (row: RecoveryOrder, columnId: RecoverySettlementColumnId) => {
    const settlementStatus = getSettlementStatus(row);
    switch (columnId) {
      case 'recoveryNo':
        return <Typography variant="body2" sx={{ fontWeight: 900, color: shell.ink }}>{row.recoveryNo}</Typography>;
      case 'customerName':
        return (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 800 }}>{row.customerName}</Typography>
            <Typography variant="caption" sx={{ color: shell.muted }}>{row.customerPhone || row.customerWechat || '-'}</Typography>
          </Box>
        );
      case 'thirdPartyOrderNo':
        return row.thirdPartyOrderNo;
      case 'originalProduct':
        return row.originalProduct;
      case 'originalAmount':
        return formatCurrency(row.originalAmount);
      case 'recoveryAmount':
        return <Typography variant="body2" sx={{ fontWeight: 900, color: shell.teal }}>{formatCurrency(row.recoveryAmount)}</Typography>;
      case 'recoveryUserName':
        return row.recoveryUserName;
      case 'status':
        return <Chip size="small" label={settlementStatus} sx={{ ...getStatusChipSx(settlementStatus), fontWeight: 900 }} />;
      case 'auditedAt':
        return row.auditedAt ? formatDate(row.auditedAt, 'yyyy-MM-dd HH:mm') : '-';
      case 'actions':
        return (
          <Stack direction="row" spacing={0.25} justifyContent="center">
            <Tooltip title="查看">
              <IconButton size="small" sx={{ color: shell.blue }} onClick={() => openDetail(row)}>
                <VisibilityIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={settlementStatus === '待分账' ? '处理分账' : '已分账'}>
              <span>
                <IconButton
                  size="small"
                  sx={{ color: settlementStatus === '待分账' ? shell.blue : '#94a3b8' }}
                  disabled={settlementStatus !== '待分账'}
                  onClick={() => openSettlement(row)}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={settlementStatus === '已分账' ? '删除分账' : '暂无可删除分账'}>
              <span>
                <IconButton
                  size="small"
                  sx={{ color: settlementStatus === '已分账' ? shell.red : '#cbd5e1' }}
                  disabled={settlementStatus !== '已分账'}
                  onClick={() => openResetSettlementDialog(row)}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        );
      default:
        return null;
    }
  };

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      {message && <Alert severity={message.type} onClose={() => setMessage(null)}>{message.text}</Alert>}

      <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, p: 1.25 }}>
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
          {STATUS_OPTIONS.map((option) => {
            const active = status === option.value;
            const count = counts[option.value as keyof typeof counts] || 0;
            return (
              <Button
                key={option.value}
                variant={active ? 'contained' : 'outlined'}
                onClick={() => setStatus(option.value)}
                sx={{
                  minWidth: 96,
                  justifyContent: 'space-between',
                  borderRadius: 1.25,
                  color: active ? '#fff' : option.color,
                  borderColor: active ? option.color : shell.line,
                  bgcolor: active ? option.color : '#fff',
                  '&:hover': { bgcolor: active ? option.color : '#f8fafc', borderColor: option.color },
                }}
              >
                <span>{option.label}</span>
                <Chip
                  size="small"
                  label={count}
                  sx={{
                    height: 22,
                    ml: 1,
                    bgcolor: active ? 'rgba(255,255,255,0.24)' : '#eef2f7',
                    color: active ? '#fff' : shell.ink,
                    fontWeight: 900,
                  }}
                />
              </Button>
            );
          })}
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, p: 1.25 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }}>
          <TextField
            size="small"
            placeholder="搜索挽回单号、客户、第三方订单号"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: shell.muted }} /> }}
            sx={{ minWidth: { md: 360 } }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>分账状态</InputLabel>
            <Select label="分账状态" value={status} onChange={(event) => setStatus(event.target.value as RecoverySettlementFilterStatus)}>
              {STATUS_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: '6px 6px 0 0' }}>
        <Table sx={{ minWidth: 1080 }}>
          <TableHead>
            <TableRow>
              {visibleColumns.map((column) => (
                <TableCell key={column.id} align={column.id === 'actions' ? 'center' : 'left'}>
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} hover>
                {visibleColumns.map((column) => (
                  <TableCell key={column.id} align={column.id === 'actions' ? 'center' : 'left'}>
                    {renderCell(row, column.id as RecoverySettlementColumnId)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={visibleColumns.length || 1} align="center" sx={{ py: 6, color: '#9ca3af' }}>
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
        sx={{ border: `1px solid ${shell.line}`, borderTop: 0, bgcolor: '#fff' }}
      />

      <Dialog open={Boolean(detailOrder)} onClose={closeDetail} maxWidth="xl" fullWidth>
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
                      <Chip label={getSettlementStatus(detailOrder)} size="small" sx={{ ...getStatusChipSx(getSettlementStatus(detailOrder)), fontWeight: 900 }} />
                    </Stack>
                    <Typography variant="body2" sx={{ color: shell.muted, overflowWrap: 'anywhere' }}>
                      {detailOrder.customerName} · 售后挽回 · {detailOrder.auditedAt ? formatDate(detailOrder.auditedAt, 'yyyy-MM-dd HH:mm:ss') : '-'}
                    </Typography>
                  </Box>
                  {[
                    { label: '挽回成交金额', value: formatCurrency(detailOrder.recoveryAmount), color: shell.teal },
                    { label: '分账总额', value: formatCurrency(detailCommissions.reduce((sum, item) => sum + item.commissionAmount, 0)), color: '#d97706' },
                    { label: '提成角色', value: `${detailCommissions.length || detailOrder.commissionIds?.length || 0} 个`, color: shell.blue },
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
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EditIcon />}
                      disabled={getSettlementStatus(detailOrder) !== '待分账'}
                      onClick={() => {
                        closeDetail();
                        openSettlement(detailOrder);
                      }}
                      sx={{ whiteSpace: 'nowrap' }}
                    >
                      调整分账
                    </Button>
                  </Box>

                  <Box sx={{ p: 1.5, bgcolor: '#f8fafc', minHeight: '48vh' }}>
                    {detailLoading ? (
                      <Typography variant="body2" sx={{ color: '#9ca3af' }}>正在读取分账明细...</Typography>
                    ) : detailCommissions.length ? (
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(260px, 320px))' },
                          gap: 1.25,
                          alignItems: 'stretch',
                          justifyContent: 'start',
                        }}
                      >
                        {detailCommissions.map((commission, index) => (
                          <Paper key={commission.id} elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                            <Box sx={{ px: 1.25, py: 1, borderBottom: '1px solid #eef2f7', bgcolor: '#fff' }}>
                              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                                <Box sx={{ minWidth: 0 }}>
                                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                                    <Chip label={commission.role || '售后'} size="small" color="primary" sx={{ fontWeight: 900 }} />
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
                                    sx={{
                                      bgcolor: commission.status === '待确认' ? '#fff7ed' : commission.status === '待发放' ? '#e0f2fe' : '#ecfdf5',
                                      color: commission.status === '待确认' ? shell.amber : commission.status === '待发放' ? '#0369a1' : shell.green,
                                      fontWeight: 900,
                                    }}
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
                    ) : (
                      <Paper elevation={0} sx={{ border: `1px dashed ${shell.line}`, borderRadius: 1, p: 2, bgcolor: '#fff' }}>
                        <Typography variant="body2" sx={{ color: '#9ca3af' }}>
                          暂无分账明细，待分账的售后挽回单可点击右上角“调整分账”处理。
                        </Typography>
                      </Paper>
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
                        {getSettlementStatus(detailOrder) === '已分账'
                          ? '本单已完成售后挽回分账，员工可在我的提成查看。'
                          : '确认分账后，本单提成进入员工提成链路。'}
                      </Typography>
                      <Button variant="contained" color="success" disabled>
                        确认分账
                      </Button>
                      <TextField size="small" placeholder="撤回原因" disabled />
                      <Button variant="outlined" disabled>
                        撤回提成
                      </Button>
                    </Stack>
                  </Paper>

                  <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                    <Box sx={{ px: 1.5, py: 1.1, borderBottom: '1px solid #eef2f7' }}>
                      <Typography variant="subtitle2" sx={{ color: shell.ink, fontWeight: 900 }}>操作历史</Typography>
                    </Box>
                    <Box sx={{ p: 1.5 }}>
                      <Stack spacing={1.25} sx={{ maxHeight: '42vh', overflowY: 'auto', overflowX: 'hidden', pr: 0.5, minWidth: 0 }}>
                        {detailOrder.auditedAt && (
                          <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderLeft: `3px solid ${shell.green}`, borderRadius: 1, p: 1.1 }}>
                            <Stack direction="row" justifyContent="space-between" spacing={1}>
                              <Chip label="审核通过" size="small" color="success" sx={{ height: 22 }} />
                              <Typography variant="caption" sx={{ color: shell.muted }}>{formatDate(detailOrder.auditedAt, 'MM-dd HH:mm')}</Typography>
                            </Stack>
                            <Typography variant="body2" sx={{ mt: 0.75, color: shell.ink, fontWeight: 700 }}>
                              售后挽回订单已进入待分账
                            </Typography>
                            <Typography variant="caption" sx={{ color: shell.muted }}>{detailOrder.auditorName || '-'}</Typography>
                          </Paper>
                        )}
                        {getSettlementStatus(detailOrder) === '已分账' && (
                          <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderLeft: `3px solid ${shell.blue}`, borderRadius: 1, p: 1.1 }}>
                            <Stack direction="row" justifyContent="space-between" spacing={1}>
                              <Chip label="确认分账" size="small" color="primary" sx={{ height: 22 }} />
                              <Typography variant="caption" sx={{ color: shell.muted }}>{formatDate(detailOrder.updatedAt, 'MM-dd HH:mm')}</Typography>
                            </Stack>
                            <Typography variant="body2" sx={{ mt: 0.75, color: shell.ink, fontWeight: 700 }}>
                              {detailCommissions.length || detailOrder.commissionIds?.length || 0} 个角色 · 合计 {formatCurrency(detailCommissions.reduce((sum, item) => sum + item.commissionAmount, 0))}
                            </Typography>
                            <Typography variant="caption" sx={{ color: shell.muted }}>{detailOrder.auditReason || '-'}</Typography>
                          </Paper>
                        )}
                        {!detailOrder.auditedAt && getSettlementStatus(detailOrder) !== '已分账' && (
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
                      <Chip label={getSettlementStatus(selected)} size="small" sx={{ ...getStatusChipSx(getSettlementStatus(selected)), fontWeight: 900 }} />
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
                      <Typography variant="subtitle2" sx={{ color: shell.ink, fontWeight: 900 }}>分账明细编辑</Typography>
                      <Typography variant="caption" sx={{ color: shell.muted }}>
                        按角色核对人员、方案和金额，确认无误后进入右侧操作。
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
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(260px, 320px))' },
                        gap: 1.25,
                        alignItems: 'stretch',
                        justifyContent: 'start',
                      }}
                    >
                      {settlementRows.map((row, index) => {
                        const selectedPlan = activePlans.find((plan) => plan.id === row.payoutPlanId);
                        const owner = activeUsers.find((user) => user.id === row.ownerId);
                        const isCustom = row.payoutPlanId === CUSTOM_PLAN_ID;
                        return (
                          <Paper key={`${index}-${row.role}`} elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                            <Box sx={{ px: 1.25, py: 1, borderBottom: '1px solid #eef2f7', bgcolor: '#fff' }}>
                              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                                <Box sx={{ minWidth: 0 }}>
                                  <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.5 }}>
                                    <Chip label={row.role || '售后'} size="small" color="primary" sx={{ fontWeight: 900 }} />
                                    <Typography variant="caption" sx={{ color: shell.muted }}>分账 {index + 1}</Typography>
                                  </Stack>
                                  <Typography variant="body2" sx={{ fontWeight: 900, color: shell.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {owner?.name || '未选择人员'}
                                  </Typography>
                                  <Typography variant="caption" sx={{ color: shell.muted }}>{owner?.departmentId || '-'}</Typography>
                                </Box>
                                {settlementRows.length > 1 && (
                                  <Tooltip title="删除">
                                    <IconButton size="small" sx={{ color: '#94a3b8' }} onClick={() => removeRow(index)}>
                                      <DeleteOutlineIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Stack>
                            </Box>

                            <Box sx={{ p: 1.25, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                              <TextField select size="small" label="角色" value={row.role} onChange={(event) => updateRow(index, { role: event.target.value })}>
                                {activeRoles.map((role) => <MenuItem key={role.id} value={role.name}>{role.name}</MenuItem>)}
                                {!activeRoles.length && <MenuItem value="售后">售后</MenuItem>}
                              </TextField>
                              <TextField select size="small" label="人员" value={row.ownerId} onChange={(event) => updateRow(index, { ownerId: event.target.value })}>
                                {activeUsers.map((user) => <MenuItem key={user.id} value={user.id}>{user.name} - {user.role}</MenuItem>)}
                              </TextField>
                              <TextField
                                size="small"
                                label="部门"
                                value={owner?.departmentId || '-'}
                                disabled
                              />
                              <TextField size="small" label="业绩金额" type="number" value={row.performanceAmount} onChange={(event) => updateRow(index, { performanceAmount: event.target.value })} />
                              <TextField
                                select
                                size="small"
                                label="提成方案"
                                value={row.payoutPlanId}
                                onChange={(event) => updateRow(index, { payoutPlanId: event.target.value })}
                                sx={{ gridColumn: '1 / -1' }}
                              >
                                <MenuItem value={CUSTOM_PLAN_ID}>自定义金额</MenuItem>
                                {activePlans.map((plan) => <MenuItem key={plan.id} value={plan.id}>{formatPlan(plan)}</MenuItem>)}
                              </TextField>
                              <TextField
                                size="small"
                                label={isCustom ? '方案金额' : '提成金额'}
                                type="number"
                                value={row.commissionAmount}
                                onChange={(event) => updateRow(index, { commissionAmount: event.target.value })}
                                disabled={!isCustom && selectedPlan?.commissionType !== 'tiered_percentage'}
                              />
                              <Box sx={{ alignSelf: 'center', textAlign: 'right' }}>
                                <Typography variant="caption" sx={{ color: shell.muted }}>当前提成</Typography>
                                <Typography variant="body1" sx={{ color: shell.red, fontWeight: 900 }}>
                                  {formatCurrency(Number(row.commissionAmount) || 0)}
                                </Typography>
                              </Box>
                              <TextField
                                size="small"
                                label="说明"
                                value={row.calculationNote}
                                onChange={(event) => updateRow(index, { calculationNote: event.target.value })}
                                fullWidth
                                sx={{ gridColumn: '1 / -1' }}
                              />
                            </Box>
                          </Paper>
                        );
                      })}
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5, gap: 1, flexWrap: 'wrap' }}>
                      <Button startIcon={<AddIcon />} onClick={addRow}>新增分账</Button>
                      <TextField
                        size="small"
                        label="调整原因"
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        required
                        sx={{ width: { xs: '100%', md: 300 } }}
                      />
                    </Box>
                  </Box>
                </Paper>

                <Stack spacing={1.5} sx={{ minWidth: 0 }}>
                  <Paper elevation={0} sx={{ border: '1px solid #dbeafe', borderRadius: 1, overflow: 'hidden', bgcolor: '#fff' }}>
                    <Box sx={{ px: 1.5, py: 1.1, borderBottom: '1px solid #dbeafe', bgcolor: '#f8fbff' }}>
                      <Typography variant="subtitle2" sx={{ color: shell.blue, fontWeight: 900 }}>当前动作</Typography>
                    </Box>
                    <Stack spacing={1.25} sx={{ p: 1.5 }}>
                      <Typography variant="body2" sx={{ color: shell.muted }}>
                        确认后，本单提成进入员工提成链路。
                      </Typography>
                      <Button variant="contained" color="success" disabled={saving || !reason.trim()} onClick={submitSettlement}>
                        确认分账
                      </Button>
                      <TextField size="small" placeholder="撤回原因" disabled />
                      <Button variant="outlined" disabled>
                        撤回提成
                      </Button>
                      <Button color="primary" onClick={() => setSelected(null)}>
                        取消编辑
                      </Button>
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
                              售后挽回订单已进入待分账
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

      <Dialog open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setDeleteTarget(null)}>删除售后挽回分账</DialogCloseTitle>
        <DialogContent dividers>
          {deleteTarget && (
            <Stack spacing={1.25}>
              <Alert severity="warning">
                删除后会清空该挽回单已生成的提成记录，并退回到“待分账”状态。
              </Alert>
              <Box sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, p: 1.25, bgcolor: shell.soft }}>
                <Typography variant="body2" sx={{ fontWeight: 900 }}>{deleteTarget.recoveryNo}</Typography>
                <Typography variant="body2" sx={{ color: shell.muted }}>{deleteTarget.customerName} · {deleteTarget.thirdPartyOrderNo}</Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  挽回金额：<Box component="span" sx={{ color: shell.teal, fontWeight: 900 }}>{formatCurrency(deleteTarget.recoveryAmount)}</Box>
                </Typography>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button color="error" variant="contained" onClick={handleResetSettlement}>
            确认删除
          </Button>
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
    </Box>
  );
};

export default RecoverySettlement;
