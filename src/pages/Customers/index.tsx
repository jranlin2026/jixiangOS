import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
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
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import useCustomerStore from '../../store/useCustomerStore';
import { orderApi, settingsApi } from '../../api';
import { CUSTOMER_LEVELS, getProductLevelColor, normalizeResourceOwnership } from '../../shared/utils/constants';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import CustomerLevelBadge from '../../shared/components/CustomerLevelBadge';
import CustomerDetail from './CustomerDetail';
import CustomerForm from './CustomerForm';
import OrderForm from '../Orders/OrderForm';
import type { Customer } from '../../types/customer';
import type { Order } from '../../types/order';
import type { User } from '../../types/settings';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import ResizableHeaderCell, {
  getResizableCellSx,
  readColumnWidths,
  resetColumnWidths,
  resizeColumnWidths,
  writeColumnWidths,
  type ColumnWidthMap,
} from '../../shared/components/ResizableTable';

type CustomerColumn = {
  id: string;
  label: string;
  render: (customer: Customer) => React.ReactNode;
};

const CUSTOMER_VIEW_STORAGE_KEY = 'aaos_customer_table_columns_v3';
const CUSTOMER_WIDTH_STORAGE_KEY = 'aaos_customer_table_column_widths_v1';
const formatCustomerSource = (customer: Customer) => [customer.leadSource, customer.sourceName].filter(Boolean).join('-') || '-';

const CUSTOMER_COLUMNS: CustomerColumn[] = [
  { id: 'company', label: '公司', render: (customer) => customer.company || '-' },
  { id: 'phone', label: '电话', render: (customer) => customer.phone || '-' },
  { id: 'wechat', label: '微信', render: (customer) => customer.wechat || '-' },
  { id: 'email', label: '邮箱', render: (customer) => customer.email || '-' },
  {
    id: 'customerLevel',
    label: '客户等级',
    render: (customer) => <CustomerLevelBadge level={customer.customerLevel} />,
  },
  { id: 'leadSource', label: '线索来源', render: (customer) => formatCustomerSource(customer) },
  { id: 'sourceType', label: '资源归属', render: (customer) => normalizeResourceOwnership(customer.sourceType) },
  { id: 'leadInputBy', label: '线索录入人', render: (customer) => customer.leadInputBy || '-' },
  { id: 'industry', label: '行业', render: (customer) => customer.industry || '-' },
  { id: 'city', label: '城市', render: (customer) => customer.city || '-' },
  { id: 'originalSalesTransferBy', label: '原销转人员', render: (customer) => customer.originalSalesTransferBy || '-' },
  { id: 'totalSpent', label: '累计消费', render: (customer) => formatCurrency(customer.totalSpent) },
  { id: 'orderCount', label: '订单数', render: (customer) => customer.orderCount },
  { id: 'owner', label: '销售负责人', render: (customer) => customer.owner || '-' },
  { id: 'createdAt', label: '创建时间', render: (customer) => formatDate(customer.createdAt) },
];

const DEFAULT_VISIBLE_COLUMNS = [
  'company',
  'phone',
  'customerLevel',
  'leadSource',
  'sourceType',
  'leadInputBy',
  'industry',
  'originalSalesTransferBy',
  'totalSpent',
  'orderCount',
  'owner',
  'createdAt',
];

const DEFAULT_COLUMN_WIDTHS: ColumnWidthMap = {
  name: 180,
  company: 220,
  phone: 150,
  wechat: 150,
  email: 180,
  customerLevel: 130,
  leadSource: 160,
  sourceType: 140,
  leadInputBy: 140,
  industry: 140,
  city: 120,
  originalSalesTransferBy: 160,
  totalSpent: 140,
  orderCount: 120,
  owner: 140,
  createdAt: 180,
};

const readVisibleColumns = () => {
  try {
    const raw = localStorage.getItem(CUSTOMER_VIEW_STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_COLUMNS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_COLUMNS;
    const validIds = new Set(CUSTOMER_COLUMNS.map((column) => column.id));
    const filtered = parsed.filter((id) => validIds.has(id));
    return filtered.length ? filtered : DEFAULT_VISIBLE_COLUMNS;
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
};

const Customers: React.FC = () => {
  const { items, filters, pagination, fetchItems, setFilters } = useCustomerStore();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [orderFormOpen, setOrderFormOpen] = useState(false);
  const [orderCustomer, setOrderCustomer] = useState<Customer | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(readVisibleColumns);
  const [columnWidths, setColumnWidths] = useState<ColumnWidthMap>(() => readColumnWidths(CUSTOMER_WIDTH_STORAGE_KEY, DEFAULT_COLUMN_WIDTHS));

  useEffect(() => {
    fetchItems();
    settingsApi.fetchUsers({ isActive: true }).then((res) => {
      if (res.code === 0) {
        setUsers(res.data.filter((user) => user.isActive));
      }
    });
  }, [fetchItems]);

  useEffect(() => {
    localStorage.setItem(CUSTOMER_VIEW_STORAGE_KEY, JSON.stringify(visibleColumnIds));
  }, [visibleColumnIds]);

  useEffect(() => {
    writeColumnWidths(CUSTOMER_WIDTH_STORAGE_KEY, columnWidths);
  }, [columnWidths]);

  const visibleColumns = useMemo(
    () => CUSTOMER_COLUMNS.filter((column) => visibleColumnIds.includes(column.id)),
    [visibleColumnIds],
  );
  const tableMinWidth = useMemo(
    () => columnWidths.name + visibleColumns.reduce((sum, column) => sum + (columnWidths[column.id] || 0), 0) + 160,
    [columnWidths, visibleColumns],
  );

  const handleViewDetail = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailOpen(true);
  };

  const handleCreate = () => {
    setFormOpen(true);
  };

  const handleCreateOrder = (customer: Customer) => {
    setOrderCustomer(customer);
    setOrderFormOpen(true);
    setDetailOpen(false);
  };

  const handleViewOrders = async (customer: Customer) => {
    setOrderCustomer(customer);
    const res = await orderApi.fetchOrders({ customerId: customer.id, pageSize: 100 });
    setCustomerOrders(res.code === 0 ? res.data.items : []);
    setOrdersOpen(true);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFilters = { ...filters, search: e.target.value, productLevel: undefined, page: 1, pageSize: pagination.pageSize || 10 };
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, productLevel: undefined, [key]: value || undefined, page: 1, pageSize: pagination.pageSize || 10 };
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handlePageChange = (_: React.MouseEvent<HTMLButtonElement> | null, page: number) => {
    const newFilters = { ...filters, page: page + 1, pageSize: pagination.pageSize || 10 };
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const pageSize = Number(event.target.value);
    const newFilters = { ...filters, page: 1, pageSize };
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

  const handleResizeColumn = (id: string, delta: number) => {
    setColumnWidths((current) => resizeColumnWidths(current, id, delta));
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          客户管理
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsOpen(true)}>
            视图设置
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
            新增客户
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          placeholder="搜索客户姓名/公司/电话/微信"
          value={filters.search || ''}
          onChange={handleSearch}
          size="small"
          sx={{ minWidth: 260 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>客户等级</InputLabel>
          <Select value={filters.customerLevel || ''} label="客户等级" onChange={(e) => handleFilterChange('customerLevel', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {CUSTOMER_LEVELS.map((level) => (
              <MenuItem key={level.value} value={level.value}>{level.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>销售负责人</InputLabel>
          <Select value={filters.owner || ''} label="销售负责人" onChange={(e) => handleFilterChange('owner', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {users.map((user) => (
              <MenuItem key={user.id} value={user.name}>{user.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0', overflowX: 'auto' }}>
        <Table sx={{ tableLayout: 'fixed', minWidth: tableMinWidth }}>
          <TableHead>
            <TableRow>
              <ResizableHeaderCell columnId="name" width={columnWidths.name} onResize={handleResizeColumn}>姓名</ResizableHeaderCell>
              {visibleColumns.map((column) => (
                <ResizableHeaderCell key={column.id} columnId={column.id} width={columnWidths[column.id]} onResize={handleResizeColumn}>
                  {column.label}
                </ResizableHeaderCell>
              ))}
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((customer) => (
              <TableRow key={customer.id} hover>
                <TableCell sx={{ ...getResizableCellSx(columnWidths.name), fontWeight: 500 }} title={customer.name}>{customer.name}</TableCell>
                {visibleColumns.map((column) => (
                  <TableCell key={column.id} sx={getResizableCellSx(columnWidths[column.id])}>{column.render(customer)}</TableCell>
                ))}
                <TableCell align="center">
                  <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.5 }}>
                    <Tooltip title="查看客户">
                      <IconButton size="small" color="primary" onClick={() => handleViewDetail(customer)}>
                        <VisibilityIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="新建订单">
                      <IconButton size="small" color="info" onClick={() => handleCreateOrder(customer)}>
                        <AddShoppingCartIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="查看订单">
                      <IconButton size="small" color="secondary" onClick={() => handleViewOrders(customer)}>
                        <ReceiptLongIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + 2} align="center" sx={{ py: 6, color: '#9ca3af' }}>
                  暂无客户数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={pagination.total}
        page={Math.max((pagination.page || 1) - 1, 0)}
        rowsPerPage={pagination.pageSize || 10}
        rowsPerPageOptions={[10, 20, 50, 100]}
        onPageChange={handlePageChange}
        onRowsPerPageChange={handleRowsPerPageChange}
        labelRowsPerPage="每页条数"
        labelDisplayedRows={formatPaginationRows}
        sx={{
          border: '1px solid #f0f0f0',
          borderTop: 0,
          bgcolor: '#fff',
          '& .MuiTablePagination-toolbar': { minHeight: 48 },
        }}
      />

      {selectedCustomer && (
        <CustomerDetail
          customer={selectedCustomer}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          onCreateOrder={handleCreateOrder}
          onViewOrders={handleViewOrders}
          onUpdated={(updated) => {
            setSelectedCustomer(updated);
            fetchItems({ ...filters, productLevel: undefined });
          }}
        />
      )}

      <CustomerForm
        key="new"
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={() => fetchItems({ ...filters, productLevel: undefined })}
      />

      <OrderForm
        open={orderFormOpen}
        customer={orderCustomer}
        onClose={() => setOrderFormOpen(false)}
        onSuccess={() => {
          fetchItems({ ...filters, productLevel: undefined });
          if (orderCustomer) handleViewOrders(orderCustomer);
        }}
      />

      <Dialog open={viewSettingsOpen} onClose={() => setViewSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setViewSettingsOpen(false)}>客户列表视图设置</DialogCloseTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: '#6b7280', mb: 2 }}>
            勾选后会显示在客户管理列表中，设置会保存在当前浏览器。
          </Typography>
          <FormGroup sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
            {CUSTOMER_COLUMNS.map((column) => (
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
          <Button onClick={() => {
            setVisibleColumnIds(DEFAULT_VISIBLE_COLUMNS);
            setColumnWidths(resetColumnWidths(DEFAULT_COLUMN_WIDTHS));
          }}>恢复默认</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={ordersOpen} onClose={() => setOrdersOpen(false)} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={() => setOrdersOpen(false)}>{orderCustomer?.company || orderCustomer?.name} 的订单</DialogCloseTitle>
        <DialogContent dividers>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>订单号</TableCell>
                <TableCell>产品分类</TableCell>
                <TableCell>订单类型</TableCell>
                <TableCell>金额</TableCell>
                <TableCell>付款日期</TableCell>
                <TableCell>状态</TableCell>
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
                  <TableCell>{formatDate(order.payments?.[0]?.paidAt || order.createdAt)}</TableCell>
                  <TableCell>{order.status}</TableCell>
                </TableRow>
              ))}
              {customerOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#9ca3af' }}>
                    暂无订单
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => orderCustomer && handleCreateOrder(orderCustomer)}>新建订单</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Customers;
