import { failure, success } from '../../api/response';
import type { AuthenticatedUser } from '../../../src/types/auth';
import type { KnowledgeSearchHit } from '../../../src/types/enablement';
import { hasPermission, PERMISSION_KEYS } from '../../../src/shared/utils/permissions';
import type { AiCitation, EnterpriseAiRepository } from './aiRepository';

type Dependencies = {
  repository: EnterpriseAiRepository;
  searchKnowledge: (question: string, actor: AuthenticatedUser) => Promise<KnowledgeSearchHit[]>;
  complete: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) => Promise<string>;
  now?: () => Date;
  modelName?: string;
};

const HIGH_RISK = ['合同', '法律', '退款', '退费', '财务', '价格承诺', '收益保证', '赔偿'];

function citation(hit: KnowledgeSearchHit): AiCitation {
  return {
    documentId: hit.documentId,
    versionId: hit.versionId,
    title: hit.title,
    versionNumber: hit.versionNumber,
    excerpt: hit.excerpt,
    updatedAt: hit.updatedAt,
  };
}

export function createEnterpriseAiAssistantService(deps: Dependencies) {
  const clock = deps.now || (() => new Date());
  return {
    async ask(raw: any, actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.AI_POSITION_ASSISTANT)) return failure<never>('无权使用岗位AI助手', 403);
      const question = String(raw?.question || '').trim().slice(0, 5000);
      if (!question) return failure<never>('请输入问题', 400);
      const existingConversation = raw?.conversationId ? await deps.repository.findConversation(String(raw.conversationId), actor.id) : null;
      if (raw?.conversationId && !existingConversation) {
        return failure<never>('会话不存在', 404);
      }
      const now = clock();
      const hits = await deps.searchKnowledge(question, actor);
      const citations = hits.slice(0, 6).map(citation);
      let answer: string;
      let outcome: 'ANSWERED' | 'NO_EVIDENCE';
      if (!citations.length) {
        answer = '当前暂无足够的已发布公司标准支持这个问题。我已记录为知识缺口，请向负责人确认后再对客户作出承诺。';
        outcome = 'NO_EVIDENCE';
        await deps.repository.upsertGap({ question, positionId: actor.positionId || null, departmentId: actor.departmentId || null, now });
      } else {
        const evidence = citations.map((item, index) => `[${index + 1}] ${item.title} V${item.versionNumber}\n${item.excerpt}`).join('\n\n');
        answer = await deps.complete([
          {
            role: 'system',
            content: '你是极享OS岗位AI助手。只能依据给出的当前有效公司知识回答；不要把推测写成公司事实；回答必须简洁可执行，并在相关结论后标注引用编号。',
          },
          ...(existingConversation?.messages.slice(-8).map((message) => ({
            role: message.role === 'USER' ? 'user' as const : 'assistant' as const,
            content: message.content,
          })) || []),
          {
            role: 'user',
            content: `员工岗位：${actor.positionName || '未设置'}\n问题：${question}\n\n公司知识证据：\n${evidence}`,
          },
        ]);
        outcome = 'ANSWERED';
        if (HIGH_RISK.some((keyword) => question.includes(keyword))) answer = `${answer}\n\n高风险事项提示：请由负责人或对应专业人员确认后执行。`;
      }
      const conversation = await deps.repository.appendExchange({
        conversationId: raw?.conversationId ? String(raw.conversationId) : undefined,
        userId: actor.id,
        title: question.slice(0, 60),
        question,
        answer,
        citations,
        now,
      });
      await deps.repository.recordAudit({
        userId: actor.id,
        conversationId: conversation.id,
        question,
        positionId: actor.positionId || null,
        departmentId: actor.departmentId || null,
        retrievedVersionIds: citations.map((item) => item.versionId),
        citationCount: citations.length,
        outcome,
        model: outcome === 'ANSWERED' ? deps.modelName || 'configured-provider' : null,
        now,
      });
      return success({ conversationId: conversation.id, answer, citations, outcome });
    },

    async listConversations(actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.AI_POSITION_ASSISTANT)) return failure<never>('无权读取AI会话', 403);
      return success(await deps.repository.listConversations(actor.id));
    },

    async getConversation(id: string, actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.AI_POSITION_ASSISTANT)) return failure<never>('无权读取AI会话', 403);
      const conversation = await deps.repository.findConversation(id, actor.id);
      return conversation ? success(conversation) : failure<never>('会话不存在', 404);
    },

    async deleteConversation(id: string, actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.AI_POSITION_ASSISTANT)) return failure<never>('无权删除AI会话', 403);
      return await deps.repository.deleteConversation(id, actor.id) ? success(true) : failure<never>('会话不存在', 404);
    },

    async listAudits(raw: any, actor: AuthenticatedUser) {
      if (!hasPermission(actor, PERMISSION_KEYS.AI_AUDIT)) return failure<never>('无权查看AI问答审计', 403);
      const page = Math.max(1, Number(raw?.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(raw?.pageSize) || 20));
      const data = await deps.repository.listAudits({ userId: raw?.userId ? String(raw.userId) : undefined, page, pageSize });
      return success({ ...data, page, pageSize });
    },
  };
}

export type EnterpriseAiAssistantService = ReturnType<typeof createEnterpriseAiAssistantService>;
