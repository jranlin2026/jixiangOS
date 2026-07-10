import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
