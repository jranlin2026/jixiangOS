import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, IconButton, Button, TextField,
  MenuItem, FormControl, InputLabel, Select, Dialog,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AddIcon from '@mui/icons-material/Add';
import useCustomerStore from '../../store/useCustomerStore';
import { PRODUCT_LEVELS, PRODUCT_LEVEL_COLOR_MAP, CUSTOMER_LEVELS } from '../../shared/utils/constants';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import CustomerLevelBadge from '../../shared/components/CustomerLevelBadge';
import CustomerDetail from './CustomerDetail';
import CustomerForm from './CustomerForm';
import type { Customer } from '../../types/customer';
import type { CustomerLevel, ProductLevel } from '../../types/common';

const Customers: React.FC = () => {
  const { items, loading, filters, fetchItems, setFilters } = useCustomerStore();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleViewDetail = (customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailOpen(true);
  };

  const handleCreate = () => {
    setEditCustomer(null);
    setFormOpen(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditCustomer(customer);
    setFormOpen(true);
    setDetailOpen(false);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFilters = { ...filters, search: e.target.value };
    setFilters(newFilters);
    fetchItems(newFilters);
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
          客户管理
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
          新增客户
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          placeholder="搜索客户名称/公司"
          value={filters.search || ''}
          onChange={handleSearch}
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
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>客户等级</InputLabel>
          <Select value={filters.customerLevel || ''} label="客户等级" onChange={(e) => handleFilterChange('customerLevel', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {CUSTOMER_LEVELS.map((cl) => (
              <MenuItem key={cl.value} value={cl.value}>{cl.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>负责人</InputLabel>
          <Select value={filters.owner || ''} label="负责人" onChange={(e) => handleFilterChange('owner', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            <MenuItem value="张伟">张伟</MenuItem>
            <MenuItem value="李娜">李娜</MenuItem>
            <MenuItem value="王磊">王磊</MenuItem>
            <MenuItem value="赵敏">赵敏</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>名称</TableCell>
              <TableCell>公司</TableCell>
              <TableCell>电话</TableCell>
              <TableCell>产品等级</TableCell>
              <TableCell>客户等级</TableCell>
              <TableCell>行业</TableCell>
              <TableCell>累计消费</TableCell>
              <TableCell>订单数</TableCell>
              <TableCell>负责人</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((customer) => (
              <TableRow key={customer.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{customer.name}</TableCell>
                <TableCell>{customer.company}</TableCell>
                <TableCell>{customer.phone}</TableCell>
                <TableCell>
                  <Chip
                    label={customer.productLevel}
                    size="small"
                    sx={{
                      bgcolor: `${PRODUCT_LEVEL_COLOR_MAP[customer.productLevel]}18`,
                      color: PRODUCT_LEVEL_COLOR_MAP[customer.productLevel],
                      fontWeight: 600,
                    }}
                  />
                </TableCell>
                <TableCell>
                  <CustomerLevelBadge level={customer.customerLevel} />
                </TableCell>
                <TableCell>{customer.industry || '-'}</TableCell>
                <TableCell>{formatCurrency(customer.totalSpent)}</TableCell>
                <TableCell>{customer.orderCount}</TableCell>
                <TableCell>{customer.owner}</TableCell>
                <TableCell>{formatDate(customer.createdAt)}</TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => handleViewDetail(customer)}>
                    <VisibilityIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} align="center" sx={{ py: 6, color: '#9ca3af' }}>
                  暂无客户数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {selectedCustomer && (
        <CustomerDetail
          customer={selectedCustomer}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          onEdit={handleEdit}
        />
      )}

      <CustomerForm
        key={editCustomer?.id ?? 'new'}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        customer={editCustomer}
        onSuccess={() => fetchItems()}
      />
    </Box>
  );
};

export default Customers;
