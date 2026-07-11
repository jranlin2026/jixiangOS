import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createKnowledgeFileStore } from './knowledgeFileStore';

const root = await mkdtemp(path.join(tmpdir(), 'jixiang-enablement-'));
try {
  const store = createKnowledgeFileStore(root);
  const result = await store.writeMarkdown({
    documentId: 'doc-1',
    versionId: 'version-1',
    fileName: '../公司介绍.md',
    markdown: '# 公司介绍',
  });

  assert.equal(result.storageKey, 'doc-1/version-1/公司介绍.md');
  assert.equal(await readFile(path.join(root, result.storageKey), 'utf8'), '# 公司介绍');
  const preserved = await store.writeMarkdown({ documentId: 'doc-1', versionId: 'version-current', fileName: 'current.md', markdown: '# current' });
  await store.discardNewWrite(result.storageKey);
  await assert.rejects(() => access(path.join(root, result.storageKey)));
  assert.equal(await readFile(path.join(root, preserved.storageKey), 'utf8'), '# current', 'compensation removes only the exact new key');
  await assert.rejects(() => store.discardNewWrite('../../.env'), /非法文件路径/);
  await assert.rejects(() => store.readMarkdown('../../.env'), /非法文件路径/);
} finally {
  await rm(root, { recursive: true, force: true });
}

console.log('knowledgeFileStore tests passed');
