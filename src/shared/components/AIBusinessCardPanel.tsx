import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Link,
  List,
  ListItem,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { AIBusinessCard } from '../../types/aiCard';
import { formatDate } from '../utils/formatters';

interface AIBusinessCardPanelProps {
  card: AIBusinessCard | null;
  loading: boolean;
  onGenerate?: () => void;
}

const SectionList: React.FC<{ title: string; items?: string[] }> = ({ title, items = [] }) => (
  <Box>
    <Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>{title}</Typography>
    {items.length ? (
      <List dense sx={{ py: 0 }}>
        {items.map((item, index) => (
          <ListItem key={`${title}-${index}`} sx={{ py: 0.25, pl: 0 }}>
            <ListItemText primary={item} primaryTypographyProps={{ variant: 'body2', color: '#4b5563' }} />
          </ListItem>
        ))}
      </List>
    ) : (
      <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无信息</Typography>
    )}
  </Box>
);

function confidenceLabel(confidence?: number): string {
  if (typeof confidence !== 'number') return '置信度待确认';
  return `置信度 ${Math.round(Math.max(0, Math.min(1, confidence)) * 100)}%`;
}

async function copyTalkTracks(card: AIBusinessCard): Promise<void> {
  const text = card.talkTracks.join('\n');
  if (!text) return;
  await navigator.clipboard?.writeText(text);
}

const AIBusinessCardPanel: React.FC<AIBusinessCardPanelProps> = ({ card, loading, onGenerate }) => (
  <Box sx={{ mb: 3 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
      <Typography variant="subtitle2" sx={{ color: '#334155', display: 'flex', alignItems: 'center', gap: 0.5, fontWeight: 700 }}>
        <AutoAwesomeIcon fontSize="small" /> AI 客户情报名片
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {card && (
          <Tooltip title="复制全部沟通话术">
            <Button variant="outlined" size="small" onClick={() => copyTalkTracks(card)} startIcon={<ContentCopyIcon />}>
              复制话术
            </Button>
          </Tooltip>
        )}
        {onGenerate && (
          <Button variant="contained" size="small" onClick={onGenerate} disabled={loading} startIcon={<AutoAwesomeIcon />}>
            {card ? '重新联网生成' : '联网生成 AI 名片'}
          </Button>
        )}
      </Box>
    </Box>

    {!card ? (
      <Box sx={{ p: 2, bgcolor: '#f8fafc', border: '1px dashed #d1d5db', borderRadius: 1 }}>
        <Typography variant="body2" sx={{ color: '#6b7280' }}>
          系统会基于客户姓名、公司、手机、微信、行业、城市和备注等资料联网搜集公开信息，再生成客户画像、需求判断、产品匹配、沟通话术和风险提醒。
        </Typography>
      </Box>
    ) : (
      <Box sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1.5, bgcolor: '#fff' }}>
        {card.isFallback && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            当前为本地兜底名片；在系统设置中配置 DeepSeek API Key 后可生成 AI 联网情报结果。
          </Alert>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{card.subjectName}</Typography>
          {card.company && <Chip label={card.company} size="small" />}
          {card.industry && <Chip label={card.industry} size="small" variant="outlined" />}
          {card.city && <Chip label={card.city} size="small" variant="outlined" />}
          <Chip label={confidenceLabel(card.confidence)} size="small" color={card.confidence && card.confidence >= 0.65 ? 'success' : 'default'} variant="outlined" />
        </Box>
        <Typography variant="body2" sx={{ color: '#374151', mb: 1.5, lineHeight: 1.7 }}>{card.externalSummary}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <SectionList title="公开事实" items={card.publicFacts} />
          <SectionList title="需求推断" items={card.demandInsights} />
          <SectionList title="产品匹配" items={card.matchedProducts} />
          <SectionList title="沟通话术" items={card.talkTracks} />
          <SectionList title="风险提醒" items={card.riskAlerts} />
          <SectionList title="搜索关键词" items={card.searchQueries} />
        </Box>
        <Divider sx={{ my: 1.5 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ maxWidth: 760 }}>
            <Typography variant="caption" sx={{ color: '#9ca3af' }}>信息来源</Typography>
            {card.sources.length ? card.sources.map((source, index) => (
              <Typography key={`${source.url}-${index}`} variant="body2" sx={{ mt: 0.25 }}>
                <Link href={source.url.startsWith('local://') ? undefined : source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </Link>
                {source.summary ? <Typography component="span" variant="caption" sx={{ ml: 1, color: '#64748b' }}>{source.summary}</Typography> : null}
              </Typography>
            )) : (
              <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无公开来源</Typography>
            )}
          </Box>
          <Typography variant="caption" sx={{ color: '#9ca3af' }}>生成时间：{formatDate(card.generatedAt, 'MM-dd HH:mm')}</Typography>
        </Box>
      </Box>
    )}
  </Box>
);

export default AIBusinessCardPanel;
