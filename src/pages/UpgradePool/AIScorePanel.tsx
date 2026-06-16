import React from 'react';
import { Box, Typography, LinearProgress, List, ListItem, ListItemText, ListItemIcon } from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import type { UpgradeOpportunity } from '../../types/upgrade';

interface AIScorePanelProps {
  opportunity: UpgradeOpportunity;
}

const AIScorePanel: React.FC<AIScorePanelProps> = ({ opportunity }) => {
  const prob = opportunity.probability;
  const probColor = prob >= 80 ? '#4CAF50' : prob >= 60 ? '#FF9800' : '#9ca3af';
  const isHigh = prob >= 80;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#6b7280' }}>AI 升单评分</Typography>

      {/* 概率条 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <LinearProgress
          variant="determinate"
          value={prob}
          sx={{
            flex: 1,
            height: 12,
            borderRadius: 6,
            bgcolor: '#f0f0f0',
            '& .MuiLinearProgress-bar': { bgcolor: probColor, borderRadius: 6 },
          }}
        />
        <Typography variant="h5" sx={{ fontWeight: 700, color: probColor, minWidth: 56 }}>
          {prob}%
        </Typography>
      </Box>

      {isHigh && (
        <Box sx={{ p: 1.5, bgcolor: '#E8F5E9', borderRadius: 1, mb: 2 }}>
          <Typography variant="body2" sx={{ color: '#2E7D32', fontWeight: 600 }}>
            ⭐ 重点跟进建议 — 评分 ≥80，建议优先推进
          </Typography>
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        {/* 升单原因 */}
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TrendingUpIcon fontSize="small" sx={{ color: '#4CAF50' }} /> 升单原因
          </Typography>
          <List dense>
            {opportunity.reason && (
              <ListItem sx={{ py: 0 }}>
                <ListItemText primary={opportunity.reason} primaryTypographyProps={{ variant: 'body2' }} />
              </ListItem>
            )}
          </List>
        </Box>

        {/* 建议 */}
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <LightbulbIcon fontSize="small" sx={{ color: '#FF9800' }} /> 行动建议
          </Typography>
          <List dense>
            {opportunity.suggestions.map((s, i) => (
              <ListItem key={i} sx={{ py: 0 }}>
                <ListItemText primary={s} primaryTypographyProps={{ variant: 'body2' }} />
              </ListItem>
            ))}
          </List>
        </Box>
      </Box>

      {opportunity.aiAnalyzedAt && (
        <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block', mt: 1 }}>
          AI 分析时间: {new Date(opportunity.aiAnalyzedAt).toLocaleString('zh-CN')}
        </Typography>
      )}
    </Box>
  );
};

export default AIScorePanel;
