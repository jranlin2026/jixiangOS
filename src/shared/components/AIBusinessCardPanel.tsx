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
  Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import type { AIBusinessCard } from '../../types/aiCard';
import { formatDate } from '../utils/formatters';

interface AIBusinessCardPanelProps {
  card: AIBusinessCard | null;
  loading: boolean;
  onGenerate: () => void;
}

const SectionList: React.FC<{ title: string; items: string[] }> = ({ title, items }) => (
  <Box>
    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>{title}</Typography>
    <List dense sx={{ py: 0 }}>
      {items.map((item, index) => (
        <ListItem key={`${title}-${index}`} sx={{ py: 0, pl: 0 }}>
          <ListItemText primary={item} primaryTypographyProps={{ variant: 'body2', color: '#4b5563' }} />
        </ListItem>
      ))}
    </List>
  </Box>
);

const AIBusinessCardPanel: React.FC<AIBusinessCardPanelProps> = ({ card, loading, onGenerate }) => (
  <Box sx={{ mb: 3 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
      <Typography variant="subtitle2" sx={{ color: '#6b7280', display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <AutoAwesomeIcon fontSize="small" /> AI 名片
      </Typography>
      <Button variant="outlined" size="small" onClick={onGenerate} disabled={loading} startIcon={<AutoAwesomeIcon />}>
        {card ? '重新生成' : '一键生成 AI 名片'}
      </Button>
    </Box>

    {!card ? (
      <Box sx={{ p: 2, bgcolor: '#f8fafc', border: '1px dashed #d1d5db', borderRadius: 1 }}>
        <Typography variant="body2" sx={{ color: '#6b7280' }}>
          生成后会展示外部信息摘要、需求推断、产品匹配、沟通话术和风险提醒。
        </Typography>
      </Box>
    ) : (
      <Box sx={{ p: 2, border: '1px solid #e5e7eb', borderRadius: 1.5, bgcolor: '#fff' }}>
        {card.isFallback && (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            当前为本地兜底名片；配置 OPENAI_API_KEY 并启动本地代理后可生成联网结果。
          </Alert>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{card.subjectName}</Typography>
          {card.company && <Chip label={card.company} size="small" />}
          {card.industry && <Chip label={card.industry} size="small" variant="outlined" />}
          {card.city && <Chip label={card.city} size="small" variant="outlined" />}
        </Box>
        <Typography variant="body2" sx={{ color: '#374151', mb: 1.5 }}>{card.externalSummary}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
          <SectionList title="需求推断" items={card.demandInsights} />
          <SectionList title="产品匹配" items={card.matchedProducts} />
          <SectionList title="建议话术" items={card.talkTracks} />
          <SectionList title="风险提醒" items={card.riskAlerts} />
        </Box>
        <Divider sx={{ my: 1.5 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="caption" sx={{ color: '#9ca3af' }}>来源</Typography>
            {card.sources.map((source, index) => (
              <Typography key={`${source.url}-${index}`} variant="body2">
                <Link href={source.url.startsWith('local://') ? undefined : source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </Link>
              </Typography>
            ))}
          </Box>
          <Typography variant="caption" sx={{ color: '#9ca3af' }}>生成时间: {formatDate(card.generatedAt, 'MM-dd HH:mm')}</Typography>
        </Box>
      </Box>
    )}
  </Box>
);

export default AIBusinessCardPanel;
