import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Chip, MenuItem, Paper, Tab, Tabs, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import { positionGovernanceApi, settingsApi } from '../../api';
import type { Position } from '../../types/position';
import type { EmployeePositionHistory, PositionMappingBatch } from '../../types/positionGovernance';
import useDepartmentStore from '../../store/useDepartmentStore';
import TablePagination from '../../shared/components/TablePagination';
import useAppFeedback from '../../shared/hooks/useAppFeedback';

const matchLabels: Record<string, string> = {
  UNIQUE_MATCH: '唯一匹配', MULTIPLE_MATCHES: '多个候选', DEPARTMENT_CONFLICT: '部门冲突', NO_MATCH: '未匹配',
};
const changeLabels: Record<string, string> = {
  MIGRATION_BIND: '历史回填', POSITION_CHANGE: '调岗', DEPARTMENT_CHANGE: '转部门', POSITION_AND_DEPARTMENT_CHANGE: '调岗并转部门',
};

const PositionGovernance: React.FC = () => {
  const { items: departments, fetchItems: fetchDepartments } = useDepartmentStore();
  const [tab, setTab] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [batch, setBatch] = useState<PositionMappingBatch | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [previewPage, setPreviewPage] = useState(0);
  const [previewRowsPerPage, setPreviewRowsPerPage] = useState(10);
  const [history, setHistory] = useState<EmployeePositionHistory[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyRowsPerPage, setHistoryRowsPerPage] = useState(10);
  const [historyType, setHistoryType] = useState('');
  const [loading, setLoading] = useState(false);
  const { alert, confirm, dialog } = useAppFeedback();

  useEffect(() => {
    fetchDepartments();
    settingsApi.fetchPositions().then((response) => {
      if (response.code === 0) setPositions(response.data);
    });
  }, [fetchDepartments]);

  const loadHistory = async () => {
    const response = await positionGovernanceApi.listHistory({ changeType: historyType, page: historyPage + 1, pageSize: historyRowsPerPage });
    if (response.code !== 0) {
      await alert(response.message || '加载岗位变更记录失败', '加载失败');
      return;
    }
    setHistory(response.data.items);
    setHistoryTotal(response.data.total);
  };

  useEffect(() => {
    if (tab === 1) loadHistory();
  }, [tab, historyPage, historyRowsPerPage, historyType]);

  const generatePreview = async () => {
    setLoading(true);
    const response = await positionGovernanceApi.createPreview({ departmentId: departmentId || undefined, search: search.trim() || undefined, employmentStatus: 'active' });
    setLoading(false);
    if (response.code !== 0) {
      await alert(response.message || '生成岗位映射预览失败', '生成失败');
      return;
    }
    setBatch(response.data);
    setPreviewPage(0);
    setSelections(Object.fromEntries(response.data.items.filter((item) => item.suggestedPositionId).map((item) => [item.employeeId, item.suggestedPositionId!])))
  };

  const applyPreview = async () => {
    if (!batch) return;
    const selectedItems = batch.items.filter((item) => selections[item.employeeId]);
    if (!selectedItems.length) {
      await alert('请至少为一名员工确认正式岗位', '确认回填');
      return;
    }
    if (!await confirm(`确认为 ${selectedItems.length} 名员工回填正式岗位吗？执行后将写入岗位变更历史。`, '确认历史岗位回填')) return;
    setLoading(true);
    const response = await positionGovernanceApi.applyBatch(batch.id, selectedItems.map((item) => ({ employeeId: item.employeeId, positionId: selections[item.employeeId] })));
    setLoading(false);
    if (response.code !== 0) {
      await alert(response.message || '历史岗位回填失败', '回填失败');
      return;
    }
    setBatch(response.data);
    await alert(`已完成 ${response.data.appliedCount} 名员工的岗位回填。`, '回填完成');
  };

  const previewItems = useMemo(() => batch?.items || [], [batch]);
  const paginatedPreview = previewItems.slice(previewPage * previewRowsPerPage, previewPage * previewRowsPerPage + previewRowsPerPage);
  const availablePositions = (item: PositionMappingBatch['items'][number]) => positions.filter((position) => (
    position.isActive && (!position.departmentId || position.departmentId === item.departmentId)
  ));

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>历史岗位治理</Typography>
        <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>先预览、再人工确认；系统不会根据自由文本自动修改员工岗位。</Typography>
      </Box>
      <Tabs value={tab} onChange={(_event, value) => setTab(value)} sx={{ mb: 2 }}>
        <Tab label="映射预览与回填" /><Tab label="岗位变更记录" />
      </Tabs>

      {tab === 0 && <>
        <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid #e5e7eb' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 220px auto' }, gap: 1.5 }}>
            <TextField size="small" placeholder="搜索员工或原岗位" value={search} onChange={(event) => setSearch(event.target.value)} InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: '#94a3b8' }} /> }} />
            <TextField select size="small" label="部门" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><MenuItem value="">全部部门</MenuItem>{departments.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField>
            <Button variant="contained" startIcon={<PlaylistAddCheckIcon />} disabled={loading} onClick={generatePreview}>生成预览</Button>
          </Box>
        </Paper>
        {batch && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 2 }}>
          <Chip label={`共 ${batch.totalCount} 人`} /><Chip color="success" label={`唯一匹配 ${batch.matchedCount}`} /><Chip color="warning" label={`待人工处理 ${batch.conflictCount}`} />
          <Button sx={{ ml: { md: 'auto' } }} variant="contained" disabled={loading || batch.status === 'APPLIED'} onClick={applyPreview}>{batch.status === 'APPLIED' ? '已完成回填' : '确认所选回填'}</Button>
        </Box>}
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', overflowX: 'auto' }}>
          <Table sx={{ minWidth: 920 }}><TableHead><TableRow><TableCell>员工</TableCell><TableCell>部门</TableCell><TableCell>原自由文本岗位</TableCell><TableCell>匹配结果</TableCell><TableCell sx={{ minWidth: 220 }}>确认正式岗位</TableCell><TableCell>处理状态</TableCell></TableRow></TableHead>
            <TableBody>{paginatedPreview.map((item) => <TableRow key={item.id} hover><TableCell sx={{ fontWeight: 600 }}>{item.employeeName}</TableCell><TableCell>{item.departmentName || '-'}</TableCell><TableCell>{item.originalPositionName || '-'}</TableCell><TableCell><Chip size="small" label={matchLabels[item.matchStatus]} color={item.matchStatus === 'UNIQUE_MATCH' ? 'success' : 'warning'} /></TableCell><TableCell><TextField select size="small" fullWidth value={selections[item.employeeId] || ''} disabled={batch?.status === 'APPLIED'} onChange={(event) => setSelections((current) => ({ ...current, [item.employeeId]: event.target.value }))}><MenuItem value="">待选择</MenuItem>{availablePositions(item).map((position) => <MenuItem key={position.id} value={position.id}>{position.name}</MenuItem>)}</TextField></TableCell><TableCell>{item.applyStatus === 'APPLIED' ? '已回填' : '待处理'}</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
        <TablePagination count={previewItems.length} page={previewPage} rowsPerPage={previewRowsPerPage} onPageChange={(_event, page) => setPreviewPage(page)} onRowsPerPageChange={(event) => { setPreviewRowsPerPage(Number(event.target.value)); setPreviewPage(0); }} sx={{ mt: 2 }} />
      </>}

      {tab === 1 && <>
        <TextField select size="small" label="变更类型" value={historyType} onChange={(event) => { setHistoryType(event.target.value); setHistoryPage(0); }} sx={{ width: 220, mb: 2 }}><MenuItem value="">全部类型</MenuItem>{Object.entries(changeLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', overflowX: 'auto' }}><Table sx={{ minWidth: 1000 }}><TableHead><TableRow><TableCell>员工</TableCell><TableCell>类型</TableCell><TableCell>原部门/岗位</TableCell><TableCell>新部门/岗位</TableCell><TableCell>原因</TableCell><TableCell>操作人</TableCell><TableCell>变更时间</TableCell></TableRow></TableHead><TableBody>{history.map((row) => <TableRow key={row.id} hover><TableCell sx={{ fontWeight: 600 }}>{row.employeeName}</TableCell><TableCell>{changeLabels[row.changeType] || row.changeType}</TableCell><TableCell>{row.oldDepartmentName || '-'} / {row.oldPositionName || '-'}</TableCell><TableCell>{row.newDepartmentName || '-'} / {row.newPositionName || '-'}</TableCell><TableCell>{row.reason || '-'}</TableCell><TableCell>{row.changedByName}</TableCell><TableCell>{new Date(row.changedAt).toLocaleString('zh-CN')}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
        <TablePagination count={historyTotal} page={historyPage} rowsPerPage={historyRowsPerPage} onPageChange={(_event, page) => setHistoryPage(page)} onRowsPerPageChange={(event) => { setHistoryRowsPerPage(Number(event.target.value)); setHistoryPage(0); }} sx={{ mt: 2 }} />
      </>}
      {dialog}
    </Box>
  );
};

export default PositionGovernance;
