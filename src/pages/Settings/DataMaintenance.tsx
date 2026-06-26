import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncIcon from '@mui/icons-material/Sync';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import { STORAGE_KEYS } from '../../shared/utils/constants';
import {
  BUSINESS_DATA_STORAGE_KEYS,
  clearBusinessTestData,
  CONTRACT_KEY_PREFIX,
  resyncLocalCacheFromBackend,
} from '../../api/dataMaintenanceApi';

const readArrayCount = (key: string): number => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
};

const readFinanceCount = (): number => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FINANCE);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { dailyRecords?: unknown[]; channelROI?: unknown[] };
    return (parsed.dailyRecords?.length || 0) + (parsed.channelROI?.length || 0);
  } catch {
    return 0;
  }
};

const readContractCacheCount = (): number => {
  try {
    let count = 0;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(CONTRACT_KEY_PREFIX)) count += 1;
    }
    return count;
  } catch {
    return 0;
  }
};

const DataMaintenance: React.FC = () => {
  const { alert, confirm, dialog } = useAppFeedback();
  const [refreshToken, setRefreshToken] = useState(0);
  const [resyncing, setResyncing] = useState(false);

  const rows = useMemo(() => (
    BUSINESS_DATA_STORAGE_KEYS.map((item) => ({
      ...item,
      count: readArrayCount(item.key),
    }))
  ), [refreshToken]);

  const financeCount = useMemo(() => readFinanceCount(), [refreshToken]);
  const contractCacheCount = useMemo(() => readContractCacheCount(), [refreshToken]);
  const totalCount = rows.reduce((sum, item) => sum + item.count, 0) + financeCount + contractCacheCount;

  const handleRefresh = () => setRefreshToken((value) => value + 1);

  const handleResyncLocalCache = async () => {
    const confirmed = await confirm(
      '这只会清理当前电脑浏览器里的本机业务缓存，并从服务器重新加载数据，不会删除 MySQL 数据，也不会影响其他设备。\n\n如果刚刚录入了数据，请确认页面已经保存成功后再继续。',
      '重新同步本机缓存',
    );
    if (!confirmed) return;

    setResyncing(true);
    const result = await resyncLocalCacheFromBackend();
    setResyncing(false);
    handleRefresh();

    if (result.code === 0) {
      await alert('本机缓存已从服务器重新同步。请刷新当前业务页面，或重新进入线索、客户、订单等页面查看最新数据。', '同步完成');
      return;
    }
    await alert(result.message || '重新同步失败，请稍后重试。', '同步失败');
  };

  const handleClear = async () => {
    const confirmed = await confirm(
      '将清空线索、客户、订单、订单申请、交付、退款、提成、升单、入库记录等业务测试数据。\n\n不会清空登录账号、员工、部门、角色权限、产品配置、客户等级、订单类型、生命周期状态、线索来源、列表视图设置。\n\n清空时会自动修复组织基础配置，确保员工&部门、角色权限使用同一套数据口径。',
      '清空业务测试数据',
    );
    if (!confirmed) return;

    const result = clearBusinessTestData();
    handleRefresh();
    if (result.code === 0) {
      await alert('业务测试数据已清空，组织基础配置已校验修复。请回到线索、客户、订单页面刷新后开始真实案例流程测试。', '清空完成');
      return;
    }
    await alert(result.message || '清空失败', '清空失败');
  };

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>数据维护</Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            用于处理当前电脑缓存、业务测试数据和系统维护任务。
          </Typography>
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleRefresh}>
            刷新统计
          </Button>
          <Button variant="outlined" startIcon={<SyncIcon />} onClick={handleResyncLocalCache} disabled={resyncing}>
            {resyncing ? '同步中...' : '重新同步本机缓存'}
          </Button>
          <Button variant="contained" color="error" startIcon={<DeleteSweepIcon />} onClick={handleClear}>
            清空业务测试数据
          </Button>
        </Stack>
      </Stack>

      <Alert severity="info" sx={{ mb: 2 }}>
        重新同步本机缓存只会刷新当前浏览器里的本地数据副本，不会删除服务器 MySQL 数据。
      </Alert>

      <Alert severity="warning" sx={{ mb: 2 }}>
        清空业务测试数据只适合当前测试环境，会清理业务数据；正式生产环境请谨慎使用。
      </Alert>

      <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', mb: 2, p: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Typography variant="body2" sx={{ color: '#64748b' }}>当前可清理数据：</Typography>
          <Chip label={`${totalCount} 条/项`} size="small" color={totalCount > 0 ? 'warning' : 'success'} />
          <Chip label={`财务模拟数据 ${financeCount}`} size="small" variant="outlined" />
          <Chip label={`客户合同缓存 ${contractCacheCount}`} size="small" variant="outlined" />
        </Stack>
      </Paper>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>数据模块</TableCell>
              <TableCell>说明</TableCell>
              <TableCell align="right">当前数量</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key} hover>
                <TableCell sx={{ fontWeight: 500 }}>{row.label}</TableCell>
                <TableCell sx={{ color: '#64748b' }}>{row.description}</TableCell>
                <TableCell align="right">
                  <Chip label={row.count} size="small" color={row.count > 0 ? 'warning' : 'default'} variant={row.count > 0 ? 'filled' : 'outlined'} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {dialog}
    </Box>
  );
};

export default DataMaintenance;
