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
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import { STORAGE_KEYS } from '../../shared/utils/constants';
import {
  BUSINESS_DATA_STORAGE_KEYS,
  clearBusinessTestData,
  CONTRACT_KEY_PREFIX,
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
    return Object.keys(localStorage).filter((key) => key.startsWith(CONTRACT_KEY_PREFIX)).length;
  } catch {
    return 0;
  }
};

const DataMaintenance: React.FC = () => {
  const { alert, confirm, dialog } = useAppFeedback();
  const [refreshToken, setRefreshToken] = useState(0);

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

  const handleClear = async () => {
    const confirmed = await confirm(
      '将清空线索、客户、订单、订单申请、交付、退款、提成、升单、入库记录等业务测试数据。\n\n不会清空登录账号、员工、部门、职位、角色权限、产品配置、客户等级、订单类型、生命周期状态、线索来源、列表视图设置。\n\n清空时会自动修复组织基础配置，确保员工&部门、职位管理、角色权限使用同一套数据口径。',
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
            用于清空本地开发环境的业务测试数据，方便重新跑真实案例流程。
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={handleRefresh}>
            刷新统计
          </Button>
          <Button variant="contained" color="error" startIcon={<DeleteSweepIcon />} onClick={handleClear}>
            清空业务测试数据
          </Button>
        </Stack>
      </Stack>

      <Alert severity="warning" sx={{ mb: 2 }}>
        这个操作只适合当前前端 mock/localStorage 测试环境。正式后端上线后，需要改为后端受控的数据维护接口。
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
