import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Dialog,
  DialogActions,
  DialogContent,
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
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import useLeadStore from '../../store/useLeadStore';
import { getLifecycleConfigByCode, normalizeLifecycleStatusCode, normalizeResourceOwnership } from '../../shared/utils/constants';
import { formatPaginationRows } from '../../shared/utils/formatters';
import LeadDetail from './LeadDetail';
import LeadForm from './LeadForm';
import { formatPhoneForDisplay } from '../../shared/utils/phoneNumber';
import LeadBulkImportDialog from './LeadBulkImportDialog';
import LeadIntakeTab from './LeadIntakeTab';
import type { Lead } from '../../types/lead';
import { leadBulkImportApi, leadFlowApi, roleApi, settingsApi } from '../../api';
import type { LeadSourceConfig, LifecycleStatusConfig, User } from '../../types/settings';
import type { Role } from '../../types/role';
import TableViewSettingsDialog from '../../shared/components/TableViewSettingsDialog';
import PermissionGate from '../../shared/auth/PermissionGate';
import useAuthStore from '../../store/useAuthStore';
import { canReceiveLead, hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import { filterUsersByCurrentDataScope } from '../../shared/utils/dataVisibility';
import ResizableHeaderCell, {
  getResizableCellSx,
  readColumnWidths,
  resetColumnWidths,
  resizeColumnWidths,
  writeColumnWidths,
  type ColumnWidthMap,
} from '../../shared/components/ResizableTable';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

type LeadColumn = {
  id: string;
  label: string;
  render: (lead: Lead) => React.ReactNode;
};

type LeadViewConfig = {
  visibleColumnIds: string[];
  columnOrder: string[];
  frozenColumnCount: number;
  schemaVersion: number;
};

const LEAD_VIEW_STORAGE_KEY = 'aaos_lead_table_view_v9';
const LEAD_VIEW_SCHEMA_VERSION = 9;
const LEAD_WIDTH_STORAGE_KEY = 'aaos_lead_table_column_widths_v4';
const LEAD_ACTION_COLUMN_WIDTH = 150;

const getAssignedSalesName = (lead: Lead) => {
  const name = lead.assignedTo || lead.owner || '';
  return name && name !== '待分配' ? name : '';
};

const getLeadAssignmentStatus = (lead: Lead) => {
  if (lead.customerId) return { label: '已领取跟进', color: 'success' as const };
  return getAssignedSalesName(lead)
    ? { label: '已分配待领取', color: 'info' as const }
    : { label: '待分配', color: 'warning' as const };
};

const buildColumns = (lifecycleConfigs: LifecycleStatusConfig[]): LeadColumn[] => {
  const getLifecycleConfig = (lead: Lead) => {
    const code = normalizeLifecycleStatusCode(lead.lifecycleStatusCode || lead.lifecycleStatus || lead.status);
    return lifecycleConfigs.find((item) => item.code === code) || getLifecycleConfigByCode(code);
  };
  return [
    { id: 'name', label: '姓名', render: (lead) => lead.name || '-' },
    { id: 'company', label: '公司', render: (lead) => lead.company || '-' },
    { id: 'phone', label: '手机号', render: (lead) => formatPhoneForDisplay(lead.phone) || '-' },
    { id: 'wechat', label: '微信', render: (lead) => lead.wechat || '-' },
    { id: 'sourceType', label: '资源归属', render: (lead) => normalizeResourceOwnership(lead.sourceType) },
    { id: 'source', label: '线索来源', render: (lead) => [lead.source, lead.sourceName].filter(Boolean).join('-') || '-' },
    { id: 'industry', label: '行业', render: (lead) => lead.industry || '-' },
    { id: 'city', label: '城市', render: (lead) => lead.city || '-' },
    { id: 'inputBy', label: '线索录入人', render: (lead) => lead.inputBy || '-' },
    { id: 'leadContributorName', label: '线索贡献人', render: (lead) => lead.leadContributorName || '-' },
    { id: 'assignedTo', label: '分配销售', render: (lead) => lead.assignedTo || lead.owner || '-' },
    {
      id: 'assignmentStatus',
      label: '分配状态',
      render: (lead) => {
        const status = getLeadAssignmentStatus(lead);
        return <Chip label={status.label} size="small" color={status.color} />;
      },
    },
    { id: 'tags', label: '标签', render: (lead) => lead.tags?.join(', ') || '-' },
    { id: 'remark', label: '备注', render: (lead) => lead.remark || '-' },
    {
      id: 'intakeStatus',
      label: '入库状态',
      render: (lead) => (
        <Chip
          label={lead.intakeStatus || '入库成功'}
          size="small"
          color={lead.intakeStatus === '入库失败' ? 'error' : 'success'}
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
  'name',
  'company',
  'phone',
  'wechat',
  'sourceType',
  'source',
  'industry',
  'city',
  'inputBy',
  'leadContributorName',
  'assignedTo',
  'assignmentStatus',
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
  leadContributorName: 140,
  assignedTo: 140,
  assignmentStatus: 150,
  tags: 180,
  remark: 260,
  intakeStatus: 140,
  lifecycleStatus: 140,
};

const LEAD_TEMPLATE_FILE_NAME = '\u7ebf\u7d22\u6279\u91cf\u5165\u5e93\u6a21\u677f.xlsx';

const getDefaultLeadViewConfig = (columns: LeadColumn[]): LeadViewConfig => ({
  visibleColumnIds: DEFAULT_VISIBLE_COLUMNS.filter((id) => columns.some((column) => column.id === id)),
  columnOrder: columns.map((column) => column.id),
  frozenColumnCount: 0,
  schemaVersion: LEAD_VIEW_SCHEMA_VERSION,
});

const normalizeLeadViewConfig = (value: unknown, columns: LeadColumn[]): LeadViewConfig => {
  const validIds = new Set(columns.map((column) => column.id));
  const defaultConfig = getDefaultLeadViewConfig(columns);
  if (Array.isArray(value)) {
    const visibleColumnIds = value.filter((id): id is string => typeof id === 'string' && validIds.has(id));
    return { ...defaultConfig, visibleColumnIds: visibleColumnIds.length ? visibleColumnIds : defaultConfig.visibleColumnIds };
  }
  if (!value || typeof value !== 'object') return defaultConfig;
  const config = value as Partial<LeadViewConfig>;
  if (config.schemaVersion !== LEAD_VIEW_SCHEMA_VERSION) return defaultConfig;
  const visibleColumnIds = Array.isArray(config.visibleColumnIds)
    ? config.visibleColumnIds.filter((id): id is string => typeof id === 'string' && validIds.has(id))
    : defaultConfig.visibleColumnIds;
  const configuredOrder = Array.isArray(config.columnOrder)
    ? config.columnOrder.filter((id): id is string => typeof id === 'string' && validIds.has(id))
    : [];
  const missingOrderIds = columns.map((column) => column.id).filter((id) => !configuredOrder.includes(id));
  const frozenColumnCount = Number.isFinite(config.frozenColumnCount)
    ? Math.max(0, Math.min(Number(config.frozenColumnCount), visibleColumnIds.length))
    : defaultConfig.frozenColumnCount;
  return {
    visibleColumnIds: visibleColumnIds.length ? visibleColumnIds : defaultConfig.visibleColumnIds,
    columnOrder: [...configuredOrder, ...missingOrderIds],
    frozenColumnCount,
    schemaVersion: LEAD_VIEW_SCHEMA_VERSION,
  };
};

const readLeadViewConfig = (columns: LeadColumn[]) => {
  try {
    const raw = localStorage.getItem(LEAD_VIEW_STORAGE_KEY);
    if (!raw) return getDefaultLeadViewConfig(columns);
    const parsed = JSON.parse(raw);
    return normalizeLeadViewConfig(parsed, columns);
  } catch {
    return getDefaultLeadViewConfig(columns);
  }
};

const Leads: React.FC = () => {
  const { items, filters, pagination, fetchItems, setFilters } = useLeadStore();
  const currentUser = useAuthStore((state) => state.currentUser);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [lifecycleConfigs, setLifecycleConfigs] = useState<LifecycleStatusConfig[]>([]);
  const [sourceConfigs, setSourceConfigs] = useState<LeadSourceConfig[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [assignLead, setAssignLead] = useState<Lead | null>(null);
  const [assignSalesName, setAssignSalesName] = useState('');

  const columns = useMemo(() => buildColumns(lifecycleConfigs), [lifecycleConfigs]);
  const [viewConfig, setViewConfig] = useState<LeadViewConfig>(() => readLeadViewConfig(buildColumns([])));
  const [columnWidths, setColumnWidths] = useState<ColumnWidthMap>(() => readColumnWidths(LEAD_WIDTH_STORAGE_KEY, DEFAULT_COLUMN_WIDTHS));
  const { alert, dialog: feedbackDialog } = useAppFeedback();
  const orderedColumns = useMemo(() => {
    const columnMap = new Map(columns.map((column) => [column.id, column]));
    const ordered = viewConfig.columnOrder
      .map((columnId) => columnMap.get(columnId))
      .filter((column): column is LeadColumn => Boolean(column));
    const missing = columns.filter((column) => !viewConfig.columnOrder.includes(column.id));
    return [...ordered, ...missing];
  }, [columns, viewConfig.columnOrder]);
  const visibleColumnIds = viewConfig.visibleColumnIds;
  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => visibleColumnIds.includes(column.id)),
    [orderedColumns, visibleColumnIds],
  );
  const frozenColumnCount = Math.min(viewConfig.frozenColumnCount, visibleColumns.length);
  const tableMinWidth = useMemo(
    () => visibleColumns.reduce((sum, column) => sum + (columnWidths[column.id] || 0), 0) + LEAD_ACTION_COLUMN_WIDTH,
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
    roleApi.getRoles({ isActive: true }).then((res) => {
      if (res.code === 0) setRoles(res.data);
    });
    settingsApi.fetchLeadSourceConfigs().then((res) => {
      if (res.code === 0) setSourceConfigs(res.data.filter((item) => item.isActive && !item.parentId));
    });
  }, [fetchItems]);

  useEffect(() => {
    localStorage.setItem(LEAD_VIEW_STORAGE_KEY, JSON.stringify(viewConfig));
  }, [viewConfig]);

  useEffect(() => {
    writeColumnWidths(LEAD_WIDTH_STORAGE_KEY, columnWidths);
  }, [columnWidths]);

  const salesUsers = filterUsersByCurrentDataScope(users).filter((user) => canReceiveLead(user, roles));
  const canViewLeadList = hasPermission(currentUser, PERMISSION_KEYS.LEADS_LIST);
  const canViewLeadIntake = hasPermission(currentUser, PERMISSION_KEYS.LEADS_INTAKE_STATUS);
  const canViewLeadDetail = hasPermission(currentUser, PERMISSION_KEYS.LEADS_DETAIL);
  const canStartFollowLead = hasPermission(currentUser, PERMISSION_KEYS.LEADS_FOLLOW);
  const canAssignLeads = hasPermission(currentUser, PERMISSION_KEYS.LEADS_FLOW_CONFIG);

  useEffect(() => {
    if (activeTab === 0 && !canViewLeadList && canViewLeadIntake) setActiveTab(1);
    if (activeTab === 1 && !canViewLeadIntake && canViewLeadList) setActiveTab(0);
  }, [activeTab, canViewLeadIntake, canViewLeadList]);

  const handleViewDetail = (lead: Lead) => {
    setSelectedLead(lead);
    setDetailOpen(true);
  };

  const getCurrentUserName = () => currentUser?.name || currentUser?.account || '';

  const handleStartFollow = async (lead: Lead) => {
    const userName = getCurrentUserName();
    if (!userName) {
      alert('当前登录用户无效，请重新登录后再领取线索');
      return;
    }
    const res = await leadFlowApi.claimLeadAsCustomer(lead.id, userName);
    if (res.code !== 0 || !res.data) {
      alert(res.message || '领取失败');
      return;
    }
    setSelectedLead((current) => (current?.id === lead.id ? res.data : current));
    fetchItems(filters);
  };

  const handleOpenAssign = (lead: Lead) => {
    setAssignLead(lead);
    setAssignSalesName(getAssignedSalesName(lead));
  };

  const handleAssignLead = async () => {
    if (!assignLead) return;
    if (!assignSalesName) {
      alert('请选择要分配的销售');
      return;
    }
    const res = await leadFlowApi.manualAssignLead(assignLead.id, assignSalesName);
    if (res.code !== 0 || !res.data) {
      alert(res.message || '分配失败');
      return;
    }
    setSelectedLead((current) => (current?.id === assignLead.id ? res.data : current));
    setAssignLead(null);
    setAssignSalesName('');
    fetchItems(filters);
  };

  const handleCreate = () => {
    setFormOpen(true);
  };

  const handleDownloadTemplate = () => {
    const workbook = leadBulkImportApi.createTemplateWorkbook();
    const blob = new Blob([workbook], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = LEAD_TEMPLATE_FILE_NAME;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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
    setViewConfig((current) => {
      const visibleColumnIds = current.visibleColumnIds.includes(id)
        ? current.visibleColumnIds.filter((columnId) => columnId !== id)
        : [...current.visibleColumnIds, id];
      if (!visibleColumnIds.length) return current;
      return {
        ...current,
        visibleColumnIds,
        frozenColumnCount: Math.min(current.frozenColumnCount, visibleColumnIds.length),
      };
    });
  };

  const handleReorderColumn = (sourceColumnId: string, targetColumnId: string) => {
    setViewConfig((current) => {
      const columnOrder = current.columnOrder.length ? current.columnOrder : columns.map((column) => column.id);
      const sourceIndex = columnOrder.indexOf(sourceColumnId);
      const targetIndex = columnOrder.indexOf(targetColumnId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current;
      const nextOrder = [...columnOrder];
      const [movedColumnId] = nextOrder.splice(sourceIndex, 1);
      nextOrder.splice(targetIndex, 0, movedColumnId);
      return { ...current, columnOrder: nextOrder };
    });
  };

  const handleFrozenColumnCountChange = (value: number) => {
    setViewConfig((current) => ({
      ...current,
      frozenColumnCount: Math.max(0, Math.min(value, current.visibleColumnIds.length)),
    }));
  };

  const handleResetViewConfig = () => {
    setViewConfig(getDefaultLeadViewConfig(columns));
    setColumnWidths(resetColumnWidths(DEFAULT_COLUMN_WIDTHS));
  };

  const handleResizeColumn = (id: string, delta: number) => {
    setColumnWidths((current) => resizeColumnWidths(current, id, delta));
  };

  const getFrozenLeft = (columnIndex: number) => {
    const widths = visibleColumns.map((column) => columnWidths[column.id] || DEFAULT_COLUMN_WIDTHS[column.id] || 120);
    return widths.slice(0, columnIndex).reduce((sum, width) => sum + width, 0);
  };

  const getFrozenColumnSx = (columnIndex: number, isHeader = false) => (
    columnIndex < frozenColumnCount
      ? {
          position: 'sticky' as const,
          left: getFrozenLeft(columnIndex),
          zIndex: isHeader ? 5 : 3,
          bgcolor: isHeader ? '#f8fafc' : '#fff',
          boxShadow: '1px 0 0 #e5e7eb',
        }
      : {}
  );

  const actionColumnSx = {
    position: 'sticky' as const,
    right: 0,
    zIndex: 4,
    width: LEAD_ACTION_COLUMN_WIDTH,
    minWidth: LEAD_ACTION_COLUMN_WIDTH,
    bgcolor: '#fff',
    boxShadow: '-1px 0 0 #e5e7eb',
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          线索管理
        </Typography>
        {activeTab === 0 && canViewLeadList && (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsOpen(true)}>
              视图设置
            </Button>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadTemplate}>
              {'\u4e0b\u8f7dExcel\u6a21\u677f'}
            </Button>
            {activeTab === 0 && (
              <PermissionGate permissionKey={PERMISSION_KEYS.LEADS_CREATE}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setBulkImportOpen(true)}>
                    {'\u6279\u91cf\u5165\u5e93'}
                  </Button>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreate}>
                  新增线索入库
                  </Button>
                </Box>
              </PermissionGate>
            )}
          </Box>
        )}
      </Box>

      <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={{ mb: 3 }}>
        {canViewLeadList && <Tab label="线索列表" value={0} />}
        {canViewLeadIntake && <Tab label="入库情况" value={1} />}
      </Tabs>

      {activeTab === 0 && canViewLeadList && (
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
                  {visibleColumns.map((column, columnIndex) => (
                    <ResizableHeaderCell
                      key={column.id}
                      columnId={column.id}
                      width={columnWidths[column.id]}
                      onResize={handleResizeColumn}
                      sx={getFrozenColumnSx(columnIndex, true)}
                    >
                      {column.label}
                    </ResizableHeaderCell>
                  ))}
                  <TableCell align="center" sx={{ ...actionColumnSx, zIndex: 5, bgcolor: '#f8fafc' }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((lead) => (
                  <TableRow key={lead.id} hover>
                    {visibleColumns.map((column, columnIndex) => (
                      <TableCell
                        key={column.id}
                        sx={{
                          ...getResizableCellSx(columnWidths[column.id]),
                          ...getFrozenColumnSx(columnIndex),
                          ...(column.id === 'name' ? { fontWeight: 600 } : {}),
                        }}
                        title={column.id === 'name' ? lead.name : undefined}
                      >
                        {column.render(lead)}
                      </TableCell>
                    ))}
                    <TableCell align="center" sx={actionColumnSx}>
                      {canViewLeadDetail && (
                        <Tooltip title="查看线索">
                          <IconButton size="small" onClick={() => handleViewDetail(lead)}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {!lead.customerId && canStartFollowLead && !getAssignedSalesName(lead) && (
                        <Tooltip title="领取并开始跟进">
                          <IconButton size="small" color="primary" onClick={() => handleStartFollow(lead)}>
                            <PersonAddAltIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {!lead.customerId && canStartFollowLead && getAssignedSalesName(lead) && (
                        <Tooltip title="开始跟进并加入客户">
                          <IconButton size="small" color="primary" onClick={() => handleStartFollow(lead)}>
                            <PersonAddAltIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {!lead.customerId && canAssignLeads && (
                        <Tooltip title="分配销售">
                          <IconButton size="small" color="info" onClick={() => handleOpenAssign(lead)}>
                            <AssignmentIndIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.length + 1} align="center" sx={{ py: 6, color: '#9ca3af' }}>
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

      {activeTab === 1 && canViewLeadIntake && <LeadIntakeTab />}
      {!canViewLeadList && !canViewLeadIntake && (
        <Typography variant="body2" sx={{ color: '#6b7280', py: 4, textAlign: 'center' }}>
          暂无可访问的线索板块
        </Typography>
      )}

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

      <LeadBulkImportDialog
        open={bulkImportOpen}
        onClose={() => setBulkImportOpen(false)}
        onImported={() => fetchItems(filters)}
      />

      <Dialog open={Boolean(assignLead)} onClose={() => setAssignLead(null)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setAssignLead(null)}>分配销售</DialogCloseTitle>
        <DialogContent dividers>
          <TextField
            select
            label="分配销售"
            value={assignSalesName}
            onChange={(event) => setAssignSalesName(event.target.value)}
            fullWidth
          >
            {salesUsers.map((user) => (
              <MenuItem key={user.id} value={user.name}>
                {user.name}（{user.positionName || '未设置职位'}）
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={handleAssignLead}>保存</Button>
        </DialogActions>
      </Dialog>

      <TableViewSettingsDialog
        open={viewSettingsOpen}
        title="线索列表视图设置"
        description="勾选后会显示在线索列表中，设置会保存在当前浏览器。"
        columns={columns}
        visibleColumnIds={visibleColumnIds}
        columnOrder={viewConfig.columnOrder}
        frozenColumnCount={viewConfig.frozenColumnCount}
        maxFrozenColumnCount={visibleColumns.length}
        onClose={() => setViewSettingsOpen(false)}
        onToggleColumn={handleToggleColumn}
        onReorderColumn={handleReorderColumn}
        onFrozenColumnCountChange={handleFrozenColumnCountChange}
        onReset={handleResetViewConfig}
      />
      {feedbackDialog}
    </Box>
  );
};

export default Leads;
