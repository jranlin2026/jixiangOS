import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { moduleTokens } from '../../shared/components/ModuleShell';
import { TODAY_ACTION_DEMO, getEnablementHomePresentation } from './todayActionData';

type EnablementHomeProps = {
  canManage: boolean;
  canOpenKnowledge: boolean;
  onOpenKnowledge: () => void;
};

const focusSx = {
  '&:focus-visible': {
    outline: `3px solid ${moduleTokens.blue}`,
    outlineOffset: 2,
  },
};

const managementTone = {
  red: { color: moduleTokens.red, background: '#FFF1F1' },
  amber: { color: '#A05A00', background: '#FFF7E6' },
  blue: { color: moduleTokens.blue, background: '#EEF5FF' },
} as const;

const ManagementDemo: React.FC<{ onReturn: () => void }> = ({ onReturn }) => (
  <Paper sx={{ p: { xs: 2, md: 2.5 }, border: `1px solid ${moduleTokens.line}`, minWidth: 0 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.5}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" sx={{ color: moduleTokens.ink, fontWeight: 900 }}>管理视角</Typography>
        <Typography variant="body2" sx={{ color: moduleTokens.muted }}>共5项待办行动 · 演示数据</Typography>
      </Box>
      <Button variant="outlined" onClick={onReturn} sx={focusSx}>返回我的学习</Button>
    </Stack>
    <Stack spacing={1.25} sx={{ mt: 2 }}>
      {TODAY_ACTION_DEMO.managementItems.map((item) => {
        const tone = managementTone[item.tone];
        return (
          <Box
            key={item.id}
            sx={{ p: 1.75, borderRadius: 1.5, borderLeft: `4px solid ${tone.color}`, bgcolor: tone.background, minWidth: 0 }}
          >
            <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: moduleTokens.ink, fontWeight: 800 }}>{item.title}</Typography>
                <Typography variant="body2" sx={{ color: moduleTokens.muted }}>{item.meta}</Typography>
              </Box>
              <Typography variant="h5" sx={{ color: tone.color, fontWeight: 900 }}>{item.count}</Typography>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  </Paper>
);

const EnablementHome: React.FC<EnablementHomeProps> = ({ canManage, canOpenKnowledge, onOpenKnowledge }) => {
  const [view, setView] = useState<'learning' | 'management'>('learning');
  const [showCompletion, setShowCompletion] = useState(false);
  const [, setSearchParams] = useSearchParams();
  const presentation = getEnablementHomePresentation(canManage);
  const data = TODAY_ACTION_DEMO;
  const selectView = (next: 'learning' | 'management') => {
    setView(next);
    setSearchParams(next === 'learning' ? {} : { view: next });
  };

  return (
    <Stack spacing={2.5} sx={{ minWidth: 0 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={2}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" flexWrap="wrap" gap={1}>
            <Typography variant="body2" sx={{ color: moduleTokens.muted, fontWeight: 700 }}>{data.dateLabel} · 我的赋能工作台</Typography>
            <Chip label="演示数据" size="small" color="warning" variant="outlined" />
          </Stack>
          <Typography variant="h4" sx={{ mt: 0.5, color: moduleTokens.ink, fontWeight: 900, fontSize: { xs: 27, md: 34 } }}>
            早上好，今天继续成长
          </Typography>
        </Box>
        {presentation.showManagementSwitch ? (
          <ToggleButtonGroup
            exclusive
            value={view}
            onChange={(_, next: 'learning' | 'management' | null) => next && selectView(next)}
            size="small"
            aria-label="赋能视角"
            sx={{ alignSelf: { xs: 'flex-start', md: 'center' }, '& .MuiToggleButton-root': focusSx }}
          >
            <ToggleButton value="learning">我的学习</ToggleButton>
            <ToggleButton value="management">管理视角 · {presentation.managementCount}</ToggleButton>
          </ToggleButtonGroup>
        ) : null}
      </Stack>

      {view === 'management' ? <ManagementDemo onReturn={() => selectView('learning')} /> : (
        <>
          <Paper
            sx={{
              p: { xs: 2, md: 2.5 },
              color: '#fff',
              background: 'linear-gradient(135deg, #1457C8 0%, #347EEA 100%)',
              minWidth: 0,
            }}
          >
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} gap={2}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="overline" sx={{ fontWeight: 900, opacity: 0.85 }}>第{data.currentDay}天</Typography>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>{data.topic}</Typography>
                <Typography sx={{ mt: 1, opacity: 0.88 }}>{data.duration} · {data.nextStep}</Typography>
              </Box>
              <Button variant="contained" onClick={() => setShowCompletion((shown) => !shown)} sx={{ bgcolor: '#fff', color: moduleTokens.blue, fontWeight: 900, '&:hover': { bgcolor: '#F4F8FF' }, ...focusSx }}>
                继续今天的学习
              </Button>
            </Stack>
            {showCompletion ? <Alert severity="info" sx={{ mt: 2 }}>演示完成：正式学习记录将在后续接入。</Alert> : null}
          </Paper>

          <Paper sx={{ p: { xs: 2, md: 2.5 }, border: `1px solid ${moduleTokens.line}`, minWidth: 0 }}>
            <Typography variant="h6" sx={{ color: moduleTokens.ink, fontWeight: 900, mb: 1.5 }}>7天上岗地图</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))', lg: 'repeat(7, minmax(0, 1fr))' }, gap: 1 }}>
              {data.days.map((day) => {
                const colors = day.status === 'done'
                  ? { color: moduleTokens.green, bg: '#EFFAF3', border: '#9CD7B1' }
                  : day.status === 'current'
                    ? { color: moduleTokens.blue, bg: '#EEF5FF', border: '#8FB2F7' }
                    : { color: moduleTokens.muted, bg: '#F5F7F9', border: moduleTokens.line };
                return (
                  <Box key={day.day} sx={{ p: 1.25, minWidth: 0, borderRadius: 1.5, bgcolor: colors.bg, border: `1px solid ${colors.border}` }}>
                    <Typography variant="caption" sx={{ color: colors.color, fontWeight: 900 }}>第{day.day}天</Typography>
                    <Typography variant="body2" sx={{ color: moduleTokens.ink, fontWeight: 800, overflowWrap: 'anywhere' }}>{day.label}</Typography>
                  </Box>
                );
              })}
            </Box>
          </Paper>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.3fr) minmax(280px, .7fr)' }, gap: 2.5, minWidth: 0 }}>
            <Paper sx={{ p: { xs: 2, md: 2.5 }, border: `1px solid ${moduleTokens.line}`, minWidth: 0 }}>
              <Typography variant="h6" sx={{ color: moduleTokens.ink, fontWeight: 900, mb: 1.5 }}>今天的任务</Typography>
              <Stack spacing={1.25}>
                {data.tasks.map((task) => (
                  <Box key={task.id} sx={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr)', gap: 1.5, p: 1.5, border: `1px solid ${moduleTokens.softLine}`, borderRadius: 1.5, minWidth: 0 }}>
                    <Box sx={{ width: 40, height: 40, display: 'grid', placeItems: 'center', bgcolor: '#EEF5FF', color: moduleTokens.blue, borderRadius: 1.25, fontWeight: 900 }}>{task.marker}</Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ color: moduleTokens.ink, fontWeight: 800 }}>{task.title}</Typography>
                      <Typography variant="body2" sx={{ color: moduleTokens.muted }}>{task.meta}</Typography>
                    </Box>
                  </Box>
                ))}
              </Stack>
            </Paper>
            <Stack spacing={2.5} sx={{ minWidth: 0 }}>
              <Paper sx={{ p: { xs: 2, md: 2.5 }, bgcolor: '#17243B', color: '#fff', minWidth: 0 }}>
                <Typography variant="overline" sx={{ color: '#9EC5FF', fontWeight: 900 }}>AI导师</Typography>
                <Typography variant="h6" sx={{ mt: 0.5, fontWeight: 900 }}>销售与交付应该怎么交接？</Typography>
                <Typography variant="body2" sx={{ mt: 1, color: '#C6D2E4' }}>基于当前生效的公司知识找答案。</Typography>
                {canOpenKnowledge ? <Button variant="outlined" onClick={onOpenKnowledge} sx={{ mt: 2, color: '#fff', borderColor: '#8FB2F7', ...focusSx }}>查找企业知识</Button> : null}
              </Paper>
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  );
};

export default EnablementHome;
