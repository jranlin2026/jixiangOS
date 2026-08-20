import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
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
  useMediaQuery,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import { enterpriseBrainApi, settingsApi } from '../../api';
import type { TaskTemplate } from '../../types/enterpriseBrain';
import type { Position } from '../../types/position';
import ProtectedFormDialog from '../../shared/components/ProtectedFormDialog';
import TablePagination from '../../shared/components/TablePagination';
import useAppFeedback from '../../shared/hooks/useAppFeedback';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
const emptyTemplate = () => ({
  positionId: '',
  name: '',
  description: '',
  targetValue: '',
  unit: '',
  dueTime: '18:00',
  evidenceRequired: false,
});

const TaskTemplates: React.FC = () => {
  const mobile = useMediaQuery(useTheme().breakpoints.down('md'));
  const { alert, dialog: feedbackDialog } = useAppFeedback();
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyTemplate());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const closeTemplateDialog = () => {
    setOpen(false);
    setForm(emptyTemplate());
  };

  const load = async () => {
    setLoading(true);
    setLoadError('');
    const [templateResult, positionResult] = await Promise.all([
      enterpriseBrainApi.listTemplates(),
      settingsApi.fetchPositions({ isActive: true }),
    ]);
    if (templateResult.code === 0) setTemplates(templateResult.data);
    if (positionResult.code === 0) setPositions(positionResult.data);
    const failed = [templateResult, positionResult].find((result) => result.code !== 0);
    if (failed) setLoadError(failed.message);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const positionById = useMemo(() => new Map(positions.map((position) => [position.id, position.name])), [positions]);
  const pageItems = useMemo(() => templates.slice(page * pageSize, (page + 1) * pageSize), [page, pageSize, templates]);

  const save = async () => {
    setSubmitting(true);
    const response = await enterpriseBrainApi.saveTemplate({
      ...form,
      targetValue: form.targetValue ? Number(form.targetValue) : undefined,
      weekdays: [1, 2, 3, 4, 5],
      isActive: true,
    });
    setSubmitting(false);
    if (response.code !== 0) {
      await alert(response.message, '保存失败');
      return;
    }
    setOpen(false);
    setForm(emptyTemplate());
    await alert('执行模板已保存，将按岗位生成工作日任务。', '保存成功');
    await load();
  };

  const generateToday = async () => {
    const response = await enterpriseBrainApi.generateTasks(today());
    await alert(
      response.code === 0
        ? `已生成 ${response.data.createdCount} 条，跳过 ${response.data.skippedCount} 条重复任务。`
        : response.message,
      response.code === 0 ? '今日任务已生成' : '生成失败',
    );
  };

  const templateSummary = (item: TaskTemplate) => (
    <>
      <Typography variant="body2" color="text.secondary">
        {positionById.get(item.positionId) || item.positionId}
      </Typography>
      <Typography variant="body2" sx={{ mt: 0.75 }}>
        目标 {item.targetValue ?? '—'} {item.unit || ''} · 截止 {item.dueTime || '未设置'} · {item.evidenceRequired ? '需证据' : '无需证据'}
      </Typography>
    </>
  );

  return (
    <Stack spacing={1.5}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}>
        <Box>
          <Typography sx={{ fontWeight: 900 }}>执行模板</Typography>
          <Typography variant="body2" color="text.secondary">
            在企业标准中定义岗位固定动作，生成后由员工在“我的工作台”执行。
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<PlayArrowOutlinedIcon />} onClick={() => void generateToday()}>生成今日任务</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setForm(emptyTemplate()); setOpen(true); }}>新建执行模板</Button>
        </Stack>
      </Stack>

      {loadError ? <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void load()}>重试</Button>}>{loadError}</Alert> : null}
      {!loading && templates.length === 0 ? <Alert severity="info">暂无执行模板。</Alert> : null}

      {mobile ? (
        <Stack spacing={1}>
          {pageItems.map((item) => (
            <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" gap={1}>
                <Typography sx={{ fontWeight: 900 }}>{item.name}</Typography>
                <Chip size="small" color={item.isActive ? 'success' : 'default'} label={item.isActive ? '启用' : '停用'} />
              </Stack>
              {templateSummary(item)}
            </Paper>
          ))}
        </Stack>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead><TableRow><TableCell>模板</TableCell><TableCell>岗位</TableCell><TableCell>目标</TableCell><TableCell>截止时间</TableCell><TableCell>证据</TableCell><TableCell>状态</TableCell></TableRow></TableHead>
            <TableBody>
              {pageItems.map((item) => (
                <TableRow hover key={item.id}>
                  <TableCell sx={{ fontWeight: 850 }}>{item.name}</TableCell>
                  <TableCell>{positionById.get(item.positionId) || item.positionId}</TableCell>
                  <TableCell>{item.targetValue ?? '—'} {item.unit || ''}</TableCell>
                  <TableCell>{item.dueTime || '未设置'}</TableCell>
                  <TableCell>{item.evidenceRequired ? '必须' : '选填'}</TableCell>
                  <TableCell><Chip size="small" color={item.isActive ? 'success' : 'default'} label={item.isActive ? '启用' : '停用'} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <TablePagination
        count={templates.length}
        page={page}
        rowsPerPage={pageSize}
        onPageChange={(_, nextPage) => setPage(nextPage)}
        onRowsPerPageChange={(event) => { setPage(0); setPageSize(Number(event.target.value)); }}
      />

      <ProtectedFormDialog open={open} onClose={closeTemplateDialog} submitting={submitting} resetKey={String(open)} fullWidth maxWidth="sm">
        {({ requestClose }) => (
          <>
            <DialogTitle>新建执行模板</DialogTitle>
            <DialogContent dividers>
              <Stack spacing={1.5}>
                <TextField select required label="岗位" value={form.positionId} onChange={(event) => setForm({ ...form, positionId: event.target.value })}>
                  {positions.map((position) => <MenuItem key={position.id} value={position.id}>{position.name}</MenuItem>)}
                </TextField>
                <TextField required label="任务名称" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                <TextField label="任务说明" multiline minRows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField fullWidth type="number" label="目标值（可空）" value={form.targetValue} onChange={(event) => setForm({ ...form, targetValue: event.target.value })} />
                  <TextField fullWidth label="单位" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
                  <TextField fullWidth type="time" label="截止时间" value={form.dueTime} onChange={(event) => setForm({ ...form, dueTime: event.target.value })} InputLabelProps={{ shrink: true }} />
                </Stack>
                <FormControlLabel control={<Switch checked={form.evidenceRequired} onChange={(event) => setForm({ ...form, evidenceRequired: event.target.checked })} />} label="完成时必须提交证据" />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button disabled={submitting} onClick={() => void requestClose()}>取消</Button>
              <Button variant="contained" disabled={submitting || !form.positionId || !form.name.trim()} onClick={() => void save()}>保存</Button>
            </DialogActions>
          </>
        )}
      </ProtectedFormDialog>
      {feedbackDialog}
    </Stack>
  );
};

export default TaskTemplates;
