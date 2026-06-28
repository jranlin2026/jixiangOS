import React, { useMemo } from 'react';
import { Box, Button, Stack, Tab, Tabs, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { Navigate, useSearchParams } from 'react-router-dom';
import RecoveryOrderTab from './RecoveryOrderTab';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../shared/utils/permissions';
import useAuthStore from '../../store/useAuthStore';

type AfterSalesTab = 'recovery-list' | 'recovery-review';

const shell = {
  ink: '#0f172a',
  muted: '#64748b',
  line: '#dbe4ee',
};

const AFTER_SALES_TABS: Array<{ value: AfterSalesTab; label: string; permissionKeys: string[] }> = [
  { value: 'recovery-list', label: '售后挽回订单列表', permissionKeys: [PERMISSION_KEYS.AFTER_SALES_RECOVERY, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE] },
  { value: 'recovery-review', label: '售后挽回审核台', permissionKeys: [PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW] },
];

function getTab(value: string | null): AfterSalesTab {
  if (value === 'recovery-review' || value === 'review') return 'recovery-review';
  return 'recovery-list';
}

const AfterSales: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const [searchParams, setSearchParams] = useSearchParams();
  const [createSignal, setCreateSignal] = React.useState(0);
  const [viewSettingsSignal, setViewSettingsSignal] = React.useState(0);
  const requestedTab = getTab(searchParams.get('tab'));
  const canCreate = hasPermission(currentUser, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE);
  const canSeeAllAfterSalesTabs = isSuperAdmin(currentUser)
    || ['超级管理员', '系统管理员', '管理员', 'Super Admin'].includes(String(currentUser?.role || ''));
  const visibleTabs = useMemo(() => AFTER_SALES_TABS.filter((tab) => (
    canSeeAllAfterSalesTabs
    || hasPermission(currentUser, PERMISSION_KEYS.AFTER_SALES)
    ||
    tab.permissionKeys.some((permissionKey) => hasPermission(currentUser, permissionKey))
  )), [canSeeAllAfterSalesTabs, currentUser]);
  const activeTab = visibleTabs.some((tab) => tab.value === requestedTab)
    ? requestedTab
    : visibleTabs[0]?.value;

  if (!visibleTabs.length) return <Navigate to="/no-permission" replace />;

  const handleTabChange = (_event: React.SyntheticEvent, value: AfterSalesTab) => {
    setSearchParams({ tab: value });
  };

  return (
    <Box sx={{ p: 3, bgcolor: '#f5f7fb', minHeight: '100%' }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} spacing={2} sx={{ mb: 2.5 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: shell.ink }}>
            售后服务
          </Typography>
          <Typography variant="body2" sx={{ color: shell.muted, mt: 0.5, maxWidth: 760 }}>
            售后只提交挽回事实，财务审核通过后再进入售后挽回分账。
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, justifyContent: { xs: 'stretch', lg: 'flex-end' } }}>
          <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsSignal((value) => value + 1)}>
            视图设置
          </Button>
          {activeTab === 'recovery-list' && canCreate && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateSignal((value) => value + 1)}>
              新建售后挽回订单
            </Button>
          )}
        </Box>
      </Stack>

      <Tabs
        value={activeTab}
        onChange={handleTabChange}
        sx={{
          borderBottom: `1px solid ${shell.line}`,
          mb: 2,
          minHeight: 44,
          '& .MuiTab-root': { minHeight: 44, fontWeight: 700 },
        }}
      >
        {visibleTabs.map((tab) => (
          <Tab key={tab.value} value={tab.value} label={tab.label} />
        ))}
      </Tabs>

      {activeTab === 'recovery-list' && <RecoveryOrderTab mode="list" createSignal={createSignal} viewSettingsSignal={viewSettingsSignal} />}
      {activeTab === 'recovery-review' && <RecoveryOrderTab mode="review" viewSettingsSignal={viewSettingsSignal} />}
    </Box>
  );
};

export default AfterSales;
