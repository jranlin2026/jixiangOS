import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Divider, IconButton, List, ListItemButton, ListItemText, Paper, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { enterpriseBrainApi } from '../../api';
import type { EnterpriseAiConversation, PositionStandardDetail } from '../../types/enterpriseBrain';
import { moduleTokens } from '../../shared/components/ModuleShell';

const AIAssistant: React.FC = () => {
  const [conversations, setConversations] = useState<EnterpriseAiConversation[]>([]);
  const [current, setCurrent] = useState<EnterpriseAiConversation | null>(null);
  const [standard, setStandard] = useState<PositionStandardDetail | null>(null);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadConversations = async () => { const response = await enterpriseBrainApi.listConversations(); if (response.code === 0) setConversations(response.data); };
  useEffect(() => { void loadConversations(); enterpriseBrainApi.getMyStandard().then((response) => { if (response.code === 0) setStandard(response.data); }); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [current?.messages.length, loading]);
  const openConversation = async (id: string) => { const response = await enterpriseBrainApi.getConversation(id); if (response.code === 0) setCurrent(response.data); };
  const ask = async (prompt?: string) => {
    const text = (prompt || question).trim(); if (!text || loading) return;
    setLoading(true); setNotice('');
    const response = await enterpriseBrainApi.ask({ conversationId: current?.id, question: text });
    if (response.code === 0) { setQuestion(''); await loadConversations(); await openConversation(response.data.conversationId); if (response.data.outcome === 'NO_EVIDENCE') setNotice('该问题没有找到当前有效的公司知识，已自动登记为知识缺口。'); }
    else setNotice(response.message);
    setLoading(false);
  };
  const remove = async (id: string) => { const response = await enterpriseBrainApi.deleteConversation(id); if (response.code === 0) { if (current?.id === id) setCurrent(null); await loadConversations(); } };

  return <Box sx={{ height: 'calc(100vh - 56px)', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '280px minmax(0, 1fr) 260px' }, bgcolor: moduleTokens.page, overflow: 'hidden' }}>
    <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', bgcolor: '#fff', borderRight: `1px solid ${moduleTokens.line}`, minHeight: 0 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 2 }}><Box><Typography sx={{ fontWeight: 900 }}>AI岗位助手</Typography><Typography variant="caption" color="text.secondary">只依据当前有效公司知识</Typography></Box><IconButton onClick={() => setCurrent(null)}><AddIcon /></IconButton></Stack><Divider />
      <List sx={{ overflow: 'auto' }}>{conversations.map((item) => <ListItemButton key={item.id} selected={item.id === current?.id} onClick={() => void openConversation(item.id)}><ListItemText primary={item.title} secondary={new Date(item.updatedAt).toLocaleString()} primaryTypographyProps={{ noWrap: true, fontWeight: 700 }} /><IconButton size="small" onClick={(event) => { event.stopPropagation(); void remove(item.id); }}><DeleteIcon fontSize="small" /></IconButton></ListItemButton>)}</List>
    </Box>
    <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: { xs: 2, md: 3 }, py: 2, bgcolor: '#fff', borderBottom: `1px solid ${moduleTokens.line}` }}><SmartToyIcon color="primary" /><Box><Typography variant="h6" sx={{ fontWeight: 900 }}>{current?.title || '新对话'}</Typography><Typography variant="caption" color="text.secondary">系统会记录引用版本和问答审计；无依据时不会编造标准答案。</Typography></Box></Stack>
      <Box sx={{ flex: 1, overflow: 'auto', p: { xs: 2, md: 3 } }}>
        {!current?.messages.length ? <Box sx={{ maxWidth: 680, mx: 'auto', mt: 8, textAlign: 'center' }}><SmartToyIcon sx={{ fontSize: 52, color: '#1E6BFF' }} /><Typography variant="h5" sx={{ fontWeight: 900, mt: 1 }}>先问工作问题，不用翻资料</Typography><Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>我知道你的正式岗位，只会从你有权查看的当前知识版本中找答案。</Typography><Stack direction="row" justifyContent="center" gap={1} flexWrap="wrap">{['客户提出价格异议怎么回应？', '我今天应该先完成哪些动作？', '这个流程的标准步骤是什么？'].map((item) => <Chip key={item} clickable variant="outlined" label={item} onClick={() => void ask(item)} />)}</Stack></Box> : <Stack spacing={2} sx={{ maxWidth: 840, mx: 'auto' }}>{current.messages.map((message) => <Box key={message.id} sx={{ alignSelf: message.role === 'USER' ? 'flex-end' : 'stretch', maxWidth: message.role === 'USER' ? '78%' : '100%' }}><Paper elevation={0} sx={{ p: 2, whiteSpace: 'pre-wrap', lineHeight: 1.8, bgcolor: message.role === 'USER' ? '#1E6BFF' : '#fff', color: message.role === 'USER' ? '#fff' : moduleTokens.ink, border: message.role === 'USER' ? 0 : `1px solid ${moduleTokens.line}` }}>{message.content}</Paper>{message.role === 'ASSISTANT' && message.citations.length > 0 && <Stack direction="row" gap={0.75} flexWrap="wrap" sx={{ mt: 1 }}>{message.citations.map((citation) => <Chip key={citation.versionId} size="small" label={`${citation.title} V${citation.versionNumber}`} title={citation.excerpt} />)}</Stack>}</Box>)}<div ref={endRef} /></Stack>}
      </Box>
      <Box sx={{ p: 2, bgcolor: '#fff', borderTop: `1px solid ${moduleTokens.line}` }}>{notice && <Alert severity={notice.includes('知识缺口') ? 'warning' : 'error'} sx={{ mb: 1 }}>{notice}</Alert>}<Stack direction="row" spacing={1} sx={{ maxWidth: 840, mx: 'auto' }}><TextField fullWidth multiline maxRows={5} placeholder="输入你在工作中遇到的问题…" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(); } }} /><Button variant="contained" disabled={loading || !question.trim()} onClick={() => void ask()}>{loading ? <CircularProgress size={22} color="inherit" /> : <SendIcon />}</Button></Stack></Box>
    </Box>
    <Box sx={{ display: { xs: 'none', md: 'block' }, bgcolor: '#fff', borderLeft: `1px solid ${moduleTokens.line}`, p: 2, overflow: 'auto' }}><Typography sx={{ fontWeight: 900 }}>当前岗位上下文</Typography>{standard ? <Stack spacing={1.5} sx={{ mt: 2 }}><Box><Typography variant="caption" color="text.secondary">岗位</Typography><Typography sx={{ fontWeight: 800 }}>{standard.positionName}</Typography></Box><Box><Typography variant="caption" color="text.secondary">使命</Typography><Typography variant="body2" sx={{ lineHeight: 1.7 }}>{standard.version.mission}</Typography></Box><Box><Typography variant="caption" color="text.secondary">当前标准</Typography><Typography variant="body2">{standard.title} V{standard.version.versionNumber}</Typography></Box><Box><Typography variant="caption" color="text.secondary">知识依据</Typography><Typography variant="body2">{standard.resources.length} 份已关联</Typography></Box></Stack> : <Alert severity="info" sx={{ mt: 2 }}>当前岗位尚未发布标准；AI仍可检索你有权查看的公司知识。</Alert>}<Divider sx={{ my: 2 }} /><Typography variant="caption" color="text.secondary">安全规则</Typography><Typography variant="body2" sx={{ mt: 0.5, lineHeight: 1.7 }}>合同、退款、财务等高风险事项会提示人工确认。所有答案保留引用与审计记录。</Typography></Box>
  </Box>;
};

export default AIAssistant;
