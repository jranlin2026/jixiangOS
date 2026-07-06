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
import { settingsApi } from '../../api/settingsApi';
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
    label: '团队企业联系人',
    description: 'EC CRM 团队客户文件夹里的企业联系人 Excel',
    accept: '.xlsx,.xls',
  },
  {
    key: 'publicPool',
    label: '公海客户资料',
    description: 'EC CRM 公海客户 Excel',
    accept: '.xlsx,.xls',
  },
  {
    key: 'assignedLeads',
    label: '已分配商机',
    description: '汇营销入库成功/已分配商机 CSV',
    accept: '.csv',
  },
  {
    key: 'failedLeads',
    label: '入库失败商机',
    description: '汇营销入库失败商机 CSV，用于失败归档和重复判断',
    accept: '.csv',
  },
];

function createAccountFromName(name: string): string {
  const hash = Array.from(name)
    .map((char) => char.charCodeAt(0).toString(36))
    .join('')
    .slice(0, 14);
  return `ec_${hash || Date.now().toString(36)}`;
}

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
    const confirmed = await confirm(
      `将为 ${missing.length} 个 EC CRM 员工创建系统账号草稿，默认角色为“销售顾问”，默认密码为 Jixiang88。创建后可以到组织架构里调整部门、角色和手机号。`,
      '创建缺失员工账号',
    );
    if (!confirmed) return;

    setSyncing(true);
    let created = 0;
    let failed = 0;
    for (const name of missing) {
      const response = await settingsApi.createUser({
        name,
        account: createAccountFromName(name),
        email: '',
        phone: '',
        role: '销售顾问',
        positionName: '销售顾问',
        isActive: true,
        employmentStatus: 'active',
        password: 'Jixiang88',
      });
      if (response.code === 0 && response.data) created += 1;
      else failed += 1;
    }
    setSyncing(false);
    await alert(`员工账号创建完成：成功 ${created} 个，失败 ${failed} 个。`, '员工同步完成');
    await runPrecheck();
  };

  const importCustomersAndLeads = async () => {
    if (!result) return;
    const confirmed = await confirm(
      [
        `将导入团队客户、公海客户，并只把“客户库外”的已分配商机补充为线索。`,
        `入库失败商机会先作为失败归档口径，不进入正式线索池。`,
        `导入会按手机号/微信跳过重复数据。`,
      ].join('\n\n'),
      '确认导入客户和补充线索',
    );
    if (!confirmed) return;

    setImporting(true);
    const response = await crmMigrationApi.importFiles(files);
    setImporting(false);
    if (response.code !== 0 || !response.data) {
      await alert(response.message || '客户和线索导入失败，请检查文件后重试。', '导入失败');
      return;
    }
    await alert(
      [
        `团队客户导入：${response.data.customers.teamCreated} 个`,
        `公海客户导入：${response.data.customers.publicCreated} 个`,
        `客户重复跳过：${response.data.customers.skippedDuplicates} 个`,
        `补充线索导入：${response.data.leads.assignedCreated} 条`,
        `已在客户库的商机跳过：${response.data.leads.skippedExistingCustomers} 条`,
        `线索重复跳过：${response.data.leads.skippedDuplicates} 条`,
        `失败商机归档口径：${response.data.failedLeadsArchived} 条`,
      ].join('\n'),
      '导入完成',
    );
    await runPrecheck();
  };

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>EC CRM 迁移向导</Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            先预检老系统文件，自动整理员工、来源、标签和重复关系，再决定导入客户与线索。
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="outlined" startIcon={<MoveToInboxIcon />} onClick={importCustomersAndLeads} disabled={!result || importing || checking || syncing}>
            导入客户和补充线索
          </Button>
          <Button variant="contained" startIcon={<FactCheckIcon />} onClick={() => runPrecheck()} disabled={!canPrecheck}>
            开始预检
          </Button>
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mb: 2 }}>
        第一版不会直接把客户写入客户库。先把基础资料对齐，避免正式导入后还要手工修员工、来源和标签。
      </Alert>

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
              <StatCard label="已分配商机" value={result.leadStats.assignedLeads} hint={`${result.leadStats.assignedMissingInCustomers} 个客户库外手机号`} color="#0f766e" />
              <StatCard label="失败商机" value={result.leadStats.failedLeads} hint={`${result.leadStats.failedOnlyArchive} 条仅归档`} color="#b45309" />
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
