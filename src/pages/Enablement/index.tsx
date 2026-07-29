import React, { useMemo } from 'react';
import { Tab } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { ModuleHeader, ModulePage, ModuleTabs } from '../../shared/components/ModuleShell';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import KnowledgeCenter from './KnowledgeCenter';
import PublishingCenter from './PublishingCenter';
import EnablementHome from './EnablementHome';
import MyStandard from './MyStandard';
import PositionStandards from './PositionStandards';
import { setEnablementSearchParam } from './todayActionData';

type EnablementTab = 'my-standard' | 'standards' | 'knowledge' | 'publishing' | 'home';

const Enablement: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useAuthStore((state) => state.currentUser);
  const canReadKnowledge = hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE);
  const canManage = hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_REVIEW)
    || hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_PUBLISH)
    || hasPermission(currentUser, PERMISSION_KEYS.STANDARD_MAINTAIN);
  const canReadStandard = hasPermission(currentUser, PERMISSION_KEYS.STANDARD_READ);
  const tabs = useMemo<Array<{ value: EnablementTab; label: string }>>(() => [
    ...(canReadStandard ? [{ value: 'my-standard' as const, label: '我的岗位标准' }] : []),
    ...(hasPermission(currentUser, PERMISSION_KEYS.STANDARD_MAINTAIN) ? [{ value: 'standards' as const, label: '标准管理' }] : []),
    ...(canReadKnowledge ? [{ value: 'knowledge' as const, label: '企业知识' }] : []),
    ...(canManage ? [{ value: 'publishing' as const, label: '发布管理' }] : []),
    { value: 'home', label: '旧版行动台' },
  ], [canManage, canReadKnowledge, canReadStandard, currentUser]);

  const tabParam = searchParams.get('tab');
  const requested = (tabParam || (canReadStandard ? 'my-standard' : 'home')) as EnablementTab;
  const activeTab: EnablementTab = tabs.some((tab) => tab.value === requested) ? requested : tabs[0]?.value || 'home';

  return (
    <ModulePage sx={{ p: { xs: 2, md: 3 } }}>
      <ModuleHeader
        title="企业标准中心"
        description="岗位标准、SOP和企业知识在这里形成当前生效版本，并直接驱动员工任务与AI回答。"
      />
      <ModuleTabs
        value={activeTab}
        onChange={(_, value: EnablementTab) => setSearchParams(setEnablementSearchParam(searchParams, 'tab', value))}
        variant="scrollable"
        allowScrollButtonsMobile
        aria-label="企业标准中心视图"
      >
        {tabs.map((tab) => <Tab key={tab.value} value={tab.value} label={tab.label} />)}
      </ModuleTabs>
      {activeTab === 'my-standard' ? <MyStandard /> : activeTab === 'standards' ? <PositionStandards /> : activeTab === 'home' ? (
        <EnablementHome
          canManage={canManage}
          canOpenKnowledge={canReadKnowledge}
          onOpenKnowledge={() => setSearchParams(setEnablementSearchParam(searchParams, 'tab', 'knowledge'))}
        />
      ) : activeTab === 'knowledge' ? (
        <KnowledgeCenter />
      ) : (
        <PublishingCenter />
      )}
    </ModulePage>
  );
};

export default Enablement;
