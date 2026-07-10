import assert from 'node:assert/strict';
import { buildMarkdownChunks, createKeywordKnowledgeSearchProvider } from './knowledgeSearchProvider';

const markdown = `# 公司介绍
极享科技是一家AI应用产品公司。

## 新人红线
禁止承诺保本、稳赚和固定收入。

## 请假流程
请假先提交申请，再由部门负责人审批。`;

const chunks = buildMarkdownChunks(markdown);
assert.equal(chunks.length, 3);
assert.equal(chunks[1].heading, '新人红线');
assert.match(chunks[1].content, /禁止承诺保本/);

const provider = createKeywordKnowledgeSearchProvider();
const hits = provider.search('新人不能承诺稳赚', chunks.map((chunk, index) => ({
  ...chunk,
  id: `chunk-${index}`,
  documentId: 'doc-1',
  versionId: 'version-1',
  title: '新人手册',
  versionNumber: 1,
  updatedAt: '2026-07-10T00:00:00.000Z',
})), 5);
assert.equal(hits[0].heading, '新人红线');
assert.ok(hits[0].score > 0);
