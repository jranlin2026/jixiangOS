import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material';
import type { Opportunity, OpportunityStage } from '../../types/opportunity';
import { opportunityApi } from '../../api';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

const stages: OpportunityStage[] = ['初步沟通', '需求确认', '方案报价', '谈判签约', '赢单', '输单'];
const activeStages: OpportunityStage[] = ['初步沟通', '需求确认', '方案报价', '谈判签约'];

const stageHelp: Record<OpportunityStage, string> = {
  初步沟通: '销售已接手，正在判断需求是否真实',
  需求确认: '已确认业务痛点、预算或产品方向',
  方案报价: '已给方案或报价，等待客户反馈',
  谈判签约: '进入合同、付款、决策人确认',
  赢单: '已成交，应进入订单流程',
  输单: '已归档，记录失败原因',
};

const Opportunities: React.FC = () => {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [search, setSearch] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [followUp, setFollowUp] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [pendingStage, setPendingStage] = useState<OpportunityStage | null>(null);

  const fetchItems = async () => {
    const res = await opportunityApi.getOpportunities({ search, ownerName: ownerName || undefined, pageSize: 200 });
    setItems(res.data.items);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<OpportunityStage, Opportunity[]>();
    activeStages.forEach((stage) => map.set(stage, []));
    items.filter((item) => item.status === '进行中').forEach((item) => map.get(item.stage)?.push(item));
    return map;
  }, [items]);

  const archivedItems = useMemo(() => items.filter((item) => item.status !== '进行中'), [items]);

  const stats = useMemo(() => {
    const active = items.filter((item) => item.status === '进行中');
    return {
      activeAmount: active.reduce((sum, item) => sum + item.estimatedAmount, 0),
      weightedAmount: active.reduce((sum, item) => sum + item.estimatedAmount * (item.probability / 100), 0),
      activeCount: active.length,
      wonCount: items.filter((item) => item.status === '已转订单').length,
    };
  }, [items]);

  const handleStage = async (nextStage: OpportunityStage) => {
    if (!selected) return;
    if (selected.status === '进行中' && (nextStage === '赢单' || nextStage === '输单')) {
      setPendingStage(nextStage);
      return;
    }
    await commitStage(nextStage);
  };

  const commitStage = async (nextStage: OpportunityStage) => {
    if (!selected) return;
    const res = await opportunityApi.updateStage(selected.id, nextStage, lostReason);
    if (res.data) {
      setSelected(res.data);
      setPendingStage(null);
      await fetchItems();
    }
  };

  const handleReopen = async () => {
    if (!selected) return;
    const res = await opportunityApi.reopenOpportunity(selected.id);
    if (res.data) {
      setSelected(res.data);
      await fetchItems();
    }
  };

  const handleFollowUp = async () => {
    if (!selected || !followUp.trim()) return;
    const res = await opportunityApi.addFollowUp(selected.id, followUp.trim());
    if (res.data) {
      setSelected(res.data);
      setFollowUp('');
      await fetchItems();
    }
  };

  const probabilityColor = (value: number) => (value >= 75 ? '#16a34a' : value >= 50 ? '#f59e0b' : '#6b7280');

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>商机看板</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            用于主管查看全部客户的商机漏斗；单个客户的推进进度和跟进记录已融合到客户详情与客户动态中。
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField size="small" placeholder="搜索客户/公司" value={search} onChange={(e) => setSearch(e.target.value)} />
          <TextField size="small" placeholder="负责人" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} sx={{ width: 120 }} />
          <Button variant="outlined" onClick={fetchItems}>筛选</Button>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 3 }}>
        {[
          ['进行中商机', stats.activeCount],
          ['预计金额', formatCurrency(stats.activeAmount)],
          ['加权预测', formatCurrency(stats.weightedAmount)],
          ['赢单数量', stats.wonCount],
        ].map(([label, value]) => (
          <Paper key={label} elevation={0} sx={{ p: 2, border: '1px solid #eef2f7' }}>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>{label}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>{value}</Typography>
          </Paper>
        ))}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(240px, 1fr))', gap: 1.5, overflowX: 'auto', pb: 1 }}>
        {activeStages.map((stage) => {
          const stageItems = grouped.get(stage) || [];
          const amount = stageItems.reduce((sum, item) => sum + item.estimatedAmount, 0);
          return (
            <Paper key={stage} elevation={0} sx={{ border: '1px solid #e5e7eb', bgcolor: '#f8fafc', minHeight: 520 }}>
              <Box sx={{ p: 1.5, borderBottom: '1px solid #e5e7eb', bgcolor: '#fff' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{stage}</Typography>
                  <Chip label={stageItems.length} size="small" />
                </Box>
                <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mt: 0.5 }}>{stageHelp[stage]}</Typography>
                <Typography variant="caption" sx={{ display: 'block', color: '#111827', mt: 0.5, fontWeight: 600 }}>{formatCurrency(amount)}</Typography>
              </Box>
              <Box sx={{ p: 1.25, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                {stageItems.map((item) => (
                  <Paper
                    key={item.id}
                    elevation={0}
                    onClick={() => setSelected(item)}
                    sx={{ p: 1.5, cursor: 'pointer', border: '1px solid #e5e7eb', borderRadius: 1, bgcolor: '#fff', '&:hover': { borderColor: '#2196F3' } }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.customerName}</Typography>
                    <Typography variant="caption" sx={{ color: '#6b7280' }}>{item.company || item.leadName || '未填写公司'}</Typography>
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatCurrency(item.estimatedAmount)}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
                        <LinearProgress
                          variant="determinate"
                          value={item.probability}
                          sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: '#eef2f7', '& .MuiLinearProgress-bar': { bgcolor: probabilityColor(item.probability) } }}
                        />
                        <Typography variant="caption" sx={{ color: probabilityColor(item.probability), fontWeight: 700 }}>{item.probability}%</Typography>
                      </Box>
                    </Box>
                    <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mt: 1 }}>下一步: {item.nextAction}</Typography>
                    <Typography variant="caption" sx={{ display: 'block', color: '#9ca3af', mt: 0.5 }}>{item.ownerName} · {item.expectedCloseDate}</Typography>
                  </Paper>
                ))}
              </Box>
            </Paper>
          );
        })}
      </Box>

      <Paper elevation={0} sx={{ mt: 3, border: '1px solid #e5e7eb' }}>
        <Box sx={{ p: 2, borderBottom: '1px solid #e5e7eb' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>已归档商机</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            赢单生成订单、退款完成或输单后会从销售看板移到这里，避免进行中商机堆积。
          </Typography>
        </Box>
        <Box sx={{ p: 1.5, display: 'grid', gap: 1 }}>
          {archivedItems.map((item) => (
            <Box key={item.id} onClick={() => setSelected(item)} sx={{ display: 'grid', gridTemplateColumns: '1.2fr 120px 120px 120px 1fr', gap: 1.5, p: 1.25, border: '1px solid #eef2f7', borderRadius: 1, cursor: 'pointer', '&:hover': { borderColor: '#2196F3' } }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.customerName}</Typography>
              <Chip label={item.status} size="small" color={item.status === '已转订单' ? 'success' : item.status === '已退款' ? 'error' : 'default'} />
              <Typography variant="body2">{formatCurrency(item.estimatedAmount)}</Typography>
              <Typography variant="body2">{item.orderNo || '-'}</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>{item.lostReason || item.lifecycleStatus || '-'}</Typography>
            </Box>
          ))}
          {archivedItems.length === 0 && (
            <Typography variant="body2" sx={{ color: '#9ca3af', p: 2, textAlign: 'center' }}>暂无归档商机</Typography>
          )}
        </Box>
      </Paper>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="md" fullWidth>
        {selected && (
          <>
            <DialogCloseTitle onClose={() => setSelected(null)}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>{selected.customerName}</Typography>
                <Typography variant="body2" sx={{ color: '#6b7280' }}>销售商机 · {selected.ownerName}</Typography>
              </Box>
              <Chip label={selected.status === '进行中' ? selected.stage : selected.status} color={selected.status === '已转订单' ? 'success' : selected.status === '已退款' || selected.status === '输单' ? 'error' : 'default'} />
            </DialogCloseTitle>
            <DialogContent dividers>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mb: 2 }}>
                <Typography variant="body2">预计金额: {formatCurrency(selected.estimatedAmount)}</Typography>
                <Typography variant="body2">成交概率: {selected.probability}%</Typography>
                <Typography variant="body2">预计成交日: {selected.expectedCloseDate}</Typography>
                <Typography variant="body2">来源线索: {selected.leadName || '-'}</Typography>
              </Box>

              <Typography variant="subtitle2" sx={{ mb: 1 }}>推进阶段</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                {stages.map((stage) => (
                  <Button key={stage} size="small" variant={selected.stage === stage ? 'contained' : 'outlined'} onClick={() => handleStage(stage)} disabled={selected.status !== '进行中' && stage !== selected.stage}>
                    {stage === '赢单' ? '赢单，进入订单' : stage}
                  </Button>
                ))}
              </Box>
              {selected.status === '已转订单' && (
                <Box sx={{ p: 1.25, mb: 2, bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 1 }}>
                  <Typography variant="body2" sx={{ color: '#166534' }}>
                    已生成订单 {selected.orderNo || '-'}。如果刚才点错，可在下方撤回，系统会取消这笔自动生成订单并把商机恢复到进行中。
                  </Typography>
                </Box>
              )}
              {selected.status === '输单' && (
                <Box sx={{ p: 1.25, mb: 2, bgcolor: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 1 }}>
                  <Typography variant="body2" sx={{ color: '#9a3412' }}>
                    该商机已标记为输单。若误操作，可在下方撤回并继续推进。
                  </Typography>
                </Box>
              )}
              {selected.stage !== '输单' && (
                <TextField label="输单原因" value={lostReason} onChange={(e) => setLostReason(e.target.value)} fullWidth size="small" sx={{ mb: 2 }} />
              )}

              <Typography variant="subtitle2" sx={{ mb: 1 }}>下一步动作</Typography>
              <Typography variant="body2" sx={{ mb: 2, color: '#374151' }}>{selected.nextAction}</Typography>

              <Typography variant="subtitle2" sx={{ mb: 1 }}>跟进记录</Typography>
              {selected.followUps.map((record) => (
                <Box key={record.id} sx={{ p: 1, mb: 1, bgcolor: '#f8fafc', borderRadius: 1 }}>
                  <Typography variant="body2">{record.content}</Typography>
                  <Typography variant="caption" sx={{ color: '#9ca3af' }}>{record.createdBy} · {formatDate(record.createdAt, 'MM-dd HH:mm')}</Typography>
                </Box>
              ))}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 1, mt: 2 }}>
                <TextField label="新增跟进" value={followUp} onChange={(e) => setFollowUp(e.target.value)} size="small" />
                <Button variant="contained" onClick={handleFollowUp} disabled={!followUp.trim()}>添加</Button>
              </Box>
            </DialogContent>
            <DialogActions>
              {selected.status !== '进行中' && (
                <Button color="warning" onClick={handleReopen}>撤回到进行中</Button>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
      <Dialog open={Boolean(pendingStage && selected)} onClose={() => setPendingStage(null)} maxWidth="xs" fullWidth>
        {pendingStage && selected && (
          <>
            <DialogCloseTitle onClose={() => setPendingStage(null)}>{pendingStage === '赢单' ? '确认赢单并生成订单？' : '确认标记为输单？'}</DialogCloseTitle>
            <DialogContent dividers>
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                客户：{selected.customerName}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1.5 }}>
                预计金额：{formatCurrency(selected.estimatedAmount)}
              </Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>
                {pendingStage === '赢单'
                  ? '系统会按商机产品意向或预计金额匹配产品，并自动生成同金额订单。点错后可以从归档商机中撤回。'
                  : '商机会移入已归档列表。点错后可以从归档商机中撤回并继续推进。'}
              </Typography>
              {pendingStage === '输单' && (
                <TextField label="输单原因" value={lostReason} onChange={(e) => setLostReason(e.target.value)} fullWidth size="small" sx={{ mt: 2 }} />
              )}
            </DialogContent>
            <DialogActions>
              <Button variant="contained" color={pendingStage === '赢单' ? 'primary' : 'warning'} onClick={() => commitStage(pendingStage)}>
                确认{pendingStage}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default Opportunities;
