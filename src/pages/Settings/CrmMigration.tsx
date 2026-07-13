import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import LabelIcon from '@mui/icons-material/Label';
import SourceIcon from '@mui/icons-material/Source';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import type { CrmMigrationFileKey, CrmMigrationFileMap, CrmMigrationPrecheckResult } from '../../api/crmMigrationApi';
import { crmMigrationApi } from '../../api/crmMigrationApi';
import useAppFeedback from '../../shared/hooks/useAppFeedback';

const FILE_SLOTS: Array<{ key: CrmMigrationFileKey; label: string; description: string; accept: string }> = [
  {
    key: 'teamCustomers',
    label: '团队客户资料',
    description: 'EC CRM 销售正在跟进的客户资料 Excel',
    accept: '.xlsx,.xls',
  },
  {
    key: 'teamContacts',
    label: '企业联系人',
    description: 'EC CRM 客户关联的企业联系人 Excel，只补充客户资料，不创建线索',
    accept: '.xlsx,.xls',
  },
  {
    key: 'publicPool',
    label: '公海客户资料',
    description: 'EC CRM 公海客户 Excel',
    accept: '.xlsx,.xls',
  },
];

const StatCard: React.FC<{ label: string; value: React.ReactNode; hint?: string; color?: string }> = ({ label, value, hint, color = '#2563eb' }) => (
  <Paper elevation={0} sx={{ border: '1px solid #dbe3ef', borderRadius: 2, p: 1.5, minWidth: 150 }}>
    <Typography variant="caption" sx={{ color: '#64748b' }}>{label}</Typography>
    <Typography variant="h6" sx={{ color, fontWeight: 700, lineHeight: 1.25 }}>{value}</Typography>
    {hint ? <Typography variant="caption" sx={{ color: '#94a3b8' }}>{hint}</Typography> : null}
  </Paper>
);

const NameList: React.FC<{ title: string; names: string[]; empty: string; color?: 'default' | 'primary' | 'warning' | 'success' }> = ({
  title,
  names,
  empty,
  color = 'default',
}) => (
  <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2, p: 1.5, minHeight: 120 }}>
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{title}</Typography>
      <Chip size="small" label={names.length} color={color} variant={color === 'default' ? 'outlined' : 'filled'} />
    </Stack>
    {names.length ? (
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {names.slice(0, 80).map((name) => <Chip key={name} size="small" label={name} variant="outlined" />)}
        {names.length > 80 ? <Chip size="small" label={`还有 ${names.length - 80} 项`} /> : null}
      </Stack>
    ) : (
      <Typography variant="body2" sx={{ color: '#94a3b8' }}>{empty}</Typography>
    )}
  </Paper>
);

const CrmMigration: React.FC = () => {
  const { alert, confirm, dialog } = useAppFeedback();
  const [files, setFiles] = useState<CrmMigrationFileMap>({});
  const [checking, setChecking] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<CrmMigrationPrecheckResult | null>(null);
  const [ownerBackfillBusy, setOwnerBackfillBusy] = useState(false);
  const fileInputs = useRef<Partial<Record<CrmMigrationFileKey, HTMLInputElement | null>>>({});

  const selectedCount = useMemo(() => Object.values(files).filter(Boolean).length, [files]);
  const canPrecheck = selectedCount > 0 && !checking;

  const runPrecheck = async (nextFiles: CrmMigrationFileMap = files) => {
    setChecking(true);
    const response = await crmMigrationApi.precheckFiles(nextFiles);
    setChecking(false);
    if (response.code !== 0 || !response.data) {
      await alert(response.message || 'EC CRM 文件预检失败，请检查文件格式。', '预检失败');
      return;
    }
    setResult(response.data);
  };

  const handlePickFile = (key: CrmMigrationFileKey, file: File | undefined) => {
    if (!file) return;
    const nextFiles = { ...files, [key]: file };
    setFiles(nextFiles);
  };

  const syncSources = async () => {
    if (!result?.sources.missing.length) return;
    setSyncing(true);
    const response = await crmMigrationApi.syncLeadSources(result.sources.missing);
    setSyncing(false);
    if (response.code !== 0) {
      await alert(response.message || '线索来源同步失败。', '同步失败');
      return;
    }
    await alert(`已补齐 ${response.data?.created || 0} 条来源配置。`, '来源同步完成');
    await runPrecheck();
  };

  const syncTags = async () => {
    if (!result?.tags.missing.length) return;
    setSyncing(true);
    const response = await crmMigrationApi.syncTags(result.tags.missing);
    setSyncing(false);
    if (response.code !== 0) {
      await alert(response.message || '客户标签同步失败。', '同步失败');
      return;
    }
    await alert(`已补齐 ${response.data?.created || 0} 个客户标签。`, '标签同步完成');
    await runPrecheck();
  };

  const createMissingEmployees = async () => {
    const missing = result?.employees.missing || [];
    if (!missing.length) return;
    await alert(
      `批量创建员工账号已暂停。请到“组织架构”逐个创建这 ${missing.length} 个员工，并为每人设置唯一初始密码。`,
      '安全限制',
    );
  };

  const importCustomers = async () => {
    if (!result) return;
    const confirmed = await confirm(
      [
        `将导入团队客户与公海客户；企业联系人只补充到对应客户资料，不创建线索。`,
        `导入会按手机号/微信跳过重复数据。`,
      ].join('\n\n'),
      '确认导入客户资料',
    );
    if (!confirmed) return;

    setImporting(true);
    const response = await crmMigrationApi.importFiles(files);
    setImporting(false);
    if (response.code !== 0 || !response.data) {
      await alert(response.message || '客户资料导入失败，请检查文件后重试。', '导入失败');
      return;
    }
    await alert(
      [
        `团队客户导入：${response.data.customers.teamCreated} 个`,
        `公海客户导入：${response.data.customers.publicCreated} 个`,
        `客户重复跳过：${response.data.customers.skippedDuplicates} 个`,
      ].join('\n'),
      '导入完成',
    );
    await runPrecheck();
  };

  const organizeHistoricalOwners = async () => {
    setOwnerBackfillBusy(true);
    const preview = await crmMigrationApi.previewCustomerOwnerBackfill();
    setOwnerBackfillBusy(false);
    if (preview.code !== 0 || !preview.data) return alert(preview.message || '历史客户归属预览失败', '整理失败');
    const summary = preview.data;
    if (!summary.totalLegacy) return alert('现有客户归属都已使用员工 ID，无需整理。', '检查完成');
    const confirmed = await confirm(
      `待整理 ${summary.totalLegacy} 条：可匹配 ${summary.resolved} 条，找不到员工 ${summary.unresolved} 条，重名待确认 ${summary.ambiguous} 条，公海 ${summary.publicPool} 条。\n\n找不到和重名的数据不会归给任何员工。是否继续？`,
      '整理历史客户归属',
    );
    if (!confirmed) return;
    setOwnerBackfillBusy(true);
    const applied = await crmMigrationApi.applyCustomerOwnerBackfill();
    setOwnerBackfillBusy(false);
    if (applied.code !== 0 || !applied.data) return alert(applied.message || '历史客户归属整理失败', '整理失败');
    await alert(`已整理 ${applied.data.updated} 条客户归属；其中 ${applied.data.unresolved + applied.data.ambiguous} 条需要管理员后续人工分配。`, '整理完成');
  };

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>EC CRM 迁移向导</Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            先预检三张客户资料表，自动整理员工、来源、标签和重复关系，再决定导入客户。
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="outlined" startIcon={<MoveToInboxIcon />} onClick={importCustomers} disabled={!result || importing || checking || syncing}>
            导入客户资料
          </Button>
          <Button variant="contained" startIcon={<FactCheckIcon />} onClick={() => runPrecheck()} disabled={!canPrecheck}>
            开始预检
          </Button>
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mb: 2 }}>
        新导入客户会按员工 ID 归属。历史客户可先做安全整理，找不到员工或存在重名时不会自动归人。
      </Alert>

      <Paper elevation={0} sx={{ border: '1px solid #dbe3ef', borderRadius: 2, p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between">
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>历史客户负责人整理</Typography>
            <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>把旧的姓名归属固化为员工 ID，避免今后出现同名员工时客户串到错误账号。</Typography>
          </Box>
          <Button variant="outlined" onClick={organizeHistoricalOwners} disabled={ownerBackfillBusy}>
            {ownerBackfillBusy ? '正在检查…' : '检查并整理'}
          </Button>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ border: '1px solid #dbe3ef', borderRadius: 2, p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} useFlexGap flexWrap="wrap">
          {FILE_SLOTS.map((slot) => (
            <Box key={slot.key} sx={{ flex: '1 1 220px', minWidth: 220, border: '1px solid #e5e7eb', borderRadius: 2, p: 1.5 }}>
              <Stack spacing={1}>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{slot.label}</Typography>
                <Typography variant="caption" sx={{ color: '#64748b', minHeight: 32 }}>{slot.description}</Typography>
                <Chip
                  size="small"
                  label={files[slot.key]?.name || '未选择文件'}
                  color={files[slot.key] ? 'success' : 'default'}
                  variant={files[slot.key] ? 'filled' : 'outlined'}
                  sx={{ justifyContent: 'flex-start', maxWidth: '100%' }}
                />
                <Button size="small" variant="outlined" startIcon={<CloudUploadIcon />} onClick={() => fileInputs.current[slot.key]?.click()}>
                  选择文件
                </Button>
                <input
                  ref={(node) => { fileInputs.current[slot.key] = node; }}
                  hidden
                  type="file"
                  accept={slot.accept}
                  onChange={(event) => handlePickFile(slot.key, event.target.files?.[0])}
                />
              </Stack>
            </Box>
          ))}
        </Stack>
      </Paper>

      {checking || syncing || importing ? <LinearProgress sx={{ mb: 2 }} /> : null}

      {result ? (
        <Stack spacing={2}>
          <Paper elevation={0} sx={{ border: '1px solid #dbe3ef', borderRadius: 2, p: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>迁移口径总览</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} useFlexGap flexWrap="wrap">
              <StatCard label="团队客户" value={result.customerStats.teamCustomers} hint={`${result.customerStats.uniqueTeamPhones} 个手机号`} />
              <StatCard label="公海客户" value={result.customerStats.publicPoolCustomers} hint={`${result.customerStats.uniquePublicPhones} 个手机号`} />
              <StatCard label="企业联系人" value={result.customerStats.teamContacts} />
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ border: '1px solid #dbe3ef', borderRadius: 2, p: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between" sx={{ mb: 1.5 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>基础资料预同步</Typography>
                <Typography variant="body2" sx={{ color: '#64748b' }}>把 EC CRM 里的员工、线索来源、客户标签先对齐到极享OS。</Typography>
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button variant="outlined" startIcon={<GroupAddIcon />} disabled={!result.employees.missing.length || syncing} onClick={createMissingEmployees}>
                  创建缺失员工
                </Button>
                <Button variant="outlined" startIcon={<SourceIcon />} disabled={!result.sources.missing.length || syncing} onClick={syncSources}>
                  同步缺失来源
                </Button>
                <Button variant="outlined" startIcon={<LabelIcon />} disabled={!result.tags.missing.length || syncing} onClick={syncTags}>
                  同步缺失标签
                </Button>
              </Stack>
            </Stack>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5}>
              <NameList title="员工已匹配" names={result.employees.matched} empty="暂无匹配员工" color="success" />
              <NameList title="员工待创建" names={result.employees.missing} empty="员工已全部匹配" color="warning" />
              <NameList title="系统/自动账号" names={result.employees.system} empty="没有识别到系统账号" />
            </Stack>
          </Paper>

          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
            <Box sx={{ flex: 1 }}>
              <NameList title="客户标签待补齐" names={result.tags.missing} empty="标签已全部匹配" color="warning" />
            </Box>
            <Box sx={{ flex: 1 }}>
              <NameList title="客户进展口径" names={result.customerProgresses} empty="未识别客户进展字段" color="primary" />
            </Box>
          </Stack>

          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #dbe3ef', borderRadius: 2 }}>
            <Box sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>线索来源映射</Typography>
              <Typography variant="body2" sx={{ color: '#64748b' }}>
                老系统来源会被拆成“一级来源 - 二级来源”。例如“直播部-抖音01”会进入直播部下面的抖音01。
              </Typography>
            </Box>
            <Divider />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>一级来源</TableCell>
                  <TableCell>二级来源</TableCell>
                  <TableCell>状态</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {result.sources.all.slice(0, 100).map((source) => {
                  const missing = result.sources.missing.some((item) => item.label === source.label);
                  return (
                    <TableRow key={source.label} hover>
                      <TableCell>{source.parentName}</TableCell>
                      <TableCell>{source.childName}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={missing ? '待同步' : '已匹配'}
                          color={missing ? 'warning' : 'success'}
                          variant={missing ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Paper elevation={0} sx={{ border: '1px solid #dbe3ef', borderRadius: 2, p: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>正式导入建议</Typography>
            <Stack spacing={1}>
              {Object.entries(result.importSuggestion).map(([key, value]) => (
                <Alert key={key} severity="success" icon={false}>{value}</Alert>
              ))}
            </Stack>
          </Paper>
        </Stack>
      ) : null}

      {dialog}
    </Box>
  );
};

export default CrmMigration;
