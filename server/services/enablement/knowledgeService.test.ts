import assert from 'node:assert/strict';
import { KNOWLEDGE_VERSION_STATUS } from '../../../src/types/enablement';
import { createKeywordKnowledgeSearchProvider } from './knowledgeSearchProvider';
import { createKnowledgeService } from './knowledgeService';

const now = new Date('2026-07-10T00:00:00.000Z');
const events: string[] = [];
const versions = new Map<string, any>();
const documents = new Map<string, any>();

const creator = {
  id: 'user-publisher', departmentId: 'dept-sales', isActive: true,
  permissions: [{ module: '赋能中台/发布管理', actions: ['read', 'write'] }],
} as any;
const reader = {
  id: 'user-reader', departmentId: 'dept-sales', isActive: true,
  permissions: [{ module: '赋能中台/企业知识', actions: ['read'] }],
} as any;
const manager = {
  id: 'user-manager', departmentId: 'dept-sales', isActive: true,
  permissions: [{ module: '赋能中台/知识审核', actions: ['read', 'write'] }],
} as any;

const repository: any = {
  createDraft: async (input: any) => {
    const document = {
      id: input.id, slug: input.slug, title: input.title, category: input.category, summary: input.summary,
      ownerDepartmentId: input.ownerDepartmentId, ownerUserId: input.ownerUserId, sensitivity: input.sensitivity,
      visibility: input.visibility.map((rule: any, index: number) => ({ id: `visibility-${index}`, ...rule })),
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    };
    const version = {
      id: input.versionId, documentId: input.id, versionNumber: 1, status: KNOWLEDGE_VERSION_STATUS.DRAFT,
      sourceFileName: input.sourceFileName, checksum: input.checksum, contentText: input.markdown,
      effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    };
    documents.set(document.id, document);
    versions.set(version.id, version);
    return { document, version };
  },
  createVersion: async (documentId: string, input: any) => {
    const version = {
      id: input.versionId, documentId, versionNumber: 2, status: KNOWLEDGE_VERSION_STATUS.DRAFT,
      sourceFileName: input.sourceFileName, checksum: input.checksum, contentText: input.markdown,
      effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    };
    versions.set(version.id, version);
    return { document: documents.get(documentId), version };
  },
  findVersion: async (id: string) => versions.get(id) ?? null,
  findDocument: async (id: string) => documents.get(id) ?? null,
  findCurrentDetail: async (id: string, at: Date) => {
    const document = documents.get(id);
    if (!document?.currentVersionId) return null;
    const version = versions.get(document.currentVersionId);
    if (!version || (version.effectiveAt && version.effectiveAt > at) || (version.expiresAt && version.expiresAt <= at)) return null;
    return { ...document, ...version, contentText: version.contentText };
  },
  findDepartment: async (id: string) => id === 'dept-sales' ? { id, managerId: 'user-manager' } : null,
  transitionVersion: async (id: string, allowedFrom: string[], nextStatus: string) => {
    const version = versions.get(id);
    if (!version || !allowedFrom.includes(version.status)) return false;
    version.status = nextStatus;
    events.push(nextStatus);
    return true;
  },
  reviewAtomic: async ({ versionId, expectedStatus, decision, nextStatus }: any) => {
    const version = versions.get(versionId);
    if (!version || version.status !== expectedStatus) return false;
    events.push(`REVIEW:${decision}`);
    version.status = nextStatus;
    events.push(nextStatus);
    return true;
  },
  publishAtomic: async ({ version, chunks }: any) => {
    if (version.status !== KNOWLEDGE_VERSION_STATUS.APPROVED) throw new Error('publish requires approved version');
    events.push(`PUBLISH:${chunks.length}`);
    version.status = KNOWLEDGE_VERSION_STATUS.CURRENT;
    const document = documents.get(version.documentId);
    document.currentVersionId = version.id;
    return document;
  },
  retireAtomic: async (documentId: string) => {
    const document = documents.get(documentId);
    if (document) delete document.currentVersionId;
    events.push('RETIRE');
  },
  listVisibleCurrent: async (at: Date) => [...documents.values()].filter((document) => {
    const version = document.currentVersionId ? versions.get(document.currentVersionId) : null;
    return version && (!version.effectiveAt || version.effectiveAt <= at) && (!version.expiresAt || version.expiresAt > at);
  }),
  listReviewQueue: async () => [...versions.values()]
    .filter((version) => version.status === KNOWLEDGE_VERSION_STATUS.PENDING_REVIEW)
    .map((version) => ({ document: documents.get(version.documentId), version, contentText: version.contentText })),
  listPublicationQueue: async () => [...versions.values()]
    .filter((version) => version.status === KNOWLEDGE_VERSION_STATUS.APPROVED)
    .map((version) => ({ document: documents.get(version.documentId), version, contentText: version.contentText })),
  listSearchableChunks: async () => [],
};

const service = createKnowledgeService({ repository, searchProvider: createKeywordKnowledgeSearchProvider(), now: () => now });

const draft = await service.createDraft({
  slug: 'company-intro', title: '公司介绍', category: '公司认知', summary: '介绍', ownerDepartmentId: 'dept-sales',
  sensitivity: 'INTERNAL', visibility: [{ subjectType: 'ALL_EMPLOYEES' }], sourceFileName: '公司介绍.md', markdown: '# 公司介绍\n极享科技。',
}, creator);
assert.equal(draft.code, 0);
assert.equal(draft.data!.version.status, KNOWLEDGE_VERSION_STATUS.DRAFT);
assert.match(draft.data!.version.checksum, /^[a-f0-9]{64}$/);

const versionId = draft.data!.version.id;
const documentId = draft.data!.document.id;
assert.equal((await service.submitForReview(versionId, creator)).code, 0);
assert.equal((await service.review(versionId, { decision: 'APPROVE', comment: '通过' }, manager)).code, 0);
assert.equal((await service.publish(versionId, creator)).code, 0);
assert.deepEqual(events, ['PENDING_REVIEW', 'REVIEW:APPROVE', 'APPROVED', 'PUBLISH:1']);
assert.notEqual((await service.publish(versionId, creator)).code, 0, 'CAS-safe publish cannot publish a current version again');

const detail = await service.getCurrent(documentId, reader);
assert.equal(detail.code, 0);
assert.equal(detail.data!.contentText, '# 公司介绍\n极享科技。');
assert.equal((await service.listCurrent(reader)).data!.length, 1);

const nextVersion = await service.createVersion(documentId, { sourceFileName: '公司介绍-v2.md', markdown: '# 公司介绍\n第二版。' }, creator);
assert.equal(nextVersion.code, 0);
assert.equal(nextVersion.data!.version.versionNumber, 2);
assert.equal((await service.submitForReview(nextVersion.data!.version.id, creator)).code, 0);
assert.notEqual((await service.review(nextVersion.data!.version.id, { decision: 'APPROVE' }, { ...manager, id: 'other-user' })).code, 0);
assert.equal((await service.review(nextVersion.data!.version.id, { decision: 'REJECT' }, manager)).code, 0);
assert.equal((await service.submitForReview(nextVersion.data!.version.id, creator)).code, 0, 'rejected versions can return to review');

assert.notEqual((await service.submitForReview('missing-version', creator)).code, 0);
assert.notEqual((await service.publish('missing-version', creator)).code, 0);
assert.notEqual((await service.createDraft({
  slug: 'bad-window', title: '失效窗口', category: '测试', summary: '测试', ownerDepartmentId: 'dept-sales', sensitivity: 'INTERNAL',
  visibility: [{ subjectType: 'ALL_EMPLOYEES' }], sourceFileName: 'bad.md', markdown: '# bad', effectiveAt: '2026-07-11T00:00:00.000Z', expiresAt: '2026-07-11T00:00:00.000Z',
}, creator)).code, 0);
assert.notEqual((await service.listPublicationQueue(reader)).code, 0);

await service.retire(documentId, creator);
assert.equal((await service.getCurrent(documentId, reader)).code, 404);

console.log('knowledgeService lifecycle tests passed');
