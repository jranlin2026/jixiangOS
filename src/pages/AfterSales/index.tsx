import React, { useMemo } from 'react';
import { Box, Stack, Tab, Tabs, Typography } from '@mui/material';
import { Navigate, useSearchParams } from 'react-router-dom';
import RefundCenter from '../RefundCenter';
import RecoveryOrderTab from './RecoveryOrderTab';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../shared/utils/permissions';
import useAuthStore from '../../store/useAuthStore';

type AfterSalesTab = 'order-refund' | 'recovery';

const shell = {
  ink: '#0f172a',
  muted: '#64748b',
  line: '#dbe4ee',
};

const AFTER_SALES_TABS: Array<{ value: AfterSalesTab; label: string; permissionKeys: string[] }> = [
  { value: 'order-refund', label: '订单退款', permissionKeys: [PERMISSION_KEYS.AFTER_SALES_REFUND, PERMISSION_KEYS.FINANCE_REFUND] },
  { value: 'recovery', label: '退款挽回单', permissionKeys: [PERMISSION_KEYS.AFTER_SALES_RECOVERY, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW] },
];

function getTab(value: string | null): AfterSalesTab {
  if (value === 'recovery') return 'recovery';
  return 'order-refund';
}

const AfterSales: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = getTab(searchParams.get('tab'));
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
      <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'flex-start' }} spacing={2} sx={{ mb: 2.5 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: shell.ink }}>
            售后服务
          </Typography>
          <Typography variant="body2" sx={{ color: shell.muted, mt: 0.5, maxWidth: 760 }}>
            处理正式订单退款和第三方平台退款挽回单，售后事实审核后再进入提成核算。
          </Typography>
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

      {activeTab === 'order-refund' && <RefundCenter embedded showInternalTabs={false} />}
      {activeTab === 'recovery' && <RecoveryOrderTab />}
    </Box>
  );
};

export default AfterSales;
