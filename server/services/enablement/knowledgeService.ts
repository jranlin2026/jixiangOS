import { createHash, randomUUID } from 'node:crypto';
import { failure, success } from '../../api/response';
import {
  KNOWLEDGE_VERSION_STATUS,
  type CreateKnowledgeDraftInput,
} from '../../../src/types/enablement';
import type { AuthenticatedUser } from '../../../src/types/auth';
import { canPublishKnowledge, canReadKnowledge, canReviewKnowledge } from './knowledgePolicy';
import type { KnowledgeRepository } from './knowledgeRepository';
import { buildMarkdownChunks, type KnowledgeSearchProvider } from './knowledgeSearchProvider';
import { validateKnowledgeDraftInput, validateKnowledgeVersionInput, validateReviewInput } from './knowledgeValidation';

type KnowledgeSourceStore = {
  writeMarkdown(input: {
    documentId: string;
    versionId: string;
    fileName: string;
    markdown: string;
  }): Promise<{ storageKey: string; byteSize: number }>;
  discardNewWrite(storageKey: string): Promise<void>;
};

type KnowledgeServiceDependencies = {
  repository: KnowledgeRepository;
  searchProvider: KnowledgeSearchProvider;
  fileStore?: KnowledgeSourceStore;
  now?: () => Date;
  onCompensationError?: (error: unknown) => void;
};

const draftableStatuses = [KNOWLEDGE_VERSION_STATUS.DRAFT, KNOWLEDGE_VERSION_STATUS.REJECTED];
const noData = (message: string, code = -1) => failure<never>(message, code);

function checksum(markdown: string): string {
  return createHash('sha256').update(markdown, 'utf8').digest('hex');
}

export function createKnowledgeService(deps: KnowledgeServiceDependencies) {
  const clock = deps.now || (() => new Date());
  const compensate = async (storageKey: string | undefined) => {
    if (!storageKey || !deps.fileStore) return;
    try {
      await deps.fileStore.discardNewWrite(storageKey);
    } catch {
      const safeError = new Error('知识源文件补偿失败');
      if (deps.onCompensationError) deps.onCompensationError(safeError);
      else console.error(safeError.message);
    }
  };

  const validateReferences = async (input: CreateKnowledgeDraftInput) => {
    const department = await deps.repository.findDepartment(input.ownerDepartmentId!);
    if (!department) return noData('归属部门不存在', 404);
    for (const rule of input.visibility) {
      if (rule.subjectType === 'ALL_EMPLOYEES') continue;
      if (!await deps.repository.visibilitySubjectExists(rule.subjectType, rule.subjectId!)) {
        return noData(`可见范围引用的${rule.subjectType}不存在`, 404);
      }
    }
    return null;
  };

  return {
    async createDraft(rawInput: unknown, actor: AuthenticatedUser) {
      if (!canPublishKnowledge(actor)) return noData('无权创建知识草稿', 403);
      const parsed = validateKnowledgeDraftInput(rawInput);
      if ('error' in parsed) return noData(parsed.error, 400);
      const input = parsed.value;
      const referenceError = await validateReferences(input);
      if (referenceError) return referenceError;

      const documentId = `doc-${randomUUID()}`;
      const versionId = `kv-${randomUUID()}`;
      const attachment = deps.fileStore
        ? await deps.fileStore.writeMarkdown({ documentId, versionId, fileName: input.sourceFileName, markdown: input.markdown })
        : null;
      try {
        const created = await deps.repository.createDraft({
          ...input,
          id: documentId,
          versionId,
          checksum: checksum(input.markdown),
          createdById: actor.id,
          attachment,
        });
        if (!created) {
          await compensate(attachment?.storageKey);
          return noData('知识标识已存在或创建发生并发冲突，请检查标识后重试', 409);
        }
        return success(created);
      } catch (error) {
        await compensate(attachment?.storageKey);
        throw error;
      }
    },

    async createVersion(documentId: string, rawInput: unknown, actor: AuthenticatedUser) {
      if (!canPublishKnowledge(actor)) return noData('无权创建知识版本', 403);
      const document = await deps.repository.findDocument(documentId);
      if (!document) return noData('知识文档不存在', 404);
      const parsed = validateKnowledgeVersionInput(rawInput);
      if ('error' in parsed) return noData(parsed.error, 400);
      const input = parsed.value;

      const versionId = `kv-${randomUUID()}`;
      const attachment = deps.fileStore
        ? await deps.fileStore.writeMarkdown({ documentId, versionId, fileName: input.sourceFileName, markdown: input.markdown })
        : null;
      try {
        const created = await deps.repository.createVersion(documentId, {
          ...input,
          versionId,
          checksum: checksum(input.markdown),
          createdById: actor.id,
          attachment,
        });
        if (!created) {
          await compensate(attachment?.storageKey);
          return noData('版本号已被其他操作占用，请刷新后重试', 409);
        }
        return success(created);
      } catch (error) {
        await compensate(attachment?.storageKey);
        throw error;
      }
    },

    async submitForReview(versionId: string, actor: AuthenticatedUser) {
      if (!canPublishKnowledge(actor)) return noData('无权提交知识审核', 403);
      const version = await deps.repository.findVersion(versionId);
      if (!version || !draftableStatuses.includes(version.status as typeof draftableStatuses[number])) {
        return noData('只有草稿或驳回版本可以提交审核');
      }
      const document = await deps.repository.findDocument(version.documentId);
      if (!document?.ownerDepartmentId) return noData('归属部门不存在', 404);
      if (!await deps.repository.hasActiveDepartmentManager(document.ownerDepartmentId)) {
        return noData('归属部门没有可承接审核的在职负责人', 409);
      }
      const moved = await deps.repository.transitionVersion(versionId, draftableStatuses, KNOWLEDGE_VERSION_STATUS.PENDING_REVIEW);
      if (!moved) return noData('版本状态已变化，请刷新后重试', 409);
      return success(true);
    },

    async review(versionId: string, rawInput: unknown, actor: AuthenticatedUser) {
      const parsed = validateReviewInput(rawInput);
      if ('error' in parsed) return noData(parsed.error, 400);
      const input = parsed.value;
      const version = await deps.repository.findVersion(versionId);
      const document = version ? await deps.repository.findDocument(version.documentId) : null;
      const department = document?.ownerDepartmentId ? await deps.repository.findDepartment(document.ownerDepartmentId) : null;
      if (!version || !document || !department) return noData('审核对象或归属部门不存在');
      if (version.status !== KNOWLEDGE_VERSION_STATUS.PENDING_REVIEW) return noData('只有待审核版本可以审核');
      if (!canReviewKnowledge(actor, department)) return noData('无权审核该部门知识', 403);

      const moved = await deps.repository.reviewAtomic({
        versionId,
        expectedStatus: KNOWLEDGE_VERSION_STATUS.PENDING_REVIEW,
        reviewerUserId: actor.id,
        decision: input.decision,
        comment: input.comment,
        nextStatus: input.decision === 'APPROVE' ? KNOWLEDGE_VERSION_STATUS.APPROVED : KNOWLEDGE_VERSION_STATUS.REJECTED,
      });
      if (!moved) return noData('版本已被其他审核人处理，请刷新后重试', 409);
      return success(true);
    },

    async publish(versionId: string, actor: AuthenticatedUser) {
      if (!canPublishKnowledge(actor)) return noData('无权发布公司知识', 403);
      const version = await deps.repository.findVersion(versionId);
      if (!version || version.status !== KNOWLEDGE_VERSION_STATUS.APPROVED) {
        return noData('只有审核通过的版本可以发布');
      }
      const publishAt = clock();
      if ((version.effectiveAt && version.effectiveAt > publishAt) || (version.expiresAt && version.expiresAt <= publishAt)) {
        return noData('版本当前不在有效时间窗口内，无法发布', 409);
      }
      const chunks = buildMarkdownChunks(version.contentText);
      if (!chunks.length) return noData('正文无法生成知识片段');
      const document = await deps.repository.publishAtomic({ version, publisherUserId: actor.id, chunks, now: publishAt });
      if (!document) return noData('版本状态已变化，请刷新后重试', 409);
      return success(document);
    },

    async retire(documentId: string, actor: AuthenticatedUser) {
      if (!canPublishKnowledge(actor)) return noData('无权下线公司知识', 403);
      const retired = await deps.repository.retireAtomic(documentId, actor.id, clock());
      if (!retired) return noData('版本状态已变化，请刷新后重试', 409);
      return success(true);
    },

    async listCurrent(actor: AuthenticatedUser) {
      const documents = await deps.repository.listVisibleCurrent(clock());
      return success(documents.filter((document) => canReadKnowledge(actor, document)));
    },

    async getCurrent(documentId: string, actor: AuthenticatedUser) {
      const document = await deps.repository.findCurrentDetail(documentId, clock());
      if (!document?.currentVersionId || !canReadKnowledge(actor, document)) return noData('知识不存在或无权查看', 404);
      return success(document);
    },

    async listReviewQueue(actor: AuthenticatedUser) {
      const queue = await deps.repository.listReviewQueue();
      const allowed = [];
      for (const item of queue) {
        const departmentId = item.document.ownerDepartmentId;
        const department = departmentId ? await deps.repository.findDepartment(departmentId) : null;
        if (department && canReviewKnowledge(actor, department)) allowed.push(item);
      }
      return success(allowed);
    },

    async listPublicationQueue(actor: AuthenticatedUser) {
      if (!canPublishKnowledge(actor)) return noData('无权查看发布队列', 403);
      return success(await deps.repository.listPublicationQueue());
    },

    async searchCurrent(query: string, actor: AuthenticatedUser) {
      const documents = await deps.repository.listVisibleCurrent(clock());
      const allowedDocumentIds = new Set(
        documents.filter((document) => canReadKnowledge(actor, document)).map((document) => document.id),
      );
      const chunks = (await deps.repository.listSearchableChunks(clock()))
        .filter((chunk) => allowedDocumentIds.has(chunk.documentId));
      return success(deps.searchProvider.search(query, chunks, 20));
    },
  };
}

export type KnowledgeService = ReturnType<typeof createKnowledgeService>;
