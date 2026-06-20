import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, Button, Checkbox,
  TextField, MenuItem, FormControl, InputLabel, Select, Tab, Tabs,
  IconButton, Dialog, DialogContent, DialogActions, Divider,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PaymentsIcon from '@mui/icons-material/Payments';
import useCommissionStore from '../../store/useCommissionStore';
import useOrderStore from '../../store/useOrderStore';
import { commissionApi, commissionRuleApi, customerApi, departmentApi, orderApi, settingsApi } from '../../api';
import { getProductLevelColor } from '../../shared/utils/constants';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import CommissionStats from './CommissionStats';
import CommissionRuleConfig from './CommissionRuleConfig';
import CustomerDetail from '../Customers/CustomerDetail';
import OrderForm from '../Orders/OrderForm';
import RefundStatusBadge from '../../shared/components/RefundStatusBadge';
import type { Commission, CommissionAdjustmentInput, CommissionAuditIssue, CommissionRole, CommissionRoleConfig, CommissionStatus } from '../../types/commission';
import type { Customer } from '../../types/customer';
import type { Order } from '../../types/order';
import type { User } from '../../types/settings';
import type { Department } from '../../types/department';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

const ROLE_LABELS: Record<CommissionRole, string> = {
  销售: '销售',
  线索: '线索',
  客户成功: '客户成功',
  售后: '售后',
  招商主管: '招商主管',
  销售主管: '销售主管',
};

const ROLE_COLORS: Record<CommissionRole, string> = {
  销售: '#1976d2',
  线索: '#ed6c02',
  客户成功: '#2e7d32',
  售后: '#7b1fa2',
  招商主管: '#d32f2f',
  销售主管: '#00838f',
};

const DEPARTMENTS = ['全部', '销售部', '市场部', '客户成功部', '售后服务部', '招商部'];
const STATUS_OPTIONS: CommissionStatus[] = ['待确认', '待发放', '已发放', '已取消'];

function getStatusColor(status: string): 'default' | 'success' | 'error' | 'warning' | 'info' {
  switch (status) {
    case '已发放': return 'success';
    case '已取消': return 'error';
    case '待确认': return 'info';
    case '待发放': return 'warning';
    default: return 'default';
  }
}

function SummaryTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Paper elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1, minWidth: 180 }}>
      <Typography variant="caption" sx={{ color: '#6b7280' }}>{label}</Typography>
      <Typography variant="h6" sx={{ fontWeight: 700, mt: 0.5 }}>{value}</Typography>
      {hint && <Typography variant="caption" sx={{ color: '#9ca3af' }}>{hint}</Typography>}
    </Paper>
  );
}

const Commission: React.FC = () => {
  const {
    items,
    stats,
    auditIssues,
    batches,
    fetchItems,
    fetchStats,
    fetchAuditIssues,
    fetchBatches,
    generateBatch,
    payBatch,
    updateStatus,
    batchApprove,
    batchPay,
    setFilters,
  } = useCommissionStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tabValue, setTabValue] = useState(0);
  const [localFilters, setLocalFilters] = useState({
    month: '',
    role: '' as CommissionRole | '',
    ownerId: '',
    department: '',
    status: '' as CommissionStatus | '',
    search: '',
    startDate: '',
    endDate: '',
  });
  const [detailCommission, setDetailCommission] = useState<Commission | null>(null);
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [orderCustomer, setOrderCustomer] = useState<Customer | null>(null);
  const [customerOrdersOpen, setCustomerOrdersOpen] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitOrderId, setSplitOrderId] = useState('');
  const [splitRows, setSplitRows] = useState<CommissionAdjustmentInput[]>([]);
  const [splitReason, setSplitReason] = useState('');
  const [splitSaving, setSplitSaving] = useState(false);
  const [commissionRoleConfigs, setCommissionRoleConfigs] = useState<CommissionRoleConfig[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const { current: orderDetail, fetchById: fetchOrderById } = useOrderStore();

  const activeEmployees = useMemo(() => employees.filter((item) => item.isActive), [employees]);
  const activeRoleConfigs = useMemo(() => commissionRoleConfigs.filter((item) => item.isActive), [commissionRoleConfigs]);
  const getDepartmentName = (departmentId?: string) => departments.find((item) => item.id === departmentId)?.name || '';

  const roleOptionsForSplit = (currentRole: CommissionRole) => {
    const options = activeRoleConfigs.slice();
    if (currentRole && !options.some((item) => item.name === currentRole)) {
      const current = commissionRoleConfigs.find((item) => item.name === currentRole);
      return current ? [current, ...options] : [{ id: currentRole, name: currentRole, code: currentRole, isActive: false, sortOrder: 999, createdAt: '', updatedAt: '' }, ...options];
    }
    return options;
  };

  const refreshCommissionData = async () => {
    await Promise.all([
      fetchItems(),
      fetchStats(),
      fetchAuditIssues(),
      fetchBatches(),
    ]);
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

  useEffect(() => {
    refreshCommissionData();
    fetchSettlementOptions();
  }, [fetchAuditIssues, fetchBatches, fetchItems, fetchStats]);

  const exceptionItems = useMemo(() => items.filter((commission) => {
    const note = `${commission.auditReason || ''}${commission.frozenReason || ''}${commission.calculationNote || ''}`;
    return commission.status === '已取消'
      || Boolean(commission.frozenReason)
      || note.includes('冲销')
      || note.includes('退款')
      || note.includes('冻结');
  }), [items]);

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);

    const apiFilters: any = {};
    if (newFilters.search) apiFilters.search = newFilters.search;
    if (newFilters.status) apiFilters.status = newFilters.status;
    if (newFilters.role) apiFilters.role = newFilters.role;
    if (newFilters.ownerId) apiFilters.ownerId = newFilters.ownerId;
    if (newFilters.department && newFilters.department !== '全部') apiFilters.department = newFilters.department;
    if (newFilters.month) apiFilters.month = newFilters.month;
    if (newFilters.startDate) apiFilters.startDate = newFilters.startDate;
    if (newFilters.endDate) apiFilters.endDate = newFilters.endDate;
    setFilters(apiFilters);
    fetchItems(apiFilters);
    fetchAuditIssues(apiFilters);
  };

  const handleStatus = async (id: string, status: CommissionStatus) => {
    await updateStatus(id, status);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleOpenSplitDialog = async (orderId: string) => {
    const res = await commissionApi.fetchCommissionsByOrder(orderId);
    if (res.code !== 0) return;
    setSplitOrderId(orderId);
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
        role: activeRoleConfigs[0]?.name || '客户成功',
        owner: '',
        ownerId: '',
        department: '',
        departmentId: '',
        commissionAmount: 0,
        commissionRate: 0,
        performanceAmount: prev[0]?.performanceAmount || 0,
        calculationNote: '财务人工新增分账',
      },
    ]);
  };

  const handleRemoveSplitRow = (index: number) => {
    setSplitRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const handleSaveSplitRows = async () => {
    setSplitSaving(true);
    try {
      const res = await commissionApi.saveOrderCommissionAdjustments(splitOrderId, splitRows, splitReason);
      if (res.code === 0) {
        setSplitDialogOpen(false);
        await refreshCommissionData();
      }
    } finally {
      setSplitSaving(false);
    }
  };

  const handleConfirmOrderSplit = async (orderId: string, reason = '确认分账') => {
    const res = await commissionApi.confirmOrderCommissions(orderId, reason);
    if (res.code === 0) {
      setSelected(new Set());
      await refreshCommissionData();
    }
  };

  const handleViewOrder = async (orderId: string) => {
    await fetchOrderById(orderId);
    setOrderDetailOpen(true);
  };

  const hydrateCustomerStats = async (customer: Customer): Promise<Customer> => {
    const allOrdersRes = await orderApi.fetchOrders({ pageSize: 1000 });
    const relatedOrders = allOrdersRes.code === 0
      ? allOrdersRes.data.items.filter(
        (item) => item.customerId === customer.id
          || item.customerName === customer.company
          || item.customerName === customer.name,
      )
      : [];
    return {
      ...customer,
      orderCount: relatedOrders.length,
      totalSpent: relatedOrders.reduce((sum, item) => sum + (Number(item.actualAmount) || 0), 0),
    };
  };

  const handleViewCustomerByCommission = async (commission: Commission | CommissionAuditIssue) => {
    let customer: Customer | null = null;
    const orderRes = await orderApi.fetchOrderById(commission.orderId);
    const order = orderRes.code === 0 ? orderRes.data : null;

    if (order?.customerId) {
      const customerRes = await customerApi.fetchCustomerById(order.customerId);
      if (customerRes.code === 0) customer = customerRes.data;
    }

    if (!customer) {
      const res = await customerApi.fetchCustomers({ search: commission.customerName, pageSize: 1000 });
      if (res.code === 0) {
        customer = res.data.items.find(
          (item) => item.company === commission.customerName || item.name === commission.customerName,
        ) || res.data.items[0] || null;
      }
    }

    if (!customer) return;
    setSelectedCustomer(await hydrateCustomerStats(customer));
    setCustomerOpen(true);
  };

  const handleCreateOrderForCustomer = (customer: Customer) => {
    setOrderCustomer(customer);
    setOrderFormOpen(true);
    setCustomerOpen(false);
  };

  const handleViewCustomerOrders = async (customer: Customer) => {
    setOrderCustomer(customer);
    const res = await orderApi.fetchOrders({ customerId: customer.id, pageSize: 100 });
    const relatedOrders = res.code === 0
      ? res.data.items.filter(
        (item) => item.customerId === customer.id
          || item.customerName === customer.company
          || item.customerName === customer.name,
      )
      : [];
    setCustomerOrders(relatedOrders);
    setCustomerOrdersOpen(true);
  };

  const handleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    const selectableIds = items.filter((c) => c.status === '待确认' || c.status === '待发放').map((c) => c.id);
    setSelected(selected.size === selectableIds.length ? new Set() : new Set(selectableIds));
  };

  const handleBatchApprove = async () => {
    const ids = Array.from(selected).filter((id) => items.find((c) => c.id === id)?.status === '待确认');
    await batchApprove(ids);
    setSelected(new Set());
  };

  const handleBatchPay = async () => {
    const ids = Array.from(selected).filter((id) => items.find((c) => c.id === id)?.status === '待发放');
    await batchPay(ids);
    setSelected(new Set());
  };

  const renderToolbar = () => (
    <Box sx={{ display: 'flex', gap: 1.5, my: 2.5, flexWrap: 'wrap' }}>
      <TextField
        placeholder="搜索订单号/客户名"
        value={localFilters.search}
        onChange={(e) => handleFilterChange('search', e.target.value)}
        size="small"
        sx={{ minWidth: 220 }}
      />
      <TextField
        label="月份"
        type="month"
        value={localFilters.month}
        onChange={(e) => handleFilterChange('month', e.target.value)}
        size="small"
        sx={{ minWidth: 160 }}
        InputLabelProps={{ shrink: true }}
      />
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>角色</InputLabel>
        <Select value={localFilters.role} label="角色" onChange={(e) => handleFilterChange('role', e.target.value)}>
          <MenuItem value="">全部</MenuItem>
          {activeRoleConfigs.map((role) => <MenuItem key={role.id} value={role.name}>{role.name}</MenuItem>)}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel>部门</InputLabel>
        <Select value={localFilters.department} label="部门" onChange={(e) => handleFilterChange('department', e.target.value)}>
          <MenuItem value="">全部</MenuItem>
          {departments.map((d) => <MenuItem key={d.id} value={d.name}>{d.name}</MenuItem>)}
        </Select>
      </FormControl>
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>人员</InputLabel>
        <Select value={localFilters.ownerId} label="人员" onChange={(e) => handleFilterChange('ownerId', e.target.value)}>
          <MenuItem value="">全部</MenuItem>
          {activeEmployees.map((employee) => <MenuItem key={employee.id} value={employee.id}>{employee.name}</MenuItem>)}
        </Select>
      </FormControl>
      <TextField
        label="付款开始"
        type="date"
        value={localFilters.startDate}
        onChange={(e) => handleFilterChange('startDate', e.target.value)}
        size="small"
        sx={{ minWidth: 150 }}
        InputLabelProps={{ shrink: true }}
      />
      <TextField
        label="付款结束"
        type="date"
        value={localFilters.endDate}
        onChange={(e) => handleFilterChange('endDate', e.target.value)}
        size="small"
        sx={{ minWidth: 150 }}
        InputLabelProps={{ shrink: true }}
      />
      <FormControl size="small" sx={{ minWidth: 130 }}>
        <InputLabel>状态</InputLabel>
        <Select value={localFilters.status} label="状态" onChange={(e) => handleFilterChange('status', e.target.value)}>
          <MenuItem value="">全部</MenuItem>
          {STATUS_OPTIONS.map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}
        </Select>
      </FormControl>
    </Box>
  );

  const renderCommissionTable = (rows: Commission[], withSelection = false) => (
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1 }}>
      <Table>
        <TableHead>
          <TableRow>
            {withSelection && (
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selected.size > 0 && selected.size < rows.length}
                  checked={rows.length > 0 && selected.size === rows.filter((c) => c.status === '待确认' || c.status === '待发放').length}
                  onChange={handleSelectAll}
                />
              </TableCell>
            )}
            <TableCell>订单号</TableCell>
            <TableCell>客户</TableCell>
            <TableCell>产品</TableCell>
            <TableCell>角色</TableCell>
            <TableCell>人员</TableCell>
            <TableCell>部门</TableCell>
            <TableCell>业绩金额</TableCell>
            <TableCell>提成金额</TableCell>
            <TableCell>状态</TableCell>
            <TableCell align="center">操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((comm) => {
            const levelColor = getProductLevelColor(comm.productLevel);
            const roleColor = ROLE_COLORS[comm.role] || '#9ca3af';
            const isSelectable = comm.status === '待确认' || comm.status === '待发放';
            return (
              <TableRow key={comm.id} hover>
                {withSelection && (
                  <TableCell padding="checkbox">
                    <Checkbox checked={selected.has(comm.id)} onChange={() => handleSelect(comm.id)} disabled={!isSelectable} />
                  </TableCell>
                )}
                <TableCell sx={{ fontWeight: 600 }}>{comm.orderNo}</TableCell>
                <TableCell>
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => handleViewCustomerByCommission(comm)}
                    sx={{ p: 0, minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', fontWeight: 500 }}
                  >
                    {comm.customerName}
                  </Button>
                </TableCell>
                <TableCell>
                  <Chip label={comm.productLevel} size="small" sx={{ bgcolor: `${levelColor}18`, color: levelColor, fontWeight: 600 }} />
                </TableCell>
                <TableCell>
                  <Chip label={ROLE_LABELS[comm.role] || comm.role} size="small" sx={{ bgcolor: `${roleColor}18`, color: roleColor, fontWeight: 600 }} />
                </TableCell>
                <TableCell>{comm.owner}</TableCell>
                <TableCell>{comm.department}</TableCell>
                <TableCell>{formatCurrency(comm.performanceAmount || comm.orderAmount)}</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#d32f2f' }}>{formatCurrency(comm.commissionAmount)}</TableCell>
                <TableCell><Chip label={comm.status} size="small" color={getStatusColor(comm.status)} /></TableCell>
                <TableCell align="center">
                  <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                    {comm.status === '待确认' && (
                      <>
                        <IconButton size="small" color="info" onClick={() => handleConfirmOrderSplit(comm.orderId)} title="确认分账">
                          <CheckCircleIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => handleStatus(comm.id, '已取消')} title="取消提成">
                          <CancelIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                    {comm.status === '待确认' && (
                      <IconButton size="small" color="primary" onClick={() => handleOpenSplitDialog(comm.orderId)} title="调整分账">
                        <EditIcon fontSize="small" />
                      </IconButton>
                    )}
                    {comm.status === '待发放' && (
                      <Button size="small" variant="outlined" onClick={() => handleStatus(comm.id, '已发放')}>发放</Button>
                    )}
                    <IconButton size="small" onClick={() => setDetailCommission(comm)} title="计算依据">
                      <ReceiptLongIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleViewOrder(comm.orderId)} title="查看订单">
                      <VisibilityIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={withSelection ? 11 : 10} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                暂无数据
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderAuditTable = (rows: CommissionAuditIssue[]) => (
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1 }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>问题类型</TableCell>
            <TableCell>订单号</TableCell>
            <TableCell>客户</TableCell>
            <TableCell>人员/角色</TableCell>
            <TableCell>金额</TableCell>
            <TableCell>原因</TableCell>
            <TableCell>状态</TableCell>
            <TableCell align="center">操作</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((issue) => (
            <TableRow key={issue.id} hover>
              <TableCell><Chip label={issue.issueType === '缺凭证' ? '缺截图' : issue.issueType} size="small" color={issue.issueType === '缺凭证' ? 'warning' : 'info'} /></TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{issue.orderNo}</TableCell>
              <TableCell>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => handleViewCustomerByCommission(issue)}
                  sx={{ p: 0, minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', fontWeight: 500 }}
                >
                  {issue.customerName}
                </Button>
              </TableCell>
              <TableCell>{issue.owner}（{issue.role}）</TableCell>
              <TableCell sx={{ color: '#d32f2f', fontWeight: 700 }}>{formatCurrency(issue.amount)}</TableCell>
              <TableCell>{issue.reason}</TableCell>
              <TableCell><Chip label={issue.status} size="small" color={getStatusColor(issue.status)} /></TableCell>
              <TableCell align="center">
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                  {issue.status === '待确认' && (
                    <Button size="small" variant="contained" onClick={() => handleConfirmOrderSplit(issue.orderId)}>确认</Button>
                  )}
                  {issue.status === '待确认' && (
                    <Button size="small" variant="outlined" onClick={() => handleOpenSplitDialog(issue.orderId)}>调整分账</Button>
                  )}
                  {issue.status !== '已取消' && (
                    <Button size="small" color="error" onClick={() => handleStatus(issue.commissionId, '已取消')}>取消</Button>
                  )}
                </Box>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                当前没有待确认或异常问题
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderSettlement = () => (
    <>
      <Box sx={{ display: 'flex', gap: 1.5, my: 2.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label="结算月份"
          type="month"
          value={localFilters.month}
          onChange={(e) => handleFilterChange('month', e.target.value)}
          size="small"
          InputLabelProps={{ shrink: true }}
        />
        <Button variant="contained" startIcon={<PaymentsIcon />} onClick={() => generateBatch(localFilters.month)}>
          生成月度结算批次
        </Button>
      </Box>
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>批次号</TableCell>
              <TableCell>月份</TableCell>
              <TableCell>记录数</TableCell>
              <TableCell>应发</TableCell>
              <TableCell>待确认</TableCell>
              <TableCell>待发</TableCell>
              <TableCell>已发</TableCell>
              <TableCell>冲销/取消</TableCell>
              <TableCell>状态</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {batches.map((batch) => (
              <TableRow key={batch.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{batch.batchNo}</TableCell>
                <TableCell>{batch.period}</TableCell>
                <TableCell>{batch.totalCount}</TableCell>
                <TableCell>{formatCurrency(batch.totalAmount)}</TableCell>
                <TableCell>{formatCurrency(batch.pendingReviewAmount)}</TableCell>
                <TableCell>{formatCurrency(batch.pendingPayAmount)}</TableCell>
                <TableCell>{formatCurrency(batch.paidAmount)}</TableCell>
                <TableCell>{formatCurrency(batch.cancelledAmount)}</TableCell>
                <TableCell><Chip label={batch.status} size="small" color={batch.status === '已发放' ? 'success' : batch.status === '待确认' ? 'info' : 'warning'} /></TableCell>
                <TableCell align="center">
                  <Button size="small" variant="outlined" disabled={batch.status === '已发放' || batch.pendingPayAmount <= 0} onClick={() => payBatch(batch.id)}>
                    批量发放
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {batches.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                  请选择月份生成结算批次
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>财务结算工作台</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            订单入库后自动生成分账草稿，财务在这里确认提成、处理冲销并进行月度发放。
          </Typography>
        </Box>
        {selected.size > 0 && tabValue === 0 && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="outlined" color="info" onClick={handleBatchApprove}>批量确认 ({selected.size})</Button>
            <Button size="small" variant="contained" onClick={handleBatchPay}>批量发放 ({selected.size})</Button>
          </Box>
        )}
      </Box>

      <Tabs value={tabValue} onChange={(_, value) => setTabValue(value)} sx={{ mb: 3, borderBottom: '1px solid #e5e7eb' }}>
        <Tab label="提成记录" />
        <Tab label="提成确认" />
        <Tab label="月度结算" />
        <Tab label="规则配置" />
        <Tab label="异常/冲销记录" />
      </Tabs>

      {tabValue === 0 && (
        <>
          <CommissionStats />
          {renderToolbar()}
          {renderCommissionTable(items, true)}
        </>
      )}

      {tabValue === 1 && (
        <>
          <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
            <SummaryTile label="待确认事项" value={`${auditIssues.length} 条`} hint="缺截图、需调整、冻结和冲销" />
            <SummaryTile label="待确认金额" value={formatCurrency(auditIssues.reduce((sum, item) => sum + item.amount, 0))} />
            <SummaryTile label="本月待确认" value={formatCurrency(stats?.pendingReview || 0)} />
          </Box>
          {renderToolbar()}
          {renderAuditTable(auditIssues)}
        </>
      )}

      {tabValue === 2 && renderSettlement()}

      {tabValue === 3 && <CommissionRuleConfig />}

      {tabValue === 4 && (
        <>
          <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
            <SummaryTile label="异常/冲销记录" value={`${exceptionItems.length} 条`} />
            <SummaryTile label="已取消金额" value={formatCurrency(exceptionItems.filter((item) => item.status === '已取消').reduce((sum, item) => sum + item.commissionAmount, 0))} />
          </Box>
          {renderCommissionTable(exceptionItems)}
        </>
      )}

      <Dialog open={Boolean(detailCommission)} onClose={() => setDetailCommission(null)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setDetailCommission(null)}>计算依据</DialogCloseTitle>
        <DialogContent>
          {detailCommission && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 1.5, mt: 1 }}>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>订单号</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{detailCommission.orderNo}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>客户</Typography>
              <Typography variant="body2">{detailCommission.customerName}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>命中场景</Typography>
              <Typography variant="body2">{detailCommission.scene || '-'}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>资源归属</Typography>
              <Typography variant="body2">{detailCommission.resourceOwnership || '-'}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>公式</Typography>
              <Typography variant="body2">{detailCommission.formulaText || '-'}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>确认/异常原因</Typography>
              <Typography variant="body2">{detailCommission.auditReason || detailCommission.frozenReason || '-'}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>计算说明</Typography>
              <Typography variant="body2">{detailCommission.calculationNote || '-'}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>金额</Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#d32f2f' }}>{formatCurrency(detailCommission.commissionAmount)}</Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={orderDetailOpen} onClose={() => setOrderDetailOpen(false)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setOrderDetailOpen(false)}>订单凭证</DialogCloseTitle>
        <DialogContent>
          {orderDetail ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 1.5, mt: 1 }}>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>订单号</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{orderDetail.orderNo}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>客户</Typography>
              <Typography variant="body2">{orderDetail.customerName}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>产品等级</Typography>
              <Typography variant="body2">{orderDetail.productLevel}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>实付金额</Typography>
              <Typography variant="body2">{formatCurrency(orderDetail.actualAmount)}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>订单类型</Typography>
              <Typography variant="body2">{orderDetail.orderType}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>收款渠道</Typography>
              <Typography variant="body2">{orderDetail.officialPaymentChannel || orderDetail.paymentMethod}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>付款截图</Typography>
              <Typography variant="body2">{orderDetail.payments?.some((p) => p.voucherName || p.voucherPreview) ? '已上传' : '未上传'}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>成交路径/聊天记录</Typography>
              <Typography variant="body2">{orderDetail.dealEvidenceName || (orderDetail.dealEvidencePreview ? '已上传' : '未上传')}</Typography>
              <Divider sx={{ gridColumn: '1 / -1', my: 1 }} />
              <Typography variant="body2" sx={{ color: '#6b7280' }}>创建时间</Typography>
              <Typography variant="body2">{formatDate(orderDetail.createdAt)}</Typography>
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: '#9ca3af', textAlign: 'center', py: 4 }}>加载中...</Typography>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={splitDialogOpen} onClose={() => setSplitDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={() => setSplitDialogOpen(false)}>调整订单分账</DialogCloseTitle>
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
                  <TableCell sx={{ minWidth: 120 }}>
                    <Select
                      size="small"
                      value={row.role}
                      onChange={(e) => updateSplitRow(index, 'role', e.target.value as CommissionRole)}
                      fullWidth
                    >
                      {roleOptionsForSplit(row.role).map((role) => (
                        <MenuItem key={role.id} value={role.name}>{role.name}{role.isActive ? '' : '（已停用）'}</MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell sx={{ minWidth: 140 }}>
                    <Select
                      size="small"
                      value={row.ownerId || ''}
                      onChange={(e) => handleSplitOwnerChange(index, e.target.value)}
                      fullWidth
                      displayEmpty
                    >
                      <MenuItem value="">选择员工</MenuItem>
                      {activeEmployees.map((employee) => (
                        <MenuItem key={employee.id} value={employee.id}>{employee.name}</MenuItem>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell sx={{ minWidth: 140 }}>
                    <TextField
                      size="small"
                      value={row.department || ''}
                      placeholder="选择人员后自动带出"
                      InputProps={{ readOnly: true }}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 120 }}>
                    <TextField
                      size="small"
                      type="number"
                      value={row.performanceAmount || 0}
                      onChange={(e) => updateSplitRow(index, 'performanceAmount', Number(e.target.value))}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 120 }}>
                    <TextField
                      size="small"
                      type="number"
                      value={row.commissionAmount}
                      onChange={(e) => updateSplitRow(index, 'commissionAmount', Number(e.target.value))}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell sx={{ minWidth: 180 }}>
                    <TextField
                      size="small"
                      value={row.calculationNote || ''}
                      onChange={(e) => updateSplitRow(index, 'calculationNote', e.target.value)}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell align="center">
                    <IconButton size="small" color="error" onClick={() => handleRemoveSplitRow(index)}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2, gap: 2 }}>
            <Button startIcon={<AddIcon />} onClick={handleAddSplitRow}>新增分账行</Button>
            <TextField
              label="调整原因"
              value={splitReason}
              onChange={(e) => setSplitReason(e.target.value)}
              size="small"
              required
              sx={{ minWidth: 320 }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSplitDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={handleSaveSplitRows}
            disabled={splitSaving || !splitReason.trim() || splitRows.length === 0 || splitRows.some((row) => !row.ownerId)}
          >
            保存调整
          </Button>
        </DialogActions>
      </Dialog>

      {selectedCustomer && (
        <CustomerDetail
          customer={selectedCustomer}
          open={customerOpen}
          onClose={() => setCustomerOpen(false)}
          onCreateOrder={handleCreateOrderForCustomer}
          onViewOrders={handleViewCustomerOrders}
        />
      )}

      <OrderForm
        open={orderFormOpen}
        customer={orderCustomer}
        onClose={() => { setOrderFormOpen(false); setOrderCustomer(null); }}
        onSuccess={() => {
          fetchItems();
          fetchAuditIssues();
          fetchStats();
          setOrderFormOpen(false);
          setOrderCustomer(null);
        }}
      />

      <Dialog open={customerOrdersOpen} onClose={() => setCustomerOrdersOpen(false)} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={() => setCustomerOrdersOpen(false)}>{orderCustomer?.company || orderCustomer?.name} 的订单</DialogCloseTitle>
        <DialogContent dividers>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>订单号</TableCell>
                <TableCell>产品分类</TableCell>
                <TableCell>订单类型</TableCell>
                <TableCell>金额</TableCell>
                <TableCell>付款日期</TableCell>
                <TableCell>退款状态</TableCell>
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
                  <TableCell>{formatDate(order.payments?.[0]?.paidAt || order.createdAt, 'yyyy-MM-dd HH:mm')}</TableCell>
                  <TableCell><RefundStatusBadge status={order.refundStatus} /></TableCell>
                </TableRow>
              ))}
              {customerOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#9ca3af' }}>暂无订单</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => orderCustomer && handleCreateOrderForCustomer(orderCustomer)}>新建订单</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Commission;
