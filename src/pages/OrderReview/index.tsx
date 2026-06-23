import React, { useEffect, useMemo, useState } from 'react';
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
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReplayIcon from '@mui/icons-material/Replay';
import BlockIcon from '@mui/icons-material/Block';
import EditIcon from '@mui/icons-material/Edit';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { canReviewOrderApplications, orderReviewApi, ORDER_APPLICATION_STATUSES } from '../../api';
import type { OrderApplication, OrderApplicationFilters, OrderApplicationStatus } from '../../types/order';
import { formatCurrency, formatPaginationRows } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import OrderForm from '../Orders/OrderForm';
import { ROUTES } from '../../shared/utils/constants';
import { getCurrentOperatorUser } from '../../shared/utils/currentOperator';

type ReviewAction = {
  type: 'approve' | 'return' | 'reject';
  application: OrderApplication;
} | null;

type OrderReviewProps = {
  embedded?: boolean;
};

const statusColor: Record<OrderApplicationStatus, 'warning' | 'info' | 'success' | 'error'> = {
  待财务审核: 'warning',
  退回修改: 'info',
  已入库: 'success',
  已驳回: 'error',
};

const reviewActionText: Record<OrderApplication['reviewLogs'][number]['action'], string> = {
  submit: '提交申请',
  resubmit: '重新提交',
  approve: '审核入库',
  return: '退回修改',
  reject: '驳回终止',
};

function formatDate(value?: string) {
  if (!value) return '-';
  try {
    return format(new Date(value), 'yyyy-MM-dd HH:mm');
  } catch {
    return value;
  }
}

const OrderReview: React.FC<OrderReviewProps> = ({ embedded = false }) => {
  const [items, setItems] = useState<OrderApplication[]>([]);
  const [filters, setFilters] = useState<OrderApplicationFilters>({ page: 1, pageSize: 10 });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [editingApplication, setEditingApplication] = useState<OrderApplication | null>(null);
  const [detailApplication, setDetailApplication] = useState<OrderApplication | null>(null);
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [approvedApplication, setApprovedApplication] = useState<OrderApplication | null>(null);
  const reviewer = useMemo(() => canReviewOrderApplications(), []);
  const currentUser = useMemo(() => getCurrentOperatorUser(), []);
  const navigate = useNavigate();

  const loadItems = async (nextFilters = filters) => {
    setLoading(true);
    try {
      const res = await orderReviewApi.fetchOrderApplications(nextFilters);
      if (res.code === 0) {
        setItems(res.data.items);
        setPagination(res.data.pagination);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilterChange = (key: keyof OrderApplicationFilters, value: string) => {
    const nextFilters = { ...filters, [key]: value || undefined, page: 1, pageSize: pagination.pageSize };
    setFilters(nextFilters);
    loadItems(nextFilters);
  };

  const handlePageChange = (_event: React.MouseEvent<HTMLButtonElement> | null, page: number) => {
    const nextFilters = { ...filters, page: page + 1, pageSize: pagination.pageSize };
    setFilters(nextFilters);
    loadItems(nextFilters);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const nextFilters = { ...filters, page: 1, pageSize: Number(event.target.value) };
    setFilters(nextFilters);
    loadItems(nextFilters);
  };

  const openApproveDialog = (application: OrderApplication) => {
    setReviewAction({ type: 'approve', application });
    setReviewReason('');
  };

  const openReturnDialog = (application: OrderApplication) => {
    setReviewAction({ type: 'return', application });
    setReviewReason('');
  };

  const openRejectDialog = (application: OrderApplication) => {
    setReviewAction({ type: 'reject', application });
    setReviewReason('');
  };

  const closeReviewDialog = () => {
    setReviewAction(null);
    setReviewReason('');
  };

  const submitReviewAction = async () => {
    if (!reviewAction) return;

    if (reviewAction.type === 'approve') {
      const res = await orderReviewApi.approveOrderApplication(reviewAction.application.id);
      if (res.code === 0 && res.data) setApprovedApplication(res.data);
    } else if (reviewAction.type === 'return') {
      const reason = reviewReason.trim();
      if (!reason) return;
      await orderReviewApi.returnOrderApplication(reviewAction.application.id, reason);
    } else {
      const reason = reviewReason.trim();
      if (!reason) return;
      await orderReviewApi.rejectOrderApplication(reviewAction.application.id, reason);
    }

    closeReviewDialog();
    loadItems();
  };

  const viewFormalOrder = (application?: OrderApplication | null) => {
    if (!application?.orderId) return;
    navigate(`${ROUTES.ORDERS}?tab=list&orderId=${encodeURIComponent(application.orderId)}`);
  };

  const isCurrentUserApplicant = (application: OrderApplication) => (
    Boolean(currentUser?.id && application.applicantId === currentUser.id)
    || Boolean(currentUser?.name && !application.applicantId && application.applicantName === currentUser.name)
  );

  const reload = () => loadItems(filters);

  return (
    <Box sx={embedded ? { pt: 1 } : { p: 3 }}>
      {!embedded && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>订单审核台</Typography>
            <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
              销售提交后先进入审核台，财务审核通过才生成正式订单和提成。
            </Typography>
          </Box>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={reload} disabled={loading}>
            刷新
          </Button>
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          placeholder="搜索申请号、订单号、客户或提交人"
          value={filters.search || ''}
          onChange={(event) => handleFilterChange('search', event.target.value)}
          sx={{ minWidth: 280 }}
        />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>审核状态</InputLabel>
          <Select
            label="审核状态"
            value={filters.status || ''}
            onChange={(event) => handleFilterChange('status', event.target.value)}
          >
            <MenuItem value="">全部</MenuItem>
            {Object.values(ORDER_APPLICATION_STATUSES).map((status) => (
              <MenuItem key={status} value={status}>{status}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {embedded && (
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={reload} disabled={loading}>
            刷新
          </Button>
        )}
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0', overflowX: 'auto' }}>
        <Table sx={{ minWidth: 1180 }}>
          <TableHead>
            <TableRow>
              <TableCell>申请编号</TableCell>
              <TableCell>正式订单号</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>客户</TableCell>
              <TableCell>产品/类型</TableCell>
              <TableCell>实付金额</TableCell>
              <TableCell>提交人</TableCell>
              <TableCell>提交时间</TableCell>
              <TableCell>审核人</TableCell>
              <TableCell>原因</TableCell>
              <TableCell
                align="center"
                sx={{
                  position: 'sticky',
                  right: 0,
                  zIndex: 5,
                  width: 148,
                  minWidth: 148,
                  bgcolor: '#f8fafc',
                  boxShadow: '-1px 0 0 #e5e7eb',
                }}
              >
                操作
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((application) => {
              const canFinanceOperate = reviewer && application.status === ORDER_APPLICATION_STATUSES.PENDING_REVIEW;
              const canResubmit = application.status === ORDER_APPLICATION_STATUSES.RETURNED && (!reviewer || isCurrentUserApplicant(application));
              const canViewFormalOrder = application.status === ORDER_APPLICATION_STATUSES.APPROVED && Boolean(application.orderId);
              return (
                <TableRow key={application.id} hover>
                  <TableCell>
                    <Button variant="text" onClick={() => setDetailApplication(application)} sx={{ px: 0 }}>
                      {application.applicationNo}
                    </Button>
                  </TableCell>
                  <TableCell>
                    {application.orderNo ? (
                      <Button variant="text" size="small" onClick={() => viewFormalOrder(application)} sx={{ px: 0 }}>
                        {application.orderNo}
                      </Button>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Chip label={application.status} size="small" color={statusColor[application.status]} variant="outlined" />
                  </TableCell>
                  <TableCell>{application.orderData.customerName}</TableCell>
                  <TableCell>{application.orderData.productLevel} / {application.orderData.orderType}</TableCell>
                  <TableCell>{formatCurrency(application.orderData.actualAmount || application.orderData.amount)}</TableCell>
                  <TableCell>{application.applicantName}</TableCell>
                  <TableCell>{formatDate(application.submittedAt)}</TableCell>
                  <TableCell>{application.reviewerName || '-'}</TableCell>
                  <TableCell sx={{ maxWidth: 180 }}>
                    <Tooltip title={application.reason || ''}>
                      <Typography variant="body2" noWrap>{application.reason || '-'}</Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell
                    align="center"
                    sx={{
                      position: 'sticky',
                      right: 0,
                      zIndex: 4,
                      width: 148,
                      minWidth: 148,
                      bgcolor: '#fff',
                      boxShadow: '-1px 0 0 #e5e7eb',
                    }}
                  >
                    <Box sx={{ display: 'flex', gap: 0.25, justifyContent: 'center', flexWrap: 'wrap' }}>
                      {canFinanceOperate && (
                        <>
                          <Tooltip title="入库">
                            <IconButton aria-label="入库" size="small" color="primary" onClick={() => openApproveDialog(application)}>
                              <CheckCircleOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="退回修改">
                            <IconButton aria-label="退回修改" size="small" color="info" onClick={() => openReturnDialog(application)}>
                              <ReplayIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="驳回终止">
                            <IconButton aria-label="驳回终止" size="small" color="error" onClick={() => openRejectDialog(application)}>
                              <BlockIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                      {canResubmit && (
                        <Tooltip title="修改提交">
                          <IconButton aria-label="修改提交" size="small" color="primary" onClick={() => setEditingApplication(application)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {canViewFormalOrder && (
                        <Tooltip title="查看正式订单">
                          <IconButton aria-label="查看正式订单" size="small" color="primary" onClick={() => viewFormalOrder(application)}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })}
            {!items.length && (
              <TableRow>
                <TableCell colSpan={11} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                  {loading ? '加载中...' : '暂无订单申请'}
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

      <OrderForm
        open={Boolean(editingApplication)}
        application={editingApplication}
        onClose={() => setEditingApplication(null)}
        onSuccess={() => {
          setEditingApplication(null);
          loadItems();
        }}
      />

      <Dialog open={Boolean(reviewAction)} onClose={closeReviewDialog} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={closeReviewDialog}>
          {reviewAction?.type === 'approve' ? '确认订单入库' : reviewAction?.type === 'return' ? '退回修改' : '驳回终止'}
        </DialogCloseTitle>
        <DialogContent dividers>
          {reviewAction && (
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <Typography variant="body2" sx={{ color: '#4b5563' }}>
                {reviewAction.type === 'approve'
                  ? '审核通过后，这条申请会生成正式订单，并进入后续提成和交付流程。'
                  : reviewAction.type === 'return'
                    ? '请填写退回原因，销售可以按原因修改后重新提交。'
                    : '请填写驳回原因，驳回后该申请将结束，不会生成正式订单。'}
              </Typography>
              <Box sx={{ p: 1.5, border: '1px solid #e5e7eb', borderRadius: 1, bgcolor: '#f8fafc' }}>
                <Typography variant="body2">客户：{reviewAction.application.orderData.customerName}</Typography>
                <Typography variant="body2">
                  产品/类型：{reviewAction.application.orderData.productLevel} / {reviewAction.application.orderData.orderType}
                </Typography>
                <Typography variant="body2">
                  实付金额：{formatCurrency(reviewAction.application.orderData.actualAmount || reviewAction.application.orderData.amount)}
                </Typography>
              </Box>
              {reviewAction.type !== 'approve' && (
                <TextField
                  label={reviewAction.type === 'return' ? '退回原因' : '驳回原因'}
                  value={reviewReason}
                  onChange={(event) => setReviewReason(event.target.value)}
                  placeholder={reviewAction.type === 'return' ? '例如：付款凭证不清晰，请补充后重提' : '例如：收款信息不匹配，无法入库'}
                  multiline
                  minRows={3}
                  required
                  fullWidth
                  autoFocus
                  error={!reviewReason.trim()}
                  helperText={!reviewReason.trim() ? '原因不能为空' : ' '}
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeReviewDialog}>取消</Button>
          <Button
            variant="contained"
            color={reviewAction?.type === 'reject' ? 'error' : reviewAction?.type === 'return' ? 'warning' : 'primary'}
            onClick={submitReviewAction}
            disabled={(reviewAction?.type === 'return' || reviewAction?.type === 'reject') && !reviewReason.trim()}
          >
            {reviewAction?.type === 'approve' ? '确认入库' : reviewAction?.type === 'return' ? '确认退回修改' : '确认驳回终止'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(approvedApplication)} onClose={() => setApprovedApplication(null)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setApprovedApplication(null)}>订单已入库</DialogCloseTitle>
        <DialogContent dividers>
          {approvedApplication && (
            <Box sx={{ display: 'grid', gap: 1.25 }}>
              <Typography variant="body2" sx={{ color: '#374151' }}>
                财务审核已通过，系统已生成正式订单，并同步进入提成和交付流程。
              </Typography>
              <Box sx={{ p: 1.5, border: '1px solid #dbeafe', borderRadius: 1, bgcolor: '#eff6ff' }}>
                <Typography variant="body2">申请编号：{approvedApplication.applicationNo}</Typography>
                <Typography variant="body2">正式订单号：{approvedApplication.orderNo || '-'}</Typography>
                <Typography variant="body2">客户：{approvedApplication.orderData.customerName}</Typography>
                <Typography variant="body2">
                  实付金额：{formatCurrency(approvedApplication.orderData.actualAmount || approvedApplication.orderData.amount)}
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApprovedApplication(null)}>继续审核</Button>
          <Button
            variant="contained"
            disabled={!approvedApplication?.orderId}
            onClick={() => {
              const target = approvedApplication;
              setApprovedApplication(null);
              viewFormalOrder(target);
            }}
          >
            查看正式订单
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(detailApplication)} onClose={() => setDetailApplication(null)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setDetailApplication(null)}>订单申请详情</DialogCloseTitle>
        <DialogContent dividers>
          {detailApplication && (
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
                <Typography>申请编号：{detailApplication.applicationNo}</Typography>
                <Typography>状态：{detailApplication.status}</Typography>
                <Typography>正式订单号：{detailApplication.orderNo || '-'}</Typography>
                <Typography>客户：{detailApplication.orderData.customerName}</Typography>
                <Typography>产品/类型：{detailApplication.orderData.productLevel} / {detailApplication.orderData.orderType}</Typography>
                <Typography>销售负责人：{detailApplication.orderData.owner}</Typography>
                <Typography>提交人：{detailApplication.applicantName}</Typography>
                <Typography>提交时间：{formatDate(detailApplication.submittedAt)}</Typography>
                <Typography>审核人：{detailApplication.reviewerName || '-'}</Typography>
                <Typography>审核时间：{formatDate(detailApplication.reviewedAt)}</Typography>
                <Typography>实付金额：{formatCurrency(detailApplication.orderData.actualAmount || detailApplication.orderData.amount)}</Typography>
                <Typography>付款时间：{formatDate(detailApplication.orderData.payments?.[0]?.paidAt)}</Typography>
              </Box>
              <Typography>原因：{detailApplication.reason || '-'}</Typography>
              <Typography>备注：{detailApplication.orderData.notes || '-'}</Typography>
              <Typography variant="subtitle2" sx={{ mt: 1 }}>审核记录</Typography>
              {detailApplication.reviewLogs.map((log) => (
                <Typography key={log.id} variant="body2" sx={{ color: '#6b7280' }}>
                  {formatDate(log.createdAt)} {log.operatorName} {reviewActionText[log.action]}{log.reason ? `：${log.reason}` : ''}
                </Typography>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailApplication(null)}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OrderReview;
