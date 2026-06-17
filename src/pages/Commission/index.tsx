import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, Button, Checkbox,
  TextField, MenuItem, FormControl, InputLabel, Select, Tab, Tabs,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import useCommissionStore from '../../store/useCommissionStore';
import useOrderStore from '../../store/useOrderStore';
import { PRODUCT_LEVELS, getProductLevelColor } from '../../shared/utils/constants';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import CommissionStats from './CommissionStats';
import CommissionRuleConfig from './CommissionRuleConfig';
import type { Commission, CommissionRole } from '../../types/commission';
import type { ProductLevel } from '../../types/common';

const ROLE_LABELS: Record<CommissionRole, string> = {
  '销售': '销售',
  '线索': '线索',
  '客户成功': '客户成功',
  '售后': '售后',
  '招商主管': '招商主管',
  '销售主管': '销售主管',
};

const ROLE_COLORS: Record<CommissionRole, string> = {
  '销售': '#2196F3',
  '线索': '#FF9800',
  '客户成功': '#4CAF50',
  '售后': '#9C27B0',
  '招商主管': '#F44336',
  '销售主管': '#00BCD4',
};

const DEPARTMENTS = ['全部', '销售部', '市场部', '客户成功部', '售后服务部', '招商部'];

const Commission: React.FC = () => {
  const { items, stats, loading, fetchItems, fetchStats, updateStatus, setFilters, filters } = useCommissionStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tabValue, setTabValue] = useState(0);
  const [localFilters, setLocalFilters] = useState({
    month: '',
    role: '' as CommissionRole | '',
    department: '',
    status: '' as string,
    search: '',
  });

  // 订单详情 Dialog
  const [orderDetailOpen, setOrderDetailOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const { current: orderDetail, fetchById: fetchOrderById } = useOrderStore();

  useEffect(() => {
    fetchItems();
    fetchStats();
  }, [fetchItems, fetchStats]);

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...localFilters, [key]: value };
    setLocalFilters(newFilters);

    const apiFilters: any = {};
    if (newFilters.search) apiFilters.search = newFilters.search;
    if (newFilters.status) apiFilters.status = newFilters.status;
    if (newFilters.role) apiFilters.role = newFilters.role;
    if (newFilters.department && newFilters.department !== '全部') apiFilters.department = newFilters.department;
    if (newFilters.month) {
      const [y, m] = newFilters.month.split('-');
      apiFilters.startDate = `${y}-${m}-01`;
      const lastDay = new Date(Number(y), Number(m), 0).getDate();
      apiFilters.endDate = `${y}-${m}-${lastDay}`;
    }
    setFilters(apiFilters);
    fetchItems(apiFilters);
  };

  const handlePay = async (id: string) => {
    await updateStatus(id, '已发放');
    setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
  };

  const handleApprove = async (id: string) => {
    await updateStatus(id, '待发放');
  };

  const handleReject = async (id: string) => {
    await updateStatus(id, '已取消');
  };

  const handleViewOrder = async (orderId: string) => {
    setSelectedOrderId(orderId);
    await fetchOrderById(orderId);
    setOrderDetailOpen(true);
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
    const selectableIds = items.filter((c) => c.status === '待审核' || c.status === '待发放').map((c) => c.id);
    if (selected.size === selectableIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIds));
    }
  };

  const handleBatchApprove = async () => {
    const ids = Array.from(selected).filter((id) => {
      const item = items.find((c) => c.id === id);
      return item?.status === '待审核';
    });
    for (const id of ids) {
      await updateStatus(id, '待发放');
    }
    setSelected(new Set());
  };

  const handleBatchPay = async () => {
    const ids = Array.from(selected).filter((id) => {
      const item = items.find((c) => c.id === id);
      return item?.status === '待发放';
    });
    for (const id of ids) {
      await updateStatus(id, '已发放');
    }
    setSelected(new Set());
  };

  const getStatusColor = (status: string): 'default' | 'success' | 'error' | 'warning' | 'info' => {
    switch (status) {
      case '已发放': return 'success';
      case '已取消': return 'error';
      case '待审核': return 'info';
      case '待发放': return 'warning';
      default: return 'default';
    }
  };

  const selectableItems = items.filter((c) => c.status === '待审核' || c.status === '待发放');

  // 当前月份
  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          提成中心
        </Typography>
        {selected.size > 0 && tabValue === 0 && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="outlined" color="info" onClick={handleBatchApprove}>
              批量审核 ({selected.size})
            </Button>
            <Button size="small" variant="contained" onClick={handleBatchPay}>
              批量发放 ({selected.size})
            </Button>
          </Box>
        )}
      </Box>

      <Tabs value={tabValue} onChange={handleTabChange} sx={{ mb: 3, borderBottom: '1px solid #e5e7eb' }}>
        <Tab label="提成记录" />
        <Tab label="提成规则配置" />
      </Tabs>

      {tabValue === 0 && (
        <>
          <CommissionStats />

          {/* 筛选区 */}
          <Box sx={{ display: 'flex', gap: 2, my: 3, flexWrap: 'wrap' }}>
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
              value={localFilters.month || currentMonth}
              onChange={(e) => handleFilterChange('month', e.target.value)}
              size="small"
              sx={{ minWidth: 160 }}
              InputLabelProps={{ shrink: true }}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>角色</InputLabel>
              <Select
                value={localFilters.role}
                label="角色"
                onChange={(e) => handleFilterChange('role', e.target.value)}
              >
                <MenuItem value="">全部</MenuItem>
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <MenuItem key={k} value={k}>{v}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>部门</InputLabel>
              <Select
                value={localFilters.department}
                label="部门"
                onChange={(e) => handleFilterChange('department', e.target.value)}
              >
                {DEPARTMENTS.map((d) => (
                  <MenuItem key={d} value={d === '全部' ? '' : d}>{d}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>状态</InputLabel>
              <Select
                value={localFilters.status}
                label="状态"
                onChange={(e) => handleFilterChange('status', e.target.value)}
              >
                <MenuItem value="">全部</MenuItem>
                <MenuItem value="待审核">待审核</MenuItem>
                <MenuItem value="待发放">待发放</MenuItem>
                <MenuItem value="已发放">已发放</MenuItem>
                <MenuItem value="已取消">已取消</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={selected.size > 0 && selected.size < selectableItems.length}
                      checked={selectableItems.length > 0 && selected.size === selectableItems.length}
                      onChange={handleSelectAll}
                    />
                  </TableCell>
                  <TableCell>订单号</TableCell>
                  <TableCell>客户</TableCell>
                  <TableCell>产品等级</TableCell>
                  <TableCell>角色</TableCell>
                  <TableCell>人员</TableCell>
                  <TableCell>部门</TableCell>
                  <TableCell>订单金额</TableCell>
                  <TableCell>提成比例</TableCell>
                  <TableCell>提成金额</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell align="center">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((comm) => {
                  const levelColor = getProductLevelColor(comm.productLevel);
                  const roleColor = ROLE_COLORS[comm.role] || '#9ca3af';
                  const isSelectable = comm.status === '待审核' || comm.status === '待发放';
                  return (
                    <TableRow key={comm.id} hover>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selected.has(comm.id)}
                          onChange={() => handleSelect(comm.id)}
                          disabled={!isSelectable}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{comm.orderNo}</TableCell>
                      <TableCell>{comm.customerName}</TableCell>
                      <TableCell>
                        <Chip label={comm.productLevel} size="small" sx={{ bgcolor: `${levelColor}18`, color: levelColor, fontWeight: 600 }} />
                      </TableCell>
                      <TableCell>
                        <Chip label={ROLE_LABELS[comm.role] || comm.role} size="small" sx={{ bgcolor: `${roleColor}18`, color: roleColor, fontWeight: 600 }} />
                      </TableCell>
                      <TableCell>{comm.owner}</TableCell>
                      <TableCell>{comm.department}</TableCell>
                      <TableCell>{formatCurrency(comm.orderAmount)}</TableCell>
                      <TableCell>
                        {comm.commissionRate > 0
                          ? `${Math.round(comm.commissionRate * 100)}%`
                          : '固定金额'}
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, color: '#F44336' }}>{formatCurrency(comm.commissionAmount)}</TableCell>
                      <TableCell>
                        <Chip label={comm.status} size="small" color={getStatusColor(comm.status)} />
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          {comm.status === '待审核' && (
                            <>
                              <IconButton size="small" color="info" onClick={() => handleApprove(comm.id)} title="审核通过">
                                <CheckCircleIcon fontSize="small" />
                              </IconButton>
                              <IconButton size="small" color="error" onClick={() => handleReject(comm.id)} title="驳回">
                                <CancelIcon fontSize="small" />
                              </IconButton>
                            </>
                          )}
                          {comm.status === '待发放' && (
                            <Button size="small" variant="outlined" onClick={() => handlePay(comm.id)}>
                              发放
                            </Button>
                          )}
                          <IconButton size="small" onClick={() => handleViewOrder(comm.orderId)} title="查看订单">
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {/* 订单详情 Dialog */}
          <Dialog open={orderDetailOpen} onClose={() => setOrderDetailOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>订单详情</DialogTitle>
            <DialogContent>
              {orderDetail ? (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>订单号</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{orderDetail.orderNo}</Typography>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>客户</Typography>
                  <Typography variant="body2">{orderDetail.customerName}</Typography>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>产品等级</Typography>
                  <Typography variant="body2">{orderDetail.productLevel}</Typography>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>订单金额</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(orderDetail.amount)}</Typography>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>实付金额</Typography>
                  <Typography variant="body2">{formatCurrency(orderDetail.actualAmount)}</Typography>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>订单类型</Typography>
                  <Typography variant="body2">{orderDetail.orderType}</Typography>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>支付方式</Typography>
                  <Typography variant="body2">{orderDetail.paymentMethod}</Typography>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>销售顾问</Typography>
                  <Typography variant="body2">{orderDetail.salesName || orderDetail.owner}</Typography>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>客户成功</Typography>
                  <Typography variant="body2">{orderDetail.successName || '-'}</Typography>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>状态</Typography>
                  <Typography variant="body2">{orderDetail.status}</Typography>
                  <Typography variant="body2" sx={{ color: '#6b7280' }}>创建时间</Typography>
                  <Typography variant="body2">{formatDate(orderDetail.createdAt)}</Typography>
                </Box>
              ) : (
                <Typography variant="body2" sx={{ color: '#9ca3af', textAlign: 'center', py: 4 }}>
                  加载中...
                </Typography>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOrderDetailOpen(false)}>关闭</Button>
            </DialogActions>
          </Dialog>
        </>
      )}

      {tabValue === 1 && <CommissionRuleConfig />}
    </Box>
  );
};

export default Commission;
