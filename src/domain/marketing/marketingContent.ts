import type {
  MarketingContentAction,
  MarketingContentStatus,
  MarketingContentType,
} from '../../types/marketing';

const transitions: Record<MarketingContentStatus, Partial<Record<MarketingContentAction, MarketingContentStatus>>> = {
  DRAFT: { SUBMIT: 'PENDING_REVIEW' },
  PENDING_REVIEW: { APPROVE: 'APPROVED', REJECT: 'REJECTED' },
  APPROVED: { RETIRE: 'RETIRED' },
  REJECTED: { SUBMIT: 'PENDING_REVIEW' },
  RETIRED: {},
};

export function nextMarketingContentStatus(
  status: MarketingContentStatus,
  action: MarketingContentAction,
): MarketingContentStatus {
  const next = transitions[status][action];
  if (!next) throw new Error(`内容状态“${status}”不能执行“${action}”`);
  return next;
}

export function expandMarketingAccountSelection(
  accountIds: string[],
  groupIds: string[],
  groups: Array<{ id: string; accountIds: string[] }>,
): string[] {
  const selectedGroups = new Set(groupIds);
  return Array.from(new Set([
    ...groups.filter((group) => selectedGroups.has(group.id)).flatMap((group) => group.accountIds),
    ...accountIds,
  ].map((id) => String(id || '').trim()).filter(Boolean)));
}

export function assertMarketingContentReadyForPublish(content: {
  title: string;
  contentType: MarketingContentType;
  copywriting?: string;
  platforms: string[];
  status: MarketingContentStatus;
  videoUrl?: string;
  imageLinks?: string[];
}): void {
  if (content.status !== 'APPROVED') throw new Error('只有审核通过的内容才能创建发布任务');
  if (!content.title.trim()) throw new Error('内容标题不能为空');
  if (!content.platforms.length) throw new Error('至少选择一个适用平台');
  if (!String(content.copywriting || '').trim()) throw new Error('发布文案不能为空');
  if (content.contentType === 'SHORT_VIDEO' && !String(content.videoUrl || '').trim()) {
    throw new Error('短视频内容必须提供视频链接');
  }
  if (content.contentType === 'GRAPHIC' && !(content.imageLinks || []).length) {
    throw new Error('图文内容至少需要一个图片链接');
  }
}
