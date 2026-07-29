import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import SearchIcon from '@mui/icons-material/Search';
import { settingsApi } from '../../api';
import type { Position } from '../../types/position';
import useDepartmentStore from '../../store/useDepartmentStore';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import TablePagination from '../../shared/components/TablePagination';
import useAppFeedback from '../../shared/hooks/useAppFeedback';

type PositionForm = Omit<Position, 'id' | 'createdAt' | 'updatedAt'>;

const emptyForm: PositionForm = {
  name: '',
  code: '',
  departmentId: '',
  description: '',
  sortOrder: 100,
  isActive: true,
};

const PositionManagement: React.FC = () => {
  const { items: departments, fetchItems: fetchDepartments } = useDepartmentStore();
  const [positions, setPositions] = useState<Position[]>([]);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [form, setForm] = useState<PositionForm>(emptyForm);
  const { alert, confirm, dialog: feedbackDialog } = useAppFeedback();

  const loadPositions = async () => {
    const response = await settingsApi.fetchPositions();
    if (response.code === 0) setPositions(response.data);
  };

  useEffect(() => {
    fetchDepartments();
    loadPositions();
  }, [fetchDepartments]);

  const activeDepartments = departments.filter((item) => item.isActive);
  const departmentName = (id?: string) => departments.find((item) => item.id === id)?.name || '未归属';
  const filteredPositions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return positions.filter((position) => {
      if (departmentId && position.departmentId !== departmentId) return false;
      if (status === 'active' && !position.isActive) return false;
      if (status === 'inactive' && position.isActive) return false;
      if (!keyword) return true;
      return position.name.toLowerCase().includes(keyword)
        || position.code.toLowerCase().includes(keyword)
        || (position.description || '').toLowerCase().includes(keyword);
    }).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [departmentId, positions, search, status]);
  const paginatedPositions = filteredPositions.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  useEffect(() => setPage(0), [departmentId, rowsPerPage, search, status]);
  useEffect(() => {
    const maxPage = Math.max(Math.ceil(filteredPositions.length / rowsPerPage) - 1, 0);
    if (page > maxPage) setPage(maxPage);
  }, [filteredPositions.length, page, rowsPerPage]);

  const openForm = (position?: Position) => {
    setEditingPosition(position || null);
    setForm(position ? {
      name: position.name,
      code: position.code,
      departmentId: position.departmentId || '',
      description: position.description || '',
      sortOrder: position.sortOrder,
      isActive: position.isActive,
    } : { ...emptyForm, departmentId: departmentId || activeDepartments[0]?.id || '' });
    setFormOpen(true);
  };

  const updateForm = <K extends keyof PositionForm>(key: K, value: PositionForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const savePosition = async () => {
    const payload = {
      ...form,
      name: form.name.trim(),
      code: form.code.trim(),
      departmentId: form.departmentId,
      description: form.description?.trim() || undefined,
      sortOrder: Number(form.sortOrder),
    };
    if (!payload.name || !payload.code) {
      await alert('岗位名称和岗位编码不能为空', editingPosition ? '编辑岗位' : '新增岗位');
      return;
    }
    const response = editingPosition
      ? await settingsApi.updatePosition(editingPosition.id, payload)
      : await settingsApi.createPosition(payload);
    if (response.code !== 0) {
      await alert(response.message || '保存岗位失败', editingPosition ? '编辑岗位' : '新增岗位');
      return;
    }
    setFormOpen(false);
    await loadPositions();
  };

  const togglePosition = async (position: Position) => {
    const response = await settingsApi.updatePosition(position.id, { isActive: !position.isActive });
    if (response.code !== 0) await alert(response.message || '更新岗位状态失败', '岗位状态');
    await loadPositions();
  };

  const deletePosition = async (position: Position) => {
    if (!await confirm(`确认删除岗位“${position.name}”吗？已有员工使用的岗位不能删除。`, '删除岗位')) return;
    const response = await settingsApi.deletePosition(position.id);
    if (response.code !== 0) {
      await alert(response.message || '删除岗位失败', '删除失败');
      return;
    }
    await loadPositions();
  };

  const renderActions = (position: Position) => (
    <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
      <Switch size="small" checked={position.isActive} onChange={() => togglePosition(position)} inputProps={{ 'aria-label': `${position.name}启停` }} />
      <IconButton size="small" onClick={() => openForm(position)} aria-label={`编辑${position.name}`}><EditIcon fontSize="small" /></IconButton>
      <IconButton size="small" color="error" onClick={() => deletePosition(position)} aria-label={`删除${position.name}`}><DeleteIcon fontSize="small" /></IconButton>
    </Stack>
  );

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>岗位管理</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>岗位是员工、岗位标准和任务模板的稳定关联基础。</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => openForm()}>新增岗位</Button>
      </Box>

      <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid #e5e7eb' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 1fr) 220px 160px' }, gap: 1.5 }}>
          <TextField size="small" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索岗位名称、编码或说明" InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: '#94a3b8' }} /> }} />
          <TextField select size="small" label="所属部门" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <MenuItem value="">全部部门</MenuItem>
            {departments.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="状态" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <MenuItem value="all">全部状态</MenuItem>
            <MenuItem value="active">启用</MenuItem>
            <MenuItem value="inactive">停用</MenuItem>
          </TextField>
        </Box>
      </Paper>

      <TableContainer component={Paper} elevation={0} sx={{ display: { xs: 'none', md: 'block' }, border: '1px solid #e5e7eb' }}>
        <Table>
          <TableHead><TableRow><TableCell>岗位名称</TableCell><TableCell>岗位编码</TableCell><TableCell>所属部门</TableCell><TableCell>说明</TableCell><TableCell>排序</TableCell><TableCell>状态</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
          <TableBody>
            {paginatedPositions.map((position) => (
              <TableRow key={position.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{position.name}</TableCell><TableCell>{position.code}</TableCell><TableCell>{departmentName(position.departmentId)}</TableCell><TableCell>{position.description || '-'}</TableCell><TableCell>{position.sortOrder}</TableCell><TableCell><Chip size="small" label={position.isActive ? '启用' : '停用'} color={position.isActive ? 'success' : 'default'} /></TableCell><TableCell align="right">{renderActions(position)}</TableCell>
              </TableRow>
            ))}
            {!paginatedPositions.length && <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5, color: '#94a3b8' }}>暂无岗位数据</TableCell></TableRow>}
          </TableBody>
        </Table>
      </TableContainer>

      <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }}>
        {paginatedPositions.map((position) => (
          <Paper key={position.id} elevation={0} sx={{ p: 2, border: '1px solid #e5e7eb' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}><Typography sx={{ fontWeight: 700 }}>{position.name}</Typography><Chip size="small" label={position.isActive ? '启用' : '停用'} color={position.isActive ? 'success' : 'default'} /></Box>
            <Typography variant="body2" sx={{ color: '#64748b', mt: 1 }}>{position.code} · {departmentName(position.departmentId)}</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>{position.description || '暂无说明'}</Typography>
            <Box sx={{ mt: 1 }}>{renderActions(position)}</Box>
          </Paper>
        ))}
        {!paginatedPositions.length && <Paper elevation={0} sx={{ p: 4, textAlign: 'center', color: '#94a3b8', border: '1px solid #e5e7eb' }}>暂无岗位数据</Paper>}
      </Stack>

      <TablePagination count={filteredPositions.length} page={page} rowsPerPage={rowsPerPage} onPageChange={(_event, nextPage) => setPage(nextPage)} onRowsPerPageChange={(event) => setRowsPerPage(Number(event.target.value))} sx={{ mt: 2 }} />

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setFormOpen(false)}>{editingPosition ? '编辑岗位' : '新增岗位'}</DialogCloseTitle>
        <DialogContent><Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
          <TextField required label="岗位名称" value={form.name} onChange={(event) => updateForm('name', event.target.value)} />
          <TextField required label="岗位编码" value={form.code} onChange={(event) => updateForm('code', event.target.value)} helperText="编码保存后作为系统稳定标识" />
          <TextField select label="所属部门" value={form.departmentId || ''} onChange={(event) => updateForm('departmentId', event.target.value)}><MenuItem value="">未归属</MenuItem>{activeDepartments.map((item) => <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>)}</TextField>
          <TextField label="岗位说明" value={form.description || ''} onChange={(event) => updateForm('description', event.target.value)} multiline minRows={3} />
          <TextField type="number" label="排序" value={form.sortOrder} onChange={(event) => updateForm('sortOrder', Number(event.target.value))} />
          <FormControlLabel control={<Switch checked={form.isActive} onChange={(event) => updateForm('isActive', event.target.checked)} />} label={form.isActive ? '启用' : '停用'} />
        </Box></DialogContent>
        <DialogActions><Button onClick={() => setFormOpen(false)}>取消</Button><Button variant="contained" onClick={savePosition}>保存</Button></DialogActions>
      </Dialog>
      {feedbackDialog}
    </Box>
  );
};

export default PositionManagement;
