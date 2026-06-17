import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormGroup,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import SortIcon from '@mui/icons-material/Sort';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import useOrderStore from '../../store/useOrderStore';
import { customerApi, orderApi, productApi, settingsApi } from '../../api';
import { getProductLevelColor, ORDER_STATUS, PRODUCT_LEVELS } from '../../shared/utils/constants';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import RefundStatusBadge from '../../shared/components/RefundStatusBadge';
import CustomerDetail from '../Customers/CustomerDetail';
import OrderDetail from './OrderDetail';
import OrderForm from './OrderForm';
import OrderHistoryDialog from './OrderHistoryDialog';
import OrderStats from './OrderStats';
import type { Customer } from '../../types/customer';
import type { Order } from '../../types/order';
import type { OrderTypeConfig } from '../../types/settings';

type OrderColumn = {
  id: string;
  label: string;
};

const ORDER_VIEW_STORAGE_KEY = 'aaos_order_table_columns';

const ORDER_COLUMNS: OrderColumn[] = [
  { id: 'customer', label: '客户' },
  { id: 'productLevel', label: '产品等级' },
  { id: 'orderType', label: '订单类型' },
  { id: 'actualAmount', label: '实付金额' },
  { id: 'paymentDate', label: '付款日期' },
  { id: 'status', label: '状态' },
  { id: 'refundStatus', label: '退款状态' },
  { id: 'owner', label: '销售负责人' },
  { id: 'createdAt', label: '创建时间' },
];

const DEFAULT_VISIBLE_COLUMNS = [
  'customer',
  'productLevel',
  'orderType',
  'actualAmount',
  'paymentDate',
  'status',
  'refundStatus',
  'owner',
  'createdAt',
];

const readVisibleColumns = () => {
  try {
    const raw = localStorage.getItem(ORDER_VIEW_STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_COLUMNS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_COLUMNS;
    const validIds = new Set(ORDER_COLUMNS.map((column) => column.id));
    const filtered = parsed.filter((id) => validIds.has(id));
    return filtered.length ? filtered : DEFAULT_VISIBLE_COLUMNS;
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
};

const Orders: React.FC = () => {
  const { items, filters, fetchItems, fetchStats, setFilters, delete: deleteOrder } = useOrderStore();
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [productLevels, setProductLevels] = useState<{ name: string; color: string }[]>([]);
  const [orderTypeConfigs, setOrderTypeConfigs] = useState<OrderTypeConfig[]>([]);
  const [customerNameMap, setCustomerNameMap] = useState<Record<string, string>>({});
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(readVisibleColumns);

  useEffect(() => {
    fetchItems({ ...filters, paymentMethod: undefined });
    fetchStats();
    productApi.getProductLevelConfigs().then((res) => {
      if (res.code === 0) {
        setProductLevels(res.data.filter((level) => level.isActive).map((level) => ({ name: level.name, color: level.color })));
      }
    });
    settingsApi.fetchOrderTypeConfigs().then((res) => {
      if (res.code === 0) setOrderTypeConfigs(res.data);
    });
    customerApi.fetchCustomers({ pageSize: 1000 }).then((res) => {
      if (res.code !== 0) return;
      setCustomerNameMap(Object.fromEntries(res.data.items.map((customer) => [customer.id, customer.name])));
    });
  }, [fetchItems, fetchStats]);

  useEffect(() => {
    localStorage.setItem(ORDER_VIEW_STORAGE_KEY, JSON.stringify(visibleColumnIds));
  }, [visibleColumnIds]);

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
    const newFilters = { ...filters, paymentMethod: undefined, [key]: value || undefined };
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handlePaymentDateSort = () => {
    const nextDirection: 'asc' | 'desc' = filters.sortBy === 'paymentDate' && filters.sortDirection === 'desc' ? 'asc' : 'desc';
    const newFilters = { ...filters, paymentMethod: undefined, sortBy: 'paymentDate' as const, sortDirection: nextDirection };
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handleToggleColumn = (id: string) => {
    setVisibleColumnIds((current) => (
      current.includes(id)
        ? current.filter((columnId) => columnId !== id)
        : [...current, id]
    ));
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
  const orderTypeOptions = orderTypeConfigs.filter((item) => item.isActive);
  const selectedOrderType = orderTypeOptions.some((item) => item.name === filters.orderType)
    ? filters.orderType || ''
    : '';
  const visibleColumns = useMemo(
    () => ORDER_COLUMNS.filter((column) => visibleColumnIds.includes(column.id)),
    [visibleColumnIds],
  );

  const renderOrderCell = (order: Order, columnId: string) => {
    const levelColor = getProductLevelColor(order.productLevel);
    const customerDisplayName = customerNameMap[order.customerId] || order.customerName;
    switch (columnId) {
      case 'customer':
        return (
          <Button
            variant="text"
            size="small"
            onClick={() => handleViewCustomer(order)}
            sx={{ p: 0, minWidth: 0, justifyContent: 'flex-start', textTransform: 'none', fontWeight: 500 }}
          >
            {customerDisplayName}
          </Button>
        );
      case 'productLevel':
        return (
          <Chip
            label={order.productLevel}
            size="small"
            sx={{ bgcolor: `${levelColor}18`, color: levelColor, fontWeight: 600 }}
          />
        );
      case 'orderType':
        return <Chip label={order.orderType} size="small" variant="outlined" />;
      case 'actualAmount':
        return formatCurrency(order.actualAmount || order.amount);
      case 'paymentDate':
        return formatDate(order.payments?.[0]?.paidAt || order.createdAt, 'yyyy-MM-dd HH:mm');
      case 'status':
        return <Chip label={order.status} size="small" color={order.status === '已完成' ? 'success' : order.status === '待确认' ? 'warning' : 'default'} />;
      case 'refundStatus':
        return <RefundStatusBadge status={order.refundStatus} />;
      case 'owner':
        return order.owner;
      case 'createdAt':
        return formatDate(order.createdAt);
      default:
        return null;
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          订单管理
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsOpen(true)}>
            视图设置
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateOrder}>
            新增订单
          </Button>
        </Box>
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
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>订单类型</InputLabel>
          <Select value={selectedOrderType} label="订单类型" onChange={(e) => handleFilterChange('orderType', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {orderTypeOptions.map((item) => (
              <MenuItem key={item.id} value={item.name}>{item.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>状态</InputLabel>
          <Select value={filters.status || ''} label="状态" onChange={(e) => handleFilterChange('status', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {Object.values(ORDER_STATUS).map((status) => (
              <MenuItem key={status} value={status}>{status}</MenuItem>
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
              {visibleColumns.map((column) => (
                <TableCell key={column.id}>{column.label}</TableCell>
              ))}
              <TableCell align="center" sx={{ width: 160 }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((order) => {
              const levelColor = getProductLevelColor(order.productLevel);
              return (
                <TableRow key={order.id} hover sx={{ bgcolor: `${levelColor}08` }}>
                  <TableCell sx={{ fontWeight: 500 }}>{order.orderNo}</TableCell>
                  {visibleColumns.map((column) => (
                    <TableCell key={column.id}>{renderOrderCell(order, column.id)}</TableCell>
                  ))}
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
        onSuccess={() => { fetchItems({ ...filters, paymentMethod: undefined }); fetchStats(); }}
      />
      <OrderHistoryDialog
        order={selectedOrder}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
      <Dialog open={viewSettingsOpen} onClose={() => setViewSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>订单列表视图设置</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: '#6b7280', mb: 2 }}>
            勾选后会显示在订单管理列表中，设置会保存在当前浏览器。
          </Typography>
          <FormGroup sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
            {ORDER_COLUMNS.map((column) => (
              <FormControlLabel
                key={column.id}
                control={(
                  <Checkbox
                    checked={visibleColumnIds.includes(column.id)}
                    onChange={() => handleToggleColumn(column.id)}
                  />
                )}
                label={column.label}
              />
            ))}
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setVisibleColumnIds(DEFAULT_VISIBLE_COLUMNS)}>恢复默认</Button>
          <Button variant="contained" onClick={() => setViewSettingsOpen(false)}>完成</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Orders;
