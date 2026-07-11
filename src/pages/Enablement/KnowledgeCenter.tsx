import React, { useEffect, useState } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import CloseIcon from '@mui/icons-material/Close';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { enablementApi } from '../../api';
import { moduleTokens } from '../../shared/components/ModuleShell';
import useEnablementStore from '../../store/useEnablementStore';
import type { KnowledgeDocumentDetailDto } from '../../types/enablement';

const formatTime = (value?: string) => {
  if (!value) return '未设置';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未设置' : new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
};

const KnowledgeCenter: React.FC = () => {
  const theme = useTheme();
  const mobileDetail = useMediaQuery(theme.breakpoints.down('sm'));
  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<KnowledgeDocumentDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const { knowledge, searchHits, loading, error, loadKnowledge, searchKnowledge } = useEnablementStore();

  useEffect(() => {
    void loadKnowledge();
  }, [loadKnowledge]);

  const runSearch = () => {
    const nextQuery = query.trim();
    if (!nextQuery) {
      setHasSearched(false);
      return;
    }
    setHasSearched(true);
    void searchKnowledge(nextQuery);
  };

  const rows = hasSearched ? searchHits : knowledge;

  const openKnowledge = async (documentId: string) => {
    setDetailOpen(true);
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    try {
      const result = await enablementApi.getKnowledge(documentId);
      if (result.code === 0) setDetail(result.data);
      else setDetailError(result.message || '知识详情加载失败');
    } catch (detailRequestError) {
      setDetailError(detailRequestError instanceof Error ? detailRequestError.message : '知识详情加载失败');
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: { xs: 2, md: 2.5 }, borderColor: '#C7DAFF', bgcolor: '#F8FBFF' }}>
        <Typography variant="h6" sx={{ color: moduleTokens.ink, mb: 0.5 }}>先找当前生效的答案</Typography>
        <Typography variant="body2" sx={{ color: moduleTokens.muted, mb: 1.5 }}>
          搜索制度名称、业务关键词或正文标题。结果只包含当前账号可见且正在生效的版本。
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField
            fullWidth
            label="搜索公司知识"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') runSearch(); }}
            placeholder="例如：客户交付验收、差旅报销"
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            }}
          />
          <Button variant="contained" onClick={runSearch} disabled={loading || !query.trim()} sx={{ minWidth: 96 }}>
            搜索
          </Button>
          {hasSearched ? (
            <Button variant="outlined" onClick={() => { setQuery(''); setHasSearched(false); }}>查看全部</Button>
          ) : null}
        </Stack>
      </Paper>

      {error ? <Alert severity="error">{error}。请检查网络后重试。</Alert> : null}

      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="subtitle1">{hasSearched ? `“${query.trim()}”的搜索结果` : '当前企业知识'}</Typography>
          <Typography variant="body2" color="text.secondary">
            {hasSearched ? `按相关度返回 ${searchHits.length} 条正文片段` : `共 ${knowledge.length} 份正在生效的知识`}
          </Typography>
        </Box>
        {loading ? <CircularProgress size={22} aria-label="正在加载知识" /> : null}
      </Stack>

      {!loading && rows.length === 0 ? (
        <Paper sx={{ py: 6, px: 2, textAlign: 'center', color: moduleTokens.muted }}>
          <MenuBookOutlinedIcon sx={{ fontSize: 36, color: '#98A2B3', mb: 1 }} />
          <Typography variant="subtitle1" color="text.primary">
            {hasSearched ? '没有找到匹配内容' : '还没有正在生效的企业知识'}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {hasSearched ? '换一个更短的关键词，或返回查看全部知识。' : '发布首个审核通过的版本后，会显示在这里。'}
          </Typography>
        </Paper>
      ) : null}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
        {hasSearched
          ? searchHits.map((hit) => (
            <Paper
              key={`${hit.documentId}-${hit.versionId}-${hit.heading || ''}`}
              component="button"
              type="button"
              onClick={() => void openKnowledge(hit.documentId)}
              aria-label={`查看知识：${hit.title}`}
              sx={{ p: 2.25, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', '&:hover': { borderColor: '#8FB2F7', bgcolor: '#FBFDFF' }, '&:focus-visible': { outline: `3px solid ${moduleTokens.blue}`, outlineOffset: 2 } }}
            >
              <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1" sx={{ color: moduleTokens.ink }}>{hit.title}</Typography>
                  <Typography variant="body2" sx={{ color: moduleTokens.blue, fontWeight: 800, mt: 0.25 }}>
                    {hit.heading || '正文'}
                  </Typography>
                </Box>
                <Chip size="small" label={`v${hit.versionNumber}`} variant="outlined" />
              </Stack>
              <Typography variant="body1" sx={{ mt: 1.25, color: moduleTokens.muted }}>{hit.excerpt}</Typography>
              <Stack direction="row" spacing={1.5} sx={{ mt: 1.5, color: '#98A2B3' }}>
                <Typography variant="caption">匹配分 {hit.score}</Typography>
                <Typography variant="caption">更新于 {formatTime(hit.updatedAt)}</Typography>
              </Stack>
            </Paper>
          ))
          : knowledge.map((document) => (
            <Paper
              key={document.id}
              component="button"
              type="button"
              onClick={() => void openKnowledge(document.id)}
              aria-label={`查看知识：${document.title}`}
              sx={{ p: 2.25, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', '&:hover': { borderColor: '#8FB2F7', bgcolor: '#FBFDFF' }, '&:focus-visible': { outline: `3px solid ${moduleTokens.blue}`, outlineOffset: 2 } }}
            >
              <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1" sx={{ color: moduleTokens.ink }}>{document.title}</Typography>
                  <Typography variant="caption" sx={{ color: moduleTokens.blue, fontWeight: 800 }}>{document.category}</Typography>
                </Box>
                <Chip size="small" label={`v${document.currentVersion?.versionNumber || '—'}`} sx={{ bgcolor: '#ECFDF3', color: '#0D5F41' }} />
              </Stack>
              <Typography variant="body1" sx={{ mt: 1.25, color: moduleTokens.muted }}>{document.summary}</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.25, sm: 2 }} sx={{ mt: 1.5, color: '#98A2B3' }}>
                <Typography variant="caption">生效时间 {formatTime(document.currentVersion?.effectiveAt || document.currentVersion?.publishedAt)}</Typography>
                <Typography variant="caption">更新时间 {formatTime(document.updatedAt)}</Typography>
              </Stack>
            </Paper>
          ))}
      </Box>

      <Dialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        fullScreen={mobileDetail}
        fullWidth
        maxWidth="md"
        aria-labelledby="knowledge-detail-title"
      >
        <DialogTitle id="knowledge-detail-title" sx={{ pr: 7 }}>
          {detail?.title || '知识详情'}
          <IconButton aria-label="关闭知识详情" onClick={() => setDetailOpen(false)} sx={{ position: 'absolute', right: 12, top: 10 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: { xs: 2, md: 3 } }}>
          {detailLoading ? (
            <Stack alignItems="center" spacing={1} sx={{ py: 8 }}><CircularProgress /><Typography variant="body2">正在加载当前版本…</Typography></Stack>
          ) : null}
          {detailError ? <Alert severity="error">{detailError}。请关闭后重试。</Alert> : null}
          {detail ? (
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip label={detail.category} size="small" color="primary" variant="outlined" />
                <Chip label={`v${detail.currentVersion?.versionNumber || '—'}`} size="small" />
                <Chip label={detail.sensitivity === 'INTERNAL' ? '公司内部' : '受限知识'} size="small" />
              </Stack>
              <Typography variant="body1" color="text.secondary">{detail.summary}</Typography>
              {detail.currentVersion?.sourceReference ? (
                <Alert severity="info" icon={false}>来源说明：{detail.currentVersion.sourceReference}</Alert>
              ) : null}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.25, sm: 2 }}>
                <Typography variant="caption" color="text.secondary">生效时间 {formatTime(detail.currentVersion?.effectiveAt || detail.currentVersion?.publishedAt)}</Typography>
                <Typography variant="caption" color="text.secondary">更新时间 {formatTime(detail.updatedAt)}</Typography>
              </Stack>
              <Box
                component="pre"
                sx={{ m: 0, p: { xs: 1.5, md: 2.5 }, border: `1px solid ${moduleTokens.line}`, borderRadius: 1, bgcolor: '#F8FAFC', color: moduleTokens.ink, fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace', fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
              >
                {detail.contentText}
              </Box>
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions><Button onClick={() => setDetailOpen(false)}>关闭</Button></DialogActions>
      </Dialog>
    </Stack>
  );
};

export default KnowledgeCenter;
