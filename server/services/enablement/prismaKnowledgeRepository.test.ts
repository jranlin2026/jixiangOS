import assert from 'node:assert/strict';
import { createPrismaKnowledgeRepository } from './prismaKnowledgeRepository';

const input = {
  version: {
    id: 'new-version', documentId: 'doc-1', versionNumber: 2, status: 'APPROVED',
    sourceFileName: 'v2.md', checksum: 'hash', contentText: '# v2',
  },
  publisherUserId: 'user-publisher',
  chunks: [
    { ordinal: 0, heading: 'v2', content: 'one', searchText: 'one' },
    { ordinal: 1, content: 'two', searchText: 'two' },
  ],
  now: new Date('2026-07-10T00:00:00.000Z'),
};

const operations: string[] = [];
const tx = {
  knowledgeDocument: {
    findUnique: async () => ({ id: 'doc-1', currentVersionId: 'old-version' }),
    updateMany: async ({ data }: any) => {
      operations.push(`point-current:${data.currentVersionId}`);
      return { count: 1 };
    },
  },
  knowledgeVersion: {
    findUnique: async () => ({ id: 'new-version', status: 'APPROVED' }),
    updateMany: async ({ where, data }: any) => {
      operations.push(data.status === 'RETIRED' ? `retire:${where.id}` : `activate:${where.id}`);
      return { count: 1 };
    },
  },
  knowledgeChunk: {
    deleteMany: async ({ where }: any) => { operations.push(`delete-chunks:${where.versionId}`); },
    createMany: async ({ data }: any) => { operations.push(`create-chunks:${data.length}`); },
  },
};
const prisma = { $transaction: async (callback: any) => callback(tx) } as any;
const repository = createPrismaKnowledgeRepository(prisma);
await repository.publishAtomic(input);
assert.deepEqual(operations, [
  'retire:old-version',
  'delete-chunks:new-version',
  'create-chunks:2',
  'activate:new-version',
  'point-current:new-version',
]);

const failedOperations: string[] = [];
const failedTx = {
  ...tx,
  knowledgeDocument: {
    findUnique: async () => ({ id: 'doc-1', currentVersionId: 'old-version' }),
    updateMany: async ({ data }: any) => {
      failedOperations.push(`point-current:${data.currentVersionId}`);
      return { count: 1 };
    },
  },
  knowledgeChunk: {
    deleteMany: async ({ where }: any) => { failedOperations.push(`delete-chunks:${where.versionId}`); },
    createMany: async () => { throw new Error('chunk failure'); },
  },
};
const failedRepository = createPrismaKnowledgeRepository({ $transaction: async (callback: any) => callback(failedTx) } as any);
await assert.rejects(() => failedRepository.publishAtomic(input), /chunk failure/);
assert.ok(!failedOperations.some((operation) => operation.startsWith('point-current:')));

const stalePublishRepository = createPrismaKnowledgeRepository({
  $transaction: async (callback: any) => callback({
    knowledgeDocument: {
      findUnique: async () => ({ id: 'doc-1', currentVersionId: 'old-version' }),
      updateMany: async () => ({ count: 1 }),
    },
    knowledgeVersion: {
      findUnique: async () => ({ id: 'new-version', status: 'APPROVED' }),
      updateMany: async ({ data }: any) => ({ count: data.status === 'CURRENT' ? 0 : 1 }),
    },
    knowledgeChunk: { deleteMany: async () => {}, createMany: async () => {} },
  }) as any,
} as any);
assert.equal(await stalePublishRepository.publishAtomic(input), null, 'lost approved-state CAS becomes a conflict');

const retirementOperations: string[] = [];
const preservedHistoryDeletes: string[] = [];
const retirementRepository = createPrismaKnowledgeRepository({
  $transaction: async (callback: any) => callback({
    knowledgeDocument: {
      findUnique: async () => ({ id: 'doc-1', currentVersionId: 'current-version' }),
      update: async ({ where, data }: any) => {
        retirementOperations.push(`clear-current:${where.id}:${String(data.currentVersionId)}`);
      },
      delete: async () => { preservedHistoryDeletes.push('document'); },
      deleteMany: async () => { preservedHistoryDeletes.push('documents'); },
    },
    knowledgeVersion: {
      updateMany: async ({ where, data }: any) => {
        retirementOperations.push(`retire:${where.id}:${where.status}->${data.status}`);
        return { count: 1 };
      },
      delete: async () => { preservedHistoryDeletes.push('version'); },
      deleteMany: async () => { preservedHistoryDeletes.push('versions'); },
    },
    knowledgeReview: {
      delete: async () => { preservedHistoryDeletes.push('review'); },
      deleteMany: async () => { preservedHistoryDeletes.push('reviews'); },
    },
    knowledgeAttachment: {
      delete: async () => { preservedHistoryDeletes.push('attachment'); },
      deleteMany: async () => { preservedHistoryDeletes.push('attachments'); },
    },
    knowledgeChunk: {
      delete: async () => { preservedHistoryDeletes.push('chunk'); },
      deleteMany: async () => { preservedHistoryDeletes.push('chunks'); },
    },
  }),
} as any);
assert.equal(await retirementRepository.retireAtomic('doc-1', input.publisherUserId, input.now), true);
assert.deepEqual(retirementOperations, [
  'retire:current-version:CURRENT->RETIRED',
  'clear-current:doc-1:null',
]);
assert.deepEqual(preservedHistoryDeletes, [], 'retirement preserves versions, reviews, attachments, and chunks');

let publicationQueueWhere: unknown;
const queueRepository = createPrismaKnowledgeRepository({
  knowledgeVersion: {
    findMany: async ({ where }: any) => {
      publicationQueueWhere = where;
      return [];
    },
  },
} as any);
await queueRepository.listPublicationQueue();
assert.deepEqual(publicationQueueWhere, { status: { in: ['DRAFT', 'REJECTED', 'APPROVED', 'CURRENT'] } });

const transactionConflict = Object.assign(new Error('transaction retry exhausted'), { code: 'P2034' });
const retryPublishRepository = createPrismaKnowledgeRepository({
  $transaction: async () => { throw transactionConflict; },
} as any);
assert.equal(await retryPublishRepository.publishAtomic(input), null, 'serializable retry exhaustion becomes a conflict');

const reviewConflictRepository = createPrismaKnowledgeRepository({
  $transaction: async () => { throw transactionConflict; },
} as any);
assert.equal(await reviewConflictRepository.reviewAtomic({
  versionId: 'version-review', expectedStatus: 'PENDING_REVIEW', reviewerUserId: 'manager-1',
  decision: 'APPROVE', nextStatus: 'APPROVED',
}), false, 'review P2034 becomes a conflict');
assert.equal(await reviewConflictRepository.retireAtomic('doc-1', input.publisherUserId, input.now), false, 'retire P2034 becomes a conflict');

const versionInput = {
  versionId: 'version-2', sourceFileName: 'v2.md', markdown: '# v2', checksum: 'hash', createdById: 'user-publisher',
  attachment: { storageKey: 'doc-1/version-2/v2.md', byteSize: 5 },
};
let provenanceVersionData: any;
const provenanceRepository = createPrismaKnowledgeRepository({
  $transaction: async (callback: any) => callback({
    knowledgeDocument: { findUnique: async () => ({ id: 'doc-1', visibilities: [], versions: [] }) },
    knowledgeVersion: {
      findFirst: async () => ({ versionNumber: 1 }),
      create: async ({ data }: any) => {
        provenanceVersionData = data;
        return { ...data, createdAt: input.now };
      },
    },
    knowledgeAttachment: { create: async () => {} },
  }),
} as any);
await provenanceRepository.createVersion('doc-1', { ...versionInput, sourceReference: 'WPS知识库/销售手册' });
assert.equal(provenanceVersionData.sourcePath, 'public:WPS知识库/销售手册');
assert.notEqual(provenanceVersionData.sourcePath, versionInput.attachment.storageKey);

for (const code of ['P2002', 'P2034']) {
  const versionConflictRepository = createPrismaKnowledgeRepository({
    $transaction: async (callback: any) => callback({
      knowledgeDocument: { findUnique: async () => ({ id: 'doc-1', visibilities: [], versions: [] }) },
      knowledgeVersion: {
        findFirst: async () => ({ versionNumber: 1 }),
        create: async () => { throw Object.assign(new Error('version conflict'), { code }); },
      },
      knowledgeAttachment: { create: async () => {} },
    }) as any,
  } as any);
  assert.equal(await versionConflictRepository.createVersion('doc-1', versionInput), null, `${code} becomes a version conflict`);
}

for (const code of ['P2002', 'P2034']) {
  const draftConflictRepository = createPrismaKnowledgeRepository({
    $transaction: async () => { throw Object.assign(new Error('draft conflict'), { code }); },
  } as any);
  assert.equal(await draftConflictRepository.createDraft({
    id: 'doc-new', versionId: 'version-new', slug: 'duplicate-slug', title: 'title', category: 'category', summary: 'summary',
    ownerDepartmentId: 'dept-sales', sensitivity: 'INTERNAL', visibility: [{ subjectType: 'ALL_EMPLOYEES' }],
    sourceFileName: 'source.md', markdown: '# source', checksum: 'hash', createdById: 'user-publisher',
    attachment: { storageKey: 'doc-new/version-new/source.md', byteSize: 8 },
  }), null, `draft ${code} becomes a conflict`);
}

const referenceRepository = createPrismaKnowledgeRepository({
  department: {
    findUnique: async ({ where }: any) => where.id === 'dept-sales' ? { id: where.id, managerId: 'manager-active', isActive: true } : null,
  },
  role: { findUnique: async ({ where }: any) => where.id === 'role-sales' ? { id: where.id } : null },
  position: { findUnique: async ({ where }: any) => where.id === 'position-sales' ? { id: where.id } : null },
  user: { findFirst: async ({ where }: any) => where.id === 'manager-active' && where.isActive ? { id: where.id } : null },
} as any);
assert.equal(await referenceRepository.visibilitySubjectExists('DEPARTMENT', 'dept-sales'), true);
assert.equal(await referenceRepository.visibilitySubjectExists('ROLE', 'role-sales'), true);
assert.equal(await referenceRepository.visibilitySubjectExists('POSITION', 'position-sales'), true);
assert.equal(await referenceRepository.visibilitySubjectExists('ROLE', 'missing-role'), false);
assert.equal(await referenceRepository.hasActiveDepartmentManager('dept-sales'), true);

const privateVersion = {
  id: 'version-private', documentId: 'doc-private', versionNumber: 1, status: 'CURRENT',
  sourceFileName: 'source.md', sourcePath: 'doc-private/version-private/source.md', checksum: 'private-checksum',
  contentText: '# Inspectable source', createdAt: new Date('2026-07-10T00:00:00.000Z'),
};
const safeReferenceVersion = { ...privateVersion, sourcePath: 'public:WPS知识库/销售手册' };
const privateDocument = {
  id: 'doc-private', slug: 'private-doc', title: 'Private metadata regression', category: 'test', summary: 'test',
  ownerDepartmentId: 'dept-1', sensitivity: 'INTERNAL', currentVersionId: privateVersion.id,
  visibilities: [{ id: 'visibility-1', subjectType: 'ALL_EMPLOYEES', subjectId: '*' }],
  versions: [privateVersion], createdAt: new Date('2026-07-10T00:00:00.000Z'), updatedAt: new Date('2026-07-10T00:00:00.000Z'),
};
const privacyRepository = createPrismaKnowledgeRepository({
  $transaction: async () => { throw new Error('not used'); },
  knowledgeDocument: {
    findMany: async () => [privateDocument],
    findUnique: async () => privateDocument,
  },
  knowledgeVersion: {
    findMany: async () => [{ ...privateVersion, document: privateDocument }],
    findUnique: async () => privateVersion,
  },
} as any);
const publicPayloads = [
  await privacyRepository.listVisibleCurrent(input.now),
  await privacyRepository.findCurrentDetail(privateDocument.id, input.now),
  await privacyRepository.listReviewQueue(),
  await privacyRepository.listPublicationQueue(),
];
for (const payload of publicPayloads) {
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /sourcePath|doc-private\/version-private\/source\.md/);
  assert.match(serialized, /source\.md/);
  assert.match(serialized, /private-checksum/);
}
assert.match(JSON.stringify(publicPayloads.slice(1)), /Inspectable source/);

const safeReferenceRepository = createPrismaKnowledgeRepository({
  knowledgeVersion: { findUnique: async () => safeReferenceVersion },
} as any);
const mappedSafeVersion = await safeReferenceRepository.findVersion(safeReferenceVersion.id);
assert.equal(mappedSafeVersion?.sourceReference, 'WPS知识库/销售手册');
assert.doesNotMatch(JSON.stringify(await privacyRepository.findVersion(privateVersion.id)), /doc-private\/version-private\/source\.md/);

console.log('prismaKnowledgeRepository transaction tests passed');
