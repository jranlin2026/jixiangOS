import React, { useMemo } from 'react';
import { Tab } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { ModuleHeader, ModulePage, ModuleTabs } from '../../shared/components/ModuleShell';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import KnowledgeCenter from './KnowledgeCenter';
import PublishingCenter from './PublishingCenter';
import EnablementHome from './EnablementHome';

type EnablementTab = 'home' | 'knowledge' | 'publishing';

const Enablement: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useAuthStore((state) => state.currentUser);
  const canReadKnowledge = hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE);
  const canManage = hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_REVIEW)
    || hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_PUBLISH);
  const tabs = useMemo<Array<{ value: EnablementTab; label: string }>>(() => [
    { value: 'home', label: '今日行动' },
    ...(canReadKnowledge ? [{ value: 'knowledge' as const, label: '企业知识' }] : []),
    ...(canManage ? [{ value: 'publishing' as const, label: '发布管理' }] : []),
  ], [canManage, canReadKnowledge]);

  const tabParam = searchParams.get('tab');
  const requested: EnablementTab = tabParam === 'knowledge' || tabParam === 'publishing' ? tabParam : 'home';
  const activeTab: EnablementTab = tabs.some((tab) => tab.value === requested) ? requested : 'home';

  return (
    <ModulePage sx={{ p: { xs: 2, md: 3 } }}>
      <ModuleHeader
        title="赋能中台"
        description="公司制度、业务方法和交付规范以当前生效版本为准；新内容按草稿、审核、发布流程留痕。"
      />
      <ModuleTabs
        value={activeTab}
        onChange={(_, value: EnablementTab) => setSearchParams({ tab: value })}
        variant="scrollable"
        allowScrollButtonsMobile
        aria-label="赋能中台视图"
      >
        {tabs.map((tab) => <Tab key={tab.value} value={tab.value} label={tab.label} />)}
      </ModuleTabs>
      {activeTab === 'home' ? (
        <EnablementHome
          canManage={canManage}
          canOpenKnowledge={canReadKnowledge}
          onOpenKnowledge={() => setSearchParams({ tab: 'knowledge' })}
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
