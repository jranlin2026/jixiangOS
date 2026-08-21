import React, { useMemo } from 'react';
import {
  Box, Button, Chip, LinearProgress, Paper, Stack, Typography,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import { useNavigate } from 'react-router-dom';
import type { BusinessCockpitData, CockpitRiskItem, HomeTaskItem } from '../../types/dashboard';
import type { EnterpriseCockpit } from '../../types/enterpriseBrain';
import { formatCurrency } from '../../shared/utils/formatters';
import { ROUTES } from '../../shared/utils/constants';
import { buildBossCommandItems } from './businessCockpitModel';

const colors = {
  ink: '#142033', muted: '#667085', line: '#D9E2EC', soft: '#F4F7FA',
  navy: '#10243E', blue: '#246BFE', red: '#C9362B', amber: '#B76E00', green: '#17845A',
};

const tone: Record<HomeTaskItem['tone'], { color: string; bg: string }> = {
  primary: { color: colors.blue, bg: '#EEF4FF' },
  warning: { color: colors.amber, bg: '#FFF6E5' },
  error: { color: colors.red, bg: '#FFF0EE' },
  success: { color: colors.green, bg: '#EAF8F1' },
  info: { color: '#0E7C86', bg: '#EAF8FA' },
};

const chainSteps = ['经营异常', '责任人', '客户 / 业务对象', '下一步动作', '结果验收'];

export const CustomerBattleBoard: React.FC<{ data: BusinessCockpitData; canViewCustomers: boolean }> = ({ data, canViewCustomers }) => {
  const navigate = useNavigate();
  const stageCounts = useMemo(() => {
    const counts = new Map<string, { label: string; count: number; amount: number }>();
    data.customerBattleStages.forEach((item) => {
      counts.set(item.stageCode, { label: item.stageLabel, count: item.customerCount, amount: item.opportunityAmount });
    });
    return [...counts.values()];
  }, [data.customerBattleStages]);
  const maxCount = Math.max(...stageCounts.map((item) => item.count), 1);
  return (
    <Stack spacing={2}>
      <Paper elevation={0} sx={{ border: `1px solid ${colors.line}`, borderRadius: 2, p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
          <Box><Typography variant="h6" sx={{ color: colors.ink, fontWeight: 900 }}>客户成交作战池</Typography><Typography variant="body2" sx={{ color: colors.muted }}>按阶段看客户卡点，按风险决定今天先推进谁</Typography></Box>
          <Button disabled={!canViewCustomers} endIcon={<ArrowForwardIcon />} onClick={() => canViewCustomers && navigate(ROUTES.CUSTOMERS)}>进入全部客户</Button>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', xl: `repeat(${Math.min(Math.max(stageCounts.length, 1), 6)}, minmax(0, 1fr))` }, gap: 1 }}>
          {stageCounts.map((item) => (
            <Box key={item.label} sx={{ borderLeft: `3px solid ${colors.blue}`, bgcolor: colors.soft, p: 1.4 }}>
              <Typography variant="caption" sx={{ color: colors.muted, fontWeight: 800 }}>{item.label}</Typography>
              <Typography variant="h6" sx={{ color: colors.ink, fontWeight: 900 }}>{item.count} 位</Typography>
              <Typography variant="caption" sx={{ color: colors.blue, fontWeight: 800 }}>{formatCurrency(item.amount)}</Typography>
              <LinearProgress variant="determinate" value={item.count / maxCount * 100} sx={{ mt: 1, height: 4, bgcolor: '#E4EAF1', '& .MuiLinearProgress-bar': { bgcolor: colors.blue } }} />
            </Box>
          ))}
          {!stageCounts.length && <Typography variant="body2" sx={{ color: colors.muted }}>暂无进入销售阶段的客户</Typography>}
        </Box>
      </Paper>
      <Paper elevation={0} sx={{ border: `1px solid ${colors.line}`, borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${colors.line}` }}><Typography sx={{ fontWeight: 900 }}>重点客户清单</Typography></Box>
        <Stack divider={<Box sx={{ borderTop: `1px solid ${colors.line}` }} />}>
          {data.customerBattles.map((item) => {
            const riskTone = item.riskLevel === 'high' ? tone.error : item.riskLevel === 'medium' ? tone.warning : tone.success;
            return <Box key={item.customerId} role={canViewCustomers ? 'button' : undefined} tabIndex={canViewCustomers ? 0 : undefined} onClick={() => canViewCustomers && navigate(`${ROUTES.CUSTOMERS}?customerId=${encodeURIComponent(item.customerId)}&detailTab=todo`)} onKeyDown={(event) => { if (canViewCustomers && event.key === 'Enter') navigate(`${ROUTES.CUSTOMERS}?customerId=${encodeURIComponent(item.customerId)}&detailTab=todo`); }} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.2fr .8fr .9fr 1.4fr auto' }, gap: 1.5, alignItems: 'center', px: 2, py: 1.35, cursor: canViewCustomers ? 'pointer' : 'default', '&:hover': canViewCustomers ? { bgcolor: '#F8FAFC' } : undefined, '&:focus-visible': { outline: `2px solid ${colors.blue}`, outlineOffset: -2 } }}>
              <Box><Typography variant="body2" sx={{ fontWeight: 900 }}>{item.customerName}</Typography><Typography variant="caption" sx={{ color: colors.muted }}>{item.company || '公司未填写'}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: colors.muted }}>销售阶段</Typography><Typography variant="body2" sx={{ fontWeight: 800 }}>{item.stageLabel}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: colors.muted }}>责任人</Typography><Typography variant="body2" sx={{ fontWeight: 800 }}>{item.ownerName}</Typography></Box>
              <Box><Typography variant="caption" sx={{ color: colors.muted }}>下一步</Typography><Typography variant="body2" sx={{ fontWeight: 800 }}>{item.nextActionTitle || '尚未设置动作'}</Typography></Box>
              <Chip size="small" label={item.riskReason} sx={{ color: riskTone.color, bgcolor: riskTone.bg, fontWeight: 800 }} />
            </Box>;
          })}
        </Stack>
      </Paper>
    </Stack>
  );
};

const BossCommandCenter: React.FC<{
  data: BusinessCockpitData;
  risks: CockpitRiskItem[];
  organizationData: EnterpriseCockpit | null;
  canViewCustomers: boolean;
  canViewTeamTasks: boolean;
  canAssignTasks: boolean;
  canOpenPath: (path: string) => boolean;
}> = ({ data, risks, organizationData, canViewCustomers, canViewTeamTasks, canAssignTasks, canOpenPath }) => {
  const navigate = useNavigate();
  const commands = useMemo(() => buildBossCommandItems(risks, data.customerBattles, 7), [data.customerBattles, risks]);
  const urgentCount = commands.filter((item) => item.tone === 'error').length;
  return (
    <Stack spacing={2}>
      <Paper elevation={0} sx={{ bgcolor: colors.navy, color: '#fff', borderRadius: 2, overflow: 'hidden', border: '1px solid #1D3B60' }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" spacing={2} sx={{ p: { xs: 2, md: 2.5 } }}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center"><BoltOutlinedIcon sx={{ color: '#79A7FF' }} /><Typography variant="overline" sx={{ color: '#9BBEFF', fontWeight: 900, letterSpacing: '.14em' }}>TODAY COMMAND</Typography></Stack>
            <Typography variant="h4" sx={{ fontWeight: 950, letterSpacing: '-.035em', mt: .5 }}>{urgentCount ? `今天有 ${urgentCount} 个紧急问题` : `今天有 ${commands.length} 项待推进`}</Typography>
            <Typography variant="body2" sx={{ color: '#B9C9DC', mt: .75 }}>每条指令必须落到责任人、业务对象、动作和验收结果。</Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button disabled={!canViewTeamTasks} variant="outlined" startIcon={<GroupsOutlinedIcon />} onClick={() => canViewTeamTasks && navigate(`${ROUTES.TASKS}?tab=team`)} sx={{ color: '#DCE8F8', borderColor: '#52739A' }}>团队任务</Button>
            <Button disabled={!canAssignTasks} variant="contained" startIcon={<AssignmentTurnedInOutlinedIcon />} onClick={() => canAssignTasks && navigate(ROUTES.TASKS)} sx={{ bgcolor: '#2C72F0' }}>下达与验收</Button>
          </Stack>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(5, 1fr)' }, borderTop: '1px solid rgba(255,255,255,.12)' }}>
          {chainSteps.map((step, index) => <Box key={step} sx={{ position: 'relative', px: 2, py: 1.25, borderRight: index < chainSteps.length - 1 ? '1px solid rgba(255,255,255,.1)' : 0 }}><Typography variant="caption" sx={{ color: '#7690AE', fontWeight: 900 }}>0{index + 1}</Typography><Typography variant="body2" sx={{ color: '#F5F8FC', fontWeight: 800 }}>{step}</Typography>{index < chainSteps.length - 1 && <ArrowForwardIcon sx={{ display: { xs: 'none', sm: 'block' }, position: 'absolute', right: -9, top: '50%', mt: '-9px', fontSize: 18, color: '#7690AE', zIndex: 1 }} />}</Box>)}
        </Box>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.65fr) minmax(310px, .75fr)' }, gap: 2 }}>
        <Paper elevation={0} sx={{ border: `1px solid ${colors.line}`, borderRadius: 2, overflow: 'hidden' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${colors.line}` }}><Box><Typography sx={{ fontWeight: 900 }}>老板指令队列</Typography><Typography variant="caption" sx={{ color: colors.muted }}>按客户风险和经营影响排序</Typography></Box><Chip size="small" label={`${commands.length} 条待推进`} sx={{ fontWeight: 800 }} /></Stack>
          <Stack divider={<Box sx={{ borderTop: `1px solid ${colors.line}` }} />}>
            {commands.map((item) => {
              const itemTone = tone[item.tone];
              const canOpen = canOpenPath(item.path);
              return <Box key={item.id} role={canOpen ? 'button' : undefined} tabIndex={canOpen ? 0 : undefined} onClick={() => canOpen && navigate(item.path)} onKeyDown={(event) => { if (canOpen && event.key === 'Enter') navigate(item.path); }} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.15fr .7fr 1fr .9fr auto' }, gap: 1.25, alignItems: 'center', px: 2, py: 1.35, cursor: canOpen ? 'pointer' : 'default', '&:hover': canOpen ? { bgcolor: '#F8FAFC' } : undefined, '&:focus-visible': { outline: `2px solid ${colors.blue}`, outlineOffset: -2 } }}>
                <Box><Typography variant="body2" sx={{ color: colors.ink, fontWeight: 900 }}>{item.title}</Typography><Typography variant="caption" sx={{ color: colors.muted }}>{item.target}</Typography></Box>
                <Box><Typography variant="caption" sx={{ color: colors.muted }}>责任人</Typography><Typography variant="body2" sx={{ fontWeight: 850 }}>{item.owner}</Typography></Box>
                <Box><Typography variant="caption" sx={{ color: colors.muted }}>下一步动作</Typography><Typography variant="body2" sx={{ fontWeight: 850 }}>{item.action}</Typography></Box>
                <Box><Typography variant="caption" sx={{ color: colors.muted }}>{item.verificationLabel}</Typography><Typography variant="body2" sx={{ fontWeight: 850 }}>{item.verification}</Typography></Box>
                <Chip size="small" label={item.tone === 'error' ? '立即处理' : item.tone === 'warning' ? '今日推进' : '持续跟进'} sx={{ color: itemTone.color, bgcolor: itemTone.bg, fontWeight: 850 }} />
              </Box>;
            })}
            {!commands.length && <Box sx={{ p: 5, textAlign: 'center' }}><Typography sx={{ color: colors.green, fontWeight: 900 }}>当前没有阻塞经营的事项</Typography></Box>}
          </Stack>
        </Paper>

        <Stack spacing={2}>
          <Paper elevation={0} sx={{ border: `1px solid ${colors.line}`, borderRadius: 2, p: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}><GroupsOutlinedIcon sx={{ color: colors.blue }} /><Box><Typography sx={{ fontWeight: 900 }}>销售队伍脉搏</Typography><Typography variant="caption" sx={{ color: colors.muted }}>本期正式订单实收</Typography></Box></Stack>
            <Stack spacing={1.25}>{data.salesRanking.slice(0, 5).map((item, index) => <Box key={item.userId}><Stack direction="row" justifyContent="space-between" alignItems="center"><Stack direction="row" spacing={1} alignItems="center"><Typography variant="caption" sx={{ color: index < 3 ? colors.blue : colors.muted, fontWeight: 900, width: 16 }}>{index + 1}</Typography><Box><Typography variant="body2" sx={{ fontWeight: 900 }}>{item.name}</Typography><Typography variant="caption" sx={{ color: colors.muted }}>{item.count} 单 · {item.department || '部门未标注'}</Typography></Box></Stack><Button disabled={!canViewCustomers || item.identityStatus !== 'resolved'} size="small" startIcon={<PersonSearchOutlinedIcon />} onClick={() => canViewCustomers && item.identityStatus === 'resolved' && navigate(`${ROUTES.CUSTOMERS}?ownerId=${encodeURIComponent(item.userId)}`)}>客户</Button></Stack><Typography variant="body2" sx={{ color: colors.blue, fontWeight: 900, ml: 3, mt: .35 }}>{formatCurrency(item.amount)}</Typography></Box>)}</Stack>
          </Paper>
          <Paper elevation={0} sx={{ border: `1px solid ${colors.line}`, borderRadius: 2, p: 2 }}>
            <Typography sx={{ fontWeight: 900 }}>执行验收</Typography>
            <Typography variant="caption" sx={{ color: colors.muted }}>组织任务不是“已安排”，而是“有结果”</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1.5 }}>
              <Box sx={{ bgcolor: colors.soft, p: 1.25 }}><Typography variant="caption" sx={{ color: colors.muted }}>任务完成率</Typography><Typography variant="h6" sx={{ fontWeight: 900 }}>{organizationData ? `${organizationData.execution.taskCompletionRate}%` : '加载中'}</Typography></Box>
              <Box sx={{ bgcolor: colors.soft, p: 1.25 }}><Typography variant="caption" sx={{ color: colors.muted }}>逾期任务</Typography><Typography variant="h6" sx={{ color: organizationData?.execution.overdueCount ? colors.red : colors.green, fontWeight: 900 }}>{organizationData?.execution.overdueCount ?? '-'}</Typography></Box>
              <Box sx={{ bgcolor: colors.soft, p: 1.25 }}><Typography variant="caption" sx={{ color: colors.muted }}>复盘提交率</Typography><Typography variant="h6" sx={{ fontWeight: 900 }}>{organizationData ? `${organizationData.execution.reviewRate}%` : '加载中'}</Typography></Box>
              <Box sx={{ bgcolor: colors.soft, p: 1.25 }}><Typography variant="caption" sx={{ color: colors.muted }}>风险目标</Typography><Typography variant="h6" sx={{ color: organizationData?.organization.okr.riskObjectiveCount ? colors.amber : colors.green, fontWeight: 900 }}>{organizationData?.organization.okr.riskObjectiveCount ?? '-'}</Typography></Box>
            </Box>
          </Paper>
        </Stack>
      </Box>
    </Stack>
  );
};

export default BossCommandCenter;
