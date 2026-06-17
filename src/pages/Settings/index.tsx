import React, { useState } from 'react';
import { Box, Typography, Tabs, Tab, Paper } from '@mui/material';
import UserManagement from './UserManagement';
import RolePermission from './RolePermission';
import ChannelConfigPage from './ChannelConfig';
import ProductConfigPage from './ProductConfig';
import DepartmentManagement from './DepartmentManagement';
import OrderTypeConfigPage from './OrderTypeConfig';
import LifecycleStatusConfigPage from './LifecycleStatusConfig';
import LeadSourceConfigPage from './LeadSourceConfig';

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

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
        系统设置
      </Typography>

      <Paper elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: 2 }}>
        <Tabs
          value={tabValue}
          onChange={(_, value) => setTabValue(value)}
          sx={{ borderBottom: '1px solid #e5e7eb', px: 2 }}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab label="用户管理" />
          <Tab label="角色权限" />
          <Tab label="部门管理" />
          <Tab label="渠道配置" />
          <Tab label="产品配置" />
          <Tab label="订单类型" />
          <Tab label="生命周期状态" />
          <Tab label="线索来源" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          <TabPanel value={tabValue} index={0}>
            <UserManagement />
          </TabPanel>
          <TabPanel value={tabValue} index={1}>
            <RolePermission />
          </TabPanel>
          <TabPanel value={tabValue} index={2}>
            <DepartmentManagement />
          </TabPanel>
          <TabPanel value={tabValue} index={3}>
            <ChannelConfigPage />
          </TabPanel>
          <TabPanel value={tabValue} index={4}>
            <ProductConfigPage />
          </TabPanel>
          <TabPanel value={tabValue} index={5}>
            <OrderTypeConfigPage />
          </TabPanel>
          <TabPanel value={tabValue} index={6}>
            <LifecycleStatusConfigPage />
          </TabPanel>
          <TabPanel value={tabValue} index={7}>
            <LeadSourceConfigPage />
          </TabPanel>
        </Box>
      </Paper>
    </Box>
  );
};

export default Settings;
