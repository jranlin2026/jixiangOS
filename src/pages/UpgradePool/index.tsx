import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  FormControl,
  Grid,
  InputLabel,
  LinearProgress,
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
  Typography,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import useUpgradeStore from '../../store/useUpgradeStore';
import { CUSTOMER_LEVEL_COLOR_MAP, getProductLevelColor } from '../../shared/utils/constants';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import UpgradeDetail from './UpgradeDetail';
import CustomerSuccessTab from './CustomerSuccessTab';
import UpgradeAnalysis from '../UpgradeAnalysis';
import TableViewSettingsDialog from '../../shared/components/TableViewSettingsDialog';
import ResizableHeaderCell, {
  getResizableCellSx,
  readColumnWidths,
  resetColumnWidths,
  resizeColumnWidths,
  writeColumnWidths,
  type ColumnWidthMap,
} from '../../shared/components/ResizableTable';
import { useTableViewConfig } from '../../shared/hooks/useTableViewConfig';
import type { UpgradeOpportunity } from '../../types/upgrade';

type UpgradeCenterTab = 'pool' | 'success' | 'analysis' | 'tasks';

type UpgradeColumn = {
  id: string;
  label: string;
  render: (opportunity: UpgradeOpportunity) => React.ReactNode;
};

const UPGRADE_VIEW_STORAGE_KEY = 'aaos_upgrade_pool_table_view_v1';
const UPGRADE_WIDTH_STORAGE_KEY = 'aaos_upgrade_pool_table_widths_v1';
const UPGRADE_ACTION_COLUMN_WIDTH = 120;

const DEFAULT_COLUMN_WIDTHS: ColumnWidthMap = {
  customerName: 180,
  currentLevel: 140,
  currentProduct: 160,
  targetProduct: 160,
  probability: 180,
  estimatedAmount: 140,
  status: 140,
  ownerName: 140,
  followUpCount: 120,
  lastFollowUpAt: 180,
};

const CENTER_TABS: Array<{ value: UpgradeCenterTab; label: string }> = [
  { value: 'pool', label: '机会池' },
  { value: 'success', label: '客户成功' },
  { value: 'analysis', label: '升单分析' },
  { value: 'tasks', label: '行动任务' },
];

const VALID_TABS = new Set(CENTER_TABS.map((item) => item.value));

function getTabFromSearch(value: string | null): UpgradeCenterTab {
  return value && VALID_TABS.has(value as UpgradeCenterTab) ? (value as UpgradeCenterTab) : 'pool';
}

const UpgradePool: React.FC = () => {
  const { items, loading, filters, pagination, fetchItems, refreshAI, setFilters } = useUpgradeStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = getTabFromSearch(searchParams.get('tab'));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState<ColumnWidthMap>(() => readColumnWidths(UPGRADE_WIDTH_STORAGE_KEY, DEFAULT_COLUMN_WIDTHS));

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    writeColumnWidths(UPGRADE_WIDTH_STORAGE_KEY, columnWidths);
  }, [columnWidths]);

  const handleViewDetail = (id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  const handleFilterChange = (key: string, value: string) => {
    const normalizedValue = key === 'minProbability' && value ? Number(value) : (value || undefined);
    const newFilters = { ...filters, [key]: normalizedValue, page: 1, pageSize: pagination.pageSize || 10 } as any;
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const columns = useMemo<UpgradeColumn[]>(() => [
    { id: 'customerName', label: '客户名称', render: (opp) => <Box component="span" sx={{ fontWeight: 600 }}>{opp.customerName}</Box> },
    {
      id: 'currentLevel',
      label: '当前等级',
      render: (opp) => {
        const color = CUSTOMER_LEVEL_COLOR_MAP[opp.currentLevel] || '#9ca3af';
        return <Chip label={opp.currentLevel} size="small" sx={{ bgcolor: `${color}18`, color, fontWeight: 600 }} />;
      },
    },
    { id: 'currentProduct', label: '当前产品', render: (opp) => opp.currentProduct },
    {
      id: 'targetProduct',
      label: '目标产品',
      render: (opp) => {
        const color = getProductLevelColor(opp.targetProduct);
        return <Chip label={opp.targetProduct} size="small" sx={{ bgcolor: `${color}18`, color, fontWeight: 600 }} />;
      },
    },
    {
      id: 'probability',
      label: 'AI评分',
      render: (opp) => {
        const probColor = opp.probability >= 80 ? '#16a34a' : opp.probability >= 60 ? '#f59e0b' : '#9ca3af';
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <LinearProgress
              variant="determinate"
              value={opp.probability}
              sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: '#f3f4f6', '& .MuiLinearProgress-bar': { bgcolor: probColor, borderRadius: 4 } }}
            />
            <Typography variant="body2" sx={{ fontWeight: 700, color: probColor, minWidth: 40 }}>
              {opp.probability}%
            </Typography>
          </Box>
        );
      },
    },
    { id: 'estimatedAmount', label: '预计金额', render: (opp) => <Box component="span" sx={{ fontWeight: 600 }}>{formatCurrency(opp.estimatedAmount)}</Box> },
    {
      id: 'status',
      label: '状态',
      render: (opp) => (
        <Chip
          label={opp.status}
          size="small"
          color={opp.status === '已转化' ? 'success' : opp.status === '跟进中' ? 'primary' : opp.status === '已流失' ? 'error' : 'default'}
        />
      ),
    },
    { id: 'ownerName', label: '负责人', render: (opp) => opp.ownerName },
    { id: 'followUpCount', label: '跟进次数', render: (opp) => opp.followUpCount },
    { id: 'lastFollowUpAt', label: '最后跟进', render: (opp) => (opp.lastFollowUpAt ? formatDate(opp.lastFollowUpAt) : '-') },
  ], []);

  const defaultVisibleColumns = useMemo(() => columns.map((column) => column.id), [columns]);
  const {
    viewConfig,
    visibleColumnIds,
    visibleColumns,
    frozenColumnCount,
    toggleColumn,
    reorderColumn,
    setFrozenColumnCount,
    resetViewConfig,
  } = useTableViewConfig(UPGRADE_VIEW_STORAGE_KEY, columns, defaultVisibleColumns);

  const tableMinWidth = visibleColumns.reduce((sum, column) => sum + (columnWidths[column.id] || DEFAULT_COLUMN_WIDTHS[column.id] || 120), 0) + UPGRADE_ACTION_COLUMN_WIDTH;

  const getFrozenLeft = (columnIndex: number) => (
    visibleColumns
      .slice(0, columnIndex)
      .reduce((sum, column) => sum + (columnWidths[column.id] || DEFAULT_COLUMN_WIDTHS[column.id] || 120), 0)
  );

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
    width: UPGRADE_ACTION_COLUMN_WIDTH,
    minWidth: UPGRADE_ACTION_COLUMN_WIDTH,
    bgcolor: '#fff',
    boxShadow: '-1px 0 0 #e5e7eb',
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

  const handleResizeColumn = (id: string, delta: number) => {
    setColumnWidths((current) => resizeColumnWidths(current, id, delta));
  };

  const handleResetViewConfig = () => {
    resetViewConfig();
    setColumnWidths(resetColumnWidths(DEFAULT_COLUMN_WIDTHS));
  };

  const handleTabChange = (_: React.SyntheticEvent, value: UpgradeCenterTab) => {
    setSearchParams(value === 'pool' ? {} : { tab: value });
  };

  const taskStats = useMemo(() => {
    const now = Date.now();
    const overdueCutoff = now - 7 * 24 * 60 * 60 * 1000;
    const activeItems = items.filter((item) => item.status !== '已转化' && item.status !== '已流失');
    return {
      highProbability: activeItems.filter((item) => item.probability >= 80).length,
      overdue: activeItems.filter((item) => new Date(item.lastFollowUpAt || item.createdAt).getTime() < overdueCutoff).length,
      inProgress: items.filter((item) => item.status === '跟进中').length,
      lost: items.filter((item) => item.status === '已流失').length,
    };
  }, [items]);

  const actionTasks = useMemo(() => {
    const now = Date.now();
    const overdueCutoff = now - 7 * 24 * 60 * 60 * 1000;
    return items
      .filter((item) => item.status !== '已转化')
      .map((item) => {
        const isOverdue = new Date(item.lastFollowUpAt || item.createdAt).getTime() < overdueCutoff;
        const reason = item.probability >= 80 ? '高概率机会待推进' : isOverdue ? '超期未跟进' : item.status === '已流失' ? '流失复盘' : '持续跟进';
        return { ...item, actionReason: reason, isOverdue };
      })
      .sort((a, b) => Number(b.probability >= 80) - Number(a.probability >= 80) || Number(b.isOverdue) - Number(a.isOverdue) || b.probability - a.probability)
      .slice(0, 10);
  }, [items]);

  const renderPool = () => (
    <>
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          placeholder="搜索客户名称"
          value={filters.search || ''}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          size="small"
          sx={{ minWidth: 220 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>状态</InputLabel>
          <Select value={filters.status || ''} label="状态" onChange={(e) => handleFilterChange('status', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            <MenuItem value="待跟进">待跟进</MenuItem>
            <MenuItem value="跟进中">跟进中</MenuItem>
            <MenuItem value="已转化">已转化</MenuItem>
            <MenuItem value="已流失">已流失</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>客户等级</InputLabel>
          <Select value={filters.currentLevel || ''} label="客户等级" onChange={(e) => handleFilterChange('currentLevel', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            <MenuItem value="L2">L2</MenuItem>
            <MenuItem value="L3">L3</MenuItem>
            <MenuItem value="L4">L4</MenuItem>
            <MenuItem value="L5">L5</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>最低概率</InputLabel>
          <Select value={filters.minProbability?.toString() || ''} label="最低概率" onChange={(e) => handleFilterChange('minProbability', e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            <MenuItem value="80">≥80%</MenuItem>
            <MenuItem value="60">≥60%</MenuItem>
            <MenuItem value="40">≥40%</MenuItem>
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
            {items.map((opp) => (
              <TableRow key={opp.id} hover>
                {visibleColumns.map((column, columnIndex) => (
                  <TableCell key={column.id} sx={{ ...getResizableCellSx(columnWidths[column.id]), ...getFrozenColumnSx(columnIndex) }}>
                    {column.render(opp)}
                  </TableCell>
                ))}
                <TableCell align="center" sx={actionColumnSx}>
                  <Button size="small" startIcon={<VisibilityIcon />} onClick={() => handleViewDetail(opp.id)}>
                    详情
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + 1} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                  暂无升单机会
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
        sx={{ border: '1px solid #f0f0f0', borderTop: 0, bgcolor: '#fff', '& .MuiTablePagination-toolbar': { minHeight: 48 } }}
      />
      <TableViewSettingsDialog
        open={viewSettingsOpen}
        title="升单机会视图设置"
        description="勾选后会显示在升单机会列表中，设置会保存在当前浏览器。"
        columns={columns}
        visibleColumnIds={visibleColumnIds}
        columnOrder={viewConfig.columnOrder}
        frozenColumnCount={viewConfig.frozenColumnCount}
        maxFrozenColumnCount={visibleColumns.length}
        onClose={() => setViewSettingsOpen(false)}
        onToggleColumn={toggleColumn}
        onReorderColumn={reorderColumn}
        onFrozenColumnCountChange={setFrozenColumnCount}
        onReset={handleResetViewConfig}
      />
    </>
  );

  const renderActionTasks = () => (
    <Box>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: '高概率待推进', value: taskStats.highProbability, color: '#f97316' },
          { label: '超期未跟进', value: taskStats.overdue, color: '#dc2626' },
          { label: '跟进中机会', value: taskStats.inProgress, color: '#2563eb' },
          { label: '流失待复盘', value: taskStats.lost, color: '#6b7280' },
        ].map((item) => (
          <Grid item xs={12} sm={6} md={3} key={item.label}>
            <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2, p: 2 }}>
              <Typography variant="body2" sx={{ color: '#6b7280', mb: 0.5 }}>{item.label}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: item.color }}>{item.value}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>客户</TableCell>
              <TableCell>任务</TableCell>
              <TableCell>负责人</TableCell>
              <TableCell>概率</TableCell>
              <TableCell>预计金额</TableCell>
              <TableCell>最后跟进</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {actionTasks.map((task) => (
              <TableRow key={task.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{task.customerName}</TableCell>
                <TableCell>
                  <Chip label={task.actionReason} size="small" color={task.actionReason.includes('超期') ? 'error' : task.actionReason.includes('高概率') ? 'warning' : 'default'} />
                </TableCell>
                <TableCell>{task.ownerName}</TableCell>
                <TableCell>{task.probability}%</TableCell>
                <TableCell>{formatCurrency(task.estimatedAmount)}</TableCell>
                <TableCell>{task.lastFollowUpAt ? formatDate(task.lastFollowUpAt) : '-'}</TableCell>
                <TableCell align="center">
                  <Button size="small" startIcon={<VisibilityIcon />} onClick={() => handleViewDetail(task.id)}>
                    查看
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {actionTasks.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                  暂无待处理行动任务
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>
            升单中心
          </Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.75 }}>
            汇总升单机会、客户成功、经营分析和推进任务。
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {activeTab === 'pool' && (
            <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsOpen(true)}>
              视图设置
            </Button>
          )}
          {activeTab === 'pool' && (
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={refreshAI} disabled={loading}>
              AI刷新评分
            </Button>
          )}
        </Box>
      </Box>

      <Tabs value={activeTab} onChange={handleTabChange} sx={{ borderBottom: '1px solid #e5e7eb', mb: 3 }}>
        {CENTER_TABS.map((tab) => (
          <Tab key={tab.value} value={tab.value} label={tab.label} />
        ))}
      </Tabs>

      {activeTab === 'pool' && renderPool()}
      {activeTab === 'success' && <CustomerSuccessTab />}
      {activeTab === 'analysis' && <UpgradeAnalysis embedded />}
      {activeTab === 'tasks' && renderActionTasks()}

      {selectedId && (
        <UpgradeDetail id={selectedId} open={detailOpen} onClose={() => setDetailOpen(false)} />
      )}
    </Box>
  );
};

export default UpgradePool;
