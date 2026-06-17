import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, Button, TextField,
  MenuItem, FormControl, InputLabel, Select, LinearProgress,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import useUpgradeStore from '../../store/useUpgradeStore';
import { CUSTOMER_LEVEL_COLOR_MAP, getProductLevelColor } from '../../shared/utils/constants';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import UpgradeDetail from './UpgradeDetail';

const UpgradePool: React.FC = () => {
  const { items, loading, filters, fetchItems, refreshAI, setFilters } = useUpgradeStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleViewDetail = (id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined } as any;
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handleRefreshAI = async () => {
    await refreshAI();
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          升单机会池
        </Typography>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleRefreshAI} disabled={loading}>
          AI 刷新评分
        </Button>
      </Box>

      {/* 筛选栏 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          placeholder="搜索客户名称"
          value={filters.search || ''}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          size="small"
          sx={{ minWidth: 200 }}
        />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>状态</InputLabel>
          <Select value={filters.status || ''} label="状态" onChange={(e) => handleFilterChange('status', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            <MenuItem value="待跟进">待跟进</MenuItem>
            <MenuItem value="跟进中">跟进中</MenuItem>
            <MenuItem value="已转化">已转化</MenuItem>
            <MenuItem value="已流失">已流失</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>客户等级</InputLabel>
          <Select value={filters.currentLevel || ''} label="客户等级" onChange={(e) => handleFilterChange('currentLevel', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            <MenuItem value="L2">L2</MenuItem>
            <MenuItem value="L3">L3</MenuItem>
            <MenuItem value="L4">L4</MenuItem>
            <MenuItem value="L5">L5</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>最低概率</InputLabel>
          <Select value={filters.minProbability?.toString() || ''} label="最低概率" onChange={(e) => handleFilterChange('minProbability', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            <MenuItem value="80">≥80%</MenuItem>
            <MenuItem value="60">≥60%</MenuItem>
            <MenuItem value="40">≥40%</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* 表格 */}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>客户名称</TableCell>
              <TableCell>当前等级</TableCell>
              <TableCell>当前产品</TableCell>
              <TableCell>目标产品</TableCell>
              <TableCell>AI评分</TableCell>
              <TableCell>预估金额</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>负责人</TableCell>
              <TableCell>跟进次数</TableCell>
              <TableCell>最后跟进</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((opp: any) => {
              const probColor = opp.probability >= 80 ? '#4CAF50' : opp.probability >= 60 ? '#FF9800' : '#9ca3af';
              const targetColor = getProductLevelColor(opp.targetProduct);
              const currentLevelColor = CUSTOMER_LEVEL_COLOR_MAP[opp.currentLevel] || '#9ca3af';
              return (
                <TableRow key={opp.id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>{opp.customerName}</TableCell>
                  <TableCell>
                    <Chip label={opp.currentLevel} size="small" sx={{ bgcolor: `${currentLevelColor}18`, color: currentLevelColor, fontWeight: 600 }} />
                  </TableCell>
                  <TableCell>{opp.currentProduct}</TableCell>
                  <TableCell>
                    <Chip label={opp.targetProduct} size="small" sx={{ bgcolor: `${targetColor}18`, color: targetColor, fontWeight: 600 }} />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={opp.probability}
                        sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: '#f0f0f0', '& .MuiLinearProgress-bar': { bgcolor: probColor, borderRadius: 4 } }}
                      />
                      <Typography variant="body2" sx={{ fontWeight: 600, color: probColor, minWidth: 36 }}>
                        {opp.probability}%
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>{formatCurrency(opp.estimatedAmount)}</TableCell>
                  <TableCell>
                    <Chip
                      label={opp.status}
                      size="small"
                      color={opp.status === '已转化' ? 'success' : opp.status === '跟进中' ? 'primary' : opp.status === '已流失' ? 'error' : 'default'}
                    />
                  </TableCell>
                  <TableCell>{opp.ownerName}</TableCell>
                  <TableCell>{opp.followUpCount}</TableCell>
                  <TableCell>{opp.lastFollowUpAt ? formatDate(opp.lastFollowUpAt) : '-'}</TableCell>
                  <TableCell align="center">
                    <Button size="small" startIcon={<VisibilityIcon />} onClick={() => handleViewDetail(opp.id)}>
                      详情
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {selectedId && (
        <UpgradeDetail id={selectedId} open={detailOpen} onClose={() => setDetailOpen(false)} />
      )}
    </Box>
  );
};

export default UpgradePool;
