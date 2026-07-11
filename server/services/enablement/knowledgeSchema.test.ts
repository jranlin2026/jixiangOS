import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  join(process.cwd(), 'prisma/migrations/20260710010000_enablement_knowledge_foundation/migration.sql'),
  'utf8',
);
const types = readFileSync(join(process.cwd(), 'src/types/enablement.ts'), 'utf8');

for (const model of ['KnowledgeDocument', 'KnowledgeVersion', 'KnowledgeAttachment', 'KnowledgeVisibility', 'ContentReview', 'KnowledgeChunk']) {
  assert.match(schema, new RegExp(`model ${model} \\{`));
}
assert.match(schema, /currentVersionId\s+String\?/);
assert.match(schema, /@@unique\(\[documentId, versionNumber\]\)/);
assert.match(schema, /@@unique\(\[versionId, ordinal\]\)/);
assert.match(migration, /CREATE TABLE `knowledge_documents`/);
assert.match(migration, /CREATE TABLE `knowledge_versions`/);
assert.match(types, /export const KNOWLEDGE_VERSION_STATUS/);
assert.match(types, /export interface KnowledgeDocumentDto/);
