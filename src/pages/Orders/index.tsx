import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, IconButton, Button, TextField,
  MenuItem, FormControl, InputLabel, Select, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SortIcon from '@mui/icons-material/Sort';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HistoryIcon from '@mui/icons-material/History';
import useOrderStore from '../../store/useOrderStore';
import { PRODUCT_LEVELS, getProductLevelColor, ORDER_STATUS, ORDER_TYPES, PAYMENT_METHODS } from '../../shared/utils/constants';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import { customerApi, orderApi, productApi } from '../../api';
import OrderStats from './OrderStats';
import OrderDetail from './OrderDetail';
import OrderForm from './OrderForm';
import OrderHistoryDialog from './OrderHistoryDialog';
import CustomerDetail from '../Customers/CustomerDetail';
import RefundStatusBadge from '../../shared/components/RefundStatusBadge';
import type { Order } from '../../types/order';
import type { Customer } from '../../types/customer';
import type { ProductLevel, OrderType, PaymentMethod } from '../../types/common';

const Orders: React.FC = () => {
  const { items, loading, filters, fetchItems, fetchStats, setFilters, delete: deleteOrder } = useOrderStore();
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [productLevels, setProductLevels] = useState<{ name: string; color: string }[]>([]);

  useEffect(() => {
    fetchItems();
    fetchStats();
    productApi.getProductLevelConfigs().then((res) => {
      if (res.code === 0) {
        setProductLevels(res.data.filter((level) => level.isActive).map((level) => ({ name: level.name, color: level.color })));
      }
    });
  }, [fetchItems, fetchStats]);

  const handleViewDetail = (order: Order) => {
    setSelectedOrder(order);
    setDetailOpen(true);
  };

  const handleCreateOrder = () => {
    setEditingOrder(null);
    setFormOpen(true);
  };

  const handleEditOrder = (order: Order) => {
    setEditingOrder(order);
    setFormOpen(true);
  };

  const handleViewHistory = (order: Order) => {
    setSelectedOrder(order);
    setHistoryOpen(true);
  };

  const handleDeleteOrder = async (order: Order) => {
    const confirmed = window.confirm(`确认删除订单 ${order.orderNo} 吗？删除后该订单将从订单管理中移除。`);
    if (!confirmed) return;
    await deleteOrder(order.id);
  };

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handlePaymentDateSort = () => {
    const nextDirection: 'asc' | 'desc' = filters.sortBy === 'paymentDate' && filters.sortDirection === 'desc' ? 'asc' : 'desc';
    const newFilters = { ...filters, sortBy: 'paymentDate' as const, sortDirection: nextDirection };
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handleViewCustomer = async (order: Order) => {
    let customer: Customer | null = null;

    if (order.customerId) {
      const res = await customerApi.fetchCustomerById(order.customerId);
      if (res.code === 0) customer = res.data;
    }

    if (!customer) {
      const res = await customerApi.fetchCustomers({ search: order.customerName, pageSize: 1000 });
      if (res.code === 0) {
        customer = res.data.items.find(
          (item) => item.company === order.customerName || item.name === order.customerName,
        ) || res.data.items[0] || null;
      }
    }

    if (!customer) return;

    const allOrdersRes = await orderApi.fetchOrders({ pageSize: 1000 });
    const relatedOrders = allOrdersRes.code === 0
      ? allOrdersRes.data.items.filter(
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

  const productLevelOptions = productLevels.length
    ? productLevels
    : Object.values(PRODUCT_LEVELS).map((name) => ({ name, color: getProductLevelColor(name) }));
  const selectedProductLevel = productLevelOptions.some((level) => level.name === filters.productLevel)
    ? filters.productLevel || ''
    : '';

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          订单管理
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateOrder}>
          新增订单
        </Button>
      </Box>

      <OrderStats />

      <Box sx={{ display: 'flex', gap: 2, my: 3, flexWrap: 'wrap' }}>
        <TextField
          placeholder="搜索订单号/客户名"
          value={filters.search || ''}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          size="small"
          sx={{ minWidth: 240 }}
        />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>产品等级</InputLabel>
          <Select value={selectedProductLevel} label="产品等级" onChange={(e) => handleFilterChange('productLevel', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {productLevelOptions.map((level) => (
              <MenuItem key={level.name} value={level.name}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: level.color }} />
                  {level.name}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>订单类型</InputLabel>
          <Select value={filters.orderType || ''} label="订单类型" onChange={(e) => handleFilterChange('orderType', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {ORDER_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>支付方式</InputLabel>
          <Select value={filters.paymentMethod || ''} label="支付方式" onChange={(e) => handleFilterChange('paymentMethod', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {PAYMENT_METHODS.map((m) => (
              <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>状态</InputLabel>
          <Select value={filters.status || ''} label="状态" onChange={(e) => handleFilterChange('status', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {Object.values(ORDER_STATUS).map((s) => (
              <MenuItem key={s} value={s}>{s}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="outlined" startIcon={<SortIcon />} onClick={handlePaymentDateSort}>
          付款日期{filters.sortBy === 'paymentDate' && filters.sortDirection === 'asc' ? '升序' : '降序'}
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>订单号</TableCell>
              <TableCell>客户</TableCell>
              <TableCell>产品等级</TableCell>
              <TableCell>订单类型</TableCell>
              <TableCell>金额</TableCell>
              <TableCell>付款日期</TableCell>
              <TableCell>支付方式</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>退款状态</TableCell>
              <TableCell>负责人</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell align="center" sx={{ width: 160 }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((order) => {
              const levelColor = getProductLevelColor(order.productLevel);
              return (
                <TableRow
                  key={order.id}
                  hover
                  sx={{ bgcolor: `${levelColor}08` }}
                >
                  <TableCell sx={{ fontWeight: 500 }}>{order.orderNo}</TableCell>
                  <TableCell>
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => handleViewCustomer(order)}
                      sx={{ p: 0, minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', fontWeight: 500 }}
                    >
                      {order.customerName}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={order.productLevel}
                      size="small"
                      sx={{ bgcolor: `${levelColor}18`, color: levelColor, fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip label={order.orderType} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell>{formatCurrency(order.amount)}</TableCell>
                  <TableCell>{formatDate(order.payments?.[0]?.paidAt || order.createdAt)}</TableCell>
                  <TableCell>{order.paymentMethod || '-'}</TableCell>
                  <TableCell>
                    <Chip label={order.status} size="small" color={order.status === '已完成' ? 'success' : order.status === '待确认' ? 'warning' : 'default'} />
                  </TableCell>
                  <TableCell>
                    <RefundStatusBadge status={order.refundStatus} />
                  </TableCell>
                  <TableCell>{order.owner}</TableCell>
                  <TableCell>{formatDate(order.createdAt)}</TableCell>
                  <TableCell align="center" sx={{ width: 160, minWidth: 160 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.5 }}>
                      <Tooltip title="查看">
                        <IconButton size="small" color="primary" aria-label="查看" onClick={() => handleViewDetail(order)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="编辑">
                        <IconButton size="small" color="info" aria-label="编辑" onClick={() => handleEditOrder(order)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="修改记录">
                        <IconButton size="small" color="secondary" aria-label="修改记录" onClick={() => handleViewHistory(order)}>
                          <HistoryIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除">
                        <IconButton size="small" color="error" aria-label="删除" onClick={() => handleDeleteOrder(order)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {selectedOrder && (
        <OrderDetail order={selectedOrder} open={detailOpen} onClose={() => setDetailOpen(false)} />
      )}

      {selectedCustomer && (
        <CustomerDetail
          customer={selectedCustomer}
          open={customerOpen}
          onClose={() => setCustomerOpen(false)}
          onEdit={() => undefined}
        />
      )}

      <OrderForm
        open={formOpen}
        order={editingOrder}
        onClose={() => { setFormOpen(false); setEditingOrder(null); }}
        onSuccess={() => { fetchItems(); fetchStats(); }}
      />
      <OrderHistoryDialog
        order={selectedOrder}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </Box>
  );
};

export default Orders;
