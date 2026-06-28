import React, { useMemo, useState } from 'react';
import { Box, Button, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { Navigate, useSearchParams } from 'react-router-dom';
import RefundCenter from '../RefundCenter';
import RecoveryOrderTab from './RecoveryOrderTab';
import { ROUTES } from '../../shared/utils/constants';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import useAuthStore from '../../store/useAuthStore';

type AfterSalesTab = 'refund' | 'recovery';

const shell = {
  ink: '#0f172a',
  muted: '#64748b',
  line: '#dbe4ee',
};

const AFTER_SALES_TABS: Array<{ value: AfterSalesTab; label: string; permissionKeys: string[] }> = [
  { value: 'refund', label: '退款冲销', permissionKeys: [PERMISSION_KEYS.AFTER_SALES_REFUND, PERMISSION_KEYS.FINANCE_REFUND] },
  { value: 'recovery', label: '退款挽回单', permissionKeys: [PERMISSION_KEYS.AFTER_SALES_RECOVERY, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW] },
];

function getTab(value: string | null): AfterSalesTab {
  return value === 'recovery' ? 'recovery' : 'refund';
}

const AfterSales: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const [searchParams, setSearchParams] = useSearchParams();
  const [refundViewSettingsTrigger, setRefundViewSettingsTrigger] = useState(0);
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
      <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'flex-start' }} spacing={2} sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: shell.ink }}>
            售后服务
          </Typography>
          <Typography variant="body2" sx={{ color: shell.muted, mt: 0.5, maxWidth: 760 }}>
            处理退款挽回、退款冲销和第三方平台挽回提成单据。
          </Typography>
        </Box>
        {activeTab === 'refund' && (
          <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setRefundViewSettingsTrigger((value) => value + 1)}>
            视图设置
          </Button>
        )}
      </Stack>

      <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, bgcolor: '#fff', mb: 2, overflow: 'hidden' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 48,
            '& .MuiTab-root': { minHeight: 48, fontWeight: 700 },
          }}
        >
          {visibleTabs.map((tab) => (
            <Tab key={tab.value} value={tab.value} label={tab.label} />
          ))}
        </Tabs>
      </Paper>

      {activeTab === 'refund' && <RefundCenter embedded refundViewSettingsTrigger={refundViewSettingsTrigger} />}
      {activeTab === 'recovery' && <RecoveryOrderTab />}
    </Box>
  );
};

export default AfterSales;
