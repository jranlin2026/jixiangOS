import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, Button, Box,
  Typography, Chip, Divider, LinearProgress, List, ListItem, ListItemText,
  IconButton,
} from '@mui/material';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import BusinessIcon from '@mui/icons-material/Business';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import RefreshIcon from '@mui/icons-material/Refresh';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import CategoryIcon from '@mui/icons-material/Category';
import type { Lead } from '../../types/lead';
import type { AIBusinessCard } from '../../types/aiCard';
import { aiCardApi, leadApi } from '../../api';
import { formatDate, formatRelativeTime } from '../../shared/utils/formatters';
import AIBusinessCardPanel from '../../shared/components/AIBusinessCardPanel';
import { normalizeResourceOwnership } from '../../shared/utils/constants';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

interface LeadDetailProps {
  lead: Lead;
  open: boolean;
  onClose: () => void;
  onEdit: (lead: Lead) => void;
}

const LeadDetail: React.FC<LeadDetailProps> = ({ lead, open, onClose, onEdit }) => {
  const [currentLead, setCurrentLead] = useState<Lead>(lead);
  const [refreshing, setRefreshing] = useState(false);
  const [aiCard, setAiCard] = useState<AIBusinessCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);

  useEffect(() => {
    setCurrentLead(lead);
    aiCardApi.getCard('lead', lead.id).then((res) => setAiCard(res.data));
  }, [lead]);

  const handleRefreshAI = async () => {
    setRefreshing(true);
    try {
      const res = await leadApi.refreshAIAnalysis(currentLead.id);
      if (res.code === 0 && res.data) {
        setCurrentLead({ ...currentLead, aiAnalysis: res.data });
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleGenerateCard = async () => {
    setCardLoading(true);
    try {
      const res = await aiCardApi.generateCard({
        subjectType: 'lead',
        subjectId: currentLead.id,
        name: currentLead.name,
        company: currentLead.company,
        phone: currentLead.phone,
        email: currentLead.email,
        wechat: currentLead.wechat,
        industry: currentLead.industry,
        city: currentLead.city,
        tags: currentLead.tags,
        notes: currentLead.followUpRecords.map((record) => record.content).join('\n'),
      });
      if (res.code === 0) setAiCard(res.data);
    } finally {
      setCardLoading(false);
    }
  };

  const ai = currentLead.aiAnalysis;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogCloseTitle onClose={onClose}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {currentLead.name}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" size="small" onClick={() => onEdit(currentLead)}>
            编辑
          </Button>
        </Box>
      </DialogCloseTitle>
      <DialogContent dividers>
        {/* 基本信息 */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#6b7280' }}>基本信息</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <BusinessIcon fontSize="small" sx={{ color: '#9ca3af' }} />
              <Typography variant="body2">{currentLead.company || '未填写'}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PhoneIcon fontSize="small" sx={{ color: '#9ca3af' }} />
              <Typography variant="body2">{currentLead.phone}</Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <EmailIcon fontSize="small" sx={{ color: '#9ca3af' }} />
              <Typography variant="body2">{currentLead.email || '未填写'}</Typography>
            </Box>
            <Box>
              <Chip label={currentLead.status} size="small" color={currentLead.status === '已成交' ? 'success' : 'default'} />
            </Box>
          </Box>
          <Box sx={{ mt: 1.5, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            {currentLead.industry && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CategoryIcon fontSize="small" sx={{ color: '#9ca3af' }} />
                <Typography variant="body2">行业: {currentLead.industry}</Typography>
              </Box>
            )}
            {currentLead.city && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LocationOnIcon fontSize="small" sx={{ color: '#9ca3af' }} />
                <Typography variant="body2">城市: {currentLead.city}</Typography>
              </Box>
            )}
            {currentLead.wechat && (
              <Typography variant="body2" sx={{ color: '#6b7280' }}>微信: {currentLead.wechat}</Typography>
            )}
            {currentLead.sourceType && (
              <Typography variant="body2" sx={{ color: '#6b7280' }}>资源归属: {normalizeResourceOwnership(currentLead.sourceType)}</Typography>
            )}
            {currentLead.score !== undefined && (
              <Typography variant="body2" sx={{ color: '#6b7280' }}>评分: {currentLead.score}</Typography>
            )}
          </Box>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>
              来源: {currentLead.source} | 负责人: {currentLead.owner} | 创建时间: {formatDate(currentLead.createdAt)}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <AIBusinessCardPanel card={aiCard} loading={cardLoading} onGenerate={handleGenerateCard} />

        <Divider sx={{ my: 2 }} />

        {/* AI 升级概率 */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ color: '#6b7280' }}>AI 升级概率分析</Typography>
            <IconButton size="small" onClick={handleRefreshAI} disabled={refreshing}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Box>
          {ai ? (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <LinearProgress
                  variant="determinate"
                  value={ai.upgradeProbability * 100}
                  sx={{
                    flex: 1,
                    height: 10,
                    borderRadius: 5,
                    bgcolor: '#f0f0f0',
                    '& .MuiLinearProgress-bar': {
                      bgcolor: ai.upgradeProbability >= 0.7 ? '#4CAF50' : ai.upgradeProbability >= 0.4 ? '#FF9800' : '#9ca3af',
                      borderRadius: 5,
                    },
                  }}
                />
                <Typography variant="h6" sx={{ fontWeight: 700, minWidth: 48, color: ai.upgradeProbability >= 0.7 ? '#4CAF50' : ai.upgradeProbability >= 0.4 ? '#FF9800' : '#9ca3af' }}>
                  {Math.round(ai.upgradeProbability * 100)}%
                </Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TrendingUpIcon fontSize="small" sx={{ color: '#4CAF50' }} /> 升级原因
                  </Typography>
                  <List dense>
                    {ai.reasons.map((r, i) => (
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
                    {ai.suggestions.map((s, i) => (
                      <ListItem key={i} sx={{ py: 0 }}>
                        <ListItemText primary={s} primaryTypographyProps={{ variant: 'body2' }} />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              </Box>
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无 AI 分析数据，点击刷新按钮生成</Typography>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* 跟进记录 */}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#6b7280' }}>跟进记录</Typography>
          {currentLead.followUpRecords.length > 0 ? (
            <Box sx={{ position: 'relative', pl: 3 }}>
              {currentLead.followUpRecords.map((record, idx) => (
                <Box key={record.id} sx={{ position: 'relative', pb: 2 }}>
                  <Box
                    sx={{
                      position: 'absolute', left: -21, top: 4,
                      width: 10, height: 10, borderRadius: '50%',
                      bgcolor: idx === 0 ? '#2196F3' : '#d1d5db',
                      border: '2px solid #fff', boxShadow: '0 0 0 2px #e5e7eb',
                    }}
                  />
                  {idx < currentLead.followUpRecords.length - 1 && (
                    <Box sx={{ position: 'absolute', left: -17, top: 14, width: 2, height: 'calc(100% - 4px)', bgcolor: '#e5e7eb' }} />
                  )}
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Chip label={record.type} size="small" variant="outlined" sx={{ fontSize: '0.6875rem' }} />
                      <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                        {formatRelativeTime(record.createdAt)}
                      </Typography>
                    </Box>
                    <Typography variant="body2">{record.content}</Typography>
                    <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                      {record.createdBy} · {formatDate(record.createdAt, 'MM-dd HH:mm')}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无跟进记录</Typography>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default LeadDetail;
