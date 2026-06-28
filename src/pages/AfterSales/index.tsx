import React, { useMemo } from 'react';
import { Box, Stack, Tab, Tabs, Typography } from '@mui/material';
import { Navigate, useSearchParams } from 'react-router-dom';
import ServiceTicketTab from '../RefundCenter/ServiceTicketTab';
import RecoveryOrderTab from './RecoveryOrderTab';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import useAuthStore from '../../store/useAuthStore';

type AfterSalesTab = 'recovery' | 'tickets';

const shell = {
  ink: '#0f172a',
  muted: '#64748b',
  line: '#dbe4ee',
};

const AFTER_SALES_TABS: Array<{ value: AfterSalesTab; label: string; permissionKeys: string[] }> = [
  { value: 'recovery', label: '退款挽回', permissionKeys: [PERMISSION_KEYS.AFTER_SALES_RECOVERY, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW] },
  { value: 'tickets', label: '售后工单', permissionKeys: [PERMISSION_KEYS.AFTER_SALES_TICKETS, PERMISSION_KEYS.AFTER_SALES_REFUND, PERMISSION_KEYS.FINANCE_REFUND] },
];

function getTab(value: string | null): AfterSalesTab {
  if (value === 'tickets' || value === 'refund') return 'tickets';
  return 'recovery';
}

const AfterSales: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = getTab(searchParams.get('tab'));
  const visibleTabs = useMemo(() => AFTER_SALES_TABS.filter((tab) => (
    tab.permissionKeys.some((permissionKey) => hasPermission(currentUser, permissionKey))
  )), [currentUser]);
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
            处理第三方平台退款挽回和客户售后工单，售后事实通过审核后再进入提成核算。
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

      {activeTab === 'recovery' && <RecoveryOrderTab />}
      {activeTab === 'tickets' && <ServiceTicketTab />}
    </Box>
  );
};

export default AfterSales;
