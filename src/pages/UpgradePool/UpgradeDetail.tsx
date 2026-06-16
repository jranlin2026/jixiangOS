import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box,
  Typography, Chip, Divider, LinearProgress, List, ListItem, ListItemText,
  TextField,
} from '@mui/material';
import type { UpgradeOpportunity } from '../../types/upgrade';
import { upgradeApi } from '../../api';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import { CUSTOMER_LEVEL_COLOR_MAP, CUSTOMER_LEVEL_LABELS, PRODUCT_LEVEL_COLOR_MAP } from '../../shared/utils/constants';
import AIScorePanel from './AIScorePanel';

interface UpgradeDetailProps {
  id: string;
  open: boolean;
  onClose: () => void;
}

const UpgradeDetail: React.FC<UpgradeDetailProps> = ({ id, open, onClose }) => {
  const [opportunity, setOpportunity] = useState<UpgradeOpportunity | null>(null);
  const [followUpContent, setFollowUpContent] = useState('');

  useEffect(() => {
    if (open && id) {
      upgradeApi.getOpportunityById(id).then((res) => {
        if (res.code === 0) setOpportunity(res.data);
      });
    }
  }, [open, id]);

  if (!opportunity) return null;

  const handleAddFollowUp = async () => {
    if (!followUpContent.trim()) return;
    await upgradeApi.addFollowUp(id, followUpContent, '当前用户');
    setFollowUpContent('');
    const res = await upgradeApi.getOpportunityById(id);
    if (res.code === 0) setOpportunity(res.data);
  };

  const handleConvert = async () => {
    await upgradeApi.convertOpportunity(id);
    onClose();
  };

  const targetColor = PRODUCT_LEVEL_COLOR_MAP[opportunity.targetProduct] || '#9ca3af';
  const currentLevelColor = CUSTOMER_LEVEL_COLOR_MAP[opportunity.currentLevel] || '#9ca3af';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>{opportunity.customerName}</Typography>
          <Chip label={`${opportunity.currentLevel} → ${opportunity.targetLevel}`} size="small" sx={{ fontWeight: 600 }} />
        </Box>
        <Chip label={opportunity.status} size="small" color={opportunity.status === '已转化' ? 'success' : 'primary'} />
      </DialogTitle>
      <DialogContent dividers>
        {/* 基本信息 */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#6b7280' }}>升级信息</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>当前等级</Typography>
              <Chip label={`${opportunity.currentLevel} ${CUSTOMER_LEVEL_LABELS[opportunity.currentLevel] || ''}`} size="small" sx={{ bgcolor: `${currentLevelColor}18`, color: currentLevelColor, fontWeight: 600 }} />
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>目标产品</Typography>
              <Chip label={opportunity.targetProduct} size="small" sx={{ bgcolor: `${targetColor}18`, color: targetColor, fontWeight: 600 }} />
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>预估金额</Typography>
              <Typography variant="body1" sx={{ fontWeight: 700 }}>{formatCurrency(opportunity.estimatedAmount)}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>负责人</Typography>
              <Typography variant="body1">{opportunity.ownerName}</Typography>
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* AI 评分面板 */}
        <AIScorePanel opportunity={opportunity} />

        <Divider sx={{ my: 2 }} />

        {/* 跟进记录 */}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#6b7280' }}>跟进记录</Typography>
          {opportunity.followUpRecords.length > 0 ? (
            <Box sx={{ position: 'relative', pl: 3, mb: 2 }}>
              {opportunity.followUpRecords.map((record, idx) => (
                <Box key={record.id} sx={{ position: 'relative', pb: 2 }}>
                  <Box sx={{ position: 'absolute', left: -21, top: 4, width: 10, height: 10, borderRadius: '50%', bgcolor: idx === 0 ? '#2196F3' : '#d1d5db', border: '2px solid #fff', boxShadow: '0 0 0 2px #e5e7eb' }} />
                  <Typography variant="body2">{record.content}</Typography>
                  <Typography variant="caption" sx={{ color: '#9ca3af' }}>{record.createdBy} · {formatDate(record.createdAt, 'MM-dd HH:mm')}</Typography>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: '#9ca3af', mb: 2 }}>暂无跟进记录</Typography>
          )}

          {opportunity.status !== '已转化' && opportunity.status !== '已流失' && (
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <TextField
                size="small"
                placeholder="添加跟进记录..."
                value={followUpContent}
                onChange={(e) => setFollowUpContent(e.target.value)}
                fullWidth
              />
              <Button variant="contained" size="small" onClick={handleAddFollowUp} disabled={!followUpContent.trim()}>
                添加
              </Button>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        {opportunity.status === '跟进中' && (
          <Button color="success" variant="contained" onClick={handleConvert}>确认转化</Button>
        )}
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
};

export default UpgradeDetail;
