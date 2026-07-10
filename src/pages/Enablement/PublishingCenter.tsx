import React, { useEffect, useMemo, useState } from 'react';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { enablementApi } from '../../api';
import { moduleTokens } from '../../shared/components/ModuleShell';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import useAuthStore from '../../store/useAuthStore';
import useEnablementStore from '../../store/useEnablementStore';
import { isMarkdownFile } from './utils';
import type {
  KnowledgeSensitivity,
  KnowledgeVersionStatus,
  KnowledgeWorkflowItemDto,
  VisibilitySubjectType,
} from '../../types/enablement';

const statusMeta: Record<KnowledgeVersionStatus, { label: string; color: string; bg: string }> = {
  DRAFT: { label: '草稿', color: '#475467', bg: '#F2F4F7' },
  PENDING_REVIEW: { label: '待审核', color: '#8A4B05', bg: '#FFFAEB' },
  APPROVED: { label: '审核通过', color: '#175CD3', bg: '#EFF8FF' },
  REJECTED: { label: '已驳回', color: '#B42318', bg: '#FEF3F2' },
  CURRENT: { label: '当前生效', color: '#067647', bg: '#ECFDF3' },
  RETIRED: { label: '已下线', color: '#475467', bg: '#F2F4F7' },
  PUBLISH_FAILED: { label: '发布失败', color: '#B42318', bg: '#FEF3F2' },
};

const lifecycleStages = [
  { key: 'DRAFT', label: '草稿' },
  { key: 'PENDING_REVIEW', label: '待审核' },
  { key: 'APPROVED', label: '已通过' },
  { key: 'CURRENT', label: '当前生效' },
] as const;

const stageIndex: Record<KnowledgeVersionStatus, number> = {
  DRAFT: 0,
  REJECTED: 0,
  PENDING_REVIEW: 1,
  APPROVED: 2,
  PUBLISH_FAILED: 2,
  CURRENT: 3,
  RETIRED: 3,
};

const LifecycleRail: React.FC<{ status: KnowledgeVersionStatus }> = ({ status }) => {
  const activeIndex = stageIndex[status];
  return (
    <Box aria-label={`版本状态：${statusMeta[status].label}`} sx={{ mt: 1.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {lifecycleStages.map((stage, index) => {
          const reached = index <= activeIndex;
          const active = index === activeIndex;
          return (
            <Box key={stage.key} sx={{ position: 'relative', textAlign: 'center', minWidth: 0 }}>
              {index > 0 ? (
                <Box sx={{ position: 'absolute', height: 2, bgcolor: reached ? moduleTokens.blue : '#DDE4EC', left: 0, right: '50%', top: 6 }} />
              ) : null}
              {index < lifecycleStages.length - 1 ? (
                <Box sx={{ position: 'absolute', height: 2, bgcolor: index < activeIndex ? moduleTokens.blue : '#DDE4EC', left: '50%', right: 0, top: 6 }} />
              ) : null}
              <Box sx={{ position: 'relative', width: 14, height: 14, borderRadius: '50%', mx: 'auto', bgcolor: reached ? moduleTokens.blue : '#FFF', border: `2px solid ${reached ? moduleTokens.blue : '#B9C7D8'}`, boxShadow: active ? '0 0 0 3px #DDEBFF' : 'none' }} />
              <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: active ? moduleTokens.ink : moduleTokens.muted, fontWeight: active ? 800 : 600, whiteSpace: 'nowrap' }}>
                {stage.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
      {status === 'REJECTED' || status === 'PUBLISH_FAILED' || status === 'RETIRED' ? (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: statusMeta[status].color, fontWeight: 800 }}>
          {statusMeta[status].label}，请按当前状态处理
        </Typography>
      ) : null}
    </Box>
  );
};

type DraftForm = {
  slug: string;
  title: string;
  category: string;
  summary: string;
  ownerDepartmentId: string;
  sensitivity: KnowledgeSensitivity;
  visibilityType: VisibilitySubjectType;
  effectiveAt: string;
};

const emptyDraft = (departmentId = ''): DraftForm => ({
  slug: '',
  title: '',
  category: '',
  summary: '',
  ownerDepartmentId: departmentId,
  sensitivity: 'INTERNAL',
  visibilityType: 'ALL_EMPLOYEES',
  effectiveAt: '',
});

type WorkflowCardProps = {
  item: KnowledgeWorkflowItemDto;
  kind: 'review' | 'manage';
  comment: string;
  actionPending: boolean;
  canReviewPermission: boolean;
  canPublishPermission: boolean;
  onCommentChange: (versionId: string, value: string) => void;
  onReview: (item: KnowledgeWorkflowItemDto, decision: 'APPROVE' | 'REJECT', comment: string) => void;
  onPublish: (item: KnowledgeWorkflowItemDto) => void;
  onSubmit: (item: KnowledgeWorkflowItemDto) => void;
  onUploadVersion: (documentId: string, file: File) => void;
  onInvalidFile: () => void;
};

const WorkflowCard: React.FC<WorkflowCardProps> = ({
  item,
  kind,
  comment,
  actionPending,
  canReviewPermission,
  canPublishPermission,
  onCommentChange,
  onReview,
  onPublish,
  onSubmit,
  onUploadVersion,
  onInvalidFile,
}) => {
  const { document, version } = item;
  const canSubmit = ['DRAFT', 'REJECTED'].includes(version.status) && canPublishPermission;
  const canReview = version.status === 'PENDING_REVIEW' && canReviewPermission;
  const canPublish = version.status === 'APPROVED' && canPublishPermission;
  return (
    <Paper sx={{ p: 2, contentVisibility: 'auto', containIntrinsicSize: '0 320px' }}>
      <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1">{document.title}</Typography>
          <Typography variant="caption" color="text.secondary">{document.category} · v{version.versionNumber} · {version.sourceFileName}</Typography>
        </Box>
        <Chip size="small" label={statusMeta[version.status].label} sx={{ color: statusMeta[version.status].color, bgcolor: statusMeta[version.status].bg }} />
      </Stack>
      <LifecycleRail status={version.status} />
      {kind === 'review' ? (
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" sx={{ color: moduleTokens.muted, fontWeight: 800 }}>待审核 Markdown 正文</Typography>
          <Box
            component="pre"
            tabIndex={0}
            aria-label={`${document.title} 待审核正文`}
            sx={{ mt: 0.75, mb: 0, p: 1.5, maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', border: `1px solid ${moduleTokens.line}`, borderRadius: 1, bgcolor: '#F8FAFC', color: moduleTokens.ink, fontFamily: '"SFMono-Regular", Consolas, monospace', fontSize: 12, lineHeight: 1.7 }}
          >
            {item.contentText || '正文为空'}
          </Box>
        </Box>
      ) : null}
      {kind === 'review' && canReview ? (
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          <TextField
            label="审核意见"
            value={comment}
            onChange={(event) => onCommentChange(version.id, event.target.value)}
            placeholder="通过可选填；驳回时请说明需要修改的内容"
            multiline
            minRows={2}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="contained" onClick={() => onReview(item, 'APPROVE', comment)} disabled={actionPending}>审核通过</Button>
            <Button color="error" variant="outlined" onClick={() => onReview(item, 'REJECT', comment)} disabled={actionPending || !comment.trim()}>驳回修改</Button>
          </Stack>
        </Stack>
      ) : null}
      {kind === 'manage' && (canSubmit || canPublish) ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
          {canSubmit ? (
            <Button variant="contained" onClick={() => onSubmit(item)} disabled={actionPending}>
              {version.status === 'REJECTED' ? '重新提交审核' : '提交审核'}
            </Button>
          ) : null}
          {canPublish ? <Button variant="contained" onClick={() => onPublish(item)} disabled={actionPending}>正式发布</Button> : null}
          {version.status === 'REJECTED' ? (
            <Button component="label" variant="outlined" disabled={actionPending}>
              上传修订版本
              <input
                hidden
                type="file"
                accept=".md,text/markdown"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file && isMarkdownFile(file)) onUploadVersion(document.id, file);
                  else if (file) onInvalidFile();
                  event.target.value = '';
                }}
              />
            </Button>
          ) : null}
        </Stack>
      ) : null}
    </Paper>
  );
};

const PublishingCenter: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const {
    knowledge,
    reviewQueue,
    publicationQueue,
    loading,
    error,
    loadKnowledge,
    loadReviewQueue,
    loadPublicationQueue,
  } = useEnablementStore();
  const canRead = hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE);
  const canReviewPermission = hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_REVIEW, 'write');
  const canPublishPermission = hasPermission(currentUser, PERMISSION_KEYS.ENABLEMENT_PUBLISH, 'write');
  const [form, setForm] = useState<DraftForm>(() => emptyDraft(currentUser?.departmentId));
  const [draftFile, setDraftFile] = useState<File | null>(null);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [actionPending, setActionPending] = useState('');
  const [notice, setNotice] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);

  const refresh = async () => {
    const requests: Array<Promise<void>> = [];
    if (canRead) requests.push(loadKnowledge());
    if (canReviewPermission) requests.push(loadReviewQueue());
    if (canPublishPermission) requests.push(loadPublicationQueue());
    await Promise.all(requests);
  };

  useEffect(() => {
    void refresh();
    // Permission-derived refresh is intentionally rerun only when the authenticated scope changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPublishPermission, canRead, canReviewPermission]);

  useEffect(() => {
    if (!form.ownerDepartmentId && currentUser?.departmentId) {
      setForm((current) => ({ ...current, ownerDepartmentId: currentUser.departmentId || '' }));
    }
  }, [currentUser?.departmentId, form.ownerDepartmentId]);

  const queueCount = reviewQueue.length + publicationQueue.length;
  const currentItems = useMemo(() => knowledge.filter((item) => Boolean(item.currentVersion)), [knowledge]);
  const draftQueue = useMemo(() => publicationQueue.filter((item) => ['DRAFT', 'REJECTED'].includes(item.version.status)), [publicationQueue]);
  const approvedQueue = useMemo(() => publicationQueue.filter((item) => item.version.status === 'APPROVED'), [publicationQueue]);

  const runAction = async (key: string, action: () => Promise<{ code: number; message: string }>, successMessage: string) => {
    setActionPending(key);
    setNotice(null);
    try {
      const result = await action();
      setNotice(result.code === 0
        ? { severity: 'success', message: successMessage }
        : { severity: 'error', message: result.message || '操作未完成，请刷新后重试' });
    } catch (actionError) {
      setNotice({ severity: 'error', message: actionError instanceof Error ? actionError.message : '知识服务暂时不可用' });
    } finally {
      await refresh();
      setActionPending('');
    }
  };

  const createDraft = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draftFile) {
      setNotice({ severity: 'error', message: '请选择一个 Markdown 文件' });
      return;
    }
    if (!isMarkdownFile(draftFile)) {
      setNotice({ severity: 'error', message: '所选文件不是有效的 Markdown 文件，请上传 .md 文件' });
      return;
    }
    if (!form.title.trim() || !form.category.trim() || !form.summary.trim() || !form.ownerDepartmentId.trim()) {
      setNotice({ severity: 'error', message: '请完整填写标题、分类、摘要和归属部门' });
      return;
    }

    setActionPending('create-draft');
    setNotice(null);
    try {
      const result = await enablementApi.createDraft({
        slug: form.slug.trim() || form.title.trim().replace(/\s+/g, '-').toLowerCase(),
        title: form.title.trim(),
        category: form.category.trim(),
        summary: form.summary.trim(),
        ownerDepartmentId: form.ownerDepartmentId.trim(),
        sensitivity: form.sensitivity,
        visibility: [{
          subjectType: form.visibilityType,
          ...(form.visibilityType === 'DEPARTMENT' ? { subjectId: form.ownerDepartmentId.trim() } : {}),
        }],
        sourceFileName: draftFile.name,
        markdown: await draftFile.text(),
        ...(form.effectiveAt ? { effectiveAt: new Date(form.effectiveAt).toISOString() } : {}),
      });
      if (result.code === 0) {
        setForm(emptyDraft(currentUser?.departmentId));
        setDraftFile(null);
        setNotice({ severity: 'success', message: '草稿已创建，可提交审核' });
      } else {
        setNotice({ severity: 'error', message: result.message });
      }
    } catch (actionError) {
      setNotice({ severity: 'error', message: actionError instanceof Error ? actionError.message : '草稿创建失败' });
    } finally {
      await refresh();
      setActionPending('');
    }
  };

  const uploadVersion = async (documentId: string, file: File) => {
    if (!isMarkdownFile(file)) {
      setNotice({ severity: 'error', message: '所选文件不是有效的 Markdown 文件，请上传 .md 文件' });
      return;
    }
    setActionPending(`version-${documentId}`);
    setNotice(null);
    try {
      const result = await enablementApi.createVersion(documentId, {
        sourceFileName: file.name,
        markdown: await file.text(),
      });
      if (result.code === 0) {
        setNotice({ severity: 'success', message: '新版本草稿已创建，原版本保持不变' });
      } else {
        setNotice({ severity: 'error', message: result.message });
      }
    } catch (actionError) {
      setNotice({ severity: 'error', message: actionError instanceof Error ? actionError.message : '新版本上传失败' });
    } finally {
      await refresh();
      setActionPending('');
    }
  };

  const invalidMarkdown = () => setNotice({ severity: 'error', message: '所选文件不是有效的 Markdown 文件，请上传 .md 文件' });
  const workflowCardProps = (item: KnowledgeWorkflowItemDto) => ({
    item,
    comment: reviewComments[item.version.id] || '',
    actionPending: Boolean(actionPending),
    canReviewPermission,
    canPublishPermission,
    onCommentChange: (versionId: string, value: string) => setReviewComments((current) => ({ ...current, [versionId]: value })),
    onReview: (workflowItem: KnowledgeWorkflowItemDto, decision: 'APPROVE' | 'REJECT', comment: string) => void runAction(
      `${decision.toLowerCase()}-${workflowItem.version.id}`,
      () => enablementApi.reviewVersion(workflowItem.version.id, { decision, comment: comment.trim() || undefined }),
      decision === 'APPROVE' ? '审核已通过' : '版本已驳回',
    ),
    onPublish: (workflowItem: KnowledgeWorkflowItemDto) => void runAction(`publish-${workflowItem.version.id}`, () => enablementApi.publishVersion(workflowItem.version.id), '版本已正式发布'),
    onSubmit: (workflowItem: KnowledgeWorkflowItemDto) => void runAction(`submit-${workflowItem.version.id}`, () => enablementApi.submitForReview(workflowItem.version.id), '版本已提交审核'),
    onUploadVersion: (documentId: string, file: File) => void uploadVersion(documentId, file),
    onInvalidFile: invalidMarkdown,
  });

  return (
    <Stack spacing={2}>
      {notice ? <Alert severity={notice.severity} onClose={() => setNotice(null)}>{notice.message}</Alert> : null}
      {error ? <Alert severity="error">{error}。队列可能不是最新状态，请重试。</Alert> : null}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: canPublishPermission ? 'minmax(320px, 0.8fr) minmax(0, 1.2fr)' : '1fr' }, gap: 2, alignItems: 'start' }}>
        {canPublishPermission ? (
          <Paper component="form" onSubmit={createDraft} sx={{ p: { xs: 2, md: 2.5 }, position: { xl: 'sticky' }, top: { xl: 16 } }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
              <AddIcon color="primary" />
              <Typography variant="h6">创建知识草稿</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              导入Markdown后生成不可变版本。后续修改请上传新版本，不会覆盖已发布内容。
            </Typography>
            <Stack spacing={1.5}>
              <Button component="label" variant="outlined" startIcon={<CloudUploadOutlinedIcon />} sx={{ justifyContent: 'flex-start' }}>
                {draftFile ? draftFile.name : '导入Markdown'}
                <input
                  hidden
                  type="file"
                  accept=".md,text/markdown"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file && isMarkdownFile(file)) setDraftFile(file);
                    else if (file) {
                      setDraftFile(null);
                      invalidMarkdown();
                    }
                    event.target.value = '';
                  }}
                />
              </Button>
              <Typography variant="caption" color="text.secondary">仅上传 `.md` 文件；浏览器不会读取或保存本地文件夹位置。</Typography>
              <TextField label="知识标题" required value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
              <TextField label="知识标识（可选）" value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))} helperText="留空时按标题自动生成" />
              <TextField label="分类" required value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="例如：销售制度 / 交付规范" />
              <TextField label="摘要" required multiline minRows={2} value={form.summary} onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))} />
              <TextField label="归属部门" required value={form.ownerDepartmentId} onChange={(event) => setForm((current) => ({ ...current, ownerDepartmentId: event.target.value }))} />
              <FormControl size="small">
                <InputLabel id="knowledge-sensitivity-label">敏感级别</InputLabel>
                <Select labelId="knowledge-sensitivity-label" label="敏感级别" value={form.sensitivity} onChange={(event) => setForm((current) => ({ ...current, sensitivity: event.target.value as KnowledgeSensitivity }))}>
                  <MenuItem value="INTERNAL">公司内部</MenuItem>
                  <MenuItem value="DEPARTMENT">部门敏感</MenuItem>
                  <MenuItem value="MANAGEMENT">管理层</MenuItem>
                  <MenuItem value="FINANCE">财务敏感</MenuItem>
                  <MenuItem value="CUSTOMER">客户相关</MenuItem>
                </Select>
              </FormControl>
              <FormControl size="small">
                <InputLabel id="knowledge-visibility-label">可见范围</InputLabel>
                <Select labelId="knowledge-visibility-label" label="可见范围" value={form.visibilityType} onChange={(event) => setForm((current) => ({ ...current, visibilityType: event.target.value as VisibilitySubjectType }))}>
                  <MenuItem value="ALL_EMPLOYEES">全体员工</MenuItem>
                  <MenuItem value="DEPARTMENT">仅归属部门</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="计划生效时间（可选）"
                type="datetime-local"
                value={form.effectiveAt}
                onChange={(event) => setForm((current) => ({ ...current, effectiveAt: event.target.value }))}
                InputLabelProps={{ shrink: true }}
              />
              <Button type="submit" variant="contained" disabled={Boolean(actionPending)}>
                {actionPending === 'create-draft' ? '正在创建…' : '创建草稿'}
              </Button>
            </Stack>
          </Paper>
        ) : null}

        <Stack spacing={2}>
          <Paper sx={{ px: 2, py: 1.5, bgcolor: '#F8FBFF', borderColor: '#C7DAFF' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="subtitle1">审核与发布队列</Typography>
                <Typography variant="body2" color="text.secondary">状态来自服务端；每次操作后自动刷新。</Typography>
              </Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip size="small" label={`${queueCount} 项待办`} />
                {loading ? <CircularProgress size={20} /> : null}
              </Stack>
            </Stack>
          </Paper>

          {canReviewPermission ? (
            <Box>
              <Typography variant="subtitle1">部门审核</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>仅显示当前账号可审核的归属部门知识。</Typography>
              <Stack spacing={1.25}>
                {reviewQueue.map((item) => <WorkflowCard key={item.version.id} kind="review" {...workflowCardProps(item)} />)}
                {!loading && reviewQueue.length === 0 ? (
                  <Paper sx={{ py: 3, px: 2, textAlign: 'center', color: moduleTokens.muted }}>
                    <Typography variant="body2">暂无待审核版本，新提交的版本会出现在这里。</Typography>
                  </Paper>
                ) : null}
              </Stack>
            </Box>
          ) : null}

          {canPublishPermission ? (
            <Box>
              <Typography variant="subtitle1">待提交与已驳回</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>这里来自服务端队列，刷新或重新登录后仍可继续提交、修订。</Typography>
              <Stack spacing={1.25}>
                {draftQueue.map((item) => <WorkflowCard key={item.version.id} kind="manage" {...workflowCardProps(item)} />)}
                {!loading && draftQueue.length === 0 ? (
                  <Paper sx={{ py: 3, px: 2, textAlign: 'center', color: moduleTokens.muted }}>
                    <Typography variant="body2">暂无待提交或已驳回版本。</Typography>
                  </Paper>
                ) : null}
              </Stack>
            </Box>
          ) : null}

          {canPublishPermission ? (
            <Box>
              <Typography variant="subtitle1">待正式发布</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>审核通过后仍需发布，才会成为员工可见的当前版本。</Typography>
              <Stack spacing={1.25}>
                {approvedQueue.map((item) => <WorkflowCard key={item.version.id} kind="manage" {...workflowCardProps(item)} />)}
                {!loading && approvedQueue.length === 0 ? (
                  <Paper sx={{ py: 3, px: 2, textAlign: 'center', color: moduleTokens.muted }}>
                    <Typography variant="body2">暂无待发布版本。</Typography>
                  </Paper>
                ) : null}
              </Stack>
            </Box>
          ) : null}
        </Stack>
      </Box>

      {canPublishPermission && canRead ? (
        <Box>
          <Typography variant="subtitle1">当前知识版本</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            上传新版本会创建独立草稿；下线后员工将无法继续检索该知识。
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25 }}>
            {currentItems.map((document) => (
              <Paper key={document.id} sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" spacing={1}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1">{document.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{document.category} · 当前 v{document.currentVersion?.versionNumber}</Typography>
                  </Box>
                  <DescriptionOutlinedIcon sx={{ color: '#98A2B3' }} />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
                  <Button component="label" variant="outlined" disabled={Boolean(actionPending)}>
                    上传新版本
                    <input
                      hidden
                      type="file"
                      accept=".md,text/markdown"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file && isMarkdownFile(file)) void uploadVersion(document.id, file);
                        else if (file) invalidMarkdown();
                        event.target.value = '';
                      }}
                    />
                  </Button>
                  <Button color="error" variant="outlined" disabled={Boolean(actionPending)} onClick={() => void runAction(`retire-${document.id}`, () => enablementApi.retireDocument(document.id), '知识已下线')}>
                    下线知识
                  </Button>
                </Stack>
              </Paper>
            ))}
            {!loading && currentItems.length === 0 ? (
              <Paper sx={{ py: 3, px: 2, textAlign: 'center', color: moduleTokens.muted }}>
                <Typography variant="body2">暂无可维护的当前知识。</Typography>
              </Paper>
            ) : null}
          </Box>
        </Box>
      ) : null}
    </Stack>
  );
};

export default PublishingCenter;
