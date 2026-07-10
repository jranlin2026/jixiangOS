import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import express from 'express';
import { createEnablementKnowledgeRouter } from './enablementKnowledgeRoutes';

const route = readFileSync(join(process.cwd(), 'server/routes/enablementKnowledgeRoutes.ts'), 'utf8');
const server = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');

assert.match(route, /router\.get\('\/'/);
assert.match(route, /router\.get\('\/search'/);
assert.match(route, /router\.get\('\/review-queue'/);
assert.match(route, /router\.get\('\/publication-queue'/);
assert.match(route, /router\.post\('\/drafts'/);
assert.match(route, /router\.post\('\/:documentId\/versions'/);
assert.match(route, /router\.post\('\/versions\/:versionId\/submit-review'/);
assert.match(route, /router\.post\('\/versions\/:versionId\/review'/);
assert.match(route, /router\.post\('\/versions\/:versionId\/publish'/);
assert.match(route, /router\.post\('\/:documentId\/retire'/);
assert.match(server, /app\.use\('\/api\/enablement\/knowledge'/);
assert.doesNotMatch(route, /express\.static|\/uploads\//);

const privateStorageKey = 'doc-private/version-private/source.md';
const version = {
  id: 'version-private',
  documentId: 'doc-private',
  versionNumber: 1,
  status: 'CURRENT',
  sourceFileName: 'source.md',
  sourcePath: privateStorageKey,
  checksum: 'private-checksum',
  createdAt: '2026-07-10T00:00:00.000Z',
  attachment: { storageKey: privateStorageKey, byteSize: 42 },
};
const document = {
  id: 'doc-private',
  slug: 'private-doc',
  title: 'Private metadata regression',
  category: 'test',
  summary: 'test',
  ownerDepartmentId: 'dept-1',
  sensitivity: 'INTERNAL',
  currentVersionId: version.id,
  visibility: [{ id: 'visibility-1', subjectType: 'ALL_EMPLOYEES' }],
  currentVersion: version,
  latestVersion: version,
  createdAt: '2026-07-10T00:00:00.000Z',
  updatedAt: '2026-07-10T00:00:00.000Z',
};
const workflowItem = { document, version, contentText: '# Reviewable source' };
const ok = (data: unknown) => ({ code: 0, data, message: 'success' });
const knowledgeService = {
  listCurrent: async () => ok([document]),
  getCurrent: async () => ok({ ...document, contentText: '# Current source' }),
  listReviewQueue: async () => ok([workflowItem]),
  listPublicationQueue: async () => ok([workflowItem]),
} as any;
const allow: express.RequestHandler = (_req, _res, next) => next();
const app = express();
app.use('/api/enablement/knowledge', createEnablementKnowledgeRouter({
  knowledgeService,
  requireRead: allow,
  requireReview: allow,
  requirePublish: allow,
}));
const listener = app.listen(0, '127.0.0.1');
await once(listener, 'listening');
const address = listener.address() as AddressInfo;

try {
  for (const endpoint of ['/', '/doc-private', '/review-queue', '/publication-queue']) {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/enablement/knowledge${endpoint}`);
    assert.equal(response.status, 200, endpoint);
    const body = await response.json();
    const serialized = JSON.stringify(body);
    assert.doesNotMatch(serialized, /sourcePath|storageKey|doc-private\/version-private\/source\.md/, endpoint);
    assert.match(serialized, /source\.md/, `${endpoint} keeps the source file name`);
    assert.match(serialized, /private-checksum/, `${endpoint} keeps the source checksum`);
    if (endpoint === '/doc-private') assert.match(serialized, /# Current source/);
    if (endpoint.endsWith('-queue')) assert.match(serialized, /# Reviewable source/);
  }
} finally {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}
