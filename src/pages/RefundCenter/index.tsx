import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  Tabs,
  Tab,
  Button,
} from '@mui/material';
import TablePagination from '../../shared/components/TablePagination';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import useRefundStore from '../../store/useRefundStore';
import { REFUND_CATEGORIES, getProductLevelColor, getProductLevelRowSx } from '../../shared/utils/constants';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import RefundDetail from './RefundDetail';
import RefundProcessDialog from './RefundProcessDialog';
import ServiceTicketTab from './ServiceTicketTab';
import type { Refund } from '../../types/refund';
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

type RefundColumn = {
  id: string;
  label: string;
  render: (refund: Refund) => React.ReactNode;
};

const REFUND_VIEW_STORAGE_KEY = 'aaos_refund_table_view_v2';
const REFUND_WIDTH_STORAGE_KEY = 'aaos_refund_table_widths_v2';
const REFUND_ACTION_COLUMN_WIDTH = 160;

const DEFAULT_COLUMN_WIDTHS: ColumnWidthMap = {
  refundNo: 180,
  orderNo: 180,
  customerName: 180,
  productName: 180,
  productLevel: 140,
  orderAmount: 140,
  refundAmount: 140,
  refundCategory: 140,
  status: 150,
  assignedTo: 160,
  attempts: 120,
  riskTags: 180,
  createdAt: 180,
};

interface RefundCenterProps {
  embedded?: boolean;
  refundViewSettingsTrigger?: number;
  showInternalTabs?: boolean;
}

const RefundCenter: React.FC<RefundCenterProps> = ({ embedded = false, refundViewSettingsTrigger = 0, showInternalTabs = true }) => {
  const lastRefundViewSettingsTriggerRef = useRef(refundViewSettingsTrigger);
  const {
    items,
    stats,
    filters,
    pagination,
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
  const [activeTab, setActiveTab] = useState(0);
  const [viewSettingsOpen, setViewSettingsOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState<ColumnWidthMap>(() => readColumnWidths(REFUND_WIDTH_STORAGE_KEY, DEFAULT_COLUMN_WIDTHS));

  useEffect(() => {
    fetchItems();
    fetchStats();
  }, [fetchItems, fetchStats]);

  useEffect(() => {
    if (refundViewSettingsTrigger <= 0) return;
    if (lastRefundViewSettingsTriggerRef.current === refundViewSettingsTrigger) return;
    lastRefundViewSettingsTriggerRef.current = refundViewSettingsTrigger;
    setActiveTab(0);
    setViewSettingsOpen(true);
  }, [refundViewSettingsTrigger]);

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
    const newFilters = { ...filters, [key]: value || undefined, page: 1, pageSize: pagination.pageSize || 10 } as any;
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

  const columns = useMemo<RefundColumn[]>(() => [
    { id: 'refundNo', label: '退款号', render: (refund) => refund.refundNo },
    { id: 'orderNo', label: '订单号', render: (refund) => refund.orderNo },
    { id: 'customerName', label: '客户', render: (refund) => refund.customerName },
    { id: 'productName', label: '产品名称', render: (refund) => refund.productName || refund.productLevel || '-' },
    {
      id: 'productLevel',
      label: '产品等级',
      render: (refund) => {
        const levelColor = getProductLevelColor(refund.productLevel);
        return <Chip label={refund.productLevel} size="small" sx={{ bgcolor: `${levelColor}18`, color: levelColor, fontWeight: 600 }} />;
      },
    },
    { id: 'orderAmount', label: '订单金额', render: (refund) => formatCurrency(refund.orderAmount) },
    { id: 'refundAmount', label: '退款金额', render: (refund) => <Box component="span" sx={{ fontWeight: 600, color: '#F44336' }}>{formatCurrency(refund.refundAmount)}</Box> },
    { id: 'refundCategory', label: '退款分类', render: (refund) => refund.refundCategory },
    {
      id: 'status',
      label: '状态',
      render: (refund) => <Chip label={refund.status} size="small" color={getStatusColor(refund.status)} />,
    },
    { id: 'assignedTo', label: '挽回负责人', render: (refund) => refund.recoveryTask?.assignedToName || refund.applicantName },
    { id: 'attempts', label: '次数', render: (refund) => `${refund.recoveryTask?.attemptCount || 0}/${refund.recoveryTask?.maxAttempts || 3}` },
    {
      id: 'riskTags',
      label: '风险',
      render: (refund) => (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {refund.riskTags?.length ? refund.riskTags.map((tag: string) => (
            <Chip key={tag} label={tag} size="small" color={tag === '高金额' ? 'error' : 'warning'} variant="outlined" />
          )) : '-'}
        </Box>
      ),
    },
    { id: 'createdAt', label: '创建时间', render: (refund) => formatDate(refund.createdAt) },
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
  } = useTableViewConfig(REFUND_VIEW_STORAGE_KEY, columns, defaultVisibleColumns);

  useEffect(() => {
    writeColumnWidths(REFUND_WIDTH_STORAGE_KEY, columnWidths);
  }, [columnWidths]);

  const actionIconSx = {
    width: 28,
    height: 28,
    borderRadius: 1,
    '& .MuiSvgIcon-root': { fontSize: 17 },
  };

  const handlePageChange = (_: React.MouseEvent<HTMLButtonElement> | null, page: number) => {
    const newFilters = { ...filters, page: page + 1, pageSize: pagination.pageSize || 10 } as any;
    setFilters(newFilters);
    fetchItems(newFilters);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const pageSize = Number(event.target.value);
    const newFilters = { ...filters, page: 1, pageSize } as any;
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

  const tableMinWidth = visibleColumns.reduce((sum, column) => sum + (columnWidths[column.id] || DEFAULT_COLUMN_WIDTHS[column.id] || 120), 0) + REFUND_ACTION_COLUMN_WIDTH;

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
    width: REFUND_ACTION_COLUMN_WIDTH,
    minWidth: REFUND_ACTION_COLUMN_WIDTH,
    bgcolor: '#fff',
    boxShadow: '-1px 0 0 #e5e7eb',
  };

  return (
    <Box sx={{ p: embedded ? 0 : 3 }}>
      {!embedded && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            退款中心
          </Typography>
          <Box sx={{ flex: 1 }} />
          {(!showInternalTabs || activeTab === 0) && (
            <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsOpen(true)}>
              视图设置
            </Button>
          )}
        </Box>
      )}

      {showInternalTabs && (
        <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={{ mb: 3 }}>
          <Tab label="退款挽回" />
          <Tab label="售后工单" />
        </Tabs>
      )}

      {!showInternalTabs || activeTab === 0 ? (
        <>

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
            {items.map((refund: any) => {
              return (
                <TableRow key={refund.id} hover sx={getProductLevelRowSx(refund.productLevel)}>
                  {visibleColumns.map((column, columnIndex) => (
                    <TableCell key={column.id} sx={{ ...getResizableCellSx(columnWidths[column.id]), ...getFrozenColumnSx(columnIndex) }}>
                      {column.render(refund)}
                    </TableCell>
                  ))}
                  <TableCell align="center" sx={actionColumnSx}>
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
                <TableCell colSpan={visibleColumns.length + 1} align="center" sx={{ py: 6, color: '#9ca3af' }}>
                  暂无退款记录
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
        title="退款列表视图设置"
        description="勾选后会显示在退款中心列表中，设置会保存在当前浏览器。"
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
        </>
      ) : (
        <ServiceTicketTab />
      )}
    </Box>
  );
};

export default RefundCenter;

