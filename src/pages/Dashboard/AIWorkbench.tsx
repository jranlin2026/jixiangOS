import React, { useState } from 'react';
import { Box, Paper, TextField, IconButton, Typography, Chip, Stack } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../shared/utils/constants';

const exampleQueries = [
  '本月销售数据概览',
  '退款原因分析',
  '销售排名',
  '线索转化率',
  '高潜力客户推荐',
  '经营分析',
];

const AIWorkbench: React.FC = () => {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const handleSend = () => {
    if (query.trim()) {
      navigate(ROUTES.AI_ASSISTANT, { state: { query: query.trim() } });
      setQuery('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleExampleClick = (q: string) => {
    navigate(ROUTES.AI_ASSISTANT, { state: { query: q } });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 6, pb: 4 }}>
      <Typography
        variant="h4"
        sx={{
          fontWeight: 700,
          color: '#1a1a2e',
          mb: 1,
          fontSize: '1.75rem',
        }}
      >
        AI 智能工作台
      </Typography>
      <Typography
        variant="body1"
        sx={{ color: '#6b7280', mb: 4 }}
      >
        输入您的问题，AI 将为您分析数据并提供洞察
      </Typography>

      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 640,
          p: 0.5,
          border: '2px solid #e5e7eb',
          borderRadius: 3,
          transition: 'border-color 0.2s',
          '&:focus-within': {
            borderColor: '#2196F3',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-end' }}>
          <TextField
            fullWidth
            multiline
            minRows={1}
            maxRows={4}
            placeholder="输入您的问题，例如：本月销售数据如何？"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            variant="standard"
            sx={{
              '& .MuiInputBase-root': {
                px: 2,
                py: 1,
                fontSize: '0.9375rem',
              },
              '& .MuiInput-underline:before, & .MuiInput-underline:after': {
                display: 'none',
              },
            }}
          />
          <IconButton
            onClick={handleSend}
            disabled={!query.trim()}
            sx={{
              m: 0.5,
              bgcolor: query.trim() ? '#2196F3' : '#f5f5f5',
              color: query.trim() ? '#fff' : '#9ca3af',
              '&:hover': {
                bgcolor: query.trim() ? '#1976D2' : '#f5f5f5',
              },
              borderRadius: 2,
            }}
          >
            <SendIcon fontSize="small" />
          </IconButton>
        </Box>
      </Paper>

      <Stack
        direction="row"
        flexWrap="wrap"
        justifyContent="center"
        gap={1}
        sx={{ mt: 3, maxWidth: 640 }}
      >
        {exampleQueries.map((q) => (
          <Chip
            key={q}
            label={q}
            onClick={() => handleExampleClick(q)}
            variant="outlined"
            sx={{
              borderColor: '#e5e7eb',
              color: '#6b7280',
              '&:hover': {
                borderColor: '#2196F3',
                color: '#2196F3',
                bgcolor: '#E3F2FD',
              },
            }}
          />
        ))}
      </Stack>
    </Box>
  );
};

export default AIWorkbench;
