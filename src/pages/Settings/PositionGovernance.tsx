import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Button, Chip, MenuItem, Paper, Tab, Tabs, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import { positionGovernanceApi, settingsApi } from '../../api';
import type { Position } from '../../types/position';
import type { EmployeePositionHistory, PositionGovernanceReadiness, PositionGovernanceReadinessStatus, PositionMappingBatch } from '../../types/positionGovernance';
import useDepartmentStore from '../../store/useDepartmentStore';
import TablePagination from '../../shared/components/TablePagination';
import useAppFeedback from '../../shared/hooks/useAppFeedback';

const matchLabels: Record<string, string> = {
  UNIQUE_MATCH: '唯一匹配', MULTIPLE_MATCHES: '多个候选', DEPARTMENT_CONFLICT: '部门冲突', NO_MATCH: '未匹配',
};
const readinessLabels: Record<PositionGovernanceReadinessStatus, string> = {
  BOUND_VALID: '已正式绑定',
  INVALID_BINDING: '无效绑定',
  UNIQUE_MATCH: '唯一匹配',
  MULTIPLE_MATCHES: '多个候选',
  DEPARTMENT_CONFLICT: '部门冲突',
  NO_MATCH: '未匹配',
};
const changeLabels: Record<string, string> = {
  MIGRATION_BIND: '历史回填', POSITION_CHANGE: '调岗', DEPARTMENT_CHANGE: '转部门', POSITION_AND_DEPARTMENT_CHANGE: '调岗并转部门',
};

const PositionGovernance: React.FC = () => {
  const { items: departments, fetchItems: fetchDepartments } = useDepartmentStore();
  const [tab, setTab] = useState(0);
  const [positions, setPositions] = useState<Position[]>([]);
  const [readiness, setReadiness] = useState<PositionGovernanceReadiness | null>(null);
  const [readinessStatus, setReadinessStatus] = useState<PositionGovernanceReadinessStatus | ''>('');
  const [readinessWarning, setReadinessWarning] = useState<'' | 'ROLE_POSITION_SUSPECTED'>('');
  const [readinessPage, setReadinessPage] = useState(0);
  const [readinessRowsPerPage, setReadinessRowsPerPage] = useState(10);
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
  const readinessRequestId = useRef(0);
  const { alert, confirm, dialog } = useAppFeedback();

  useEffect(() => {
    fetchDepartments();
    settingsApi.fetchPositions().then((response) => {
      if (response.code === 0) setPositions(response.data);
    });
  }, [fetchDepartments]);

  const loadReadiness = async (pageIndex = readinessPage) => {
    const requestId = ++readinessRequestId.current;
    setLoading(true);
    const response = await positionGovernanceApi.getReadiness({
      departmentId: departmentId || undefined,
      search: search.trim() || undefined,
      employmentStatus: 'active',
      status: readinessStatus || undefined,
      warning: readinessWarning || undefined,
      page: pageIndex + 1,
      pageSize: readinessRowsPerPage,
    });
    if (requestId !== readinessRequestId.current) return;
    setLoading(false);
    if (response.code !== 0) {
      await alert(response.message || '加载岗位治理盘点失败', '加载失败');
      return;
    }
    setReadiness(response.data);
  };

  useEffect(() => {
    if (tab === 0) loadReadiness();
  }, [tab, readinessPage, readinessRowsPerPage, readinessStatus, readinessWarning]);

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
    if (tab === 2) loadHistory();
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
    const selectedItems = batch.items.filter((item) => item.applyStatus !== 'APPLIED' && selections[item.employeeId]);
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
        <Tab label="治理盘点" /><Tab label="映射预览与回填" /><Tab label="岗位变更记录" />
      </Tabs>

      {tab === 0 && <>
        <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid #e5e7eb' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 190px 190px 190px auto' }, gap: 1.5 }}>
            <TextField size="small" placeholder="搜索员工、角色或原岗位" value={search} onChange={(event) => setSearch(event.target.value)} InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: '#94a3b8' }} /> }} />
            <TextField select size="small" label="部门" value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setReadinessPage(0); }}><MenuItem value="">全部部门</MenuItem>{departments.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField>
            <TextField select size="small" label="治理状态" value={readinessStatus} onChange={(event) => { setReadinessStatus(event.target.value as PositionGovernanceReadinessStatus | ''); setReadinessPage(0); }}><MenuItem value="">全部状态</MenuItem>{Object.entries(readinessLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
            <TextField select size="small" label="风险标记" value={readinessWarning} onChange={(event) => { setReadinessWarning(event.target.value as '' | 'ROLE_POSITION_SUSPECTED'); setReadinessPage(0); }}><MenuItem value="">全部标记</MenuItem><MenuItem value="ROLE_POSITION_SUSPECTED">角色岗位疑似混用</MenuItem></TextField>
            <Button variant="contained" disabled={loading} onClick={() => { if (readinessPage === 0) loadReadiness(0); else setReadinessPage(0); }}>查询盘点</Button>
          </Box>
        </Paper>
        {readiness && <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          <Chip label={`共 ${readiness.summary.total} 人`} />
          <Chip color="success" label={`已绑定 ${readiness.summary.boundValid}`} />
          <Chip color="info" label={`可唯一匹配 ${readiness.summary.uniqueMatch}`} />
          <Chip color="error" label={`无效绑定 ${readiness.summary.invalidBinding}`} />
          <Chip color="warning" label={`需人工治理 ${readiness.summary.multipleMatches + readiness.summary.departmentConflict + readiness.summary.noMatch}`} />
          <Chip color="warning" variant="outlined" label={`角色/岗位疑似混用 ${readiness.summary.rolePositionSuspected}`} />
        </Box>}
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', overflowX: 'auto' }}>
          <Table sx={{ minWidth: 1200 }}><TableHead><TableRow><TableCell>员工</TableCell><TableCell>在职状态</TableCell><TableCell>部门</TableCell><TableCell>角色</TableCell><TableCell>原岗位</TableCell><TableCell>正式岗位</TableCell><TableCell>建议岗位</TableCell><TableCell>盘点结果</TableCell><TableCell>风险说明</TableCell></TableRow></TableHead>
            <TableBody>{(readiness?.items || []).map((item) => <TableRow key={item.employeeId} hover><TableCell sx={{ fontWeight: 600 }}>{item.employeeName}</TableCell><TableCell>{item.employmentStatus === 'active' ? '在职' : item.employmentStatus}</TableCell><TableCell>{item.departmentName || '-'}</TableCell><TableCell>{item.roleName || '-'}</TableCell><TableCell>{item.originalPositionName || '-'}</TableCell><TableCell>{item.boundPositionName || '-'}</TableCell><TableCell>{item.suggestedPositionId ? positions.find((position) => position.id === item.suggestedPositionId)?.name || '-' : '-'}</TableCell><TableCell><Chip size="small" label={readinessLabels[item.status]} color={item.status === 'BOUND_VALID' ? 'success' : item.status === 'UNIQUE_MATCH' ? 'info' : item.status === 'INVALID_BINDING' ? 'error' : 'warning'} /></TableCell><TableCell>{item.reason}{item.warnings.includes('ROLE_POSITION_SUSPECTED') ? '；角色与岗位名称重合' : ''}</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
        <TablePagination count={readiness?.total || 0} page={readinessPage} rowsPerPage={readinessRowsPerPage} onPageChange={(_event, page) => setReadinessPage(page)} onRowsPerPageChange={(event) => { setReadinessRowsPerPage(Number(event.target.value)); setReadinessPage(0); }} sx={{ mt: 2 }} />
      </>}

      {tab === 1 && <>
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
            <TableBody>{paginatedPreview.map((item) => <TableRow key={item.id} hover><TableCell sx={{ fontWeight: 600 }}>{item.employeeName}</TableCell><TableCell>{item.departmentName || '-'}</TableCell><TableCell>{item.originalPositionName || '-'}</TableCell><TableCell><Chip size="small" label={matchLabels[item.matchStatus]} color={item.matchStatus === 'UNIQUE_MATCH' ? 'success' : 'warning'} /></TableCell><TableCell><TextField select size="small" fullWidth value={selections[item.employeeId] || ''} disabled={item.applyStatus === 'APPLIED'} onChange={(event) => setSelections((current) => ({ ...current, [item.employeeId]: event.target.value }))}><MenuItem value="">待选择</MenuItem>{availablePositions(item).map((position) => <MenuItem key={position.id} value={position.id}>{position.name}</MenuItem>)}</TextField></TableCell><TableCell>{item.applyStatus === 'APPLIED' ? '已回填' : '待处理'}</TableCell></TableRow>)}</TableBody>
          </Table>
        </TableContainer>
        <TablePagination count={previewItems.length} page={previewPage} rowsPerPage={previewRowsPerPage} onPageChange={(_event, page) => setPreviewPage(page)} onRowsPerPageChange={(event) => { setPreviewRowsPerPage(Number(event.target.value)); setPreviewPage(0); }} sx={{ mt: 2 }} />
      </>}

      {tab === 2 && <>
        <TextField select size="small" label="变更类型" value={historyType} onChange={(event) => { setHistoryType(event.target.value); setHistoryPage(0); }} sx={{ width: 220, mb: 2 }}><MenuItem value="">全部类型</MenuItem>{Object.entries(changeLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</TextField>
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', overflowX: 'auto' }}><Table sx={{ minWidth: 1000 }}><TableHead><TableRow><TableCell>员工</TableCell><TableCell>类型</TableCell><TableCell>原部门/岗位</TableCell><TableCell>新部门/岗位</TableCell><TableCell>原因</TableCell><TableCell>操作人</TableCell><TableCell>变更时间</TableCell></TableRow></TableHead><TableBody>{history.map((row) => <TableRow key={row.id} hover><TableCell sx={{ fontWeight: 600 }}>{row.employeeName}</TableCell><TableCell>{changeLabels[row.changeType] || row.changeType}</TableCell><TableCell>{row.oldDepartmentName || '-'} / {row.oldPositionName || '-'}</TableCell><TableCell>{row.newDepartmentName || '-'} / {row.newPositionName || '-'}</TableCell><TableCell>{row.reason || '-'}</TableCell><TableCell>{row.changedByName}</TableCell><TableCell>{new Date(row.changedAt).toLocaleString('zh-CN')}</TableCell></TableRow>)}</TableBody></Table></TableContainer>
        <TablePagination count={historyTotal} page={historyPage} rowsPerPage={historyRowsPerPage} onPageChange={(_event, page) => setHistoryPage(page)} onRowsPerPageChange={(event) => { setHistoryRowsPerPage(Number(event.target.value)); setHistoryPage(0); }} sx={{ mt: 2 }} />
      </>}
      {dialog}
    </Box>
  );
};

export default PositionGovernance;
