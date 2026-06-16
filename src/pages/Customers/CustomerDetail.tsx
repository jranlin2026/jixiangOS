import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box,
  Typography, Chip, Divider, LinearProgress, List, ListItem, ListItemText,
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PsychologyIcon from '@mui/icons-material/Psychology';
import type { Customer } from '../../types/customer';
import { customerApi } from '../../api';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import { PRODUCT_LEVEL_COLOR_MAP, CUSTOMER_LEVEL_LABELS } from '../../shared/utils/constants';
import CustomerLevelBadge from '../../shared/components/CustomerLevelBadge';

interface CustomerDetailProps {
  customer: Customer;
  open: boolean;
  onClose: () => void;
  onEdit: (customer: Customer) => void;
}

const CustomerDetail: React.FC<CustomerDetailProps> = ({ customer, open, onClose, onEdit }) => {
  const [currentCustomer, setCurrentCustomer] = useState<Customer>(customer);

  useEffect(() => {
    setCurrentCustomer(customer);
  }, [customer]);

  const portrait = currentCustomer.aiPortrait;

  const getRiskColor = (level: string) => {
    if (level === '高') return '#F44336';
    if (level === '中') return '#FF9800';
    return '#4CAF50';
  };

  const getPotentialColor = (level: string) => {
    if (level === '高') return '#4CAF50';
    if (level === '中') return '#FF9800';
    return '#9ca3af';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>{currentCustomer.name}</Typography>
          <Chip
            label={currentCustomer.productLevel}
            size="small"
            sx={{
              bgcolor: `${PRODUCT_LEVEL_COLOR_MAP[currentCustomer.productLevel]}18`,
              color: PRODUCT_LEVEL_COLOR_MAP[currentCustomer.productLevel],
              fontWeight: 600,
            }}
          />
          <CustomerLevelBadge level={currentCustomer.customerLevel} />
        </Box>
        <Button variant="outlined" size="small" onClick={() => onEdit(currentCustomer)}>编辑</Button>
      </DialogTitle>
      <DialogContent dividers>
        {/* 基本信息 */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#6b7280' }}>客户信息</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1 }}>
            <Typography variant="body2">公司: {currentCustomer.company}</Typography>
            <Typography variant="body2">电话: {currentCustomer.phone}</Typography>
            <Typography variant="body2">邮箱: {currentCustomer.email || '未填写'}</Typography>
            <Typography variant="body2">微信: {currentCustomer.wechat || '未填写'}</Typography>
            <Typography variant="body2">行业: {currentCustomer.industry || '未填写'}</Typography>
            <Typography variant="body2">城市: {currentCustomer.city || '未填写'}</Typography>
            <Typography variant="body2">负责人: {currentCustomer.owner}</Typography>
            <Typography variant="body2">累计消费: {formatCurrency(currentCustomer.totalSpent)}</Typography>
            <Typography variant="body2">订单数: {currentCustomer.orderCount}</Typography>
            {currentCustomer.sourceType && (
              <Typography variant="body2">来源类型: {currentCustomer.sourceType}</Typography>
            )}
            {currentCustomer.score !== undefined && (
              <Typography variant="body2">评分: {currentCustomer.score}</Typography>
            )}
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* 客户等级变化记录 */}
        {currentCustomer.growthRecords && currentCustomer.growthRecords.length > 0 && (
          <>
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#6b7280' }}>等级变化记录</Typography>
              <Box sx={{ position: 'relative', pl: 3 }}>
                {currentCustomer.growthRecords.map((record, idx) => (
                  <Box key={idx} sx={{ position: 'relative', pb: 2 }}>
                    <Box
                      sx={{
                        position: 'absolute', left: -21, top: 4,
                        width: 10, height: 10, borderRadius: '50%',
                        bgcolor: '#2196F3', border: '2px solid #fff',
                        boxShadow: '0 0 0 2px #e5e7eb',
                      }}
                    />
                    {idx < currentCustomer.growthRecords.length - 1 && (
                      <Box sx={{ position: 'absolute', left: -17, top: 14, width: 2, height: 'calc(100% - 4px)', bgcolor: '#e5e7eb' }} />
                    )}
                    <Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <CustomerLevelBadge level={record.fromLevel} />
                        <Typography variant="body2" sx={{ color: '#6b7280' }}>→</Typography>
                        <CustomerLevelBadge level={record.toLevel} />
                        <Typography variant="caption" sx={{ color: '#9ca3af' }}>{formatDate(record.createdAt)}</Typography>
                      </Box>
                      <Typography variant="body2" sx={{ color: '#6b7280' }}>
                        {record.fromProduct} → {record.toProduct} | 升单金额: {formatCurrency(record.upgradeAmount)} | {record.reason}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
            <Divider sx={{ my: 2 }} />
          </>
        )}

        {/* 成长路径时间轴 */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#6b7280' }}>成长路径</Typography>
          {currentCustomer.growthPath.length > 0 ? (
            <Box sx={{ position: 'relative', pl: 3 }}>
              {currentCustomer.growthPath.map((milestone, idx) => (
                <Box key={milestone.id} sx={{ position: 'relative', pb: 2 }}>
                  <Box
                    sx={{
                      position: 'absolute', left: -21, top: 4,
                      width: 10, height: 10, borderRadius: '50%',
                      bgcolor: PRODUCT_LEVEL_COLOR_MAP[milestone.productLevel] || '#2196F3',
                      border: '2px solid #fff', boxShadow: '0 0 0 2px #e5e7eb',
                    }}
                  />
                  {idx < currentCustomer.growthPath.length - 1 && (
                    <Box sx={{ position: 'absolute', left: -17, top: 14, width: 2, height: 'calc(100% - 4px)', bgcolor: '#e5e7eb' }} />
                  )}
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Chip label={milestone.productLevel} size="small" sx={{ fontSize: '0.6875rem', bgcolor: `${PRODUCT_LEVEL_COLOR_MAP[milestone.productLevel]}18`, color: PRODUCT_LEVEL_COLOR_MAP[milestone.productLevel] }} />
                      <Typography variant="caption" sx={{ color: '#9ca3af' }}>{milestone.date}</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{milestone.title}</Typography>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>{milestone.description}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无成长记录</Typography>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* AI 客户画像 */}
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <PsychologyIcon fontSize="small" /> AI 客户画像
          </Typography>
          {portrait ? (
            <Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, mb: 2 }}>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280', mb: 0.5 }}>风险等级</Typography>
                  <Chip label={portrait.riskLevel} size="small" sx={{ bgcolor: `${getRiskColor(portrait.riskLevel)}18`, color: getRiskColor(portrait.riskLevel), fontWeight: 600 }} />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280', mb: 0.5 }}>升级潜力</Typography>
                  <Chip label={portrait.upgradePotential} size="small" sx={{ bgcolor: `${getPotentialColor(portrait.upgradePotential)}18`, color: getPotentialColor(portrait.upgradePotential), fontWeight: 600 }} />
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ color: '#6b7280', mb: 0.5 }}>满意度</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={portrait.satisfaction}
                      sx={{ flex: 1, height: 8, borderRadius: 4, bgcolor: '#f0f0f0', '& .MuiLinearProgress-bar': { bgcolor: portrait.satisfaction >= 80 ? '#4CAF50' : portrait.satisfaction >= 60 ? '#FF9800' : '#F44336', borderRadius: 4 } }}
                    />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{portrait.satisfaction}</Typography>
                  </Box>
                </Box>
              </Box>
              {/* 扩展画像字段 */}
              {(portrait.teamSize || portrait.accountCount || portrait.budgetLevel || portrait.activityLevel || portrait.upgradeProbability !== undefined) && (
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 2, mb: 2 }}>
                  {portrait.teamSize && (
                    <Box>
                      <Typography variant="body2" sx={{ color: '#6b7280', mb: 0.5 }}>团队规模</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{portrait.teamSize}</Typography>
                    </Box>
                  )}
                  {portrait.accountCount !== undefined && (
                    <Box>
                      <Typography variant="body2" sx={{ color: '#6b7280', mb: 0.5 }}>账号数</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{portrait.accountCount}</Typography>
                    </Box>
                  )}
                  {portrait.budgetLevel && (
                    <Box>
                      <Typography variant="body2" sx={{ color: '#6b7280', mb: 0.5 }}>预算水平</Typography>
                      <Chip label={portrait.budgetLevel} size="small" sx={{ bgcolor: `${getPotentialColor(portrait.budgetLevel)}18`, color: getPotentialColor(portrait.budgetLevel), fontWeight: 600 }} />
                    </Box>
                  )}
                  {portrait.upgradeProbability !== undefined && (
                    <Box>
                      <Typography variant="body2" sx={{ color: '#6b7280', mb: 0.5 }}>升级概率</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: portrait.upgradeProbability >= 0.8 ? '#4CAF50' : portrait.upgradeProbability >= 0.5 ? '#FF9800' : '#9ca3af' }}>
                        {Math.round(portrait.upgradeProbability * 100)}%
                      </Typography>
                    </Box>
                  )}
                </Box>
              )}
              {portrait.aiSummary && (
                <Box sx={{ mb: 2, p: 1.5, bgcolor: '#f8fafc', borderRadius: 1 }}>
                  <Typography variant="body2" sx={{ color: '#1a1a2e' }}>{portrait.aiSummary}</Typography>
                </Box>
              )}
              {portrait.predictedNextPurchase && (
                <Typography variant="body2" sx={{ mb: 1 }}>
                  <strong>预测下次购买:</strong> {portrait.predictedNextPurchase}
                </Typography>
              )}
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>关键洞察</Typography>
              <List dense>
                {portrait.keyInsights.map((insight, i) => (
                  <ListItem key={i} sx={{ py: 0 }}>
                    <ListItemText primary={insight} primaryTypographyProps={{ variant: 'body2' }} />
                  </ListItem>
                ))}
              </List>
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无 AI 画像数据</Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CustomerDetail;
