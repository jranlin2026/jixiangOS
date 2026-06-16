import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, Button, TextField,
  MenuItem, FormControl, InputLabel, Select,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import useRefundStore from '../../store/useRefundStore';
import { REFUND_CATEGORIES, PRODUCT_LEVEL_COLOR_MAP } from '../../shared/utils/constants';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import RefundDetail from './RefundDetail';
import type { Refund } from '../../types/refund';
import type { RefundStatus, ProductLevel } from '../../types/common';

const RefundCenter: React.FC = () => {
  const { items, loading, filters, fetchItems, setFilters } = useRefundStore();
  const [selectedRefund, setSelectedRefund] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleViewDetail = (refund: any) => {
    setSelectedRefund(refund);
    setDetailOpen(true);
  };

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined } as any;
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const getStatusColor = (status: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    const map: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
      '退款申请中': 'warning',
      '退款已批准': 'info',
      '退款已完成': 'success',
      '退款已拒绝': 'error',
    };
    return map[status] || 'default';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        退款中心
      </Typography>

      {/* 筛选栏 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          placeholder="搜索退款号/客户名/订单号"
          value={filters.search || ''}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          size="small"
          sx={{ minWidth: 240 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>退款状态</InputLabel>
          <Select value={filters.status || ''} label="退款状态" onChange={(e) => handleFilterChange('status', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            <MenuItem value="退款申请中">退款申请中</MenuItem>
            <MenuItem value="退款已批准">退款已批准</MenuItem>
            <MenuItem value="退款已完成">退款已完成</MenuItem>
            <MenuItem value="退款已拒绝">退款已拒绝</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>退款分类</InputLabel>
          <Select value={(filters as any).refundCategory || ''} label="退款分类" onChange={(e) => handleFilterChange('refundCategory', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {REFUND_CATEGORIES.map((c) => (
              <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* 表格 */}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>退款号</TableCell>
              <TableCell>订单号</TableCell>
              <TableCell>客户</TableCell>
              <TableCell>产品等级</TableCell>
              <TableCell>订单金额</TableCell>
              <TableCell>退款金额</TableCell>
              <TableCell>退款分类</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>申请人</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((refund: any) => {
              const levelColor = PRODUCT_LEVEL_COLOR_MAP[refund.productLevel as ProductLevel] || '#9ca3af';
              return (
                <TableRow key={refund.id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{refund.refundNo}</TableCell>
                  <TableCell>{refund.orderNo}</TableCell>
                  <TableCell>{refund.customerName}</TableCell>
                  <TableCell>
                    <Chip label={refund.productLevel} size="small" sx={{ bgcolor: `${levelColor}18`, color: levelColor, fontWeight: 600 }} />
                  </TableCell>
                  <TableCell>{formatCurrency(refund.orderAmount)}</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#F44336' }}>{formatCurrency(refund.refundAmount)}</TableCell>
                  <TableCell>{refund.refundCategory}</TableCell>
                  <TableCell>
                    <Chip label={refund.status} size="small" color={getStatusColor(refund.status)} />
                  </TableCell>
                  <TableCell>{refund.applicantName}</TableCell>
                  <TableCell>{formatDate(refund.createdAt)}</TableCell>
                  <TableCell align="center">
                    <Button size="small" startIcon={<VisibilityIcon />} onClick={() => handleViewDetail(refund)}>
                      详情
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} align="center" sx={{ py: 6, color: '#9ca3af' }}>
                  暂无退款记录
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {selectedRefund && (
        <RefundDetail refund={selectedRefund} open={detailOpen} onClose={() => setDetailOpen(false)} />
      )}
    </Box>
  );
};

export default RefundCenter;
