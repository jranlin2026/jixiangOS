import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { leadFlowApi } from '../../api';
import type { LeadIntakeRecord } from '../../types/lead';
import { formatDate, formatPaginationRows } from '../../shared/utils/formatters';
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
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import useAuthStore from '../../store/useAuthStore';
import { isSuperAdminRoleName } from '../../shared/utils/roles';

type IntakeColumn = {
  id: string;
  label: string;
  render: (record: LeadIntakeRecord) => React.ReactNode;
};

const INTAKE_VIEW_STORAGE_KEY = 'aaos_lead_intake_table_view_v2';
const INTAKE_WIDTH_STORAGE_KEY = 'aaos_lead_intake_table_widths_v2';
const INTAKE_ACTION_COLUMN_WIDTH = 90;

const INTAKE_COLUMNS: IntakeColumn[] = [
  {
    id: 'customer',
    label: '客户',
    render: (record) => (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>{record.name}</Typography>
        {record.company && (
          <Typography variant="caption" sx={{ color: '#6b7280' }}>{record.company}</Typography>
        )}
      </Box>
    ),
  },
  {
    id: 'contact',
    label: '联系方式',
    render: (record) => (
      <Box>
        <Typography variant="body2">{record.phone || record.wechat || '未填写'}</Typography>
        {record.phone && record.wechat && (
          <Typography variant="caption" sx={{ color: '#6b7280' }}>{record.wechat}</Typography>
        )}
      </Box>
    ),
  },
  { id: 'source', label: '来源', render: (record) => record.source || '未填写' },
  { id: 'inputBy', label: '线索录入人', render: (record) => record.inputBy || '-' },
  {
    id: 'status',
    label: '状态',
    render: (record) => (
      <Chip
        label={record.status}
        size="small"
        color={record.status === '入库失败' ? 'error' : record.status === '待分配' ? 'warning' : 'success'}
      />
    ),
  },
  { id: 'assignedTo', label: '分配销售', render: (record) => record.assignedTo || (record.status === '待分配' ? '待分配' : '未分配') },
  { id: 'matchedRule', label: '命中规则', render: (record) => record.matchedRule || '系统规则' },
  {
    id: 'reason',
    label: '原因/对撞对象',
    render: (record) => record.failureReason || record.collisionTargetName || (record.status === '入库成功' ? '正常入库' : '等待分配'),
  },
  { id: 'createdAt', label: '录入时间', render: (record) => formatDate(record.createdAt, 'yyyy-MM-dd HH:mm:ss') },
];

const DEFAULT_VISIBLE_COLUMNS = INTAKE_COLUMNS.map((column) => column.id);

const DEFAULT_COLUMN_WIDTHS: ColumnWidthMap = {
  customer: 220,
  contact: 180,
  source: 150,
  inputBy: 140,
  status: 130,
  assignedTo: 140,
  matchedRule: 160,
  reason: 260,
  createdAt: 180,
};

const LeadIntakeTab: React.FC = () => {
  const [items, setItems] = useState<LeadIntakeRecord[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState<ColumnWidthMap>(() => readColumnWidths(INTAKE_WIDTH_STORAGE_KEY, DEFAULT_COLUMN_WIDTHS));
  const currentUser = useAuthStore((state) => state.currentUser);
  const isSuperAdmin = isSuperAdminRoleName(currentUser?.role);
  const [cleanupRecord, setCleanupRecord] = useState<LeadIntakeRecord | null>(null);
  const [cleanupReason, setCleanupReason] = useState('');
  const [cleanupSubmitting, setCleanupSubmitting] = useState(false);
  const { alert, dialog: feedbackDialog } = useAppFeedback();
  const {
    viewConfig,
    visibleColumnIds,
    visibleColumns,
    frozenColumnCount,
    toggleColumn,
    reorderColumn,
    setFrozenColumnCount,
    resetViewConfig,
  } = useTableViewConfig(INTAKE_VIEW_STORAGE_KEY, INTAKE_COLUMNS, DEFAULT_VISIBLE_COLUMNS);
  const [pagination, setPagination] = useState<PaginatedResponse<LeadIntakeRecord>['pagination']>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });

  const fetchData = async (
    nextSearch = search,
    nextStatus = status,
    nextPage = pagination.page,
    nextPageSize = pagination.pageSize,
  ) => {
    const res = await leadFlowApi.fetchIntakeRecords({
      search: nextSearch || undefined,
      status: nextStatus || undefined,
      page: nextPage,
      pageSize: nextPageSize,
    });
    if (res.code === 0) {
      setItems(res.data.items);
      setPagination(res.data.pagination);
    }
  };

  useEffect(() => {
    fetchData(search, status, 1, 10);
  }, []);

  useEffect(() => {
    writeColumnWidths(INTAKE_WIDTH_STORAGE_KEY, columnWidths);
  }, [columnWidths]);

  const handlePageChange = (_: React.MouseEvent<HTMLButtonElement> | null, page: number) => {
    fetchData(search, status, page + 1, pagination.pageSize);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    fetchData(search, status, 1, Number(event.target.value));
  };

  const handleResizeColumn = (id: string, delta: number) => {
    setColumnWidths((current) => resizeColumnWidths(current, id, delta));
  };

  const handleResetViewConfig = () => {
    resetViewConfig();
    setColumnWidths(resetColumnWidths(DEFAULT_COLUMN_WIDTHS));
  };

  const handleOpenCleanup = (record: LeadIntakeRecord) => {
    setCleanupRecord(record);
    setCleanupReason('');
  };

  const handleCloseCleanup = () => {
    setCleanupRecord(null);
    setCleanupReason('');
  };

  const handleConfirmCleanup = async () => {
    if (!cleanupRecord) return;
    const reason = cleanupReason.trim();
    if (!reason) return;
    setCleanupSubmitting(true);
    try {
      const res = await leadFlowApi.cleanupIntakeRecord(cleanupRecord.id, reason);
      if (res.code !== 0) {
        await alert(res.message || '清理线索入库记录失败');
        return;
      }
      handleCloseCleanup();
      fetchData(search, status, pagination.page, pagination.pageSize);
    } finally {
      setCleanupSubmitting(false);
    }
  };

  const tableMinWidth = visibleColumns.reduce((sum, column) => sum + (columnWidths[column.id] || DEFAULT_COLUMN_WIDTHS[column.id] || 120), 0)
    + (isSuperAdmin ? INTAKE_ACTION_COLUMN_WIDTH : 0);

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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="搜索姓名/公司/手机号/微信"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            fetchData(event.target.value, status, 1, pagination.pageSize);
          }}
          sx={{ minWidth: 260 }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>入库状态</InputLabel>
          <Select
            value={status}
            label="入库状态"
            onChange={(event) => {
              setStatus(event.target.value);
              fetchData(search, event.target.value, 1, pagination.pageSize);
            }}
          >
            <MenuItem value="">全部</MenuItem>
            <MenuItem value="入库成功">入库成功</MenuItem>
            <MenuItem value="入库失败">入库失败</MenuItem>
            <MenuItem value="待分配">待分配</MenuItem>
          </Select>
        </FormControl>
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
              {isSuperAdmin && (
                <TableCell
                  align="center"
                  sx={{
                    position: 'sticky',
                    right: 0,
                    zIndex: 5,
                    width: INTAKE_ACTION_COLUMN_WIDTH,
                    minWidth: INTAKE_ACTION_COLUMN_WIDTH,
                    bgcolor: '#f8fafc',
                    boxShadow: '-1px 0 0 #e5e7eb',
                  }}
                >
                  操作
                </TableCell>
              )}
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((record) => (
              <TableRow key={record.id} hover>
                {visibleColumns.map((column, columnIndex) => (
                  <TableCell key={column.id} sx={{ ...getResizableCellSx(columnWidths[column.id]), ...getFrozenColumnSx(columnIndex) }}>
                    {column.render(record)}
                  </TableCell>
                ))}
                {isSuperAdmin && (
                  <TableCell
                    align="center"
                    sx={{
                      position: 'sticky',
                      right: 0,
                      zIndex: 4,
                      width: INTAKE_ACTION_COLUMN_WIDTH,
                      minWidth: INTAKE_ACTION_COLUMN_WIDTH,
                      bgcolor: '#fff',
                      boxShadow: '-1px 0 0 #e5e7eb',
                    }}
                  >
                    <Tooltip title="清理入库记录">
                      <IconButton size="small" color="error" onClick={() => handleOpenCleanup(record)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + (isSuperAdmin ? 1 : 0)} align="center" sx={{ py: 6, color: '#9ca3af' }}>
                  暂无入库记录
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
      <Dialog open={Boolean(cleanupRecord)} onClose={cleanupSubmitting ? undefined : handleCloseCleanup} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => {
          if (!cleanupSubmitting) handleCloseCleanup();
        }}>清理线索入库记录</DialogCloseTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
            这里清理的是入库流水记录，不会删除已经入库成功的线索或客户。
          </Typography>
          {cleanupRecord && (
            <Box sx={{ p: 1.5, border: '1px solid #fee2e2', borderRadius: 1, bgcolor: '#fff7ed', mb: 2 }}>
              <Typography variant="body2">客户：{cleanupRecord.name}</Typography>
              <Typography variant="body2">状态：{cleanupRecord.status}</Typography>
            </Box>
          )}
          <TextField
            label="清理原因"
            value={cleanupReason}
            onChange={(event) => setCleanupReason(event.target.value)}
            placeholder="例如：测试入库记录、重复导入记录"
            multiline
            minRows={3}
            required
            fullWidth
            autoFocus
            error={!cleanupReason.trim()}
            helperText={!cleanupReason.trim() ? '清理原因不能为空' : ' '}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCleanup} disabled={cleanupSubmitting}>取消</Button>
          <Button color="error" variant="contained" onClick={handleConfirmCleanup} disabled={!cleanupReason.trim() || cleanupSubmitting}>
            确认清理
          </Button>
        </DialogActions>
      </Dialog>
      <TableViewSettingsDialog
        open={viewSettingsOpen}
        title="入库情况视图设置"
        description="勾选后会显示在入库情况列表中，设置会保存在当前浏览器。"
        columns={INTAKE_COLUMNS}
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
      {feedbackDialog}
    </Box>
  );
};

export default LeadIntakeTab;
