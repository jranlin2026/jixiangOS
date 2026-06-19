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
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import useLeadStore from '../../store/useLeadStore';
import { getLifecycleConfigByCode, normalizeLifecycleStatusCode, normalizeResourceOwnership } from '../../shared/utils/constants';
import { formatPaginationRows } from '../../shared/utils/formatters';
import LeadDetail from './LeadDetail';
import LeadForm from './LeadForm';
import LeadIntakeTab from './LeadIntakeTab';
import LeadFlowConfigTab from './LeadFlowConfigTab';
import type { Lead } from '../../types/lead';
import { leadFlowApi, settingsApi } from '../../api';
import type { LeadSourceConfig, LifecycleStatusConfig, User } from '../../types/settings';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import PermissionGate from '../../shared/auth/PermissionGate';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import { isSalesRoleName } from '../../shared/utils/roles';
import ResizableHeaderCell, {
  getResizableCellSx,
  readColumnWidths,
  resetColumnWidths,
  resizeColumnWidths,
  writeColumnWidths,
  type ColumnWidthMap,
} from '../../shared/components/ResizableTable';

type LeadColumn = {
  id: string;
  label: string;
  render: (lead: Lead) => React.ReactNode;
};

const LEAD_VIEW_STORAGE_KEY = 'aaos_lead_table_columns_v4';
const LEAD_WIDTH_STORAGE_KEY = 'aaos_lead_table_column_widths_v3';

const buildColumns = (lifecycleConfigs: LifecycleStatusConfig[]): LeadColumn[] => {
  const getLifecycleConfig = (lead: Lead) => {
    const code = normalizeLifecycleStatusCode(lead.lifecycleStatusCode || lead.lifecycleStatus || lead.status);
    return lifecycleConfigs.find((item) => item.code === code) || getLifecycleConfigByCode(code);
  };
  return [
    { id: 'company', label: '公司', render: (lead) => lead.company || '-' },
    { id: 'phone', label: '手机号', render: (lead) => lead.phone || '-' },
    { id: 'wechat', label: '微信', render: (lead) => lead.wechat || '-' },
    { id: 'sourceType', label: '资源归属', render: (lead) => normalizeResourceOwnership(lead.sourceType) },
    { id: 'source', label: '线索来源', render: (lead) => [lead.source, lead.sourceName].filter(Boolean).join('-') || '-' },
    { id: 'industry', label: '行业', render: (lead) => lead.industry || '-' },
    { id: 'city', label: '城市', render: (lead) => lead.city || '-' },
    { id: 'inputBy', label: '线索录入人', render: (lead) => lead.inputBy || '-' },
    { id: 'assignedTo', label: '分配销售', render: (lead) => lead.assignedTo || lead.owner || '-' },
    { id: 'tags', label: '标签', render: (lead) => lead.tags?.join(', ') || '-' },
    { id: 'remark', label: '备注', render: (lead) => lead.remark || '-' },
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
      render: (lead) => {
        const config = getLifecycleConfig(lead);
        return (
          <Chip
            label={config.name}
            size="small"
            sx={{
              bgcolor: `${config.color}18`,
              color: config.color,
              fontWeight: 600,
            }}
          />
        );
      },
    },
  ];
};

const DEFAULT_VISIBLE_COLUMNS = [
  'company',
  'phone',
  'wechat',
  'sourceType',
  'source',
  'industry',
  'city',
  'inputBy',
  'assignedTo',
  'tags',
  'remark',
  'intakeStatus',
  'lifecycleStatus',
];

const DEFAULT_COLUMN_WIDTHS: ColumnWidthMap = {
  name: 180,
  company: 220,
  phone: 150,
  wechat: 150,
  sourceType: 140,
  source: 180,
  industry: 140,
  city: 120,
  inputBy: 140,
  assignedTo: 140,
  tags: 180,
  remark: 260,
  intakeStatus: 140,
  lifecycleStatus: 140,
};

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
  const { items, filters, pagination, fetchItems, setFilters } = useLeadStore();
  const currentUser = useAuthStore((state) => state.currentUser);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [lifecycleConfigs, setLifecycleConfigs] = useState<LifecycleStatusConfig[]>([]);
  const [sourceConfigs, setSourceConfigs] = useState<LeadSourceConfig[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);

  const columns = useMemo(() => buildColumns(lifecycleConfigs), [lifecycleConfigs]);
  const [visibleColumnIds, setVisibleColumnIds] = useState<string[]>(() => readVisibleColumns(buildColumns([])));
  const [columnWidths, setColumnWidths] = useState<ColumnWidthMap>(() => readColumnWidths(LEAD_WIDTH_STORAGE_KEY, DEFAULT_COLUMN_WIDTHS));
  const visibleColumns = useMemo(
    () => columns.filter((column) => visibleColumnIds.includes(column.id)),
    [columns, visibleColumnIds],
  );
  const tableMinWidth = useMemo(
    () => columnWidths.name + visibleColumns.reduce((sum, column) => sum + (columnWidths[column.id] || 0), 0) + 120,
    [columnWidths, visibleColumns],
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

  useEffect(() => {
    writeColumnWidths(LEAD_WIDTH_STORAGE_KEY, columnWidths);
  }, [columnWidths]);

  const salesUsers = users.filter((user) => isSalesRoleName(user.role));
  const canManageLeadFlow = hasPermission(currentUser, PERMISSION_KEYS.LEADS_FLOW_CONFIG, 'write');

  const handleViewDetail = (lead: Lead) => {
    setSelectedLead(lead);
    setDetailOpen(true);
  };

  const getCurrentUserName = () => currentUser?.name || currentUser?.account || '';

  const handleClaimLead = async (lead: Lead) => {
    const userName = getCurrentUserName();
    if (!userName) {
      window.alert('当前登录用户无效，请重新登录后再领取线索');
      return;
    }
    const res = await leadFlowApi.manualAssignLead(lead.id, userName);
    if (res.code !== 0 || !res.data) {
      window.alert(res.message || '领取失败');
      return;
    }
    setSelectedLead((current) => (current?.id === lead.id ? res.data : current));
    fetchItems(filters);
  };

  const handleCreate = () => {
    setFormOpen(true);
  };

  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFilters = { ...filters, search: event.target.value, page: 1, pageSize: pagination.pageSize || 10 };
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handleFilterChange = (key: string, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined, page: 1, pageSize: pagination.pageSize || 10 };
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          线索管理
        </Typography>
        {activeTab === 0 && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsOpen(true)}>
              视图设置
            </Button>
            {activeTab === 0 && (
              <PermissionGate permissionKey={PERMISSION_KEYS.LEADS_CREATE} action="write">
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
                  新增线索入库
                </Button>
              </PermissionGate>
            )}
          </Box>
        )}
      </Box>

      <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={{ mb: 3 }}>
        <Tab label="线索列表" />
        <Tab label="入库情况" />
        <Tab label="流转配置" disabled={!canManageLeadFlow} />
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
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>生命周期</InputLabel>
              <Select
                value={filters.lifecycleStatusCode || ''}
                label="生命周期"
                onChange={(event) => handleFilterChange('lifecycleStatusCode', event.target.value)}
              >
                <MenuItem value="">全部</MenuItem>
                {lifecycleConfigs.filter((status) => status.code !== 'public_pool').map((status) => (
                  <MenuItem key={status.code} value={status.code}>{status.name}</MenuItem>
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
                {items.map((lead) => (
                  <TableRow key={lead.id} hover>
                    <TableCell sx={{ ...getResizableCellSx(columnWidths.name), fontWeight: 600 }} title={lead.name}>{lead.name}</TableCell>
                    {visibleColumns.map((column) => (
                      <TableCell key={column.id} sx={getResizableCellSx(columnWidths[column.id])}>{column.render(lead)}</TableCell>
                    ))}
                    <TableCell align="center">
                      <Tooltip title="查看线索">
                        <IconButton size="small" onClick={() => handleViewDetail(lead)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {!lead.customerId && (
                        <Tooltip title="领取并加入客户">
                          <IconButton size="small" color="primary" onClick={() => handleClaimLead(lead)}>
                            <PersonAddAltIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
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
        </>
      )}

      {activeTab === 1 && <LeadIntakeTab />}
      {activeTab === 2 && canManageLeadFlow && <LeadFlowConfigTab />}

      {selectedLead && (
        <LeadDetail
          lead={selectedLead}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          onUpdated={(updated) => {
            setSelectedLead(updated);
            fetchItems(filters);
          }}
        />
      )}

      <LeadForm
        key="new"
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSuccess={() => fetchItems(filters)}
      />

      <Dialog open={viewSettingsOpen} onClose={() => setViewSettingsOpen(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setViewSettingsOpen(false)}>线索列表视图设置</DialogCloseTitle>
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
          <Button onClick={() => {
            setVisibleColumnIds(DEFAULT_VISIBLE_COLUMNS);
            setColumnWidths(resetColumnWidths(DEFAULT_COLUMN_WIDTHS));
          }}>恢复默认</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Leads;
