import assert from 'node:assert/strict';
import { KNOWLEDGE_VERSION_STATUS } from '../../../src/types/enablement';
import { createKeywordKnowledgeSearchProvider } from './knowledgeSearchProvider';
import { createKnowledgeService } from './knowledgeService';

const now = new Date('2026-07-10T00:00:00.000Z');
const creator = {
  id: 'publisher-1', departmentId: 'dept-sales', isActive: true,
  permissions: [{ module: '赋能中台/发布管理', actions: ['read', 'write'] }],
} as any;

const validDraft = {
  slug: 'sales-guide', title: '销售手册', category: '销售', summary: '供销售使用', ownerDepartmentId: 'dept-sales',
  sensitivity: 'INTERNAL' as const, visibility: [{ subjectType: 'ALL_EMPLOYEES' as const }],
  sourceFileName: 'sales-guide.md', markdown: '# 销售手册',
};

let createDraftCalls = 0;
let createVersionCalls = 0;
let transitionCalls = 0;
let createDraftMode: 'success' | 'conflict' | 'error' = 'success';
let createVersionMode: 'success' | 'conflict' | 'error' = 'success';
const discardedKeys: string[] = [];
const compensationErrors: string[] = [];
const documents = new Map<string, any>();
const versions = new Map<string, any>();

const repository: any = {
  createDraft: async (input: any) => {
    createDraftCalls += 1;
    if (createDraftMode === 'conflict') return null;
    if (createDraftMode === 'error') throw new Error('database unavailable');
    const document = { ...input, visibility: input.visibility, createdAt: now.toISOString(), updatedAt: now.toISOString() };
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
    createVersionCalls += 1;
    if (createVersionMode === 'conflict') return null;
    if (createVersionMode === 'error') throw new Error('version database unavailable');
    const version = {
      id: input.versionId, documentId, versionNumber: 2, status: KNOWLEDGE_VERSION_STATUS.DRAFT,
      sourceFileName: input.sourceFileName, checksum: input.checksum, contentText: input.markdown,
      effectiveAt: input.effectiveAt ? new Date(input.effectiveAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    };
    versions.set(version.id, version);
    return { document: documents.get(documentId), version };
  },
  findVersion: async (id: string) => versions.get(id) || null,
  findDocument: async (id: string) => documents.get(id) || null,
  findDepartment: async (id: string) => id === 'dept-sales'
    ? { id, managerId: 'manager-active', isActive: true }
    : null,
  visibilitySubjectExists: async (type: string, id: string) => (
    (type === 'DEPARTMENT' && id === 'dept-sales')
    || (type === 'ROLE' && id === 'role-sales')
    || (type === 'POSITION' && id === 'position-sales')
  ),
  hasActiveDepartmentManager: async (id: string) => id === 'dept-sales',
  transitionVersion: async () => { transitionCalls += 1; return true; },
  reviewAtomic: async () => true,
  publishAtomic: async ({ version }: any) => {
    const document = documents.get(version.documentId);
    const old = document.currentVersionId ? versions.get(document.currentVersionId) : null;
    if (old) old.status = KNOWLEDGE_VERSION_STATUS.RETIRED;
    version.status = KNOWLEDGE_VERSION_STATUS.CURRENT;
    document.currentVersionId = version.id;
    return document;
  },
  retireAtomic: async () => true,
  listVisibleCurrent: async () => [], listReviewQueue: async () => [], listPublicationQueue: async () => [], listSearchableChunks: async () => [],
};

const service = createKnowledgeService({
  repository,
  searchProvider: createKeywordKnowledgeSearchProvider(),
  now: () => now,
  fileStore: {
    writeMarkdown: async ({ documentId, versionId, fileName, markdown }: any) => ({
      storageKey: `${documentId}/${versionId}/${fileName}`, byteSize: Buffer.byteLength(markdown),
    }),
    discardNewWrite: async (key: string) => { discardedKeys.push(key); },
  },
  onCompensationError: (error) => compensationErrors.push(error instanceof Error ? error.message : String(error)),
});

const invalidDrafts: Array<[string, any, number]> = [
  ['non-object body', null, 400],
  ['unvalidated string', { ...validDraft, title: 42 }, 400],
  ['invalid sensitivity', { ...validDraft, sensitivity: 'SECRET' }, 400],
  ['invalid visibility enum', { ...validDraft, visibility: [{ subjectType: 'TEAM', subjectId: 'team-1' }] }, 400],
  ['missing visibility subject', { ...validDraft, visibility: [{ subjectType: 'ROLE' }] }, 400],
  ['all employees subject id', { ...validDraft, visibility: [{ subjectType: 'ALL_EMPLOYEES', subjectId: 'dept-sales' }] }, 400],
  ['invalid department reference', { ...validDraft, ownerDepartmentId: 'dept-missing' }, 404],
  ['missing role reference', { ...validDraft, visibility: [{ subjectType: 'ROLE', subjectId: 'role-missing' }] }, 404],
  ['bad filename', { ...validDraft, sourceFileName: 'sales.txt' }, 400],
  ['path filename', { ...validDraft, sourceFileName: '../sales.md' }, 400],
  ['invalid date', { ...validDraft, effectiveAt: 'not-a-date' }, 400],
  ['invalid date window', { ...validDraft, effectiveAt: '2026-07-11T00:00:00.000Z', expiresAt: '2026-07-10T00:00:00.000Z' }, 400],
  ['overlong slug', { ...validDraft, slug: 's'.repeat(161) }, 400],
  ['department visibility mismatch', { ...validDraft, sensitivity: 'DEPARTMENT', visibility: [{ subjectType: 'ALL_EMPLOYEES' }] }, 400],
];
for (const [name, payload, expectedCode] of invalidDrafts) {
  const callsBefore = createDraftCalls;
  const result = await service.createDraft(payload, creator);
  assert.equal(result.code, expectedCode, name);
  assert.equal(createDraftCalls, callsBefore, `${name} is rejected before persistence`);
}

const departmentDraft = await service.createDraft({
  ...validDraft, slug: 'department-guide', sensitivity: 'DEPARTMENT',
  visibility: [{ subjectType: 'DEPARTMENT', subjectId: 'dept-sales' }],
}, creator);
assert.equal(departmentDraft.code, 0);

const exactMarkdown = '  # preserve exact source\n\n';
const exactDraft = await service.createDraft({ ...validDraft, slug: 'exact-source', markdown: exactMarkdown }, creator);
assert.equal(exactDraft.data!.version.contentText, exactMarkdown, 'validated Markdown remains byte-for-byte inspectable');

createDraftMode = 'conflict';
const discardedBeforeConflict = discardedKeys.length;
const conflict = await service.createDraft({ ...validDraft, slug: 'duplicate-slug' }, creator);
assert.equal(conflict.code, 409);
assert.match(conflict.message, /标识/);
assert.equal(discardedKeys.length, discardedBeforeConflict + 1, 'duplicate-slug conflict compensates the exact new file');

createDraftMode = 'error';
const discardedBeforeError = discardedKeys.length;
await assert.rejects(() => service.createDraft({ ...validDraft, slug: 'db-error' }, creator), /database unavailable/);
assert.equal(discardedKeys.length, discardedBeforeError + 1, 'database failure compensates the exact new file');
createDraftMode = 'success';

const base = await service.createDraft({ ...validDraft, slug: 'publication-window' }, creator);
assert.equal(base.code, 0);
const documentId = base.data!.document.id;
const v1 = base.data!.version;
v1.status = KNOWLEDGE_VERSION_STATUS.CURRENT;
documents.get(documentId).currentVersionId = v1.id;

const versionCallsBeforeMalformed = createVersionCalls;
assert.equal((await service.createVersion(documentId, { sourceFileName: 42, markdown: '# invalid' }, creator)).code, 400);
assert.equal(createVersionCalls, versionCallsBeforeMalformed);
assert.equal((await service.review('missing', null, creator)).code, 400);

createVersionMode = 'conflict';
const discardedBeforeVersionConflict = discardedKeys.length;
assert.equal((await service.createVersion(documentId, { sourceFileName: 'conflict.md', markdown: '# conflict' }, creator)).code, 409);
assert.equal(discardedKeys.length, discardedBeforeVersionConflict + 1, 'version conflict compensates its new source file');
createVersionMode = 'error';
const discardedBeforeVersionError = discardedKeys.length;
await assert.rejects(() => service.createVersion(documentId, { sourceFileName: 'db-error.md', markdown: '# error' }, creator), /version database unavailable/);
assert.equal(discardedKeys.length, discardedBeforeVersionError + 1, 'version database failure compensates its new source file');
createVersionMode = 'success';

for (const [name, window] of [
  ['future', { effectiveAt: '2026-07-11T00:00:00.000Z' }],
  ['expired', { expiresAt: '2026-07-09T00:00:00.000Z' }],
] as const) {
  const created = await service.createVersion(documentId, { sourceFileName: `${name}.md`, markdown: `# ${name}`, ...window }, creator);
  assert.equal(created.code, 0);
  created.data!.version.status = KNOWLEDGE_VERSION_STATUS.APPROVED;
  const result = await service.publish(created.data!.version.id, creator);
  assert.equal(result.code, 409, `${name} approved version cannot publish outside its active window`);
  assert.equal(documents.get(documentId).currentVersionId, v1.id, `${name} rejection preserves the current pointer`);
  assert.equal(v1.status, KNOWLEDGE_VERSION_STATUS.CURRENT, `${name} rejection preserves current v1`);
}

const unreviewable = await service.createDraft({ ...validDraft, slug: 'unreviewable' }, creator);
assert.equal(unreviewable.code, 0);
repository.hasActiveDepartmentManager = async () => false;
const transitionsBefore = transitionCalls;
const submit = await service.submitForReview(unreviewable.data!.version.id, creator);
assert.equal(submit.code, 409);
assert.match(submit.message, /负责人|审核/);
assert.equal(transitionCalls, transitionsBefore, 'unreviewable department never becomes pending');

assert.deepEqual(compensationErrors, []);

const safeCompensationMessages: string[] = [];
const compensationFailureService = createKnowledgeService({
  repository: { ...repository, createDraft: async () => null },
  searchProvider: createKeywordKnowledgeSearchProvider(),
  now: () => now,
  fileStore: {
    writeMarkdown: async () => ({ storageKey: 'private/doc-new/version-new/source.md', byteSize: 8 }),
    discardNewWrite: async () => { throw new Error('/private/root/private/doc-new/version-new/source.md'); },
  },
  onCompensationError: (error) => safeCompensationMessages.push(error instanceof Error ? error.message : String(error)),
});
const compensationFailure = await compensationFailureService.createDraft({ ...validDraft, slug: 'compensation-failure' }, creator);
assert.equal(compensationFailure.code, 409);
assert.deepEqual(safeCompensationMessages, ['知识源文件补偿失败']);
assert.doesNotMatch(JSON.stringify(compensationFailure), /private\/doc-new|private\/root/);
console.log('knowledgeService validation tests passed');
