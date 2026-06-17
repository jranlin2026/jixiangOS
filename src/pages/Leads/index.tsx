import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import useLeadStore from '../../store/useLeadStore';
import { ROUTES } from '../../shared/utils/constants';
import { formatDate } from '../../shared/utils/formatters';
import LeadDetail from './LeadDetail';
import LeadForm from './LeadForm';
import LeadIntakeTab from './LeadIntakeTab';
import LeadFlowConfigTab from './LeadFlowConfigTab';
import type { Lead } from '../../types/lead';
import { opportunityApi, settingsApi } from '../../api';
import type { LeadSourceConfig, LifecycleStatusConfig, User } from '../../types/settings';

type LeadColumn = {
  id: string;
  label: string;
  render: (lead: Lead) => React.ReactNode;
};

const LEAD_VIEW_STORAGE_KEY = 'aaos_lead_table_columns';

const buildColumns = (lifecycleConfigs: LifecycleStatusConfig[]): LeadColumn[] => {
  const getLifecycleColor = (status?: string) => lifecycleConfigs.find((item) => item.name === status)?.color || '#9E9E9E';
  return [
    { id: 'company', label: '公司', render: (lead) => lead.company || '-' },
    { id: 'phone', label: '手机号', render: (lead) => lead.phone || '-' },
    { id: 'wechat', label: '微信', render: (lead) => lead.wechat || '-' },
    { id: 'email', label: '邮箱', render: (lead) => lead.email || '-' },
    { id: 'source', label: '来源', render: (lead) => lead.source },
    {
      id: 'intakeStatus',
      label: '入库状态',
      render: (lead) => (
        <Chip
          label={lead.intakeStatus || '入库成功'}
          size="small"
          color={lead.intakeStatus === '待分配' ? 'warning' : lead.intakeStatus === '入库失败' ? 'error' : 'success'}
        />
      ),
    },
    {
      id: 'lifecycleStatus',
      label: '生命周期',
      render: (lead) => (
        <Chip
          label={lead.lifecycleStatus || '未转商机'}
          size="small"
          sx={{
            bgcolor: `${getLifecycleColor(lead.lifecycleStatus)}18`,
            color: getLifecycleColor(lead.lifecycleStatus),
            fontWeight: 600,
          }}
        />
      ),
    },
    { id: 'industry', label: '行业', render: (lead) => lead.industry || '-' },
    { id: 'city', label: '城市', render: (lead) => lead.city || '-' },
    { id: 'assignedTo', label: '分配销售', render: (lead) => lead.assignedTo || lead.owner || '-' },
    { id: 'inputBy', label: '录入人', render: (lead) => lead.inputBy || '-' },
    { id: 'score', label: '评分', render: (lead) => lead.score ?? '-' },
    {
      id: 'aiProbability',
      label: 'AI升级概率',
      render: (lead) => (lead.aiAnalysis ? `${Math.round(lead.aiAnalysis.upgradeProbability * 100)}%` : '-'),
    },
    { id: 'createdAt', label: '创建时间', render: (lead) => formatDate(lead.createdAt) },
  ];
};

const DEFAULT_VISIBLE_COLUMNS = [
  'company',
  'phone',
  'wechat',
  'source',
  'intakeStatus',
  'lifecycleStatus',
  'assignedTo',
  'inputBy',
  'createdAt',
];

const readVisibleColumns = (columns: LeadColumn[]) => {
  try {
    const raw = localStorage.getItem(LEAD_VIEW_STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE_COLUMNS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_VISIBLE_COLUMNS;
    const validIds = new Set(columns.map((column) => column.id));
    const filtered = parsed.filter((id) => validIds.has(id));
    return filtered.length ? filtered : DEFAULT_VISIBLE_COLUMNS;
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
};

const Leads: React.FC = () => {
  const navigate = useNavigate();
  const { items, filters, fetchItems, setFilters } = useLeadStore();
  const [activeTab, setActiveTab] = useState(0);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [lifecycleConfigs, setLifecycleConfigs] = useState<LifecycleStatusConfig[]>([]);
  const [sourceConfigs, setSourceConfigs] = useState<LeadSourceConfig[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);

  const columns = useMemo(() => buildColumns(lifecycleConfigs), [lifecycleConfigs]);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(() => readVisibleColumns(buildColumns([])));
  const visibleColumns = useMemo(
    () => columns.filter((column) => visibleColumnIds.includes(column.id)),
    [columns, visibleColumnIds],
  );

  useEffect(() => {
    fetchItems();
    settingsApi.fetchLifecycleStatusConfigs().then((res) => {
      if (res.code === 0) setLifecycleConfigs(res.data);
    });
    settingsApi.fetchUsers({ isActive: true }).then((res) => {
      if (res.code === 0) setUsers(res.data.filter((user) => user.isActive));
    });
    settingsApi.fetchLeadSourceConfigs().then((res) => {
      if (res.code === 0) setSourceConfigs(res.data.filter((item) => item.isActive && !item.parentId));
    });
  }, [fetchItems]);

  useEffect(() => {
    localStorage.setItem(LEAD_VIEW_STORAGE_KEY, JSON.stringify(visibleColumnIds));
  }, [visibleColumnIds]);

  const salesUsers = users.filter((user) => user.role === '销售' || user.role === '销售经理');

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

  const handleCreateOpportunity = async (lead: Lead) => {
    await opportunityApi.createFromLead(lead);
    setDetailOpen(false);
    navigate(ROUTES.OPPORTUNITIES);
  };

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFilters = { ...filters, search: event.target.value };
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined };
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

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          线索管理
        </Typography>
        {activeTab === 0 && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsOpen(true)}>
              视图设置
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
              新增线索入库
            </Button>
          </Box>
        )}
      </Box>

      <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={{ mb: 3 }}>
        <Tab label="线索列表" />
        <Tab label="入库情况" />
        <Tab label="流转配置" />
      </Tabs>

      {activeTab === 0 && (
        <>
          <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
            <TextField
              placeholder="搜索姓名/公司/手机号/微信"
              value={filters.search || ''}
              onChange={handleSearch}
              size="small"
              sx={{ minWidth: 260 }}
            />
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>来源</InputLabel>
              <Select value={filters.source || ''} label="来源" onChange={(event) => handleFilterChange('source', event.target.value)}>
                <MenuItem value="">全部</MenuItem>
                {sourceConfigs.map((source) => (
                  <MenuItem key={source.id} value={source.name}>{source.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>分配销售</InputLabel>
              <Select value={filters.owner || ''} label="分配销售" onChange={(event) => handleFilterChange('owner', event.target.value)}>
                <MenuItem value="">全部</MenuItem>
                <MenuItem value="待分配">待分配</MenuItem>
                {salesUsers.map((user) => (
                  <MenuItem key={user.id} value={user.name}>{user.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>姓名</TableCell>
                  {visibleColumns.map((column) => (
                    <TableCell key={column.id}>{column.label}</TableCell>
                  ))}
                  <TableCell align="center">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((lead) => (
                  <TableRow key={lead.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{lead.name}</TableCell>
                    {visibleColumns.map((column) => (
                      <TableCell key={column.id}>{column.render(lead)}</TableCell>
                    ))}
                    <TableCell align="center">
                      <Tooltip title="查看线索">
                        <IconButton size="small" onClick={() => handleViewDetail(lead)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.length + 2} align="center" sx={{ py: 6, color: '#9ca3af' }}>
                      暂无线索数据
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {activeTab === 1 && <LeadIntakeTab />}
      {activeTab === 2 && <LeadFlowConfigTab />}

      {selectedLead && (
        <LeadDetail
          lead={selectedLead}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          onEdit={handleEdit}
          onCreateOpportunity={handleCreateOpportunity}
        />
      )}

      <LeadForm
        key={editLead?.id ?? 'new'}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        lead={editLead}
        onSuccess={() => fetchItems()}
      />

      <Dialog open={viewSettingsOpen} onClose={() => setViewSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>线索列表视图设置</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: '#6b7280', mb: 2 }}>
            勾选后会显示在线索列表中，设置会保存在当前浏览器。
          </Typography>
          <FormGroup sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
            {columns.map((column) => (
              <FormControlLabel
                key={column.id}
                control={<Checkbox checked={visibleColumnIds.includes(column.id)} onChange={() => handleToggleColumn(column.id)} />}
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

export default Leads;
