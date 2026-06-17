import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box,
  Typography, Chip, Divider, LinearProgress, List, ListItem, ListItemText,
} from '@mui/material';
import PsychologyIcon from '@mui/icons-material/Psychology';
import type { Customer } from '../../types/customer';
import type { AIBusinessCard } from '../../types/aiCard';
import { aiCardApi } from '../../api';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import { getProductLevelColor } from '../../shared/utils/constants';
import CustomerLevelBadge from '../../shared/components/CustomerLevelBadge';
import AIBusinessCardPanel from '../../shared/components/AIBusinessCardPanel';

interface CustomerDetailProps {
  customer: Customer;
  open: boolean;
  onClose: () => void;
  onEdit: (customer: Customer) => void;
  onCreateOrder?: (customer: Customer) => void;
  onViewOrders?: (customer: Customer) => void;
}

const emptyText = (value?: string | number) => (value || value === 0 ? value : '未填写');

const CustomerDetail: React.FC<CustomerDetailProps> = ({
  customer,
  open,
  onClose,
  onEdit,
  onCreateOrder,
  onViewOrders,
}) => {
  const [currentCustomer, setCurrentCustomer] = useState<Customer>(customer);
  const [aiCard, setAiCard] = useState<AIBusinessCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);

  useEffect(() => {
    setCurrentCustomer(customer);
    aiCardApi.getCard('customer', customer.id).then((res) => setAiCard(res.data));
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

  const handleGenerateCard = async () => {
    setCardLoading(true);
    try {
      const res = await aiCardApi.generateCard({
        subjectType: 'customer',
        subjectId: currentCustomer.id,
        name: currentCustomer.name,
        company: currentCustomer.company,
        phone: currentCustomer.phone,
        email: currentCustomer.email,
        wechat: currentCustomer.wechat,
        industry: currentCustomer.industry,
        city: currentCustomer.city,
        tags: currentCustomer.tags,
        notes: currentCustomer.remark || currentCustomer.aiPortrait?.aiSummary,
      });
      if (res.code === 0) setAiCard(res.data);
    } finally {
      setCardLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>{currentCustomer.name}</Typography>
          <CustomerLevelBadge level={currentCustomer.customerLevel} />
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          <Button variant="outlined" size="small" onClick={() => onViewOrders?.(currentCustomer)}>查看订单</Button>
          <Button variant="outlined" size="small" onClick={() => onCreateOrder?.(currentCustomer)}>新建订单</Button>
          <Button variant="outlined" size="small" onClick={() => onEdit(currentCustomer)}>编辑</Button>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#6b7280' }}>客户信息</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.25 }}>
            <Typography variant="body2">公司: {emptyText(currentCustomer.company)}</Typography>
            <Typography variant="body2">电话: {emptyText(currentCustomer.phone)}</Typography>
            <Typography variant="body2">邮箱: {emptyText(currentCustomer.email)}</Typography>
            <Typography variant="body2">微信: {emptyText(currentCustomer.wechat)}</Typography>
            <Typography variant="body2">行业: {emptyText(currentCustomer.industry)}</Typography>
            <Typography variant="body2">城市: {emptyText(currentCustomer.city)}</Typography>
            <Typography variant="body2">销售负责人: {emptyText(currentCustomer.owner)}</Typography>
            <Typography variant="body2">线索录入人: {emptyText(currentCustomer.leadInputBy)}</Typography>
            <Typography variant="body2">线索来源: {emptyText(currentCustomer.leadSource || currentCustomer.sourceType)}</Typography>
            <Typography variant="body2">原销转人员: {emptyText(currentCustomer.originalSalesTransferBy)}</Typography>
            <Typography variant="body2">累计消费: {formatCurrency(currentCustomer.totalSpent)}</Typography>
            <Typography variant="body2">订单数: {currentCustomer.orderCount}</Typography>
            <Typography variant="body2">创建时间: {formatDate(currentCustomer.createdAt)}</Typography>
          </Box>
          {currentCustomer.remark && (
            <Box sx={{ mt: 1.5, p: 1.5, bgcolor: '#f8fafc', borderRadius: 1 }}>
              <Typography variant="body2" sx={{ color: '#4b5563' }}>备注: {currentCustomer.remark}</Typography>
            </Box>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        <AIBusinessCardPanel card={aiCard} loading={cardLoading} onGenerate={handleGenerateCard} />

        <Divider sx={{ my: 2 }} />

        {currentCustomer.growthRecords && currentCustomer.growthRecords.length > 0 && (
          <>
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#6b7280' }}>客户等级变化记录</Typography>
              <Box sx={{ position: 'relative', pl: 3 }}>
                {currentCustomer.growthRecords.map((record, idx) => (
                  <Box key={`${record.createdAt}-${idx}`} sx={{ position: 'relative', pb: 2 }}>
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
                      bgcolor: getProductLevelColor(milestone.productLevel, '#2196F3'),
                      border: '2px solid #fff', boxShadow: '0 0 0 2px #e5e7eb',
                    }}
                  />
                  {idx < currentCustomer.growthPath.length - 1 && (
                    <Box sx={{ position: 'absolute', left: -17, top: 14, width: 2, height: 'calc(100% - 4px)', bgcolor: '#e5e7eb' }} />
                  )}
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Chip
                        label={milestone.productLevel}
                        size="small"
                        sx={{
                          fontSize: '0.6875rem',
                          bgcolor: `${getProductLevelColor(milestone.productLevel)}18`,
                          color: getProductLevelColor(milestone.productLevel),
                        }}
                      />
                      <Typography variant="caption" sx={{ color: '#9ca3af' }}>{milestone.date}</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{milestone.title}</Typography>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>{milestone.description}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          ) : (
            <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无成长记录，客户成交订单后会自动生成。</Typography>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

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
              {portrait.aiSummary && (
                <Box sx={{ mb: 2, p: 1.5, bgcolor: '#f8fafc', borderRadius: 1 }}>
                  <Typography variant="body2" sx={{ color: '#1a1a2e' }}>{portrait.aiSummary}</Typography>
                </Box>
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
