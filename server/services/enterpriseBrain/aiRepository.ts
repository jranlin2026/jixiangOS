import { createHash } from 'node:crypto';

export type AiCitation = {
  documentId: string;
  versionId: string;
  title: string;
  versionNumber: number;
  excerpt: string;
  updatedAt: string;
};

export type AiConversationRecord = {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Array<{ id: string; role: 'USER' | 'ASSISTANT'; content: string; citations: AiCitation[]; createdAt: string }>;
};

export type AiAuditRecord = {
  id: string;
  userId: string;
  conversationId: string;
  question: string;
  positionId: string | null;
  departmentId: string | null;
  retrievedVersionIds: string[];
  citationCount: number;
  outcome: string;
  model: string | null;
  createdAt: string;
};

export interface EnterpriseAiRepository {
  listConversations(userId: string): Promise<AiConversationRecord[]>;
  findConversation(id: string, userId: string): Promise<AiConversationRecord | null>;
  deleteConversation(id: string, userId: string): Promise<boolean>;
  appendExchange(input: { conversationId?: string; userId: string; title: string; question: string; answer: string; citations: AiCitation[]; now: Date }): Promise<AiConversationRecord>;
  recordAudit(input: Omit<AiAuditRecord, 'id' | 'createdAt'> & { now: Date }): Promise<void>;
  upsertGap(input: { question: string; positionId: string | null; departmentId: string | null; now: Date }): Promise<void>;
  listAudits(input: { userId?: string; page: number; pageSize: number }): Promise<{ items: AiAuditRecord[]; total: number }>;
}

export function normalizeKnowledgeGapHash(question: string, positionId: string | null): string {
  const normalized = question.toLowerCase().replace(/\s+/g, '').trim();
  return createHash('sha256').update(`${positionId || '*'}:${normalized}`, 'utf8').digest('hex');
}

export function createMemoryEnterpriseAiRepository(): EnterpriseAiRepository & { inspect(): { gaps: any[]; audits: AiAuditRecord[] } } {
  const conversations: AiConversationRecord[] = [];
  const audits: AiAuditRecord[] = [];
  const gaps: any[] = [];
  let sequence = 0;
  return {
    inspect: () => ({ gaps, audits }),
    async listConversations(userId) { return conversations.filter((item) => item.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); },
    async findConversation(id, userId) { return conversations.find((item) => item.id === id && item.userId === userId) || null; },
    async deleteConversation(id, userId) {
      const index = conversations.findIndex((item) => item.id === id && item.userId === userId);
      if (index < 0) return false;
      conversations.splice(index, 1);
      return true;
    },
    async appendExchange(input) {
      let conversation = input.conversationId ? conversations.find((item) => item.id === input.conversationId && item.userId === input.userId) : undefined;
      if (!conversation) {
        conversation = { id: `conversation-${++sequence}`, userId: input.userId, title: input.title, createdAt: input.now.toISOString(), updatedAt: input.now.toISOString(), messages: [] };
        conversations.push(conversation);
      }
      conversation.messages.push(
        { id: `message-${++sequence}`, role: 'USER', content: input.question, citations: [], createdAt: input.now.toISOString() },
        { id: `message-${++sequence}`, role: 'ASSISTANT', content: input.answer, citations: input.citations, createdAt: input.now.toISOString() },
      );
      conversation.updatedAt = input.now.toISOString();
      return conversation;
    },
    async recordAudit(input) { audits.push({ ...input, id: `audit-${++sequence}`, createdAt: input.now.toISOString() }); },
    async upsertGap(input) {
      const hash = normalizeKnowledgeGapHash(input.question, input.positionId);
      const existing = gaps.find((item) => item.normalizedHash === hash);
      if (existing) { existing.occurrenceCount += 1; existing.lastAskedAt = input.now.toISOString(); return; }
      gaps.push({ id: `gap-${++sequence}`, normalizedHash: hash, question: input.question, positionId: input.positionId, departmentId: input.departmentId, occurrenceCount: 1, status: 'OPEN', firstAskedAt: input.now.toISOString(), lastAskedAt: input.now.toISOString() });
    },
    async listAudits(input) {
      const rows = audits.filter((item) => !input.userId || item.userId === input.userId);
      return { items: rows.slice((input.page - 1) * input.pageSize, input.page * input.pageSize), total: rows.length };
    },
  };
}
