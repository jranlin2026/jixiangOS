import React, { useEffect, useMemo, useState } from 'react';
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
  InputLabel,
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import PaymentsIcon from '@mui/icons-material/Payments';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { commissionApi, commissionRuleApi, departmentApi, orderApi, settingsApi } from '../../api';
import { getProductLevelColor } from '../../shared/utils/constants';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import CommissionRuleConfig from './CommissionRuleConfig';
import type {
  Commission,
  CommissionAdjustmentInput,
  CommissionOrderSummary,
  CommissionOrderSummaryFilters,
  CommissionOrderSummaryStatus,
  CommissionRole,
  CommissionRoleConfig,
  MonthlyCommissionPayout,
} from '../../types/commission';
import type { Department } from '../../types/department';
import type { Order } from '../../types/order';
import type { User } from '../../types/settings';

const ORDER_STATUS_OPTIONS: Array<{ value: CommissionOrderSummaryStatus | '全部'; label: string }> = [
  { value: '待处理', label: '待处理' },
  { value: '待确认', label: '待确认' },
  { value: '待发放', label: '待发放' },
  { value: '已发放', label: '已发放' },
  { value: '异常', label: '异常' },
  { value: '全部', label: '全部' },
];

function getOrderStatusColor(status: CommissionOrderSummaryStatus): 'default' | 'success' | 'error' | 'warning' | 'info' {
  if (status === '已发放') return 'success';
  if (status === '异常') return 'error';
  if (status === '待处理') return 'warning';
  if (status === '待发放') return 'info';
  return 'default';
}

function getPayoutStatusColor(status: MonthlyCommissionPayout['status']): 'default' | 'success' | 'error' | 'warning' | 'info' {
  if (status === '已发放') return 'success';
  if (status === '异常') return 'error';
  if (status === '待发放') return 'warning';
  return 'default';
}

const Commission: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [orderRows, setOrderRows] = useState<CommissionOrderSummary[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderFilters, setOrderFilters] = useState({
    search: '',
    status: '待处理' as CommissionOrderSummaryStatus | '全部',
    ownerId: '',
    role: '' as CommissionRole | '',
    month: '',
    startDate: '',
    endDate: '',
  });

  const [payoutPeriod, setPayoutPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [payoutRows, setPayoutRows] = useState<MonthlyCommissionPayout[]>([]);
  const [expandedPayoutOwners, setExpandedPayoutOwners] = useState<Set<string>>(new Set());
  const [payoutLoading, setPayoutLoading] = useState(false);

  const [commissionRoleConfigs, setCommissionRoleConfigs] = useState<CommissionRoleConfig[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);

  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitOrderId, setSplitOrderId] = useState('');
  const [splitRows, setSplitRows] = useState<CommissionAdjustmentInput[]>([]);
  const [splitReason, setSplitReason] = useState('');
  const [splitSaving, setSplitSaving] = useState(false);
  const [summaryDetail, setSummaryDetail] = useState<CommissionOrderSummary | null>(null);
  const [orderDetail, setOrderDetail] = useState<Order | null>(null);

  const activeEmployees = useMemo(() => employees.filter((item) => item.isActive), [employees]);
  const activeRoleConfigs = useMemo(() => commissionRoleConfigs.filter((item) => item.isActive), [commissionRoleConfigs]);

  const getDepartmentName = (departmentId?: string) => departments.find((item) => item.id === departmentId)?.name || '';
  const selectedSplitSummary = orderRows.find((item) => item.orderId === splitOrderId);

  const roleOptionsForSplit = (currentRole: CommissionRole) => {
    const options = activeRoleConfigs.slice();
    if (currentRole && !options.some((item) => item.name === currentRole)) {
      const current = commissionRoleConfigs.find((item) => item.name === currentRole);
      return current ? [current, ...options] : [{ id: currentRole, name: currentRole, code: currentRole, isActive: false, sortOrder: 999, createdAt: '', updatedAt: '' }, ...options];
    }
    return options;
  };

  const fetchSettlementOptions = async () => {
    const [rolesRes, usersRes, departmentsRes] = await Promise.all([
      commissionRuleApi.getCommissionRoleConfigs(),
      settingsApi.fetchUsers({ isActive: true }),
      departmentApi.getDepartments({ isActive: true }),
    ]);
    if (rolesRes.code === 0) setCommissionRoleConfigs(rolesRes.data);
    if (usersRes.code === 0) setEmployees(usersRes.data);
    if (departmentsRes.code === 0) setDepartments(departmentsRes.data);
  };

  const buildOrderSummaryFilters = (): CommissionOrderSummaryFilters => ({
    search: orderFilters.search || undefined,
    status: orderFilters.status,
    ownerId: orderFilters.ownerId || undefined,
    role: orderFilters.role || undefined,
    month: orderFilters.month || undefined,
    startDate: orderFilters.startDate || undefined,
    endDate: orderFilters.endDate || undefined,
    pageSize: 1000,
  });

  const fetchOrderSummaries = async () => {
    setOrderLoading(true);
    try {
      const res = await commissionApi.fetchCommissionOrderSummaries(buildOrderSummaryFilters());
      if (res.code === 0) setOrderRows(res.data.items);
    } finally {
      setOrderLoading(false);
    }
  };

  const fetchMonthlyPayouts = async (period = payoutPeriod) => {
    if (!period) return;
    setPayoutLoading(true);
    try {
      const res = await commissionApi.fetchMonthlyCommissionPayouts(period);
      if (res.code === 0) setPayoutRows(res.data);
    } finally {
      setPayoutLoading(false);
    }
  };

  const refreshAll = async () => {
    await Promise.all([fetchOrderSummaries(), fetchMonthlyPayouts()]);
  };

  useEffect(() => {
    fetchSettlementOptions();
  }, []);

  useEffect(() => {
    fetchOrderSummaries();
  }, [orderFilters]);

  useEffect(() => {
    fetchMonthlyPayouts(payoutPeriod);
  }, [payoutPeriod]);

  const updateOrderFilter = (key: keyof typeof orderFilters, value: string) => {
    setOrderFilters((prev) => ({ ...prev, [key]: value }));
  };

  const openSplitDialog = async (summary: CommissionOrderSummary) => {
    if (summary.status === '已发放') return;
    const res = await commissionApi.fetchCommissionsByOrder(summary.orderId);
    if (res.code !== 0) return;
    setSplitOrderId(summary.orderId);
    setSplitRows(res.data.map((item) => {
      const employee = activeEmployees.find((user) => user.id === item.ownerId || user.name === item.owner);
      return {
        id: item.id,
        orderId: item.orderId,
        role: item.role,
        owner: employee?.name || '',
        ownerId: employee?.id || '',
        department: employee ? getDepartmentName(employee.departmentId) : '',
        departmentId: employee?.departmentId || '',
        paymentDate: item.paymentDate,
        commissionAmount: item.commissionAmount,
        commissionRate: item.commissionRate,
        performanceAmount: item.performanceAmount || item.orderAmount,
        calculationNote: item.calculationNote || item.formulaText || '',
        commissionRuleId: item.commissionRuleId,
      };
    }));
    setSplitReason('');
    setSplitDialogOpen(true);
  };

  const updateSplitRow = <K extends keyof CommissionAdjustmentInput>(index: number, key: K, value: CommissionAdjustmentInput[K]) => {
    setSplitRows((prev) => prev.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [key]: value } : row
    )));
  };

  const handleSplitOwnerChange = (index: number, ownerId: string) => {
    const employee = activeEmployees.find((item) => item.id === ownerId);
    setSplitRows((prev) => prev.map((row, rowIndex) => (
      rowIndex === index
        ? {
          ...row,
          ownerId,
          owner: employee?.name || '',
          departmentId: employee?.departmentId || '',
          department: getDepartmentName(employee?.departmentId),
        }
        : row
    )));
  };

  const handleAddSplitRow = () => {
    setSplitRows((prev) => [
      ...prev,
      {
        orderId: splitOrderId,
        role: activeRoleConfigs[0]?.name || '销售',
        owner: '',
        ownerId: '',
        department: '',
        departmentId: '',
        commissionAmount: 0,
        commissionRate: 0,
        performanceAmount: prev[0]?.performanceAmount || selectedSplitSummary?.orderAmount || 0,
        calculationNote: '财务人工新增分账',
      },
    ]);
  };

  const handleSaveSplitRows = async () => {
    setSplitSaving(true);
    try {
      const res = await commissionApi.saveOrderCommissionAdjustments(splitOrderId, splitRows, splitReason);
      if (res.code === 0) {
        setSplitDialogOpen(false);
        await refreshAll();
      }
    } finally {
      setSplitSaving(false);
    }
  };

  const confirmOrder = async (summary: CommissionOrderSummary) => {
    const res = await commissionApi.confirmOrderCommissions(summary.orderId, '订单分账确认');
    if (res.code === 0) await refreshAll();
  };

  const cancelOrder = async (summary: CommissionOrderSummary) => {
    await Promise.all(summary.commissions.map((item) => commissionApi.updateCommissionStatus(item.id, '已取消')));
    await refreshAll();
  };

  const viewOrder = async (summary: CommissionOrderSummary) => {
    const res = await orderApi.fetchOrderById(summary.orderId);
    if (res.code === 0) setOrderDetail(res.data);
  };

  const generateMonthlyBatch = async () => {
    if (!payoutPeriod) return;
    await commissionApi.generateSettlementBatch(payoutPeriod);
    await fetchMonthlyPayouts(payoutPeriod);
  };

  const payOwner = async (ownerId?: string) => {
    if (!ownerId) return;
    const res = await commissionApi.payMonthlyOwnerCommissions(payoutPeriod, ownerId);
    if (res.code === 0) {
      setPayoutRows(res.data);
      await fetchOrderSummaries();
    }
  };

  const payBatch = async () => {
    const res = await commissionApi.payMonthlyCommissionBatch(payoutPeriod);
    if (res.code === 0) {
      setPayoutRows(res.data);
      await fetchOrderSummaries();
    }
  };

  const togglePayoutExpanded = (ownerKey: string) => {
    setExpandedPayoutOwners((prev) => {
      const next = new Set(prev);
      if (next.has(ownerKey)) next.delete(ownerKey);
      else next.add(ownerKey);
      return next;
    });
  };

  const renderOrderToolbar = () => (
    <Stack direction="row" spacing={1.25} sx={{ mb: 2, flexWrap: 'wrap', rowGap: 1 }}>
      <TextField
        placeholder="搜索订单号/客户"
        value={orderFilters.search}
        onChange={(event) => updateOrderFilter('search', event.target.value)}
        size="small"
        sx={{ minWidth: 210 }}
      />
      <ToggleButtonGroup
        exclusive
        size="small"
        value={orderFilters.status}
        onChange={(_event, value) => value && updateOrderFilter('status', value)}
      >
        {ORDER_STATUS_OPTIONS.map((item) => (
          <ToggleButton key={item.value} value={item.value}>{item.label}</ToggleButton>
        ))}
      </ToggleButtonGroup>
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>角色</InputLabel>
        <Select value={orderFilters.role} label="角色" onChange={(event) => updateOrderFilter('role', event.target.value)}>
          <MenuItem value="">全部</MenuItem>
          {activeRoleConfigs.map((role) => <MenuItem key={role.id} value={role.name}>{role.name}</MenuItem>)}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>人员</InputLabel>
        <Select value={orderFilters.ownerId} label="人员" onChange={(event) => updateOrderFilter('ownerId', event.target.value)}>
          <MenuItem value="">全部</MenuItem>
          {activeEmployees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.name}</MenuItem>)}
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
      <Tooltip title="刷新">
        <IconButton onClick={refreshAll}><RefreshIcon /></IconButton>
      </Tooltip>
    </Stack>
  );

  const renderOrderSplitTable = () => (
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1 }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>订单号</TableCell>
            <TableCell>客户</TableCell>
            <TableCell>付款日期</TableCell>
            <TableCell>实付金额</TableCell>
            <TableCell>订单类型</TableCell>
            <TableCell>分账摘要</TableCell>
            <TableCell>状态</TableCell>
            <TableCell align="center">操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {orderRows.map((summary) => (
            <TableRow key={summary.orderId} hover>
              <TableCell sx={{ fontWeight: 700 }}>{summary.orderNo}</TableCell>
              <TableCell>{summary.customerName}</TableCell>
              <TableCell>{formatDate(summary.paymentDate, 'yyyy-MM-dd')}</TableCell>
              <TableCell>{formatCurrency(summary.orderAmount)}</TableCell>
              <TableCell>
                <Chip
                  label={summary.productLevel}
                  size="small"
                  sx={{ mr: 0.75, bgcolor: `${getProductLevelColor(summary.productLevel)}18`, color: getProductLevelColor(summary.productLevel), fontWeight: 600 }}
                />
                {summary.orderType}
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                  {summary.splitSummary.slice(0, 4).map((item) => (
                    <Chip key={`${summary.orderId}-${item.role}-${item.owner}`} label={`${item.role} ${formatCurrency(item.amount)}`} size="small" variant="outlined" />
                  ))}
                  {summary.splitSummary.length > 4 && <Chip label={`+${summary.splitSummary.length - 4}`} size="small" />}
                </Stack>
              </TableCell>
              <TableCell>
                <Chip label={summary.status} size="small" color={getOrderStatusColor(summary.status)} />
              </TableCell>
              <TableCell align="center">
                <Stack direction="row" spacing={0.5} justifyContent="center">
                  <Tooltip title="查看分账">
                    <IconButton size="small" onClick={() => setSummaryDetail(summary)}><VisibilityIcon fontSize="small" /></IconButton>
                  </Tooltip>
                  <Tooltip title={summary.status === '已发放' ? '已发放不可直接调整' : '调整分账'}>
                    <span>
                      <IconButton size="small" color="primary" disabled={summary.status === '已发放'} onClick={() => openSplitDialog(summary)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="确认分账">
                    <span>
                      <IconButton size="small" color="success" disabled={summary.status !== '待确认'} onClick={() => confirmOrder(summary)}>
                        <CheckCircleIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="取消/异常">
                    <span>
                      <IconButton size="small" color="error" disabled={summary.status === '已发放'} onClick={() => cancelOrder(summary)}>
                        <CancelIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="查看订单">
                    <IconButton size="small" onClick={() => viewOrder(summary)}><ReceiptLongIcon fontSize="small" /></IconButton>
                  </Tooltip>
                </Stack>
              </TableCell>
            </TableRow>
          ))}
          {!orderRows.length && (
            <TableRow>
              <TableCell colSpan={8} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                {orderLoading ? '加载中...' : '暂无订单分账'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderMonthlyPayout = () => (
    <>
      <Stack direction="row" spacing={1.25} sx={{ mb: 2, alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
        <TextField
          label="发放月份"
          type="month"
          value={payoutPeriod}
          onChange={(event) => setPayoutPeriod(event.target.value)}
          size="small"
          InputLabelProps={{ shrink: true }}
        />
        <Tooltip title="生成批次">
          <Button variant="outlined" startIcon={<PaymentsIcon />} onClick={generateMonthlyBatch}>生成</Button>
        </Tooltip>
        <Tooltip title="整批发放">
          <Button variant="contained" startIcon={<CheckCircleIcon />} onClick={payBatch}>发放</Button>
        </Tooltip>
      </Stack>
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell width={52} />
              <TableCell>人员</TableCell>
              <TableCell>部门</TableCell>
              <TableCell>订单数</TableCell>
              <TableCell>应发金额</TableCell>
              <TableCell>异常金额</TableCell>
              <TableCell>已发金额</TableCell>
              <TableCell>状态</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payoutRows.map((row) => {
              const ownerKey = row.ownerId || row.owner;
              const expanded = expandedPayoutOwners.has(ownerKey);
              return (
                <React.Fragment key={ownerKey}>
                  <TableRow hover>
                    <TableCell>
                      <IconButton size="small" onClick={() => togglePayoutExpanded(ownerKey)}>
                        {expanded ? <KeyboardArrowDownIcon fontSize="small" /> : <KeyboardArrowRightIcon fontSize="small" />}
                      </IconButton>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{row.owner}</TableCell>
                    <TableCell>{row.department || '-'}</TableCell>
                    <TableCell>{row.orderCount}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: '#d32f2f' }}>{formatCurrency(row.pendingPayAmount)}</TableCell>
                    <TableCell>{formatCurrency(row.exceptionAmount)}</TableCell>
                    <TableCell>{formatCurrency(row.paidAmount)}</TableCell>
                    <TableCell><Chip label={row.status} size="small" color={getPayoutStatusColor(row.status)} /></TableCell>
                    <TableCell align="center">
                      <Tooltip title="发放此人">
                        <span>
                          <IconButton size="small" color="success" disabled={!row.ownerId || row.pendingPayAmount <= 0} onClick={() => payOwner(row.ownerId)}>
                            <CheckCircleIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={9} sx={{ p: 0, border: 0 }}>
                      <Collapse in={expanded} timeout="auto" unmountOnExit>
                        <Box sx={{ px: 7, py: 1.5, bgcolor: '#fafafa' }}>
                          <Stack spacing={0.75}>
                            {row.commissions.map((commission) => (
                              <Stack key={commission.id} direction="row" spacing={2} sx={{ fontSize: 13, color: '#4b5563' }}>
                                <Box sx={{ width: 150, fontWeight: 600 }}>{commission.orderNo}</Box>
                                <Box sx={{ width: 180 }}>{commission.customerName}</Box>
                                <Box sx={{ width: 110 }}>{commission.role}</Box>
                                <Box sx={{ width: 120 }}>{formatCurrency(commission.commissionAmount)}</Box>
                                <Box>{commission.status}</Box>
                              </Stack>
                            ))}
                          </Stack>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
            {!payoutRows.length && (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                  {payoutLoading ? '加载中...' : '暂无待发放人员'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>财务结算台</Typography>
        <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
          订单入库后自动生成分账，财务按订单确认，再按月份给人员发放。
        </Typography>
      </Box>

      <Tabs value={tabValue} onChange={(_event, value) => setTabValue(value)} sx={{ mb: 3, borderBottom: '1px solid #e5e7eb' }}>
        <Tab label="订单分账台" />
        <Tab label="月度发放" />
        <Tab label="规则配置" />
      </Tabs>

      {tabValue === 0 && (
        <>
          {renderOrderToolbar()}
          {renderOrderSplitTable()}
        </>
      )}

      {tabValue === 1 && renderMonthlyPayout()}

      {tabValue === 2 && <CommissionRuleConfig />}

      <Dialog open={Boolean(summaryDetail)} onClose={() => setSummaryDetail(null)} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={() => setSummaryDetail(null)}>分账明细</DialogCloseTitle>
        <DialogContent dividers>
          {summaryDetail && (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>角色</TableCell>
                  <TableCell>人员</TableCell>
                  <TableCell>部门</TableCell>
                  <TableCell>业绩金额</TableCell>
                  <TableCell>提成金额</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell>说明</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {summaryDetail.commissions.map((commission) => (
                  <TableRow key={commission.id}>
                    <TableCell>{commission.role}</TableCell>
                    <TableCell>{commission.owner}</TableCell>
                    <TableCell>{commission.department}</TableCell>
                    <TableCell>{formatCurrency(commission.performanceAmount || commission.orderAmount)}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: '#d32f2f' }}>{formatCurrency(commission.commissionAmount)}</TableCell>
                    <TableCell><Chip label={commission.status} size="small" /></TableCell>
                    <TableCell>{commission.calculationNote || commission.formulaText || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={splitDialogOpen} onClose={() => setSplitDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogCloseTitle onClose={() => setSplitDialogOpen(false)}>
          {selectedSplitSummary
            ? `调整分账：${selectedSplitSummary.orderNo} / ${selectedSplitSummary.customerName} / ${formatCurrency(selectedSplitSummary.orderAmount)} / ${formatDate(selectedSplitSummary.paymentDate, 'yyyy-MM-dd')}`
            : '调整订单分账'}
        </DialogCloseTitle>
        <DialogContent dividers>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>角色</TableCell>
                <TableCell>人员</TableCell>
                <TableCell>部门</TableCell>
                <TableCell>业绩金额</TableCell>
                <TableCell>提成金额</TableCell>
                <TableCell>说明</TableCell>
                <TableCell align="center">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {splitRows.map((row, index) => (
                <TableRow key={row.id || `new-${index}`}>
                  <TableCell sx={{ minWidth: 130 }}>
                    <Select
                      size="small"
                      value={row.role}
                      onChange={(event) => updateSplitRow(index, 'role', event.target.value as CommissionRole)}
                      fullWidth
                    >
                      {roleOptionsForSplit(row.role).map((role) => (
                        <MenuItem key={role.id} value={role.name}>{role.name}{role.isActive ? '' : '（已停用）'}</MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell sx={{ minWidth: 150 }}>
                    <Select
                      size="small"
                      value={row.ownerId || ''}
                      onChange={(event) => handleSplitOwnerChange(index, event.target.value)}
                      displayEmpty
                      fullWidth
                    >
                      <MenuItem value="">选择员工</MenuItem>
                      {activeEmployees.map((employee) => (
                        <MenuItem key={employee.id} value={employee.id}>{employee.name}</MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell sx={{ minWidth: 140 }}>
                    <TextField size="small" value={row.department || ''} placeholder="自动带出" InputProps={{ readOnly: true }} fullWidth />
                  </TableCell>
                  <TableCell sx={{ minWidth: 120 }}>
                    <TextField
                      size="small"
                      type="number"
                      value={row.performanceAmount || 0}
                      onChange={(event) => updateSplitRow(index, 'performanceAmount', Number(event.target.value))}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 120 }}>
                    <TextField
                      size="small"
                      type="number"
                      value={row.commissionAmount}
                      onChange={(event) => updateSplitRow(index, 'commissionAmount', Number(event.target.value))}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 180 }}>
                    <TextField
                      size="small"
                      value={row.calculationNote || ''}
                      onChange={(event) => updateSplitRow(index, 'calculationNote', event.target.value)}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="删除">
                      <IconButton size="small" color="error" onClick={() => setSplitRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Stack direction="row" spacing={1.5} sx={{ mt: 2, alignItems: 'center', justifyContent: 'space-between' }}>
            <Button startIcon={<AddIcon />} onClick={handleAddSplitRow}>新增</Button>
            <TextField
              label="调整原因"
              value={splitReason}
              onChange={(event) => setSplitReason(event.target.value)}
              size="small"
              required
              sx={{ minWidth: 360 }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSplitDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleSaveSplitRows}
            disabled={splitSaving || !splitReason.trim() || splitRows.length === 0 || splitRows.some((row) => !row.ownerId)}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(orderDetail)} onClose={() => setOrderDetail(null)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setOrderDetail(null)}>订单资料</DialogCloseTitle>
        <DialogContent dividers>
          {orderDetail && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 1.25 }}>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>订单号</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{orderDetail.orderNo}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>客户</Typography>
              <Typography variant="body2">{orderDetail.customerName}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>类型</Typography>
              <Typography variant="body2">{orderDetail.orderType}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>实付</Typography>
              <Typography variant="body2">{formatCurrency(orderDetail.actualAmount || orderDetail.amount)}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>付款日期</Typography>
              <Typography variant="body2">{formatDate(orderDetail.payments?.[0]?.paidAt || orderDetail.createdAt, 'yyyy-MM-dd HH:mm')}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>收款渠道</Typography>
              <Typography variant="body2">{orderDetail.officialPaymentChannel || orderDetail.paymentMethod}</Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default Commission;
