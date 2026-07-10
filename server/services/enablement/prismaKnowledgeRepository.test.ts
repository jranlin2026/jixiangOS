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
    update: async ({ data }: any) => { operations.push(`point-current:${data.currentVersionId}`); },
  },
  knowledgeVersion: {
    findUnique: async () => ({ id: 'new-version', status: 'APPROVED' }),
    update: async ({ where, data }: any) => {
      operations.push(data.status === 'RETIRED' ? `retire:${where.id}` : `activate:${where.id}`);
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
    update: async ({ data }: any) => { failedOperations.push(`point-current:${data.currentVersionId}`); },
  },
  knowledgeChunk: {
    deleteMany: async ({ where }: any) => { failedOperations.push(`delete-chunks:${where.versionId}`); },
    createMany: async () => { throw new Error('chunk failure'); },
  },
};
const failedRepository = createPrismaKnowledgeRepository({ $transaction: async (callback: any) => callback(failedTx) } as any);
await assert.rejects(() => failedRepository.publishAtomic(input), /chunk failure/);
assert.ok(!failedOperations.some((operation) => operation.startsWith('point-current:')));

console.log('prismaKnowledgeRepository publish transaction tests passed');
