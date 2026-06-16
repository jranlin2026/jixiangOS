import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, IconButton, Button, TextField,
  MenuItem, FormControl, InputLabel, Select, Dialog,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import useOrderStore from '../../store/useOrderStore';
import { PRODUCT_LEVELS, PRODUCT_LEVEL_COLOR_MAP, ORDER_STATUS, ORDER_TYPES, PAYMENT_METHODS } from '../../shared/utils/constants';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import OrderStats from './OrderStats';
import OrderDetail from './OrderDetail';
import OrderForm from './OrderForm';
import RefundStatusBadge from '../../shared/components/RefundStatusBadge';
import type { Order } from '../../types/order';
import type { ProductLevel, OrderType, PaymentMethod } from '../../types/common';

const Orders: React.FC = () => {
  const { items, loading, filters, fetchItems, fetchStats, setFilters } = useOrderStore();
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => {
    fetchItems();
    fetchStats();
  }, [fetchItems, fetchStats]);

  const handleViewDetail = (order: Order) => {
    setSelectedOrder(order);
    setDetailOpen(true);
  };

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          订单管理
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
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
          <Select value={filters.productLevel || ''} label="产品等级" onChange={(e) => handleFilterChange('productLevel', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {Object.values(PRODUCT_LEVELS).map((l) => (
              <MenuItem key={l} value={l}>{l}</MenuItem>
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
              <TableCell>支付方式</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>退款状态</TableCell>
              <TableCell>负责人</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((order) => {
              const levelColor = PRODUCT_LEVEL_COLOR_MAP[order.productLevel] || '#9ca3af';
              return (
                <TableRow
                  key={order.id}
                  hover
                  sx={{ bgcolor: `${levelColor}08` }}
                >
                  <TableCell sx={{ fontWeight: 500 }}>{order.orderNo}</TableCell>
                  <TableCell>{order.customerName}</TableCell>
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
                  <TableCell>{order.paymentMethod || '-'}</TableCell>
                  <TableCell>
                    <Chip label={order.status} size="small" color={order.status === '已完成' ? 'success' : order.status === '待确认' ? 'warning' : 'default'} />
                  </TableCell>
                  <TableCell>
                    <RefundStatusBadge status={order.refundStatus} />
                  </TableCell>
                  <TableCell>{order.owner}</TableCell>
                  <TableCell>{formatDate(order.createdAt)}</TableCell>
                  <TableCell align="center">
                    <Button size="small" onClick={() => handleViewDetail(order)}>查看</Button>
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

      <OrderForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={() => { fetchItems(); fetchStats(); }}
      />
    </Box>
  );
};

export default Orders;
