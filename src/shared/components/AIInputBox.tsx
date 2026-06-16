import React, { useState } from 'react';
import { Box, TextField, IconButton, Paper } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';

interface AIInputBoxProps {
  onSubmit: (query: string) => void;
  placeholder?: string;
  loading?: boolean;
}

const AIInputBox: React.FC<AIInputBoxProps> = ({ onSubmit, placeholder = '输入您的问题...', loading = false }) => {
  const [query, setQuery] = useState('');

  const handleSend = () => {
    if (query.trim() && !loading) {
      onSubmit(query.trim());
      setQuery('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
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
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          variant="standard"
          disabled={loading}
          sx={{
            '& .MuiInputBase-root': { px: 2, py: 1, fontSize: '0.9375rem' },
            '& .MuiInput-underline:before, & .MuiInput-underline:after': { display: 'none' },
          }}
        />
        <IconButton
          onClick={handleSend}
          disabled={!query.trim() || loading}
          sx={{
            m: 0.5,
            bgcolor: query.trim() ? '#2196F3' : '#f5f5f5',
            color: query.trim() ? '#fff' : '#9ca3af',
            '&:hover': { bgcolor: query.trim() ? '#1976D2' : '#f5f5f5' },
            borderRadius: 2,
          }}
        >
          <SendIcon fontSize="small" />
        </IconButton>
      </Box>
    </Paper>
  );
};

export default AIInputBox;
