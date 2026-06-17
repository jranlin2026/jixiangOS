import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, TextField,
  MenuItem, FormControl, InputLabel, Select, Card, CardContent, IconButton, Tooltip,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import useRefundStore from '../../store/useRefundStore';
import { REFUND_CATEGORIES, getProductLevelColor } from '../../shared/utils/constants';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import RefundDetail from './RefundDetail';
import RefundProcessDialog from './RefundProcessDialog';
import type { Refund } from '../../types/refund';

const RefundCenter: React.FC = () => {
  const {
    items,
    stats,
    filters,
    fetchItems,
    fetchStats,
    setFilters,
    assign,
    addLog,
    markSuccess,
    markFailed,
  } = useRefundStore();
  const [selectedRefund, setSelectedRefund] = useState<Refund | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);
  const [processAction, setProcessAction] = useState<'assign' | 'log' | 'success' | 'failed'>('assign');

  useEffect(() => {
    fetchItems();
    fetchStats();
  }, [fetchItems, fetchStats]);

  const handleViewDetail = (refund: Refund) => {
    setSelectedRefund(refund);
    setDetailOpen(true);
  };

  const handleOpenProcess = (refund: Refund, action: typeof processAction) => {
    setSelectedRefund(refund);
    setProcessAction(action);
    setProcessOpen(true);
  };

  const handleProcessSubmit = async (data: any) => {
    if (!selectedRefund) return;
    if (processAction === 'assign') await assign(selectedRefund.id, data);
    if (processAction === 'log') await addLog(selectedRefund.id, data);
    if (processAction === 'success') await markSuccess(selectedRefund.id, { ...data, retainedAmount: Number(data.retainedAmount) || selectedRefund.orderAmount });
    if (processAction === 'failed') await markFailed(selectedRefund.id, data);
    setProcessOpen(false);
  };

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined } as any;
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const getStatusColor = (status: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    const map: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
      '退款申请中': 'warning',
      '待分配': 'warning',
      '挽回中': 'primary',
      '挽回成功': 'success',
      '待财务退款': 'secondary',
      '退款已批准': 'info',
      '退款已完成': 'success',
      '退款已拒绝': 'error',
    };
    return map[status] || 'default';
  };

  const actionIconSx = {
    width: 28,
    height: 28,
    borderRadius: 1,
    '& .MuiSvgIcon-root': { fontSize: 17 },
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        退款中心
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(7, 1fr)' }, gap: 2, mb: 3 }}>
        {[
          { label: '待分配', value: stats?.toAssign || 0, color: '#F59E0B' },
          { label: '挽回中', value: stats?.recovering || 0, color: '#2196F3' },
          { label: '待财务退款', value: stats?.waitingFinance || 0, color: '#9C27B0' },
          { label: '挽回成功', value: stats?.recoverySuccess || 0, color: '#4CAF50' },
          { label: '退款完成', value: stats?.completed || 0, color: '#607D8B' },
          { label: '冻结提成', value: formatCurrency(stats?.frozenCommissionAmount || 0), color: '#EF4444' },
          { label: '预计损失', value: formatCurrency(stats?.estimatedLossAmount || 0), color: '#F97316' },
        ].map((item) => (
          <Card key={item.label} elevation={0} sx={{ border: '1px solid #eef2f7' }}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant="caption" sx={{ color: '#6b7280' }}>{item.label}</Typography>
              <Typography variant="h6" sx={{ color: item.color, fontWeight: 700 }}>{item.value}</Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

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
            <MenuItem value="待分配">待分配</MenuItem>
            <MenuItem value="挽回中">挽回中</MenuItem>
            <MenuItem value="挽回成功">挽回成功</MenuItem>
            <MenuItem value="待财务退款">待财务退款</MenuItem>
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
        <TextField
          label="负责人"
          value={(filters as any).owner || ''}
          onChange={(e) => handleFilterChange('owner', e.target.value)}
          size="small"
          sx={{ minWidth: 120 }}
        />
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
              <TableCell>挽回负责人</TableCell>
              <TableCell>次数</TableCell>
              <TableCell>风险</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell align="center" sx={{ width: 160 }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((refund: any) => {
              const levelColor = getProductLevelColor(refund.productLevel);
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
                  <TableCell>{refund.recoveryTask?.assignedToName || refund.applicantName}</TableCell>
                  <TableCell>{refund.recoveryTask?.attemptCount || 0}/{refund.recoveryTask?.maxAttempts || 3}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {refund.riskTags?.length ? refund.riskTags.map((tag: string) => (
                        <Chip key={tag} label={tag} size="small" color={tag === '高金额' ? 'error' : 'warning'} variant="outlined" />
                      )) : '-'}
                    </Box>
                  </TableCell>
                  <TableCell>{formatDate(refund.createdAt)}</TableCell>
                  <TableCell align="center" sx={{ width: 160, minWidth: 160 }}>
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', alignItems: 'center', flexWrap: 'nowrap' }}>
                      <Tooltip title="详情">
                        <IconButton aria-label="详情" size="small" color="primary" sx={actionIconSx} onClick={() => handleViewDetail(refund)}>
                          <VisibilityIcon />
                        </IconButton>
                      </Tooltip>
                      {['待分配', '退款申请中'].includes(refund.status) && (
                        <Tooltip title="分配">
                          <IconButton aria-label="分配" size="small" color="primary" sx={actionIconSx} onClick={() => handleOpenProcess(refund, 'assign')}>
                            <AssignmentIndIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                      {['待分配', '挽回中'].includes(refund.status) && (
                        <>
                          <Tooltip title="记录沟通">
                            <IconButton aria-label="记录沟通" size="small" color="info" sx={actionIconSx} onClick={() => handleOpenProcess(refund, 'log')}>
                              <ChatBubbleOutlineIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="挽回成功">
                            <IconButton aria-label="挽回成功" size="small" color="success" sx={actionIconSx} onClick={() => handleOpenProcess(refund, 'success')}>
                              <CheckCircleOutlineIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="挽回失败">
                            <IconButton aria-label="挽回失败" size="small" color="warning" sx={actionIconSx} onClick={() => handleOpenProcess(refund, 'failed')}>
                              <HighlightOffIcon />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={13} align="center" sx={{ py: 6, color: '#9ca3af' }}>
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

      <RefundProcessDialog
        open={processOpen}
        action={processAction}
        refund={selectedRefund || undefined}
        onClose={() => setProcessOpen(false)}
        onSubmit={handleProcessSubmit}
      />
    </Box>
  );
};

export default RefundCenter;
