import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, IconButton, Button, TextField,
  MenuItem, Select, FormControl, InputLabel, Dialog,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AddIcon from '@mui/icons-material/Add';
import useLeadStore from '../../store/useLeadStore';
import { LEAD_STATUS, LEAD_SOURCES } from '../../shared/utils/constants';
import { formatDate } from '../../shared/utils/formatters';
import LeadDetail from './LeadDetail';
import LeadForm from './LeadForm';
import type { Lead, LeadStatus, LeadSource } from '../../types/lead';
import { opportunityApi, settingsApi } from '../../api';
import { ROUTES } from '../../shared/utils/constants';
import type { LifecycleStatusConfig } from '../../types/settings';

const Leads: React.FC = () => {
  const navigate = useNavigate();
  const { items, loading, filters, fetchItems, setFilters } = useLeadStore();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [lifecycleConfigs, setLifecycleConfigs] = useState<LifecycleStatusConfig[]>([]);

  useEffect(() => {
    fetchItems();
    settingsApi.fetchLifecycleStatusConfigs().then((res) => {
      if (res.code === 0) setLifecycleConfigs(res.data);
    });
  }, [fetchItems]);

  const handleViewDetail = (lead: Lead) => {
    setSelectedLead(lead);
    setDetailOpen(true);
  };

  const handleCreate = () => {
    setEditLead(null);
    setFormOpen(true);
  };

  const handleEdit = (lead: Lead) => {
    setEditLead(lead);
    setFormOpen(true);
    setDetailOpen(false);
  };

  const getLifecycleColor = (status?: string) => lifecycleConfigs.find((item) => item.name === status)?.color || '#9E9E9E';

  const handleCreateOpportunity = async (lead: Lead) => {
    await opportunityApi.createFromLead(lead);
    setDetailOpen(false);
    navigate(ROUTES.OPPORTUNITIES);
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

  const getStatusColor = (status: LeadStatus): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    const map: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
      '新线索': 'info',
      '已联系': 'primary',
      '已验证': 'warning',
      '方案中': 'secondary',
      '谈判中': 'warning',
      '已成交': 'success',
      '已流失': 'error',
    };
    return map[status] || 'default';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          线索管理
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
          新增线索
        </Button>
      </Box>

      {/* 筛选栏 */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          placeholder="搜索线索名称/公司/电话"
          value={filters.search || ''}
          onChange={handleSearch}
          size="small"
          sx={{ minWidth: 240 }}
        />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>来源</InputLabel>
          <Select value={filters.source || ''} label="来源" onChange={(e) => handleFilterChange('source', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {Object.values(LEAD_SOURCES).map((s) => (
              <MenuItem key={s} value={s}>{s}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>状态</InputLabel>
          <Select value={filters.status || ''} label="状态" onChange={(e) => handleFilterChange('status', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {Object.values(LEAD_STATUS).map((s) => (
              <MenuItem key={s} value={s}>{s}</MenuItem>
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

      {/* 表格 */}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>名称</TableCell>
              <TableCell>公司</TableCell>
              <TableCell>电话</TableCell>
              <TableCell>来源</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>生命周期</TableCell>
              <TableCell>行业</TableCell>
              <TableCell>城市</TableCell>
              <TableCell>评分</TableCell>
              <TableCell>负责人</TableCell>
              <TableCell>AI升级概率</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((lead) => (
              <TableRow key={lead.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{lead.name}</TableCell>
                <TableCell>{lead.company || '-'}</TableCell>
                <TableCell>{lead.phone}</TableCell>
                <TableCell>{lead.source}</TableCell>
                <TableCell>
                  <Chip label={lead.status} color={getStatusColor(lead.status)} size="small" />
                </TableCell>
                <TableCell>
                  <Chip
                    label={lead.lifecycleStatus || '未转商机'}
                    size="small"
                    sx={{
                      bgcolor: `${getLifecycleColor(lead.lifecycleStatus)}18`,
                      color: getLifecycleColor(lead.lifecycleStatus),
                      fontWeight: 600,
                    }}
                  />
                </TableCell>
                <TableCell>{lead.industry || '-'}</TableCell>
                <TableCell>{lead.city || '-'}</TableCell>
                <TableCell>
                  {lead.score !== undefined ? (
                    <Typography variant="body2" sx={{ fontWeight: 600, color: lead.score >= 70 ? '#4CAF50' : lead.score >= 40 ? '#FF9800' : '#9ca3af' }}>
                      {lead.score}
                    </Typography>
                  ) : (
                    <Typography variant="body2" sx={{ color: '#9ca3af' }}>-</Typography>
                  )}
                </TableCell>
                <TableCell>{lead.owner}</TableCell>
                <TableCell>
                  {lead.aiAnalysis ? (
                    <Typography
                      variant="body2"
                      sx={{
                        color: lead.aiAnalysis.upgradeProbability >= 0.7 ? '#4CAF50' : lead.aiAnalysis.upgradeProbability >= 0.4 ? '#FF9800' : '#9ca3af',
                        fontWeight: 600,
                      }}
                    >
                      {Math.round(lead.aiAnalysis.upgradeProbability * 100)}%
                    </Typography>
                  ) : (
                    <Typography variant="body2" sx={{ color: '#9ca3af' }}>-</Typography>
                  )}
                </TableCell>
                <TableCell>{formatDate(lead.createdAt)}</TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => handleViewDetail(lead)}>
                    <VisibilityIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={13} align="center" sx={{ py: 6, color: '#9ca3af' }}>
                  暂无线索数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* 详情对话框 */}
      {selectedLead && (
        <LeadDetail
          lead={selectedLead}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          onEdit={handleEdit}
          onCreateOpportunity={handleCreateOpportunity}
        />
      )}

      {/* 新增/编辑表单 — key 强制切换编辑对象时重新挂载 */}
      <LeadForm
        key={editLead?.id ?? 'new'}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        lead={editLead}
        onSuccess={() => fetchItems()}
      />
    </Box>
  );
};

export default Leads;
