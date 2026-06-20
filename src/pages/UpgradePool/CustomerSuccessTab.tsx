import React, { useEffect, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogContent,
  FormControl, InputLabel, MenuItem, Paper, Select, Table, TableBody,
  TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography,
} from '@mui/material';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import type { CustomerSuccessTask, CustomerSuccessTaskStatus, CustomerSuccessTaskType } from '../../types/customerSuccess';
import { customerSuccessApi } from '../../api';
import { formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import type { PaginatedResponse } from '../../api/types';
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

type TaskColumn = {
  id: string;
  label: string;
  render: (task: CustomerSuccessTask) => React.ReactNode;
};

const taskTypes: CustomerSuccessTaskType[] = ['续费', '升单', '风险', '回访', '服务'];
const statuses: CustomerSuccessTaskStatus[] = ['待处理', '跟进中', '已完成', '已关闭'];
const TASK_VIEW_STORAGE_KEY = 'aaos_customer_success_table_view_v1';
const TASK_WIDTH_STORAGE_KEY = 'aaos_customer_success_table_widths_v1';

const TASK_COLUMNS: TaskColumn[] = [
  { id: 'customerName', label: '客户', render: (item) => <Box component="span" sx={{ fontWeight: 600 }}>{item.customerName}</Box> },
  { id: 'title', label: '任务', render: (item) => item.title },
  { id: 'taskType', label: '类型', render: (item) => <Chip label={item.taskType} size="small" /> },
  { id: 'priority', label: '优先级', render: (item) => <Chip label={item.priority} size="small" color={(item.priority === '高' ? 'error' : item.priority === '中' ? 'warning' : 'default') as any} /> },
  { id: 'status', label: '状态', render: (item) => item.status },
  { id: 'ownerName', label: '负责人', render: (item) => item.ownerName },
  { id: 'dueDate', label: '到期日', render: (item) => item.dueDate },
  { id: 'source', label: '来源', render: (item) => item.source },
];

const DEFAULT_VISIBLE_COLUMNS = TASK_COLUMNS.map((column) => column.id);
const DEFAULT_COLUMN_WIDTHS: ColumnWidthMap = {
  customerName: 180,
  title: 240,
  taskType: 120,
  priority: 120,
  status: 120,
  ownerName: 140,
  dueDate: 140,
  source: 140,
};

const CustomerSuccessTab: React.FC = () => {
  const [items, setItems] = useState<CustomerSuccessTask[]>([]);
  const [stats, setStats] = useState({ pending: 0, overdue: 0, highRisk: 0, renewal: 0, upgrade: 0 });
  const [taskType, setTaskType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CustomerSuccessTask | null>(null);
  const [followUp, setFollowUp] = useState('');
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState<ColumnWidthMap>(() => readColumnWidths(TASK_WIDTH_STORAGE_KEY, DEFAULT_COLUMN_WIDTHS));
  const [pagination, setPagination] = useState<PaginatedResponse<CustomerSuccessTask>['pagination']>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });
  const {
    viewConfig,
    visibleColumnIds,
    visibleColumns,
    frozenColumnCount,
    toggleColumn,
    reorderColumn,
    setFrozenColumnCount,
    resetViewConfig,
  } = useTableViewConfig(TASK_VIEW_STORAGE_KEY, TASK_COLUMNS, DEFAULT_VISIBLE_COLUMNS);

  const fetchData = async (nextPage = pagination.page, nextPageSize = pagination.pageSize) => {
    const [taskRes, statsRes] = await Promise.all([
      customerSuccessApi.getTasks({
        search,
        taskType: taskType as CustomerSuccessTaskType | undefined,
        status: status as CustomerSuccessTaskStatus | undefined,
        page: nextPage,
        pageSize: nextPageSize,
      }),
      customerSuccessApi.getStats(),
    ]);
    setItems(taskRes.data.items);
    setPagination(taskRes.data.pagination);
    setStats(statsRes.data);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    writeColumnWidths(TASK_WIDTH_STORAGE_KEY, columnWidths);
  }, [columnWidths]);

  const handleStatus = async (nextStatus: CustomerSuccessTaskStatus) => {
    if (!selected) return;
    const res = await customerSuccessApi.updateStatus(selected.id, nextStatus);
    if (res.data) {
      setSelected(res.data);
      await fetchData(pagination.page, pagination.pageSize);
    }
  };

  const handleFollowUp = async () => {
    if (!selected || !followUp.trim()) return;
    const res = await customerSuccessApi.addFollowUp(selected.id, followUp.trim());
    if (res.data) {
      setSelected(res.data);
      setFollowUp('');
      await fetchData(pagination.page, pagination.pageSize);
    }
  };

  const handleApplyFilters = () => {
    fetchData(1, pagination.pageSize);
  };

  const handlePageChange = (_: React.MouseEvent<HTMLButtonElement> | null, page: number) => {
    fetchData(page + 1, pagination.pageSize);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    fetchData(1, Number(event.target.value));
  };

  const handleResizeColumn = (id: string, delta: number) => {
    setColumnWidths((current) => resizeColumnWidths(current, id, delta));
  };

  const handleResetViewConfig = () => {
    resetViewConfig();
    setColumnWidths(resetColumnWidths(DEFAULT_COLUMN_WIDTHS));
  };

  const tableMinWidth = visibleColumns.reduce((sum, column) => sum + (columnWidths[column.id] || DEFAULT_COLUMN_WIDTHS[column.id] || 120), 0);

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

  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, mb: 3 }}>
        {[
          ['待处理', stats.pending],
          ['逾期', stats.overdue],
          ['风险客户', stats.highRisk],
          ['续费任务', stats.renewal],
          ['升单建议', stats.upgrade],
        ].map(([label, value]) => (
          <Paper key={label} elevation={0} sx={{ p: 2, border: '1px solid #f0f0f0' }}>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>{label}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{value}</Typography>
          </Paper>
        ))}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <TextField size="small" placeholder="搜索客户/任务" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 220 }} />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>任务类型</InputLabel>
            <Select value={taskType} label="任务类型" onChange={(e) => setTaskType(e.target.value)}>
              <MenuItem value="">全部</MenuItem>
              {taskTypes.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>状态</InputLabel>
            <Select value={status} label="状态" onChange={(e) => setStatus(e.target.value)}>
              <MenuItem value="">全部</MenuItem>
              {statuses.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
            </Select>
          </FormControl>
          <Button variant="outlined" onClick={handleApplyFilters}>筛选</Button>
        </Box>
        <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsOpen(true)}>
          视图设置
        </Button>
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
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelected(item)}>
                {visibleColumns.map((column, columnIndex) => (
                  <TableCell key={column.id} sx={{ ...getResizableCellSx(columnWidths[column.id]), ...getFrozenColumnSx(columnIndex) }}>
                    {column.render(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={visibleColumns.length} align="center" sx={{ py: 6, color: '#9ca3af' }}>
                  暂无客户成功任务
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
      <TableViewSettingsDialog
        open={viewSettingsOpen}
        title="客户成功任务视图设置"
        description="勾选后会显示在客户成功任务列表中，设置会保存在当前浏览器。"
        columns={TASK_COLUMNS}
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

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="sm" fullWidth>
        {selected && (
          <>
            <DialogCloseTitle onClose={() => setSelected(null)}>{selected.title}</DialogCloseTitle>
            <DialogContent dividers>
              <Typography variant="body2" sx={{ mb: 2 }}>{selected.description}</Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                {statuses.map((item) => (
                  <Button key={item} size="small" variant={selected.status === item ? 'contained' : 'outlined'} onClick={() => handleStatus(item)}>
                    {item}
                  </Button>
                ))}
              </Box>
              {selected.followUps.map((record) => (
                <Box key={record.id} sx={{ p: 1, mb: 1, bgcolor: '#f8fafc', borderRadius: 1 }}>
                  <Typography variant="body2">{record.content}</Typography>
                  <Typography variant="caption" sx={{ color: '#9ca3af' }}>{record.createdBy} · {formatDate(record.createdAt, 'MM-dd HH:mm')}</Typography>
                </Box>
              ))}
              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                <TextField size="small" label="跟进记录" value={followUp} onChange={(e) => setFollowUp(e.target.value)} fullWidth />
                <Button variant="contained" onClick={handleFollowUp} disabled={!followUp.trim()}>添加</Button>
              </Box>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default CustomerSuccessTab;
