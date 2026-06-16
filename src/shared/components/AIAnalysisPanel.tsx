import React from 'react';
import { Box, Typography, LinearProgress, List, ListItem, ListItemText, Paper } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LightbulbIcon from '@mui/icons-material/Lightbulb';

interface AIAnalysisPanelProps {
  probability: number;
  reasons: string[];
  suggestions: string[];
}

const AIAnalysisPanel: React.FC<AIAnalysisPanelProps> = ({ probability, reasons, suggestions }) => {
  const probPercent = Math.round(probability * 100);
  const probColor = probability >= 0.7 ? '#4CAF50' : probability >= 0.4 ? '#FF9800' : '#9ca3af';

  return (
    <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2, p: 2.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 2 }}>AI 升级概率分析</Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <LinearProgress
          variant="determinate"
          value={probPercent}
          sx={{
            flex: 1,
            height: 10,
            borderRadius: 5,
            bgcolor: '#f0f0f0',
            '& .MuiLinearProgress-bar': {
              bgcolor: probColor,
              borderRadius: 5,
            },
          }}
        />
        <Typography variant="h6" sx={{ fontWeight: 700, color: probColor, minWidth: 48 }}>
          {probPercent}%
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TrendingUpIcon fontSize="small" sx={{ color: '#4CAF50' }} /> 升级原因
          </Typography>
          <List dense>
            {reasons.map((r, i) => (
              <ListItem key={i} sx={{ py: 0 }}>
                <ListItemText primary={r} primaryTypographyProps={{ variant: 'body2' }} />
              </ListItem>
            ))}
          </List>
        </Box>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LightbulbIcon fontSize="small" sx={{ color: '#FF9800' }} /> 建议行动
          </Typography>
          <List dense>
            {suggestions.map((s, i) => (
              <ListItem key={i} sx={{ py: 0 }}>
                <ListItemText primary={s} primaryTypographyProps={{ variant: 'body2' }} />
              </ListItem>
            ))}
          </List>
        </Box>
      </Box>
    </Paper>
  );
};

export default AIAnalysisPanel;
