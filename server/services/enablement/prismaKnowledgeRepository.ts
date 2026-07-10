import { randomUUID } from 'node:crypto';
import type {
  KnowledgeDocumentDetailDto,
  KnowledgeDocumentDto,
  KnowledgeVersionDto,
  KnowledgeWorkflowItemDto,
} from '../../../src/types/enablement';
import type { KnowledgeRepository, KnowledgeVersionRecord } from './knowledgeRepository';

type AnyRow = Record<string, any>;

/**
 * Deliberately structural: the checked-in Prisma Client can lag migrations in
 * a fresh checkout, while this repository only needs these generated delegates.
 */
type PrismaKnowledgeClient = {
  $transaction<T>(callback: (tx: any) => Promise<T>, options?: { isolationLevel: 'Serializable' }): Promise<T>;
  knowledgeDocument: any;
  knowledgeVersion: any;
  knowledgeAttachment: any;
  knowledgeChunk: any;
  department: any;
};

const asIso = (value: Date | string | null | undefined): string | undefined => (
  value ? (value instanceof Date ? value.toISOString() : new Date(value).toISOString()) : undefined
);

const asDate = (value: unknown): Date | null => value ? new Date(value as string) : null;

const PUBLISH_CONFLICT = '版本状态已变化，无法发布';

function isExpectedConcurrencyConflict(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'P2002' || code === 'P2034';
}

const currentWindow = (now: Date) => ({
  status: 'CURRENT',
  AND: [
    { OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }] },
    { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  ],
});

function mapVersion(row: AnyRow): KnowledgeVersionDto {
  return {
    id: row.id,
    documentId: row.documentId,
    versionNumber: row.versionNumber,
    status: row.status,
    sourceFileName: row.sourceFileName,
    ...(row.sourcePath ? { sourcePath: row.sourcePath } : {}),
    checksum: row.checksum,
    ...(asIso(row.effectiveAt) ? { effectiveAt: asIso(row.effectiveAt) } : {}),
    ...(asIso(row.expiresAt) ? { expiresAt: asIso(row.expiresAt) } : {}),
    ...(asIso(row.publishedAt) ? { publishedAt: asIso(row.publishedAt) } : {}),
    ...(row.publishedById ? { publishedById: row.publishedById } : {}),
    createdAt: asIso(row.createdAt) || new Date(0).toISOString(),
  } as KnowledgeVersionDto;
}

function mapVersionRecord(row: AnyRow): KnowledgeVersionRecord {
  return {
    id: row.id,
    documentId: row.documentId,
    versionNumber: row.versionNumber,
    status: row.status,
    sourceFileName: row.sourceFileName,
    checksum: row.checksum,
    contentText: row.contentText,
    effectiveAt: row.effectiveAt || null,
    expiresAt: row.expiresAt || null,
  };
}

function mapDocument(row: AnyRow, selectedVersion?: AnyRow): KnowledgeDocumentDto {
  const versions = Array.isArray(row.versions) ? row.versions : [];
  const current = selectedVersion || versions.find((version: AnyRow) => version.id === row.currentVersionId);
  const latest = versions.reduce<AnyRow | undefined>((last, version) => (
    !last || version.versionNumber > last.versionNumber ? version : last
  ), undefined);

  return {
    id: row.id,
    slug: row.slug || '',
    title: row.title || '',
    category: row.category || '',
    summary: row.summary || '',
    ownerDepartmentId: row.ownerDepartmentId || '',
    ...(row.ownerUserId ? { ownerUserId: row.ownerUserId } : {}),
    sensitivity: row.sensitivity || 'INTERNAL',
    ...(row.currentVersionId ? { currentVersionId: row.currentVersionId } : {}),
    visibility: (row.visibilities || []).map((visibility: AnyRow) => ({
      id: visibility.id,
      subjectType: visibility.subjectType,
      ...(visibility.subjectId && visibility.subjectId !== '*' ? { subjectId: visibility.subjectId } : {}),
    })),
    ...(current ? { currentVersion: mapVersion(current) } : {}),
    ...(latest ? { latestVersion: mapVersion(latest) } : {}),
    createdAt: asIso(row.createdAt) || new Date(0).toISOString(),
    updatedAt: asIso(row.updatedAt) || new Date(0).toISOString(),
  } as KnowledgeDocumentDto;
}

function attachmentData(input: AnyRow, versionId: string) {
  const attachment = input.attachment as { storageKey?: string; byteSize?: number } | undefined;
  if (!attachment?.storageKey) throw new Error('私有 Markdown 存储信息不能为空');
  return {
    id: `ka-${randomUUID()}`,
    versionId,
    fileName: input.sourceFileName,
    mimeType: 'text/markdown',
    byteSize: attachment.byteSize || Buffer.byteLength(String(input.markdown || ''), 'utf8'),
    storageKey: attachment.storageKey,
    checksum: input.checksum,
    createdById: input.createdById,
  };
}

function versionData(input: AnyRow, documentId: string, versionId: string, versionNumber: number) {
  const storageKey = (input.attachment as { storageKey?: string } | undefined)?.storageKey;
  return {
    id: versionId,
    documentId,
    versionNumber,
    status: 'DRAFT',
    sourceFileName: input.sourceFileName,
    sourcePath: storageKey || null,
    checksum: input.checksum,
    contentText: input.markdown,
    effectiveAt: asDate(input.effectiveAt),
    expiresAt: asDate(input.expiresAt),
    createdById: input.createdById,
  };
}

const documentInclude = { visibilities: true, versions: true };

/** Prisma implementation of the server-side knowledge lifecycle boundary. */
export function createPrismaKnowledgeRepository(prisma: PrismaKnowledgeClient): KnowledgeRepository {
  return {
    async createDraft(rawInput) {
      const input = rawInput as AnyRow;
      return prisma.$transaction(async (tx) => {
        const attachment = attachmentData(input, input.versionId);
        await tx.knowledgeDocument.create({
          data: {
            id: input.id,
            slug: input.slug,
            title: input.title,
            category: input.category,
            summary: input.summary,
            ownerDepartmentId: input.ownerDepartmentId || null,
            ownerUserId: input.ownerUserId || null,
            sensitivity: input.sensitivity,
            createdById: input.createdById,
          },
        });
        const version = await tx.knowledgeVersion.create({ data: versionData(input, input.id, input.versionId, 1) });
        await tx.knowledgeVisibility.createMany({
          data: (input.visibility || []).map((visibility: AnyRow) => ({
            id: `kv-${randomUUID()}`,
            documentId: input.id,
            subjectType: visibility.subjectType,
            subjectId: visibility.subjectId || '*',
          })),
        });
        await tx.knowledgeAttachment.create({ data: attachment });
        const document = await tx.knowledgeDocument.findUnique({ where: { id: input.id }, include: documentInclude });
        if (!document) throw new Error('知识文档不存在');
        return { document: mapDocument(document), version: mapVersionRecord(version) };
      }, { isolationLevel: 'Serializable' });
    },

    async createVersion(documentId, rawInput) {
      const input = rawInput as AnyRow;
      try {
        return await prisma.$transaction(async (tx) => {
          const attachment = attachmentData(input, input.versionId);
          const document = await tx.knowledgeDocument.findUnique({ where: { id: documentId }, include: documentInclude });
          if (!document) throw new Error('知识文档不存在');
          const latest = await tx.knowledgeVersion.findFirst({
            where: { documentId },
            orderBy: { versionNumber: 'desc' },
            select: { versionNumber: true },
          });
          const version = await tx.knowledgeVersion.create({
            data: versionData(input, documentId, input.versionId, (latest?.versionNumber || 0) + 1),
          });
          await tx.knowledgeAttachment.create({ data: attachment });
          return { document: mapDocument(document), version: mapVersionRecord(version) };
        }, { isolationLevel: 'Serializable' });
      } catch (error) {
        if (isExpectedConcurrencyConflict(error)) return null;
        throw error;
      }
    },

    async findVersion(id) {
      const version = await prisma.knowledgeVersion.findUnique({ where: { id } });
      return version ? mapVersionRecord(version) : null;
    },

    async findDocument(id) {
      const document = await prisma.knowledgeDocument.findUnique({ where: { id }, include: documentInclude });
      return document ? mapDocument(document) : null;
    },

    async findCurrentDetail(id, now) {
      const document = await prisma.knowledgeDocument.findUnique({
        where: { id },
        include: { visibilities: true, versions: { where: currentWindow(now) } },
      });
      const current = document?.versions.find((version: AnyRow) => version.id === document.currentVersionId);
      if (!document || !current) return null;
      return { ...mapDocument(document, current), contentText: current.contentText } as KnowledgeDocumentDetailDto;
    },

    async findDepartment(id) {
      return prisma.department.findUnique({ where: { id }, select: { id: true, managerId: true } });
    },

    async transitionVersion(versionId, allowedFrom, nextStatus) {
      const result = await prisma.knowledgeVersion.updateMany({
        where: { id: versionId, status: { in: allowedFrom } },
        data: { status: nextStatus },
      });
      return result.count === 1;
    },

    async reviewAtomic(input) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.contentReview.create({
            data: {
              id: `cr-${randomUUID()}`,
              versionId: input.versionId,
              reviewerUserId: input.reviewerUserId,
              decision: input.decision,
              comment: input.comment || null,
            },
          });
          const result = await tx.knowledgeVersion.updateMany({
            where: { id: input.versionId, status: input.expectedStatus },
            data: { status: input.nextStatus },
          });
          if (result.count !== 1) throw new Error('版本状态已变化，请刷新后重试');
        }, { isolationLevel: 'Serializable' });
        return true;
      } catch (error) {
        if (error instanceof Error && error.message === '版本状态已变化，请刷新后重试') return false;
        throw error;
      }
    },

    async publishAtomic(input) {
      let published: KnowledgeDocumentDto | null = null;
      try {
        await prisma.$transaction(async (tx) => {
          const current = await tx.knowledgeDocument.findUnique({ where: { id: input.version.documentId } });
          if (!current) throw new Error('知识文档不存在');
          const publishVersion = await tx.knowledgeVersion.findUnique({ where: { id: input.version.id } });
          if (!publishVersion || publishVersion.status !== 'APPROVED') throw new Error(PUBLISH_CONFLICT);
          if (current.currentVersionId) {
            const retired = await tx.knowledgeVersion.updateMany({
              where: { id: current.currentVersionId, status: 'CURRENT' },
              data: { status: 'RETIRED' },
            });
            if (retired.count !== 1) throw new Error(PUBLISH_CONFLICT);
          }
          await tx.knowledgeChunk.deleteMany({ where: { versionId: input.version.id } });
          await tx.knowledgeChunk.createMany({
            data: input.chunks.map((chunk) => ({
              id: `kc-${randomUUID()}`,
              versionId: input.version.id,
              ordinal: chunk.ordinal,
              heading: chunk.heading || null,
              content: chunk.content,
              searchText: chunk.searchText,
            })),
          });
          const activated = await tx.knowledgeVersion.updateMany({
            where: { id: input.version.id, status: 'APPROVED' },
            data: { status: 'CURRENT', publishedAt: input.now, publishedById: input.publisherUserId },
          });
          if (activated.count !== 1) throw new Error(PUBLISH_CONFLICT);
          const pointed = await tx.knowledgeDocument.updateMany({
            where: { id: current.id, currentVersionId: current.currentVersionId },
            data: { currentVersionId: input.version.id },
          });
          if (pointed.count !== 1) throw new Error(PUBLISH_CONFLICT);
          published = mapDocument({
            ...current,
            currentVersionId: input.version.id,
            versions: [{
              ...publishVersion,
              status: 'CURRENT',
              publishedAt: input.now,
              publishedById: input.publisherUserId,
            }],
          });
        }, { isolationLevel: 'Serializable' });
        return published;
      } catch (error) {
        if ((error instanceof Error && error.message === PUBLISH_CONFLICT) || isExpectedConcurrencyConflict(error)) return null;
        throw error;
      }
    },

    async retireAtomic(documentId) {
      try {
        await prisma.$transaction(async (tx) => {
          const document = await tx.knowledgeDocument.findUnique({ where: { id: documentId } });
          if (!document?.currentVersionId) throw new Error('当前版本已变化');
          const updated = await tx.knowledgeVersion.updateMany({
            where: { id: document.currentVersionId, status: 'CURRENT' },
            data: { status: 'RETIRED' },
          });
          if (updated.count !== 1) throw new Error('当前版本已变化');
          await tx.knowledgeDocument.update({ where: { id: documentId }, data: { currentVersionId: null } });
        }, { isolationLevel: 'Serializable' });
        return true;
      } catch (error) {
        if (error instanceof Error && error.message === '当前版本已变化') return false;
        throw error;
      }
    },

    async listVisibleCurrent(now) {
      const documents = await prisma.knowledgeDocument.findMany({
        where: { currentVersionId: { not: null }, versions: { some: currentWindow(now) } },
        include: { visibilities: true, versions: { where: currentWindow(now) } },
      });
      return documents
        .map((document: AnyRow) => {
          const current = document.versions.find((version: AnyRow) => version.id === document.currentVersionId);
          return current ? mapDocument(document, current) : null;
        })
        .filter((document: KnowledgeDocumentDto | null): document is KnowledgeDocumentDto => Boolean(document));
    },

    async listReviewQueue() {
      const versions = await prisma.knowledgeVersion.findMany({
        where: { status: 'PENDING_REVIEW' },
        include: { document: { include: documentInclude } },
        orderBy: { updatedAt: 'asc' },
      });
      return versions.map((version: AnyRow) => ({
        document: mapDocument(version.document),
        version: mapVersion(version),
        contentText: version.contentText,
      })) as KnowledgeWorkflowItemDto[];
    },

    async listPublicationQueue() {
      const versions = await prisma.knowledgeVersion.findMany({
        where: { status: 'APPROVED' },
        include: { document: { include: documentInclude } },
        orderBy: { updatedAt: 'asc' },
      });
      return versions.map((version: AnyRow) => ({
        document: mapDocument(version.document),
        version: mapVersion(version),
        contentText: version.contentText,
      })) as KnowledgeWorkflowItemDto[];
    },

    async listSearchableChunks(now) {
      const chunks = await prisma.knowledgeChunk.findMany({
        where: { version: currentWindow(now) },
        include: { version: { include: { document: true } } },
        orderBy: [{ versionId: 'asc' }, { ordinal: 'asc' }],
      });
      return chunks
        .filter((chunk: AnyRow) => chunk.version.document.currentVersionId === chunk.versionId)
        .map((chunk: AnyRow) => ({
          id: chunk.id,
          documentId: chunk.version.documentId,
          versionId: chunk.versionId,
          title: chunk.version.document.title,
          versionNumber: chunk.version.versionNumber,
          updatedAt: asIso(chunk.version.updatedAt) || new Date(0).toISOString(),
          ordinal: chunk.ordinal,
          ...(chunk.heading ? { heading: chunk.heading } : {}),
          content: chunk.content,
          searchText: chunk.searchText,
        }));
    },
  };
}
