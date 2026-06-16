import React, { useEffect, useState } from 'react';
import {
  Box, Typography, List, ListItemButton, ListItemText, Paper,
  TextField, IconButton, Divider, Chip, Drawer,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import DeleteIcon from '@mui/icons-material/Delete';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import useAIStore from '../../store/useAIStore';
import AIResultRenderer from './AIResultRenderer';
import type { AIQuerySession } from '../../types/ai';

const AIAssistant: React.FC = () => {
  const { sessions, currentSession, loading, fetchSessions, sendQuery, deleteSession, fetchSessionById } = useAIStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleSend = async () => {
    if (!query.trim()) return;
    const sessionId = currentSession?.id || null;
    await sendQuery(sessionId, query.trim());
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectSession = (session: AIQuerySession) => {
    fetchSessionById(session.id);
  };

  const handleNewChat = () => {
    useAIStore.setState({ currentSession: null });
  };

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      {/* 左侧会话列表 */}
      <Box
        sx={{
          width: 260,
          borderRight: '1px solid #e5e7eb',
          bgcolor: '#fff',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>对话列表</Typography>
          <Chip label="新对话" size="small" clickable onClick={handleNewChat} sx={{ fontSize: '0.6875rem' }} />
        </Box>
        <Divider />
        <List sx={{ flex: 1, overflow: 'auto' }}>
          {sessions.map((session) => (
            <ListItemButton
              key={session.id}
              selected={currentSession?.id === session.id}
              onClick={() => handleSelectSession(session)}
              sx={{ display: 'flex', justifyContent: 'space-between', pr: 1 }}
            >
              <ListItemText
                primary={session.title}
                primaryTypographyProps={{ fontSize: '0.8125rem', noWrap: true }}
              />
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
              >
                <DeleteIcon fontSize="small" sx={{ color: '#9ca3af' }} />
              </IconButton>
            </ListItemButton>
          ))}
          {sessions.length === 0 && (
            <Typography variant="body2" sx={{ p: 2, color: '#9ca3af', textAlign: 'center' }}>
              暂无对话，开始提问吧
            </Typography>
          )}
        </List>
      </Box>

      {/* 右侧对话区 */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: '#f8f9fa' }}>
        {/* 消息列表 */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          {currentSession?.messages.map((msg) => (
            <Box
              key={msg.id}
              sx={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                mb: 2,
              }}
            >
              <Box
                sx={{
                  maxWidth: '70%',
                  display: 'flex',
                  gap: 1,
                  flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                }}
              >
                <Box
                  sx={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    bgcolor: msg.role === 'user' ? '#2196F3' : '#4CAF50',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  {msg.role === 'user' ? <PersonIcon fontSize="small" /> : <SmartToyIcon fontSize="small" />}
                </Box>
                <Box>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      bgcolor: msg.role === 'user' ? '#2196F3' : '#fff',
                      color: msg.role === 'user' ? '#fff' : '#1a1a2e',
                      border: msg.role === 'user' ? 'none' : '1px solid #e5e7eb',
                      borderRadius: 2,
                    }}
                  >
                    <Typography variant="body2">{msg.content}</Typography>
                  </Paper>
                  {msg.results && msg.results.map((result, idx) => (
                    <Box key={idx} sx={{ mt: 1 }}>
                      <AIResultRenderer result={result} />
                    </Box>
                  ))}
                </Box>
              </Box>
            </Box>
          ))}
          {!currentSession && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <SmartToyIcon sx={{ fontSize: 48, color: '#d1d5db', mb: 2 }} />
              <Typography variant="h6" sx={{ color: '#9ca3af', fontWeight: 400 }}>
                AI 经营助手
              </Typography>
              <Typography variant="body2" sx={{ color: '#9ca3af', mt: 1 }}>
                输入您的问题，开始对话
              </Typography>
            </Box>
          )}
        </Box>

        {/* 输入框 */}
        <Box sx={{ p: 2, bgcolor: '#fff', borderTop: '1px solid #e5e7eb' }}>
          <Box sx={{ display: 'flex', gap: 1, maxWidth: 800, mx: 'auto' }}>
            <TextField
              fullWidth
              multiline
              minRows={1}
              maxRows={4}
              placeholder="输入您的问题..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              size="small"
              disabled={loading}
            />
            <IconButton
              onClick={handleSend}
              disabled={!query.trim() || loading}
              sx={{
                bgcolor: query.trim() ? '#2196F3' : '#f5f5f5',
                color: query.trim() ? '#fff' : '#9ca3af',
                '&:hover': { bgcolor: query.trim() ? '#1976D2' : '#f5f5f5' },
                borderRadius: 2,
                alignSelf: 'flex-end',
              }}
            >
              <SendIcon />
            </IconButton>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default AIAssistant;
