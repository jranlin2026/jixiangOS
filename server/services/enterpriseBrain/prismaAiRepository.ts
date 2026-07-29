import { randomUUID } from 'node:crypto';
import type { AiAuditRecord, AiCitation, AiConversationRecord, EnterpriseAiRepository } from './aiRepository';
import { normalizeKnowledgeGapHash } from './aiRepository';

type Client = {
  $transaction<T>(callback: (tx: any) => Promise<T>, options?: { isolationLevel: 'Serializable' }): Promise<T>;
  aiConversation: any;
  aiQueryAudit: any;
  knowledgeGap: any;
};

const citations = (value: unknown): AiCitation[] => Array.isArray(value) ? value as AiCitation[] : [];

function mapConversation(row: any): AiConversationRecord {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    messages: (row.messages || []).map((item: any) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      citations: citations(item.citations),
      createdAt: new Date(item.createdAt).toISOString(),
    })),
  };
}

function mapAudit(row: any): AiAuditRecord {
  return {
    id: row.id, userId: row.userId, conversationId: row.conversationId || '', question: row.question,
    positionId: row.positionId || null, departmentId: row.departmentId || null,
    retrievedVersionIds: Array.isArray(row.retrievedVersionIds) ? row.retrievedVersionIds.map(String) : [],
    citationCount: row.citationCount, outcome: row.outcome, model: row.model || null,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

const messageInclude = { messages: { orderBy: { createdAt: 'asc' } } };

export function createPrismaEnterpriseAiRepository(prisma: Client): EnterpriseAiRepository {
  return {
    async listConversations(userId) {
      const rows = await prisma.aiConversation.findMany({ where: { userId }, include: messageInclude, orderBy: { updatedAt: 'desc' } });
      return rows.map(mapConversation);
    },
    async findConversation(id, userId) {
      const row = await prisma.aiConversation.findFirst({ where: { id, userId }, include: messageInclude });
      return row ? mapConversation(row) : null;
    },
    async deleteConversation(id, userId) {
      const result = await prisma.aiConversation.deleteMany({ where: { id, userId } });
      return result.count === 1;
    },
    async appendExchange(input) {
      return prisma.$transaction(async (tx) => {
        let conversation = input.conversationId
          ? await tx.aiConversation.findFirst({ where: { id: input.conversationId, userId: input.userId } })
          : null;
        if (input.conversationId && !conversation) throw new Error('AI_CONVERSATION_NOT_OWNED');
        if (!conversation) {
          conversation = await tx.aiConversation.create({ data: { id: `ai-conversation-${randomUUID()}`, userId: input.userId, title: input.title } });
        }
        await tx.aiMessage.createMany({
          data: [
            { id: `ai-message-${randomUUID()}`, conversationId: conversation.id, role: 'USER', content: input.question, citations: [] },
            { id: `ai-message-${randomUUID()}`, conversationId: conversation.id, role: 'ASSISTANT', content: input.answer, citations: input.citations },
          ],
        });
        const row = await tx.aiConversation.update({ where: { id: conversation.id }, data: { updatedAt: input.now }, include: messageInclude });
        return mapConversation(row);
      }, { isolationLevel: 'Serializable' });
    },
    async recordAudit(input) {
      await prisma.aiQueryAudit.create({
        data: {
          id: `ai-audit-${randomUUID()}`, userId: input.userId, conversationId: input.conversationId,
          question: input.question, positionId: input.positionId, departmentId: input.departmentId,
          retrievedVersionIds: input.retrievedVersionIds, citationCount: input.citationCount,
          outcome: input.outcome, model: input.model, createdAt: input.now,
        },
      });
    },
    async upsertGap(input) {
      const normalizedHash = normalizeKnowledgeGapHash(input.question, input.positionId);
      await prisma.knowledgeGap.upsert({
        where: { normalizedHash },
        create: { id: `knowledge-gap-${randomUUID()}`, question: input.question, normalizedHash, positionId: input.positionId, departmentId: input.departmentId, firstAskedAt: input.now, lastAskedAt: input.now },
        update: { occurrenceCount: { increment: 1 }, lastAskedAt: input.now },
      });
    },
    async listAudits(input) {
      const where = input.userId ? { userId: input.userId } : {};
      const [rows, total] = await Promise.all([
        prisma.aiQueryAudit.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * input.pageSize, take: input.pageSize }),
        prisma.aiQueryAudit.count({ where }),
      ]);
      return { items: rows.map(mapAudit), total };
    },
  };
}
