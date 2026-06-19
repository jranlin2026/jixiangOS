import React, { useEffect, useState } from 'react';
import {
  Box,
  Chip,
  FormControl,
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
  Typography,
} from '@mui/material';
import { leadFlowApi } from '../../api';
import type { LeadIntakeRecord } from '../../types/lead';
import { formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import type { PaginatedResponse } from '../../api/types';

const LeadIntakeTab: React.FC = () => {
  const [items, setItems] = useState<LeadIntakeRecord[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
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

  const handlePageChange = (_: React.MouseEvent<HTMLButtonElement> | null, page: number) => {
    fetchData(search, status, page + 1, pagination.pageSize);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    fetchData(search, status, 1, Number(event.target.value));
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
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

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>客户</TableCell>
              <TableCell>联系方式</TableCell>
              <TableCell>来源</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>分配销售</TableCell>
              <TableCell>命中规则</TableCell>
              <TableCell>原因/对撞对象</TableCell>
              <TableCell>录入时间</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((record) => (
              <TableRow key={record.id} hover>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{record.name}</Typography>
                  {record.company && (
                    <Typography variant="caption" sx={{ color: '#6b7280' }}>{record.company}</Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{record.phone || record.wechat || '未填写'}</Typography>
                  {record.phone && record.wechat && (
                    <Typography variant="caption" sx={{ color: '#6b7280' }}>{record.wechat}</Typography>
                  )}
                </TableCell>
                <TableCell>{record.source || '未填写'}</TableCell>
                <TableCell>
                  <Chip
                    label={record.status}
                    size="small"
                    color={record.status === '入库失败' ? 'error' : record.status === '待分配' ? 'warning' : 'success'}
                  />
                </TableCell>
                <TableCell>{record.assignedTo || (record.status === '待分配' ? '待分配' : '未分配')}</TableCell>
                <TableCell>{record.matchedRule || '系统规则'}</TableCell>
                <TableCell>
                  {record.failureReason || record.collisionTargetName || (record.status === '入库成功' ? '正常入库' : '等待分配')}
                </TableCell>
                <TableCell>{formatDate(record.createdAt)}</TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6, color: '#9ca3af' }}>
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
    </Box>
  );
};

export default LeadIntakeTab;
