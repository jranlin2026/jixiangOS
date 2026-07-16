import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Paper, Tab, Tabs, Typography } from '@mui/material';
import RolePermission from './RolePermission';
import ProductConfigPage from './ProductConfig';
import EmployeeDepartmentManagement from './EmployeeDepartmentManagement';
import AccountRecycleBin from './AccountRecycleBin';
import BusinessRecycleBin from './BusinessRecycleBin';
import CustomerLevelConfigPage from './CustomerLevelConfig';
import OrderTypeConfigPage from './OrderTypeConfig';
import LifecycleStatusConfigPage from './LifecycleStatusConfig';
import LeadSourceConfigPage from './LeadSourceConfig';
import CrmMigration from './CrmMigration';
import AIProviderConfig from './AIProviderConfig';
import LeadFlowConfigTab from '../Leads/LeadFlowConfigTab';
import CustomerTagConfig from './CustomerTagConfig';
import DeliveryAssignmentConfig from './DeliveryAssignmentConfig';
import AfterSalesSourceConfigPage from './AfterSalesSourceConfig';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import { isSuperAdminRoleName } from '../../shared/utils/roles';
import { ModuleHeader, ModulePage, ModuleTabs, moduleRadius, moduleTokens } from '../../shared/components/ModuleShell';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

type SettingsTabConfig = {
  label: string;
  permissionKey: string;
  permissionKeys?: string[];
  superAdminOnly?: boolean;
  component: React.ReactNode;
};

type SettingsGroupConfig = {
  key: string;
  label: string;
  description: string;
  tabs: SettingsTabConfig[];
};

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <Box sx={{ display: value === index ? 'block' : 'none', pt: 3 }}>
    {value === index ? children : null}
  </Box>
);

const Settings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedGroupKey = searchParams.get('group') || 'organization';
  const [tabValue, setTabValue] = useState(0);
  const currentUser = useAuthStore((state) => state.currentUser);

  const groups = useMemo<SettingsGroupConfig[]>(() => ([
    {
      key: 'organization',
      label: '组织架构',
      description: '员工账号、部门和角色权限',
      tabs: [
        {
          label: '员工&部门',
          permissionKey: PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS,
          component: <EmployeeDepartmentManagement />,
        },
        { label: '角色权限', permissionKey: PERMISSION_KEYS.SETTINGS_ROLES, component: <RolePermission /> },
        { label: '账号回收站', permissionKey: PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE, component: <AccountRecycleBin /> },
      ],
    },
    {
      key: 'product',
      label: '产品设置',
      description: '产品配置和订单类型配置',
      tabs: [
        { label: '产品配置', permissionKey: PERMISSION_KEYS.SETTINGS_PRODUCTS, component: <ProductConfigPage /> },
        { label: '订单类型', permissionKey: PERMISSION_KEYS.SETTINGS_ORDER_TYPES, component: <OrderTypeConfigPage /> },
      ],
    },
    {
      key: 'leadCustomer',
      label: '客户设置',
      description: '客户等级、生命周期、人工标签、线索来源和流转规则',
      tabs: [
        { label: '客户等级', permissionKey: PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS, component: <CustomerLevelConfigPage /> },
        { label: '客户生命周期', permissionKey: PERMISSION_KEYS.SETTINGS_LIFECYCLE, component: <LifecycleStatusConfigPage /> },
        { label: '客户标签', permissionKey: PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS, component: <CustomerTagConfig /> },
        { label: '线索来源', permissionKey: PERMISSION_KEYS.SETTINGS_LEAD_SOURCES, component: <LeadSourceConfigPage /> },
        { label: '线索流转', permissionKey: PERMISSION_KEYS.SETTINGS_LEAD_FLOW, component: <LeadFlowConfigTab /> },
      ],
    },
    {
      key: 'delivery',
      label: '交付设置',
      description: '客户成功自动分配规则',
      tabs: [
        { label: '客户成功分配', permissionKey: PERMISSION_KEYS.SETTINGS_DELIVERY_ASSIGNMENT, component: <DeliveryAssignmentConfig /> },
      ],
    },
    {
      key: 'afterSales',
      label: '售后设置',
      description: '售后挽回订单来源配置',
      tabs: [
        { label: '来源平台与店铺', permissionKey: PERMISSION_KEYS.SETTINGS_AFTER_SALES_SOURCES, component: <AfterSalesSourceConfigPage /> },
      ],
    },
    {
      key: 'maintenance',
      label: '系统维护',
      description: '测试数据和系统维护工具',
      tabs: [
        { label: 'AI大脑', permissionKey: PERMISSION_KEYS.SETTINGS_AI_CONFIG, component: <AIProviderConfig /> },
        { label: '业务回收站', permissionKey: PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE, superAdminOnly: true, component: <BusinessRecycleBin /> },
        { label: 'EC CRM迁移', permissionKey: PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE, component: <CrmMigration /> },
      ],
    },
  ]).map((group) => ({
    ...group,
    tabs: group.tabs.filter((tab: SettingsTabConfig) => {
      if (tab.superAdminOnly && !isSuperAdminRoleName(currentUser?.role)) return false;
      const permissionKeys = tab.permissionKeys || [tab.permissionKey];
      return permissionKeys.some((permissionKey: string) => hasPermission(currentUser, permissionKey));
    }),
  })).filter((group) => group.tabs.length > 0), [currentUser]);

  const activeGroup = groups.find((group) => group.key === requestedGroupKey) || groups[0];
  const tabs = activeGroup?.tabs || [];

  useEffect(() => {
    if (groups.length && !groups.some((group) => group.key === requestedGroupKey)) {
      setSearchParams({ group: groups[0].key }, { replace: true });
      setTabValue(0);
    }
  }, [groups, requestedGroupKey, setSearchParams]);

  useEffect(() => {
    setTabValue((current) => (current >= tabs.length ? 0 : current));
  }, [tabs.length]);

  useEffect(() => {
    setTabValue(0);
  }, [activeGroup?.key]);

  return (
    <ModulePage>
      <ModuleHeader
        title="系统设置"
        description="统一配置组织、产品、客户规则和系统维护项。"
      />

      <Paper elevation={0} sx={{ border: `1px solid ${moduleTokens.line}`, borderRadius: moduleRadius, overflow: 'hidden' }}>
        {groups.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center', color: '#6b7280' }}>当前账号没有系统设置权限</Box>
        ) : (
          <Box sx={{ minHeight: 640 }}>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ px: 3, pt: 2, pb: 1.5, borderBottom: `1px solid ${moduleTokens.softLine}` }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  {activeGroup?.label}
                </Typography>
                <ModuleTabs
                  value={tabs.length ? tabValue : false}
                  onChange={(_, value) => setTabValue(value)}
                  variant="scrollable"
                  scrollButtons="auto"
                  sx={{ mb: 0 }}
                >
                  {tabs.map((tab) => <Tab key={tab.label} label={tab.label} />)}
                </ModuleTabs>
              </Box>

              <Box sx={{ p: 3 }}>
                {tabs.map((tab, index) => (
                  <TabPanel key={tab.label} value={tabValue} index={index}>
                    {tab.component}
                  </TabPanel>
                ))}
              </Box>
            </Box>
          </Box>
        )}
      </Paper>
    </ModulePage>
  );
};

export default Settings;
