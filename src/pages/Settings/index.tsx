import React, { useEffect, useMemo, useState } from 'react';
import { Box, Paper, Tab, Tabs, Typography } from '@mui/material';
import UserManagement from './UserManagement';
import RolePermission from './RolePermission';
import ChannelConfigPage from './ChannelConfig';
import ProductConfigPage from './ProductConfig';
import DepartmentManagement from './DepartmentManagement';
import OrderTypeConfigPage from './OrderTypeConfig';
import LifecycleStatusConfigPage from './LifecycleStatusConfig';
import LeadSourceConfigPage from './LeadSourceConfig';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <Box sx={{ display: value === index ? 'block' : 'none', pt: 3 }}>
    {children}
  </Box>
);

const Settings: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const currentUser = useAuthStore((state) => state.currentUser);

  const tabs = useMemo(() => ([
    { label: '用户管理', permissionKey: PERMISSION_KEYS.SETTINGS_USERS, component: <UserManagement /> },
    { label: '角色权限', permissionKey: PERMISSION_KEYS.SETTINGS_ROLES, component: <RolePermission /> },
    { label: '部门管理', permissionKey: PERMISSION_KEYS.SETTINGS_DEPARTMENTS, component: <DepartmentManagement /> },
    { label: '渠道配置', permissionKey: PERMISSION_KEYS.SETTINGS_CHANNELS, component: <ChannelConfigPage /> },
    { label: '产品配置', permissionKey: PERMISSION_KEYS.SETTINGS_PRODUCTS, component: <ProductConfigPage /> },
    { label: '订单类型', permissionKey: PERMISSION_KEYS.SETTINGS_ORDER_TYPES, component: <OrderTypeConfigPage /> },
    { label: '生命周期状态', permissionKey: PERMISSION_KEYS.SETTINGS_LIFECYCLE, component: <LifecycleStatusConfigPage /> },
    { label: '线索来源', permissionKey: PERMISSION_KEYS.SETTINGS_LEAD_SOURCES, component: <LeadSourceConfigPage /> },
  ].filter((tab) => hasPermission(currentUser, tab.permissionKey))), [currentUser]);

  useEffect(() => {
    if (tabValue >= tabs.length) setTabValue(0);
  }, [tabValue, tabs.length]);

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
        系统设置
      </Typography>

      <Paper elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: 2 }}>
        <Tabs
          value={tabs.length ? tabValue : false}
          onChange={(_, value) => setTabValue(value)}
          sx={{ borderBottom: '1px solid #e5e7eb', px: 2 }}
          variant="scrollable"
          scrollButtons="auto"
        >
          {tabs.map((tab) => <Tab key={tab.label} label={tab.label} />)}
        </Tabs>

        <Box sx={{ p: 3 }}>
          {tabs.length === 0 ? (
            <Box sx={{ py: 6, textAlign: 'center', color: '#6b7280' }}>当前账号没有系统设置权限</Box>
          ) : (
            tabs.map((tab, index) => (
              <TabPanel key={tab.label} value={tabValue} index={index}>
                {tab.component}
              </TabPanel>
            ))
          )}
        </Box>
      </Paper>
    </Box>
  );
};

export default Settings;
