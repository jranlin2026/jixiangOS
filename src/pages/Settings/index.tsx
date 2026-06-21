import React, { useEffect, useMemo, useState } from 'react';
import { Box, Paper, Tab, Tabs, Typography } from '@mui/material';
import RolePermission from './RolePermission';
import ProductConfigPage from './ProductConfig';
import EmployeeDepartmentManagement from './EmployeeDepartmentManagement';
import CustomerLevelConfigPage from './CustomerLevelConfig';
import OrderTypeConfigPage from './OrderTypeConfig';
import LifecycleStatusConfigPage from './LifecycleStatusConfig';
import LeadSourceConfigPage from './LeadSourceConfig';
import DataMaintenance from './DataMaintenance';
import LeadFlowConfigTab from '../Leads/LeadFlowConfigTab';
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
    { label: '员工&部门', permissionKey: PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS, component: <EmployeeDepartmentManagement /> },
    { label: '角色权限', permissionKey: PERMISSION_KEYS.SETTINGS_ROLES, component: <RolePermission /> },
    { label: '产品配置', permissionKey: PERMISSION_KEYS.SETTINGS_PRODUCTS, component: <ProductConfigPage /> },
    { label: '客户等级', permissionKey: PERMISSION_KEYS.SETTINGS, component: <CustomerLevelConfigPage /> },
    { label: '订单类型', permissionKey: PERMISSION_KEYS.SETTINGS_ORDER_TYPES, component: <OrderTypeConfigPage /> },
    { label: '生命周期状态', permissionKey: PERMISSION_KEYS.SETTINGS_LIFECYCLE, component: <LifecycleStatusConfigPage /> },
    { label: '线索来源', permissionKey: PERMISSION_KEYS.SETTINGS_LEAD_SOURCES, component: <LeadSourceConfigPage /> },
    { label: '线索流转配置', permissionKey: PERMISSION_KEYS.LEADS_FLOW_CONFIG, component: <LeadFlowConfigTab /> },
    { label: '数据维护', permissionKey: PERMISSION_KEYS.SETTINGS, component: <DataMaintenance /> },
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
