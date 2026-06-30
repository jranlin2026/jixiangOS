import React, { useMemo } from 'react';
import { Button, Tab } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { Navigate, useSearchParams } from 'react-router-dom';
import RecoveryOrderTab from './RecoveryOrderTab';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../shared/utils/permissions';
import useAuthStore from '../../store/useAuthStore';
import { ModuleHeader, ModulePage, ModuleTabs } from '../../shared/components/ModuleShell';

type AfterSalesTab = 'recovery-list' | 'recovery-review';

const AFTER_SALES_TABS: Array<{ value: AfterSalesTab; label: string; permissionKeys: string[] }> = [
  { value: 'recovery-list', label: '售后挽回订单列表', permissionKeys: [PERMISSION_KEYS.AFTER_SALES_RECOVERY, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE] },
  { value: 'recovery-review', label: '售后挽回订单审核台', permissionKeys: [PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW] },
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
  const canSeeAllAfterSalesTabs = isSuperAdmin(currentUser);
  const visibleTabs = useMemo(() => AFTER_SALES_TABS.filter((tab) => (
    canSeeAllAfterSalesTabs
    || tab.permissionKeys.some((permissionKey) => hasPermission(currentUser, permissionKey))
  )), [canSeeAllAfterSalesTabs, currentUser]);
  const activeTab = visibleTabs.some((tab) => tab.value === requestedTab)
    ? requestedTab
    : visibleTabs[0]?.value;

  if (!visibleTabs.length) return <Navigate to="/no-permission" replace />;

  const handleTabChange = (_event: React.SyntheticEvent, value: AfterSalesTab) => {
    setSearchParams({ tab: value });
  };

  return (
    <ModulePage>
      <ModuleHeader
        title="售后服务"
        description="售后只提交挽回事实，财务审核通过后再进入售后挽回分账。"
        actions={(
          <>
          <Button variant="outlined" startIcon={<ViewColumnIcon />} onClick={() => setViewSettingsSignal((value) => value + 1)}>
            视图设置
          </Button>
          {activeTab === 'recovery-list' && canCreate && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateSignal((value) => value + 1)}>
              新建售后挽回订单
            </Button>
          )}
          </>
        )}
      />

      <ModuleTabs
        value={activeTab}
        onChange={handleTabChange}
      >
        {visibleTabs.map((tab) => (
          <Tab key={tab.value} value={tab.value} label={tab.label} />
        ))}
      </ModuleTabs>

      {activeTab === 'recovery-list' && <RecoveryOrderTab mode="list" createSignal={createSignal} viewSettingsSignal={viewSettingsSignal} />}
      {activeTab === 'recovery-review' && <RecoveryOrderTab mode="review" viewSettingsSignal={viewSettingsSignal} />}
    </ModulePage>
  );
};

export default AfterSales;
