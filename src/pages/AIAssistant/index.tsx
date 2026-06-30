import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  LinearProgress,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import DeleteIcon from '@mui/icons-material/Delete';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import AddIcon from '@mui/icons-material/Add';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InsightsIcon from '@mui/icons-material/Insights';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import BoltIcon from '@mui/icons-material/Bolt';
import useAIStore from '../../store/useAIStore';
import AIResultRenderer from './AIResultRenderer';
import type { AIAssistantTask, AIAssistantTone, AIQuerySession } from '../../types/ai';
import { moduleTokens } from '../../shared/components/ModuleShell';

const toneColors: Record<AIAssistantTone, string> = {
  primary: '#2563eb',
  success: '#16a34a',
  warning: '#f59e0b',
  error: '#dc2626',
  info: '#0891b2',
  neutral: '#6b7280',
};

const priorityColor: Record<AIAssistantTask['priority'], 'error' | 'warning' | 'default'> = {
  high: 'error',
  medium: 'warning',
  low: 'default',
};

const AIAssistant: React.FC = () => {
  const navigate = useNavigate();
  const {
    sessions,
    currentSession,
    workbench,
    loading,
    fetchWorkbench,
    fetchSessions,
    sendQuery,
    deleteSession,
    fetchSessionById,
  } = useAIStore();
  const [query, setQuery] = useState('');
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchWorkbench();
    fetchSessions();
  }, [fetchWorkbench, fetchSessions]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [currentSession?.messages.length, loading]);

  const activeTasks = useMemo(
    () => (workbench?.tasks || []).filter((task) => task.count > 0).slice(0, 5),
    [workbench],
  );

  const submitPrompt = async (prompt?: string) => {
    const text = (prompt ?? query).trim();
    if (!text || loading) return;
    const sessionId = currentSession?.id || null;
    await sendQuery(sessionId, text);
    setQuery('');
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitPrompt();
    }
  };

  const handleSelectSession = (session: AIQuerySession) => {
    fetchSessionById(session.id);
  };

  const handleNewChat = () => {
    useAIStore.setState({ currentSession: null });
    setQuery('');
  };

  const renderMetricGrid = () => (
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
      {workbench?.metrics.map((metric) => (
        <Paper key={metric.id} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2, p: 1.5 }}>
          <Typography variant="caption" sx={{ color: '#6b7280' }}>{metric.label}</Typography>
          <Typography variant="h6" sx={{ fontWeight: 800, color: toneColors[metric.tone], lineHeight: 1.3 }}>{metric.value}</Typography>
          {metric.subValue && (
            <Typography variant="caption" sx={{ color: '#9ca3af' }}>{metric.subValue}</Typography>
          )}
        </Paper>
      ))}
    </Box>
  );

  const renderInsights = () => (
    <Stack spacing={1}>
      {workbench?.insights.map((insight) => (
        <Paper key={insight.id} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2, p: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <InsightsIcon fontSize="small" sx={{ color: toneColors[insight.tone], mt: 0.25 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{insight.title}</Typography>
              <Typography variant="caption" sx={{ color: '#6b7280', display: 'block', mt: 0.25, lineHeight: 1.6 }}>
                {insight.content}
              </Typography>
              {insight.path && (() => {
                const path = insight.path;
                return (
                  <Button size="small" endIcon={<ArrowForwardIcon />} sx={{ mt: 0.5, px: 0 }} onClick={() => navigate(path)}>
                    查看
                  </Button>
                );
              })()}
            </Box>
          </Box>
        </Paper>
      ))}
    </Stack>
  );

  const renderTasks = () => (
    <Stack spacing={1}>
      {(activeTasks.length ? activeTasks : workbench?.tasks.slice(0, 3) || []).map((task) => (
        <Paper key={task.id} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2, p: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{task.title}</Typography>
                <Chip label={task.priority === 'high' ? '高' : task.priority === 'medium' ? '中' : '低'} color={priorityColor[task.priority]} size="small" sx={{ height: 20 }} />
              </Box>
              <Typography variant="caption" sx={{ color: '#6b7280', lineHeight: 1.6 }}>{task.description}</Typography>
            </Box>
            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, color: task.count > 0 ? '#dc2626' : '#6b7280' }}>{task.count}</Typography>
              <Button size="small" onClick={() => navigate(task.path)} sx={{ minWidth: 0, px: 0.5 }}>{task.actionLabel}</Button>
            </Box>
          </Box>
        </Paper>
      ))}
    </Stack>
  );

  const renderPromptTemplates = () => (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      {workbench?.promptTemplates.map((template) => (
        <Chip
          key={template.id}
          label={template.label}
          clickable
          variant="outlined"
          onClick={() => submitPrompt(template.prompt)}
          sx={{ borderRadius: 1.5, bgcolor: '#fff' }}
        />
      ))}
    </Box>
  );

  const renderEmptyChat = () => (
    <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
      <Box sx={{ maxWidth: 620, textAlign: 'center' }}>
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            bgcolor: '#e0f2fe',
            color: '#0284c7',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 2,
          }}
        >
          <SmartToyIcon />
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>
          AI 运营负责人助理
        </Typography>
        <Typography variant="body2" sx={{ color: '#6b7280', lineHeight: 1.8, mb: 2 }}>
          我会结合线索、客户、订单、财务结算、退款和升单数据，帮你判断今天该先处理什么。
        </Typography>
        {renderPromptTemplates()}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ height: 'calc(100vh - 64px)', display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr) 280px', bgcolor: moduleTokens.page, overflow: 'hidden' }}>
      <Box sx={{ borderRight: `1px solid ${moduleTokens.softLine}`, bgcolor: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Box sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
            <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BoltIcon fontSize="small" />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.2 }}>AI 助手</Typography>
              <Typography variant="caption" sx={{ color: '#6b7280' }}>{workbench?.scopeLabel || '运营工作台'}</Typography>
            </Box>
          </Box>
          <Typography variant="body2" sx={{ color: '#6b7280', lineHeight: 1.7 }}>
            自动巡检核心链路，发现风险后给出处理入口。
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>经营体检</Typography>
            {renderMetricGrid()}
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>智能洞察</Typography>
            {renderInsights()}
          </Box>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
              <TaskAltIcon fontSize="small" sx={{ color: '#2563eb' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>优先任务</Typography>
            </Box>
            {renderTasks()}
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <Box sx={{ p: 2.5, bgcolor: '#fff', borderBottom: `1px solid ${moduleTokens.softLine}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 800 }}>运营分析对话</Typography>
            <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
              问销售、客户、订单审核、分账、退款、升单，AI 会按当前系统数据回答。
            </Typography>
          </Box>
          {activeTasks.length > 0 && (
            <Chip icon={<WarningAmberIcon />} color="warning" label={`${activeTasks.length} 类任务待处理`} />
          )}
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 3 }}>
          {currentSession?.messages.length ? (
            <>
              {currentSession.messages.map((message) => (
                <Box key={message.id} sx={{ display: 'flex', justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start', mb: 2 }}>
                  <Box sx={{ maxWidth: message.role === 'user' ? '72%' : '86%', display: 'flex', gap: 1, flexDirection: message.role === 'user' ? 'row-reverse' : 'row' }}>
                    <Box
                      sx={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        bgcolor: message.role === 'user' ? '#2563eb' : '#16a34a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        flexShrink: 0,
                      }}
                    >
                      {message.role === 'user' ? <PersonIcon fontSize="small" /> : <SmartToyIcon fontSize="small" />}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Paper
                        elevation={0}
                        sx={{
                          p: 1.5,
                          bgcolor: message.role === 'user' ? '#2563eb' : '#fff',
                          color: message.role === 'user' ? '#fff' : '#111827',
                          border: message.role === 'user' ? 'none' : '1px solid #e5e7eb',
                          borderRadius: 2,
                        }}
                      >
                        <Typography variant="body2" sx={{ lineHeight: 1.7 }}>{message.content}</Typography>
                      </Paper>
                      {message.results?.map((result, index) => (
                        <AIResultRenderer key={`${message.id}-${index}`} result={result} />
                      ))}
                    </Box>
                  </Box>
                </Box>
              ))}
              <div ref={messageEndRef} />
            </>
          ) : (
            renderEmptyChat()
          )}
        </Box>

        <Box sx={{ p: 2, bgcolor: '#fff', borderTop: `1px solid ${moduleTokens.softLine}` }}>
          {loading && (
            <Box sx={{ mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
                <SmartToyIcon fontSize="small" sx={{ color: '#2563eb' }} />
                <Typography variant="caption" sx={{ color: '#4b5563', fontWeight: 600 }}>
                  AI 正在分析系统数据和生成回复，请稍候
                </Typography>
              </Box>
              <LinearProgress sx={{ borderRadius: 999 }} />
            </Box>
          )}
          <Box sx={{ display: 'flex', gap: 1.25 }}>
            <TextField
              fullWidth
              multiline
              minRows={1}
              maxRows={4}
              placeholder="例如：今天优先处理什么？本月销售情况如何？分账有什么风险？"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              size="small"
              disabled={loading}
            />
            <Tooltip title="发送">
              <span>
                <IconButton
                  aria-label="发送"
                  onClick={() => submitPrompt()}
                  disabled={!query.trim() || loading}
                  sx={{
                    bgcolor: query.trim() ? '#2563eb' : '#f3f4f6',
                    color: query.trim() ? '#fff' : '#9ca3af',
                    '&:hover': { bgcolor: query.trim() ? '#1d4ed8' : '#f3f4f6' },
                    borderRadius: 2,
                    alignSelf: 'flex-end',
                    width: 42,
                    height: 42,
                  }}
                >
                  <SendIcon />
                </IconButton>
              </span>
            </Tooltip>
          </Box>
        </Box>
      </Box>

      <Box sx={{ borderLeft: `1px solid ${moduleTokens.softLine}`, bgcolor: '#fff', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>会话记录</Typography>
          <Tooltip title="新建对话">
            <IconButton size="small" onClick={handleNewChat}>
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Divider />
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800, mb: 1 }}>常用问题</Typography>
          {renderPromptTemplates()}
        </Box>
        <Divider />
        <List sx={{ flex: 1, overflow: 'auto' }}>
          {sessions.map((session) => (
            <ListItemButton
              key={session.id}
              selected={currentSession?.id === session.id}
              onClick={() => handleSelectSession(session)}
              sx={{ display: 'flex', justifyContent: 'space-between', pr: 1.25, alignItems: 'center' }}
            >
              <ListItemText
                primary={session.title}
                secondary={new Date(session.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                primaryTypographyProps={{ fontSize: '0.8125rem', noWrap: true, fontWeight: 600 }}
                secondaryTypographyProps={{ fontSize: '0.6875rem', color: '#9ca3af' }}
              />
              <IconButton
                size="small"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteSession(session.id);
                }}
              >
                <DeleteIcon fontSize="small" sx={{ color: '#9ca3af' }} />
              </IconButton>
            </ListItemButton>
          ))}
          {sessions.length === 0 && (
            <Typography variant="body2" sx={{ p: 2, color: '#9ca3af', textAlign: 'center' }}>
              暂无会话
            </Typography>
          )}
        </List>
      </Box>
    </Box>
  );
};

export default AIAssistant;
