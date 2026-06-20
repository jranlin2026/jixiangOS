import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, Button, TextField,
  MenuItem, FormControl, InputLabel, Select, LinearProgress,
  Tabs, Tab, TablePagination,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import RefreshIcon from '@mui/icons-material/Refresh';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import useUpgradeStore from '../../store/useUpgradeStore';
import { CUSTOMER_LEVEL_COLOR_MAP, getProductLevelColor } from '../../shared/utils/constants';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import UpgradeDetail from './UpgradeDetail';
import CustomerSuccessTab from './CustomerSuccessTab';
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

const UpgradePool: React.FC = () => {
  const { items, loading, filters, pagination, fetchItems, refreshAI, setFilters } = useUpgradeStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
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
    const newFilters = { ...filters, [key]: value || undefined, page: 1, pageSize: pagination.pageSize || 10 } as any;
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handleRefreshAI = async () => {
    await refreshAI();
  };

  const columns = useMemo<UpgradeColumn[]>(() => [
    { id: 'customerName', label: '客户名称', render: (opp) => <Box component="span" sx={{ fontWeight: 500 }}>{opp.customerName}</Box> },
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
        const probColor = opp.probability >= 80 ? '#4CAF50' : opp.probability >= 60 ? '#FF9800' : '#9ca3af';
        return (
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
        );
      },
    },
    { id: 'estimatedAmount', label: '预估金额', render: (opp) => <Box component="span" sx={{ fontWeight: 600 }}>{formatCurrency(opp.estimatedAmount)}</Box> },
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

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          升单机会池
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {activeTab === 0 && (
            <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsOpen(true)}>
              视图设置
            </Button>
          )}
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleRefreshAI} disabled={loading}>
            AI 刷新评分
          </Button>
        </Box>
      </Box>

      <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={{ mb: 3 }}>
        <Tab label="升单机会" />
        <Tab label="客户成功工作台" />
      </Tabs>

      {activeTab === 0 ? (
        <>

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
            {items.map((opp: any) => {
              return (
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
              );
            })}
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
      ) : (
        <CustomerSuccessTab />
      )}

      {selectedId && (
        <UpgradeDetail id={selectedId} open={detailOpen} onClose={() => setDetailOpen(false)} />
      )}
    </Box>
  );
};

export default UpgradePool;
