import { failure, success } from '../../api/response';
import type { AuthenticatedUser } from '../../../src/types/auth';
import { hasPermission, PERMISSION_KEYS } from '../../../src/shared/utils/permissions';
import type { PositionStandardRepository } from './positionStandardRepository';

type Dependencies = { repository: PositionStandardRepository; now?: () => Date };

function strings(value: unknown, maxItems = 100): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const normalized = value.map((item) => String(item || '').trim()).filter(Boolean);
  return normalized.length === value.length ? normalized : null;
}

function text(value: unknown, max: number): string {
  return String(value || '').trim().slice(0, max);
}

export function createPositionStandardService(deps: Dependencies) {
  const now = deps.now || (() => new Date());
  return {
    async saveDraft(raw: any, actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.STANDARD_MAINTAIN, 'write') && !hasPermission(actor, '全部', 'admin')) {
        return failure<never>('无权维护岗位标准', 403);
      }
      const positionId = text(raw?.positionId, 64);
      const title = text(raw?.title, 200);
      const mission = text(raw?.mission, 10000);
      const goals = strings(raw?.goals);
      const dailyActions = strings(raw?.dailyActions);
      const kpis = strings(raw?.kpis);
      const workflow = strings(raw?.workflow);
      const speechTemplates = strings(raw?.speechTemplates);
      const faq = strings(raw?.faq);
      const knowledgeVersionIds = Array.from(new Set(strings(raw?.knowledgeVersionIds) || []));
      if (!positionId || !title || !mission || !goals?.length || !dailyActions?.length || !kpis?.length || !workflow?.length || !speechTemplates || !faq) {
        return failure<never>('岗位、标题、使命、目标、每日动作、指标和流程不能为空', 400);
      }
      const position = await deps.repository.findPosition(positionId);
      if (!position?.isActive) return failure<never>('岗位不存在或已停用', 404);
      const knowledge = await deps.repository.findKnowledgeVersions(knowledgeVersionIds);
      if (knowledge.length !== knowledgeVersionIds.length) return failure<never>('关联知识版本不存在', 404);
      const instant = now();
      if (knowledge.some((item) => item.status !== 'CURRENT' || (item.effectiveAt && item.effectiveAt > instant) || (item.expiresAt && item.expiresAt <= instant))) {
        return failure<never>('只能关联当前有效的已发布知识版本', 409);
      }
      const effectiveAt = raw?.effectiveAt ? new Date(raw.effectiveAt) : null;
      if (effectiveAt && Number.isNaN(effectiveAt.getTime())) return failure<never>('生效时间格式不正确', 400);
      const result = await deps.repository.saveDraftAtomic({
        positionId, title, mission, goals, dailyActions, kpis, workflow, speechTemplates, faq,
        knowledgeVersionIds, effectiveAt, actorId: actor.id, actorName: actor.name,
      });
      return result ? success(result) : failure<never>('岗位标准版本发生并发冲突，请刷新后重试', 409);
    },

    async publish(versionId: string, actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.STANDARD_PUBLISH, 'write') && !hasPermission(actor, '全部', 'admin')) {
        return failure<never>('无权发布岗位标准', 403);
      }
      const version = await deps.repository.findVersion(versionId);
      if (!version || version.status !== 'DRAFT') return failure<never>('只有草稿版本可以发布', 409);
      const published = await deps.repository.publishAtomic(versionId, { id: actor.id, name: actor.name }, now());
      return published ? success(published) : failure<never>('版本状态已变化，请刷新后重试', 409);
    },

    async getMyStandard(actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.STANDARD_READ)) return failure<never>('无权读取岗位标准', 403);
      if (!actor.positionId) return failure<never>('当前员工尚未绑定正式岗位', 404);
      const standard = await deps.repository.findCurrentByPosition(actor.positionId, now());
      return standard ? success(standard) : failure<never>('当前岗位尚未发布有效标准', 404);
    },

    async listWorkspace(actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.STANDARD_MAINTAIN) && !hasPermission(actor, '全部', 'admin')) {
        return failure<never>('无权查看岗位标准工作区', 403);
      }
      return success(await deps.repository.listWorkspace());
    },
  };
}

export type PositionStandardService = ReturnType<typeof createPositionStandardService>;
