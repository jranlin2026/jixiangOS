import React, { useMemo } from 'react';
import { Paper, Tab, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { ModuleHeader, ModulePage, ModuleTabs, moduleTokens } from '../../shared/components/ModuleShell';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import KnowledgeCenter from './KnowledgeCenter';
import PublishingCenter from './PublishingCenter';

type EnablementTab = 'knowledge' | 'publishing';

const Enablement: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentUser = useAuthStore((state) => state.currentUser);
  const tabs = useMemo(() => {
    const visible: Array<{ value: EnablementTab; label: string }> = [];
    if (hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE)) {
      visible.push({ value: 'knowledge', label: '企业知识' });
    }
    if (
      hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_REVIEW)
      || hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_PUBLISH)
    ) {
      visible.push({ value: 'publishing', label: '发布管理' });
    }
    return visible;
  }, [currentUser]);

  const requested = searchParams.get('tab') === 'publishing' ? 'publishing' : 'knowledge';
  const activeTab = tabs.some((tab) => tab.value === requested) ? requested : tabs[0]?.value;

  if (!activeTab) {
    return (
      <ModulePage>
        <ModuleHeader title="赋能中台" description="查找公司最新知识，协同完成审核与发布。" />
        <Paper sx={{ p: 4, textAlign: 'center', color: moduleTokens.muted }}>
          <Typography variant="subtitle1">当前账号没有赋能中台权限</Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>请联系管理员开通企业知识、知识审核或发布管理权限。</Typography>
        </Paper>
      </ModulePage>
    );
  }

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
      {activeTab === 'knowledge' ? <KnowledgeCenter /> : <PublishingCenter />}
    </ModulePage>
  );
};

export default Enablement;
